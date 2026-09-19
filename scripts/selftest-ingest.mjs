// Offline checks for session 6: scorecard → exemplar, comment splitting, agreement, exemplar retrieval in the assembler.
// No network, no keys.   npm run test:ingest
import assert from 'node:assert/strict';
import { renderExemplar, noteChunks, ingestScore, EXEMPLAR_TOKENS } from '../lib/ingest/score.js';
import { splitPoints, commentChunks, ingestComments } from '../lib/ingest/comment.js';
import { agreement } from '../lib/agreement.js';
import { mentorScores, formatScoreLine } from '../lib/mentorScores.js';
import { assemble, BUDGET, estTokens } from '../lib/assembler.js';
import { extractionToText } from '../lib/prompts/extract.js';
import { connectionStats } from '../lib/extractStats.js';
import { normalizeChunk, hashText } from '../lib/store.js';
import { SCORED_CRITERIA } from '../lib/vocab.js';
const SC = await import('../src/lib/scorecard.js');

// ── fixtures: the two real scorecards (§16, 9/17 and 9/18) ──
const conn = (o) => ({ phase: 'initiation', section: 'presentation', body_movement: 'whole-body rotation', fundamental: 'rotary', linked_fundamental: null, body_consequence: 'weight moves inside', ski_performance: null, outcome: null, outcome_detail: null, how_stated: false, how_quote: null, prompted: false, quote: 'whole body rotation caused the ski to rapidly pivot to an edge', ...o });
const mkX = (o = {}) => { const x = {
  ma_type: 'at_exam', extract_version: 3, task: { named: 'Fall line bumps', described: false, quote: null },
  desired_performance: { stated: false, quote: null, fundamentals_blended: [] }, observations: [], skills_referenced: ['rotary', 'edging', 'bogus'],
  connections: [conn({}), conn({ ski_performance: 'ski pivots to an edge', outcome: 'turn_shape', outcome_detail: 'little shape at the top', how_stated: true, how_quote: 'because the legs cannot turn under a rotating pelvis' }), conn({ prompted: true, ski_performance: 'tails skid' })],
  physics_concepts: [{ concept: 'edge platform', explicit_or_implied: 'implied', applied_to: 'observed_skier', prompted: false, quote: 'no platform to push against' }],
  equipment: { addressed: true, prompted: false, quote: 'a softer ski would let her bend it in the trough', linked_to_biomechanics: false, linked_to_desired_performance: true, linked_to_environment: true },
  intent_verification: { asked: true, questions: ['What were you going for?'], peer_answers: ['a guided ski from the top'] },
  comparison_to_intended_outcome: { made: true, intent_referenced_quote: 'you wanted a guided ski', outcome_dimensions: ['turn_shape'], quote: 'you wanted a guided ski and the top of the turn was pivoted' },
  prescription: { task: 'pivot slips to guided entries', delivery_to_peer: 'Keep your zipper facing the fall line and steer both feet from the top.', peer_restated: 'Focus on initiating with a guided ski', chain: { skier_input: 'steer both feet', fundamental_changed: 'rotary', other_fundamentals_affected: null, ski_performance_change: null, outcome_change: null, tied_to_observed_task: false } },
  verbatim_key_phrases: ['rapidly pivot to an edge'], delivery_stats: { peer_prescription_words: 14, peer_prescription_sentences: 1 }, ...o };
  x.connection_stats = connectionStats(x); return x; };
const ai7uk = { cause_effect: 3, evaluate: 4, prescription: 3, desired_performances: 2, biomechanics: 3, equipment: 4, describe: 4, communication: 3 };
const ai7n6 = { cause_effect: 3, evaluate: 1, prescription: 3, desired_performances: 1, biomechanics: 2, equipment: 1, describe: 3, communication: 3 };
const sum = (scores, extra = {}) => ({ scores, meta: { scorer: 'v2-rag-2', scored_at: '2026-09-18T20:00:00Z' }, ...extra });
const s7uk = { id: '7uk7lnh', date: '2026-09-18', type: 'AT MA Exam', who: 'Sam', activity: 'Fall Line Bumps', conditions: 'soft bumps', sections: { presentation: 'x' }, parsedSummary: sum(ai7uk),
  mentorFeedback: [{ userId: 'mark', timestamp: '2026-09-19T10:00:00Z', text: 'Chris scorecard 2026-09-18 (2026 form, scored blind), posted by Mark from the 9/18 call: MA: cause_effect 2, evaluate 2, prescription 3 | TU: desired_performances 2, biomechanics 3, equipment 3' }] };
const s7n6 = { id: '7n6ry6d', date: '2026-09-16', type: 'AT MA Exam', who: 'Ben', activity: 'Dynamic parallel, variable snow', conditions: 'variable', sections: { presentation: 'y' }, parsedSummary: sum(ai7n6, { extraction: mkX({ equipment: { addressed: false } }) }),
  mentorFeedback: [
    { userId: 'chris', timestamp: '2026-09-17T13:16:41.509Z', text: 'Lacks connection.' },
    { userId: 'mark', timestamp: '2026-09-17T15:00:00Z', text: 'Chris scorecard 2026-09-17 (2026 form): MA: cause_effect 2, evaluate 2, prescription 2 (avg 2) | TU: desired_performances 2, biomechanics 2, equipment 1 (avg 1.67) | Overall: Does Not Meet Standards' }] };

// ── 1. one reader, server and browser ──
assert.deepEqual(SC.mentorScores(s7uk), mentorScores(s7uk), 'src/lib/scorecard re-exports the lib reader');
const c7uk = mentorScores(s7uk).chris, c7n6 = mentorScores(s7n6).chris;
assert.deepEqual(SCORED_CRITERIA.map((k) => c7uk.scores[k]), [2, 2, 3, 2, 3, 3]); assert.equal(c7uk.blind, true); assert.equal(c7uk.postedBy, 'mark');
assert.deepEqual(SCORED_CRITERIA.map((k) => c7n6.scores[k]), [2, 2, 2, 2, 2, 1]); assert.equal(c7n6.blind, false);
const withNote = mentorScores({ mentorFeedback: [{ userId: 'mark', text: `${formatScoreLine({ who: 'Chris', date: '2026-09-20', scores: c7uk.scores, blind: true, note: 'Evaluate needs the ideal.' })}` }] }).chris;
assert.equal(withNote.note, 'Evaluate needs the ideal.', 'note parsed from a hand-posted line');

// ── 2. the exemplar text ──
const x = mkX();
const text = renderExemplar({ session: s7uk, extraction: x, card: c7uk, date: '2026-09-18' });
for (const want of ['Cause & Effect — CHRIS: 2', 'Evaluate — CHRIS: 2', 'Equipment — CHRIS: 3', 'blind', '3 causal claims · 1 complete', '[partial: no ski performance, no outcome, no how]', '[complete]', 'prompted', 'MA 2.33 · TU 2.67 · Does Not Meet Standards', 'tied to the task skied: no']) assert.ok(text.includes(want), `exemplar text has "${want}"`);
assert.ok(!/\bAI\b(?! score\))/.test(text.replace('before seeing any AI score', '')), 'no AI numbers or mention beyond the blind flag');
assert.ok(!text.includes('Focus on initiating with a guided ski'), "the peer's restatement is not shown as Mark's prescription");
const big = mkX({ connections: Array.from({ length: 30 }, (_, i) => conn({ quote: 'q '.repeat(200), body_movement: `movement ${i} `.repeat(12) })), physics_concepts: Array.from({ length: 20 }, () => ({ concept: 'c '.repeat(60), explicit_or_implied: 'explicit', applied_to: 'both', quote: 'z '.repeat(150) })) });
const bigText = renderExemplar({ session: s7uk, extraction: big, card: { ...c7uk, note: 'n '.repeat(2000) }, date: '2026-09-18' });
assert.ok(estTokens(bigText) <= EXEMPLAR_TOKENS, `oversized extraction still fits the exemplar cap (${estTokens(bigText)})`);
assert.ok(3 * (EXEMPLAR_TOKENS + 40) <= BUDGET.exemplars, 'three exemplars fit the slot');
const v4 = renderExemplar({ session: s7uk, extraction: mkX({ comparison_to_intended_outcome: { vs_intent: { state: 'made', quote: 'you wanted guided; it was pivoted' }, vs_ideal: { state: 'absent', quote: null }, outcome_dimensions: ['turn_shape'] } }), card: c7uk });
assert.ok(v4.includes("performance vs the skier's intent: made") && v4.includes("vs the task's ideal: absent"), 'renders the two-comparison shape too');

// ── 3. ingest against an in-memory store ──
function memStore() {
  const rows = []; let n = 0;
  return { rows,
    liveBySourceRef: async (source, ref, { author = null } = {}) => rows.filter((r) => r.source === source && r.source_ref === ref && !r.superseded_by && (!author || r.author === author)),
    insertChunks: async (chunks) => { const made = []; let skipped = 0; for (const c of chunks.map(normalizeChunk)) { if (rows.some((r) => r.source === c.source && r.source_ref === c.source_ref && r.text_hash === c.text_hash)) { skipped++; continue; } const row = { ...c, id: `${String(++n).padStart(8, '0')}-0000-0000-0000-000000000000`, superseded_by: null }; rows.push(row); made.push(row); } return { inserted: made.length, skipped, ids: made.map((m) => m.id) }; },
    supersede: async (oldId, newId) => { rows.find((r) => r.id === oldId).superseded_by = newId; },
    commentTimestamps: async (ref) => new Set(rows.filter((r) => r.source === 'chris_comment' && r.source_ref === ref).map((r) => r.metadata?.timestamp).filter(Boolean)),
  };
}
const db = memStore();
let extractCalls = 0;
const deps = { store: db, extractionToText, extractSession: async () => { extractCalls++; return mkX(); } };
await db.insertChunks([{ text: 'old extraction', source: 'past_session', source_ref: 'session:7uk7lnh', type: 'exemplar', author: 'mark' }]);

const r1 = await ingestScore({ session: s7uk }, deps);
assert.equal(extractCalls, 1, '7uk7lnh has no stored extraction (it was shed) → Step 1 runs once'); assert.equal(r1.extraction_from, 'extracted');
assert.equal(r1.inserted, 1); assert.equal(r1.past_session_superseded, 1);
const ex = db.rows.find((r) => r.id === r1.exemplar_id);
assert.equal(ex.source, 'chris_score'); assert.equal(ex.type, 'exemplar'); assert.equal(ex.author, 'chris'); assert.equal(ex.source_ref, 'session:7uk7lnh'); assert.equal(ex.approved, true); assert.equal(ex.date, '2026-09-18');
assert.equal(ex.embed_text, extractionToText(mkX()), 'embedded on the extraction text — the same thing the query is');
assert.deepEqual(ex.skills, ['rotary', 'edging'], 'invalid skill tags dropped'); assert.equal(ex.metadata.blind, true);
assert.deepEqual(ex.metadata.ai_at_submit.scores, Object.fromEntries(SCORED_CRITERIA.map((k) => [k, ai7uk[k]])), 'AI score pinned at first ingest'); assert.equal(ex.metadata.ai_at_submit.pinned_from, 'summary_at_ingest');

const r2 = await ingestScore({ session: s7uk }, deps);
assert.equal(r2.unchanged, true); assert.equal(r2.inserted, 0); assert.equal(extractCalls, 1, 're-run reuses the exemplar\'s extraction: no model call, nothing written');

const rescored = { ...s7uk, parsedSummary: sum({ ...ai7uk, evaluate: 2 }), mentorFeedback: [{ ...s7uk.mentorFeedback[0], text: s7uk.mentorFeedback[0].text.replace('equipment 3', 'equipment 3 | Note: Evaluate: he never set her intent against the ideal for bumps.\n\nEquipment was a recommendation, not an effect on what she did.') }] };
const r3 = await ingestScore({ session: rescored }, deps);
assert.equal(r3.replaced, 1, 'a changed scorecard replaces the exemplar'); assert.equal(db.rows.find((r) => r.id === r1.exemplar_id).superseded_by, r3.exemplar_id);
assert.equal(db.rows.find((r) => r.id === r3.exemplar_id).metadata.ai_at_submit.scores.evaluate, 4, 'the pinned AI score survives a rescore + re-ingest');
assert.equal(r3.notes, 1, 'a note under 600 chars is one point');
const note = db.rows.find((r) => r.metadata?.kind === 'score_note');
assert.ok(note.text.includes('He scored') && note.text.includes('Evaluate 2, Equipment 3') && note.criteria.includes('evaluate') && note.criteria.includes('equipment') && note.type === 'principle');
assert.equal((await db.liveBySourceRef('chris_score', 'session:7uk7lnh')).filter((c) => c.type === 'exemplar').length, 1, 'exactly one live exemplar per mentor per session');

const r4 = await ingestScore({ session: s7n6 }, deps);
assert.equal(r4.extraction_from, 'summary'); assert.equal(extractCalls, 1); assert.ok(db.rows.find((r) => r.id === r4.exemplar_id).text.includes('Equipment — CHRIS: 1') && db.rows.find((r) => r.id === r4.exemplar_id).text.includes('not addressed'));
await assert.rejects(ingestScore({ session: { ...s7n6, mentorFeedback: [] } }, deps), /no chris scorecard/);
await assert.rejects(ingestScore({ session: s7n6, mentor: 'mark' }, deps), /mentor must be/);
const gatesS = { ...s7n6, id: 'gg', mentorFeedback: [{ userId: 'gates', kind: 'blind_score', scores: c7n6.scores, blind: true, timestamp: '2026-09-20T00:00:00Z', ai_at_submit: { form: '2026', scores: ai7n6, scorer: 'v2-rag-2' } }] };
await db.insertChunks([{ text: 'gg past', source: 'past_session', source_ref: 'session:gg', type: 'exemplar', author: 'mark' }]);
const r5 = await ingestScore({ session: gatesS, mentor: 'gates' }, deps);
assert.equal(r5.past_session_superseded, 0, "only Chris's scorecard supersedes the past_session chunk"); assert.equal(db.rows.find((r) => r.id === r5.exemplar_id).metadata.ai_at_submit.pinned_from, 'submit');

// ── 4. comments ──
const long = ['Lacks connection between the fundamentals named and what the ski did; rotary and edging are listed but never related to the turn shape she was after in that terrain.', 'The peer comparison:', 'A coaching cue plus — a few sentences, not a lecture. Tell them what to do, and the one reason it matters for the turn they just made on that pitch.', 'Agreed on the rest.', 'There is no speaking to equipment at all. Boots, ski width and tune all change how the edge engages and how the forces build through the shaping phase of the turn.'].join('\n\n') + '\n\n' + 'x'.repeat(200);
const pts = splitPoints(long);
assert.equal(pts.length, 4, 'lead-in rides forward, short tail rides back'); assert.ok(pts[1].startsWith('The peer comparison:') && pts[1].includes('Agreed on the rest.'));
assert.equal(pts.join('\n\n'), long, 'verbatim: every word, in order, nothing added'); assert.deepEqual(splitPoints('Short one.'), ['Short one.']);
const cc = commentChunks({ session: s7n6, item: { userId: 'chris', text: long, timestamp: 't1' } });
assert.ok(cc[0].text.startsWith('Comment by chris on MA session 7n6ry6d') && cc[2].criteria.includes('equipment') && cc.every((c) => c.source === 'chris_comment' && c.author === 'chris' && c.metadata.timestamp === 't1'));
assert.equal(commentChunks({ session: s7n6, item: s7n6.mentorFeedback[1] }).length, 0, "Mark's post is not a mentor comment");
assert.equal(commentChunks({ session: s7n6, item: { userId: 'chris', kind: 'blind_score', scores: c7n6.scores, text: 'Chris scorecard …' } }).length, 0, 'scorecards belong to the score path');
await db.insertChunks([{ text: 'whole comment as bootstrap stored it', source: 'chris_comment', source_ref: 'session:7n6ry6d', type: 'principle', author: 'chris', metadata: { timestamp: '2026-09-17T13:16:41.509Z' } }]);
const ci = await ingestComments({ session: { ...s7n6, mentorFeedback: [...s7n6.mentorFeedback, { userId: 'chris', text: long, timestamp: 't2' }] } }, { store: db });
assert.equal(ci.comments_skipped, 1, 'a comment already in the store (any form) is not ingested again'); assert.equal(ci.inserted, 4);
assert.equal((await ingestComments({ session: { ...s7n6, mentorFeedback: [{ userId: 'chris', text: long, timestamp: 't2' }] } }, { store: db })).inserted, 0, 'idempotent');

// ── 5. agreement — must reproduce §16's numbers ──
const a = agreement([s7uk, s7n6]);
assert.deepEqual([a.blind.overall.exact, a.blind.overall.within_one, a.blind.overall.n], [3, 5, 6], '7uk7lnh: exact 3/6, within-one 5/6');
assert.equal(a.blind.per_criterion.evaluate.mean_delta, 2, 'Evaluate AI +2'); assert.equal(a.blind.same_result.agree, 1);
assert.deepEqual([a.all.overall.exact, a.all.overall.within_one, a.all.overall.n], [5, 11, 12], 'running total 5/12 exact (42%), 11/12 within one (92%)');
assert.equal(a.all.overall.exact_pct, 41.7); assert.equal(a.all.overall.within_one_pct, 91.7); assert.equal(a.blind.meets_targets, false);
assert.equal(a.not_blind.sessions, 1); assert.ok(a.sessions.every((r) => r.unpinned), 'hand-posted cards with no pin are flagged');
const pinned = agreement([rescored], { pins: { '7uk7lnh': { scores: ai7uk, scorer: 'v2-rag-2' } } });
assert.equal(pinned.blind.per_criterion.evaluate.mean_delta, 2, 'a rescore does not move a past comparison'); assert.equal(pinned.sessions[0].ai_source, 'pinned_at_ingest');
const leg = agreement([{ ...s7uk, parsedSummary: { scores: { describe: 4, cause_effect: 3, evaluate: 4, prescription: 4, biomechanics: 3, communication: 4 } } }]);
assert.equal(leg.sessions.length, 0); assert.match(leg.excluded[0].reason, /old-scorer/);
assert.equal(agreement([gatesS], { mentor: 'gates' }).sessions[0].ai_source, 'submit');
assert.equal(a.trend.length, 1, 'trend is over blind scorecards only');

// ── 6. the assembler retrieves exemplars, never the session's own ──
const id = (n) => `${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;
const defs = Array.from({ length: 7 }, (_, i) => ({ id: id(100 + i), text: 'def', source: 'psia_doc', source_ref: `at-ma-tu-assessment-form-2026.md#MA › ${i}`, type: 'definition', author: 'psia', metadata: {} }));
const exRows = db.rows.filter((r) => r.type === 'exemplar' && r.source === 'chris_score' && !r.superseded_by).map((r, i) => ({ ...r, similarity: 0.6 - i / 100 }));
const calls = [];
const store = { getBySourceRefPrefix: async () => defs, searchByEmbedding: async (_e, o) => { calls.push(o); if (o.types?.length === 1 && o.types[0] === 'exemplar') return exRows.filter((r) => o.authors.includes(r.author)); return []; } };
const asm = await assemble(mkX(), { sessionId: 'ma_7uk7lnh', deps: { embedQuery: async () => [0], store } });
assert.deepEqual(calls.find((c) => c.types?.[0] === 'exemplar' && c.types.length === 1).authors, ['chris'], "exemplar slot asks for Chris's only");
assert.deepEqual(asm.manifest.exemplar_sessions, ['7n6ry6d'], "scoring 7uk7lnh sees 7n6ry6d's exemplar and not its own (nor Gates's)");
assert.ok(asm.context.includes('Equipment — CHRIS: 1') && !asm.context.includes('Fall Line Bumps'), 'own exemplar text absent from the context');
assert.ok(asm.context.includes('start from Chris\'s number'), 'anchoring instruction rides with the exemplars'); assert.ok(asm.manifest.tokens.total <= BUDGET.total);
assert.equal(Object.values(asm.chunkIndex).find((c) => c.slot === 'exemplars').type, 'exemplar', 'exemplar is citable');
assert.ok(normalizeChunk({ text: 'a', source: 'chris_score', type: 'exemplar', embed_text: 'b' }).embed_text === 'b' && hashText('a') === normalizeChunk({ text: 'a', source: 'chris_score', type: 'exemplar', embed_text: 'b' }).text_hash, 'hash is of the stored text, not the embedded text');

console.log('selftest-ingest: all checks passed');
