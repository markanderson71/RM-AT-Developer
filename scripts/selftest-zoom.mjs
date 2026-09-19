// Offline checks for the Zoom pipeline. No network, no keys.  npm run test:zoom [transcript.txt]
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { scoreLinesUnheard, normalizeSessions, sessionAt, parseTranscript, speakerReport, windows, quoteGrounded, textOverlap, toChunks, dedupe, ingestZoom } from '../lib/ingest/zoom.js';
import { zoomSystem, zoomUser } from '../lib/prompts/zoom.js';
import { supersessionCandidates, canSupersede, normalizeChunk } from '../lib/store.js';

// A synthetic call in Plaud format; labels deliberately wrong in one turn (T3 is the mentor under the candidate's label).
const filler = (n) => Array.from({ length: n }, (_, k) => `00:${String(10 + k).padStart(2, '0')}:00 Speaker ${k % 2 ? 2 : 1}\n${k % 2 ? 'Okay so what I meant was the tails wash out at the end of the turn for that skier' : 'Logistics and scheduling talk that carries no calibration content at all, repeated to fill the window budget. '.repeat(12)}`).join('\n');
const raw = `00:00:05 Speaker 1
You cannot be in one fundamental land. You have got to be in all of them, or the relationships between them. One fundamental land is a level two.
00:00:40 Speaker 2
So I need a combination of fundamentals throughout.
00:01:00 Speaker 1
Um, so how do you create friction, and why is it important? That is the answer versus just saying create and manage friction.
00:01:30 Speaker 2
Symmetry above and below the fall line in bumps is, my man, not going to happen. They are tightening the radius at the end of the turn.
${filler(30)}`;
const turns = parseTranscript(raw);
assert.equal(turns[0].speaker, 'Speaker 1'); assert.equal(turns[0].t, '00:00:05'); assert.equal(turns[3].i, 3);
assert.ok(turns[0].text.startsWith('You cannot') && turns[0].text.endsWith('level two.'), 'multi-line turn text joined');
assert.equal(parseTranscript('[12:03] Chris: hello there\nmore\n[12:40] Mark: hi')[0].text, 'hello there more');

const rep = speakerReport(turns); assert.equal(rep.guess['Speaker 1'], 'chris'); assert.equal(rep.guess['Speaker 2'], 'mark');

const wins = windows(turns); assert.ok(wins.length >= 2, 'long call splits');
const coreSeen = wins.flatMap((w) => w.filter((x) => !x.ctx).map((x) => x.i));
assert.deepEqual(coreSeen, turns.map((x) => x.i), 'every turn is core in exactly one window, in order');
assert.ok(wins[1][0].ctx && wins[0][wins[0].length - 1].ctx, 'windows padded with context-only turns');
assert.ok(zoomUser({ turns: wins[1], date: '2026-09-18', speakerMap: { 'Speaker 1': 'chris' }, part: 2, parts: 2 }).includes(`[~T${wins[1][0].i} `), 'context turns marked ~');

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const sourceNorm = norm(turns.map((x) => x.text).join(' '));
assert.ok(quoteGrounded('You have got to be in all of them, or the relationships between them', sourceNorm) >= 0.9);
assert.ok(quoteGrounded('Candidates must always blend at least three fundamentals in every analysis', sourceNorm) < 0.3);
assert.ok(textOverlap('Maintain ski-to-snow contact through the blend', 'maintaining as much skeetus no contact as possible through what blends', ['skeetus no → ski-to-snow']) > 0.6, 'asr fixes count as said');

const map = { 'Speaker 1': 'chris', 'Speaker 2': 'mark' };
const ctx = { window: wins[0], turns, sourceNorm, date: '2026-09-18', sourceRef: 'zoom:2026-09-18', author: 'chris', speakerMap: map, part: 1 };
const S = (o) => ({ turns: [0], timestamp: '00:00:05', speaker_basis: 'label', criteria: ['cause_effect', 'bogus'], skills: ['rotary', 'nope'], type: 'mental_model', context: 'Discussing the bump MA.', ...o });
const r = toChunks([
  S({ text: 'You cannot be in one fundamental land. You have to be in all of them, or the relationships between them. One fundamental land is a level two.', quote: 'You have got to be in all of them, or the relationships between them' }),
  S({ text: 'Candidates should always name at least three fundamentals and explain biomechanics for each joint in detail.', quote: 'You have got to be in all of them, or the relationships between them' }),   // generalized → drift
  S({ text: 'One fundamental land is a level two.', quote: 'a single fundamental focus is scored as level two on the national standard form' }),              // invented quote
  S({ turns: [3], timestamp: '00:01:30', speaker_basis: 'content', type: 'correction', criteria: ['desired_performances'], skills: ['turn_shape'], text: 'Symmetry above and below the fall line in bumps is not going to happen. They are tightening the radius at the end of the turn.', quote: 'Symmetry above and below the fall line in bumps is, my man, not going to happen' }),
  S({ turns: [wins[0][wins[0].length - 1].i], text: 'x', quote: 'y' }),                                                                                           // starts in a context turn
  { text: 'no turns' },
], ctx);
assert.equal(r.chunks.length, 2, JSON.stringify(r.rejected));
assert.deepEqual(r.rejected.map((x) => x.why.split(' (')[0]).sort(), ['bad shape', 'quote not in transcript', 'starts in a context-only turn', 'text drifted from what was said']);
const [a, b] = r.chunks;
assert.deepEqual(a.criteria, ['cause_effect']); assert.deepEqual(a.skills, ['rotary']); assert.equal(a.approved, false); assert.equal(a.source, 'chris_zoom');
assert.equal(a.metadata.attribution.check, false); assert.equal(b.metadata.attribution.check, true, 'mentor speech under the candidate label is flagged, not dropped');
assert.equal(normalizeChunk(a).approved, false, 'chris_zoom defaults to unapproved in the store too');
assert.equal(dedupe([a, { ...a, text: `${a.text} Right.` }, b]).length, 2);

// Pipeline with a fake store + fake model: dry run without a map, 409 on re-ingest, replacePending path, nothing embedded.
const calls = { inserted: null, deleted: 0 };
const store = { countBySourceRef: async () => ({ pending: 3, approved: 1 }), deletePendingBySourceRef: async () => { calls.deleted++; return 3; }, insertPending: async (c) => { calls.inserted = c; return { inserted: c.length, skipped: 0 }; } };
const completeJson = async ({ user }) => (user.includes('part 1 of') ? { statements: [S({ text: a.text, quote: a.metadata.quote })], tool_feedback: [{ timestamp: '00:00:10', text: 'The AI peer said pivot.' }] } : { statements: [] });
const dry = await ingestZoom({ transcript: raw, date: '2026-09-18' }, { store, completeJson });
assert.equal(dry.needs, 'speakerMap'); assert.equal(calls.inserted, null);
await assert.rejects(() => ingestZoom({ transcript: raw, date: '2026-09-18', speakerMap: map }, { store, completeJson }), /already ingested/);
await assert.rejects(() => ingestZoom({ transcript: raw, date: '9/18', speakerMap: map }, { store, completeJson }), /date/);
const live = await ingestZoom({ transcript: raw, date: '2026-09-18', speakerMap: map, replacePending: true }, { store, completeJson });
assert.equal(live.inserted, 1); assert.equal(calls.deleted, 1); assert.equal(live.tool_feedback.length, 1);
assert.ok(calls.inserted.every((c) => c.approved === false && !('embedding' in c)), 'pending chunks carry no embedding');
const ses = normalizeSessions([{ from: '00:00:00', to: '00:24:30', id: 'ma_7uk7lnh', label: 'Fall Line Bumps' }]);
assert.equal(sessionAt(5, ses).id, '7uk7lnh'); assert.equal(sessionAt(1500, ses), null); assert.throws(() => normalizeSessions([{ id: 'x', from: 'soon', to: '1:00' }]));
const tagged = await ingestZoom({ transcript: raw, date: '2026-09-18', speakerMap: map, replacePending: true, sessions: [{ from: '00:00', to: '00:30', id: 'ma_SELF' }] }, { store, completeJson });
assert.equal(calls.inserted[0].metadata.session_id, 'SELF', 'chunk inside a session range carries session_id for self-exclusion'); assert.equal(tagged.about_sessions[0].chunks, 1);

// Score guard: a line Chris never said cannot appear in a scores item; asr_fixes don't launder it.
const heard = 'So MA two three two cost and effect to evaluate re prescription. Two cost. Two cause and effect. Two evaluate. Three prescription.';
assert.deepEqual(scoreLinesUnheard('Scores for Fall Line Bumps: MA Describe 2, Cause and Effect 2, Evaluate 2, Prescription 3.', heard), ['describe']);
assert.deepEqual(scoreLinesUnheard('Scores for Fall Line Bumps: Cause and Effect 2, Evaluate 2, Prescription 3.', heard), []);
assert.deepEqual(scoreLinesUnheard('You need to describe the turn shape better.', heard), [], 'only score items are checked');
// Two passes are unioned; an item only the second pass found survives; excluded ranges drop out.
let call = 0;
const twoPass = async ({ user }) => { call++; if (!user.includes('part 1 of')) return { statements: [] };
  return call <= wins.length ? { statements: [S({ text: a.text, quote: a.metadata.quote })] }
    : { statements: [S({ text: `${a.text} Right.`, quote: a.metadata.quote }), S({ turns: [3], timestamp: '00:01:30', text: b.text, quote: b.metadata.quote, type: 'correction' })] }; };
const u = await ingestZoom({ transcript: raw, date: '2026-09-18', speakerMap: map, dryRun: true }, { store, completeJson: twoPass });
assert.equal(u.would_insert, 2); assert.equal(u.only_in_later_pass, 1); assert.equal(u.chunks[0].text, a.text, 'first pass wording wins');
call = 0;
const ex = await ingestZoom({ transcript: raw, date: '2026-09-18', speakerMap: map, dryRun: true, exclude: [{ from: '00:01:00', to: '00:02:00', reason: 'off-topic' }] }, { store, completeJson: twoPass });
assert.equal(ex.would_insert, 1); assert.equal(ex.excluded.length, 1);

// §5.6
const old = (n, o) => ({ id: `old-${n}`, author: 'chris', approved: true, date: '2026-09-17', source: 'chris_comment', source_ref: 'session:x', criteria: ['general'], skills: [], type: 'principle', text: 't', ...o });
const pool = [old(1, { criteria: ['cause_effect'] }), old(2, { criteria: ['general'] }), old(3, { skills: ['rotary'], date: '2026-10-01' }), old(4, { author: 'gates', criteria: ['cause_effect'] }), old(5, { criteria: ['cause_effect'], skills: ['rotary'], type: 'correction' })];
const N = { id: 'new', author: 'chris', date: '2026-09-18', source_ref: 'zoom:2026-09-18', criteria: ['cause_effect', 'general'], skills: ['rotary'], type: 'principle' };
assert.deepEqual(supersessionCandidates(N, pool).map((c) => c.id), ['old-5', 'old-1'], 'same author, older, real tag overlap, best overlap first');
assert.deepEqual(supersessionCandidates({ ...N, type: 'correction' }, pool).map((c) => c.id), ['old-5'], 'a correction is never offered a principle to replace');
assert.equal(canSupersede({ type: 'correction' }, { type: 'principle' }), false); assert.equal(canSupersede({ type: 'principle' }, { type: 'correction' }), true);

// Prompt carries the rules that matter.
const sys = zoomSystem();
for (const must of ['SPEAKER LABELS ARE UNRELIABLE', 'reads aloud', 'Do not generalize', 'VERBATIM', 'tool_feedback', 'desired_performances', 'equipment']) assert.ok(sys.includes(must), `prompt missing: ${must}`);

// Real transcript, if given: parses, windows cover it, prompt sizes are sane.
const f = process.argv[2];
if (f && existsSync(f)) {
  const t = parseTranscript(readFileSync(f, 'utf8')); const w = windows(t);
  assert.ok(t.length > 100); assert.deepEqual(w.flatMap((x) => x.filter((y) => !y.ctx).map((y) => y.i)), t.map((x) => x.i));
  console.log(`real transcript: ${t.length} turns · ${w.length} windows · ${w.map((x) => Math.round(zoomUser({ turns: x, date: 'd', part: 1, parts: 1 }).length / 4)).join(' / ')} tok · system ${Math.round(sys.length / 4)} tok`);
  console.log(JSON.stringify(speakerReport(t).guess));
}
console.log('selftest-zoom: ok');
