// Offline checks for the Journal tab (session 7): row mapping and its guards, column ownership under concurrent writers,
// depth set/change/clear, hash-diff, the two-line list summary, notification, drafts, the Challenge prompt.
//   npm run test:journal [path/to/Journal-getAll.json]
// With a real export as the argument, every live row is also run through the mapping and back.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const mem = new Map();
globalThis.window = { localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }, location: { origin: 'https://rm-at-developer.vercel.app' } };

// ── an in-memory Apps Script: same semantics as AT_AppsScript_V2 (header-mapped writes, per-column update, update upserts) ──
const JOURNAL_HEADERS = ['id', 'date', 'context', 'location', 'conditions', 'whatISaw', 'whatWasGoingOn', 'whatIDid', 'whyThatApproach', 'whatHappened', 'whatIdDoDifferently', 'videoUrl', 'connectionTags', 'themeIds', 'depthLevel', 'resourceId', 'season', 'timestamp', 'mentorPulse', 'mentorComments', 'data'];
const sheet = { headers: { Journal: [...JOURNAL_HEADERS] }, rows: { Journal: [] }, mail: [], failNext: 0, calls: [] };
const profiles = { chris: { email: 'chris@example.com' }, gates: { email: '', notifications: true }, mike: { email: 'mike@example.com', notifications: false } };
function script(body) {
  const { _action, _sheet, ...data } = body;
  sheet.calls.push(_action);
  if (sheet.failNext > 0) { sheet.failNext--; return { error: 'Unknown action: ' }; }
  const H = sheet.headers[_sheet] || ['id', 'data'], R = (sheet.rows[_sheet] ||= []);
  const toRow = (d) => Object.fromEntries(H.map((h) => [h, d[h] !== undefined ? String(d[h]) : '']));
  if (_action === 'getAll') return { rows: R.map((r) => ({ ...r })) };
  if (_action === 'create') { R.push(toRow(data)); return { success: true }; }
  if (_action === 'update') {
    const row = R.find((r) => r.id === String(data.id));
    if (row) { for (const h of H) if (data[h] !== undefined) row[h] = String(data[h]); return { success: true, action: 'updated' }; }
    R.push(toRow(data)); return { success: true, action: 'created' };
  }
  if (_action === 'delete') { const i = R.findIndex((r) => r.id === String(data._id)); if (i < 0) return { error: `Row not found with id: ${data._id}` }; R.splice(i, 1); return { success: true }; }
  if (_action === 'notify') { const to = Object.values(profiles).filter((p) => p.email && p.notifications !== false); to.forEach((p) => sheet.mail.push({ to: p.email, ...data })); return { success: true, sent: to.length }; }
  return { error: `Unknown action: ${_action}` };
}
globalThis.fetch = async (url, init) => { assert.equal(url, '/api/sheet'); const out = script(JSON.parse(init.body)); return { ok: true, status: 200, text: async () => JSON.stringify(out) }; };

const J = await import('../src/lib/journal.js');
const api = await import('../src/api.js');
const { buildChallengeSystem, challengeUserMessage } = await import('../src/lib/prompts.js');
const { USERS } = await import('../src/lib/users.js');
let n = 0; const ok = (m) => { n++; console.log('ok  ', m); };

// ── 1. row mapping guards ────────────────────────────────────────────────────
{
  const base = { id: ' abc ', date: '2026-05-21', context: 'Training', whatISaw: 'x', connectionTags: '["ma","physics"]', themeIds: 'not json', mentorPulse: '{"chris":"connecting","gates":"bogus"}', mentorComments: '[{"userId":"chris","text":"why?","timestamp":"2026-05-22T00:00:00Z"},{"userId":"x"}]', timestamp: '2026-05-21T01:00:00Z' };
  const e = J.normalizeJournalRow(base);
  assert.equal(e.id, 'abc'); assert.deepEqual(e.connectionTags, ['ma', 'physics']); assert.deepEqual(e.themeIds, [], 'unparseable JSON column → default, not a throw');
  assert.deepEqual(e.mentorPulse, { chris: 'connecting' }, 'unknown depth values dropped'); assert.equal(e.mentorComments.length, 1, 'comment without text dropped');
  assert.equal(e.typeKnown, false); assert.equal(e.entryType, 'coaching', 'no stored type → coaching prompts, as the old app rendered it, but not labelled as such');
  assert.equal(J.normalizeJournalRow({ ...base, entryType: 'study' }).typeKnown, true);
  for (const id of ['_THEMES', 'ma_7uk7lnh', 'cp_1', 'vid_qwn6hc1']) assert.equal(J.normalizeJournalRow({ id, date: 'x' }), null, `${id} is not a journal entry`);
  assert.equal(J.normalizeJournalRow({ id: '', date: '', context: '' }), null, 'blank row skipped');
  const a = J.normalizeJournalRow({ id: '', whatISaw: 'kept', timestamp: '2026-04-21T13:58:34.618Z' }), b = J.normalizeJournalRow({ id: '', whatISaw: 'kept', timestamp: '2026-04-21T13:58:34.618Z' });
  assert.equal(a.id, b.id, 'id-less row gets the SAME id on every load');
  assert.equal(J.cleanDate('Tue Apr 21 2026 00:00:00 GMT-0600 (Mountain Daylight Time)'), '2026-04-21'); assert.equal(J.cleanDate('garbage'), ''); assert.equal(J.cleanDate('2026-05-01T03:00:00Z'), '2026-05-01');
  const dated = [{ id: 'a', date: '', timestamp: '2026-04-21T13:00:00Z' }, { id: 'b', date: '2026-05-01', timestamp: '' }, { id: 'c', date: '2026-05-01', timestamp: '' }].map((r) => J.normalizeJournalRow({ ...r, whatISaw: 'x' })).sort(J.byEntryDesc);
  assert.deepEqual(dated.map((x) => x.id), ['c', 'b', 'a'], 'undated entry sorts by its timestamp; same-day ties break on id');
  assert.equal(J.hasTypeColumn([{ id: 'a' }]), false); assert.equal(J.hasTypeColumn([{ id: 'a', entryType: '' }]), true); assert.equal(J.hasTypeColumn([]), null);
  ok('row mapping: JSON guards, foreign rows, stable ids, dates, sort, type-column detection');
}

// ── 2. column ownership ──────────────────────────────────────────────────────
{
  const e = { ...J.newEntry('general'), whatISaw: 'a', whatWasGoingOn: 'b', whyThatApproach: 'left over from Coaching', mentorPulse: { chris: 'integrated' }, mentorComments: [{ userId: 'chris', text: 'x' }] };
  const row = J.contentRow(e);
  assert.ok(!('mentorPulse' in row) && !('mentorComments' in row), "Mark's save never carries the mentor columns");
  assert.equal(row.whyThatApproach, '', 'an answer the type has no prompt for is not saved invisibly');
  assert.deepEqual([J.createRow(e).mentorPulse, J.createRow(e).mentorComments], ['{}', '[]']);
  assert.equal(J.contentHash(e), J.contentHash({ ...e, mentorPulse: {}, mentorComments: [] }), 'mentor activity does not make an entry look edited');
  assert.notEqual(J.contentHash(e), J.contentHash({ ...e, whatISaw: 'a2' }));
  ok('content row: mentor columns excluded, hidden answers cleared, hash ignores mentor columns');
}

// ── 3. depth + comments merge ────────────────────────────────────────────────
{
  assert.deepEqual(J.applyPulse({ gates: 'surface' }, 'chris', 'connecting'), { gates: 'surface', chris: 'connecting' });
  assert.deepEqual(J.applyPulse({ gates: 'surface', chris: 'connecting' }, 'chris', 'integrated'), { gates: 'surface', chris: 'integrated' }, 'change');
  assert.deepEqual(J.applyPulse({ gates: 'surface', chris: 'connecting' }, 'chris', null), { gates: 'surface' }, 'deselect');
  assert.deepEqual(J.applyPulse('junk', 'chris', 'nope'), {});
  const c1 = { userId: 'gates', text: 'first', timestamp: '2026-09-19T10:00:00Z' }, c2 = { userId: 'chris', text: 'second', timestamp: '2026-09-19T11:00:00Z' };
  assert.deepEqual(J.mergeComment([c2], c1).map((c) => c.text), ['first', 'second']); assert.equal(J.mergeComment([c1, c2], c2).length, 2, 'idempotent');
  assert.equal(J.topDepth({ mentorPulse: { chris: 'surface', gates: 'integrated' } }).id, 'integrated'); assert.equal(J.topDepth({ mentorPulse: {} }), null);
  ok('depth set / change / deselect; comment merge; top depth');
}

// ── 4. against the (simulated) Sheet: concurrent writers, upsert, retry, delete, notify ──
{
  const e = { ...J.newEntry('personal'), whatISaw: 'Short turns on Go Devil', whatWasGoingOn: 'Felt early edge; video shows a pivot.' };
  sheet.failNext = 1;                                             // transient failure on the first try
  assert.equal(await api.saveJournalEntry(e, { isNew: true }), true); assert.equal(await api.saveJournalEntry(e, { isNew: true }), true);
  assert.equal(sheet.rows.Journal.length, 1, 'transient failure retried; a repeated create never duplicates the row');
  assert.ok(!sheet.calls.includes('create'), 'update-only: no fall-through to create');

  let { entries, typeColumn } = await api.loadJournal();
  assert.equal(typeColumn, false); assert.equal(entries[0].typeKnown, false, 'no entryType header → the type is dropped by the script (the live Sheet today)');
  const markStale = entries[0];                                   // Mark opens the entry…
  const p = await api.setJournalPulse(e.id, 'chris', 'connecting'); assert.ok(p.ok);      // …Chris assesses depth…
  const g = await api.appendJournalComment(e.id, { userId: 'gates', text: 'Which ski?', timestamp: '2026-09-19T10:00:00Z' }); assert.ok(g.ok);
  assert.ok(await api.saveJournalEntry({ ...markStale, whatIDid: 'Slowed the edge change.' }));   // …Mark saves from his stale copy
  ({ entries } = await api.loadJournal());
  assert.deepEqual(entries[0].mentorPulse, { chris: 'connecting' }, "Mark's edit did not erase Chris's depth read"); assert.equal(entries[0].mentorComments.length, 1);
  assert.equal(entries[0].whatIDid, 'Slowed the edge change.');
  const c = await api.appendJournalComment(e.id, { userId: 'chris', text: 'And what did the ski do?', timestamp: '2026-09-19T11:00:00Z' });   // Chris's copy predates Gates's comment
  assert.deepEqual(c.mentorComments.map((x) => x.userId), ['gates', 'chris'], 'both comments kept');
  assert.deepEqual((await api.setJournalPulse(e.id, 'chris', null)).mentorPulse, {}, 'deselect reaches the Sheet');
  assert.deepEqual((await api.setJournalPulse(e.id, 'gates', 'surface')).mentorPulse, { gates: 'surface' });

  sheet.headers.Journal.push('entryType'); sheet.rows.Journal.forEach((r) => { r.entryType = ''; });   // Mark adds the header
  assert.ok(await api.saveJournalEntry({ ...entries[0], entryType: 'personal' }));
  ({ entries, typeColumn } = await api.loadJournal());
  assert.equal(typeColumn, true); assert.equal(entries[0].entryType, 'personal'); assert.equal(entries[0].typeKnown, true); ok('with the header in place, the type round-trips');

  const note = J.notificationFor(entries[0], 'https://rm-at-developer.vercel.app');
  const sent = await api.notifyMentors(note.subject, note.body);
  assert.deepEqual([sent.ok, sent.sent], [true, 1]); assert.equal(sheet.mail[0].to, 'chris@example.com'); assert.match(sheet.mail[0].subject, /New Personal Skiing from Mark/); assert.match(sheet.mail[0].body, /Short turns on Go Devil[\s\S]*rm-at-developer/);
  assert.deepEqual(J.notifyRecipients(JSON.stringify(profiles)).map((r) => r.key), ['chris'], 'no email / notifications:false are skipped — same rule as the script'); assert.deepEqual(J.notifyRecipients(''), []);

  assert.ok(await api.deleteJournalEntry(e.id));
  const gone = await api.setJournalPulse(e.id, 'chris', 'surface');
  assert.deepEqual([gone.ok, gone.reason], [false, 'gone']); assert.equal(sheet.rows.Journal.length, 0, 'a depth tap on a deleted entry does not resurrect an empty row');
  ok('Sheet simulation: retry, no duplicate, concurrent mentor/candidate writes, deselect, notify, delete guard');
}

// ── 5. list summary: two lines ───────────────────────────────────────────────
{
  const mk = (t, f) => ({ ...J.newEntry(t), ...f });
  let s = J.listSummary(mk('coaching', { whatISaw: 'Chris challenge no ski to ski or edging at all.\nSki is white pass turns, focus on the inside ski through the top of the turn.', whatWasGoingOn: 'zzz' }));
  assert.equal(s.title, 'Chris challenge no ski to ski or edging at all.'); assert.match(s.more, /^Ski is white pass/); assert.equal(s.moreLabel, '', 'multi-line first answer: line 2 continues it');
  s = J.listSummary(mk('study', { whatISaw: 'Root Cause VS Symptom', whatWasGoingOn: 'A symptom is what I see; the cause is what I verify.' }));
  assert.deepEqual([s.title, s.moreLabel, s.more], ['Root Cause VS Symptom', 'What clicked or connected?', 'A symptom is what I see; the cause is what I verify.'], 'short first answer: line 2 is the next answered prompt, labelled');
  const long = 'In my own skiing I worked on actively using my lower legs and ankles to tip the skis earlier in the turn, and I noticed that the inside ski kept lagging behind the outside ski on my left turns only.';
  s = J.listSummary(mk('personal', { whatISaw: long }));
  assert.ok(s.title.length <= 101 && s.title.endsWith('…') && s.more.length > 25); assert.ok(long.replace(/\s+/g, ' ').includes(s.more.replace(/…$/, '').slice(0, 30)), 'a long single line is split across the two lines, nothing repeated');
  assert.ok(!s.title.replace('…', '').endsWith(' '));
  assert.deepEqual(J.listSummary(mk('general', {})), { title: 'Untitled entry', more: '', moreLabel: '' });
  s = J.listSummary(mk('general', { whatISaw: '', whatWasGoingOn: 'Only the second prompt answered.' })); assert.equal(s.title, 'Only the second prompt answered.');
  s = J.listSummary(mk('general', { whatISaw: 'x', whyThatApproach: 'hidden under General' })); assert.equal(s.more, '', 'answers the type does not show never reach the list');
  ok('list summary');
}

// ── 6. drafts and the Challenge cache ────────────────────────────────────────
{
  const e = { ...J.newEntry('clinic'), whatISaw: 'Bumps clinic with Gates' };
  J.saveDraft('new', e); assert.equal(J.loadDraft('new').whatISaw, e.whatISaw); J.clearDraft('new'); assert.equal(J.loadDraft('new'), null);
  mem.set('rmat_journal_draft_bad', '{not json'); assert.equal(J.loadDraft('bad'), null);
  J.saveChallenge(e, 'What would you NOT use that drill for?'); assert.equal(J.loadChallenge(e).text, 'What would you NOT use that drill for?');
  assert.equal(J.loadChallenge({ ...e, whatISaw: 'edited' }), null, 'an edited entry drops the old challenge');
  ok('drafts; challenge reply is tied to the text it answered');
}

// ── 7. Challenge prompt ──────────────────────────────────────────────────────
{
  const e = { ...J.newEntry('feedback'), whatISaw: 'Chris after the 9/18 call', themeIds: ['root-cause'], mentorComments: [{ userId: 'chris', text: 'Go to the component parts.', timestamp: 't' }, { userId: 'mark', text: 'my reply', timestamp: 't2' }] };
  const sys = buildChallengeSystem(e, { mentorAssessments: { chris: { consistentGaps: 'chains lack turn phase', whatsWorking: 'sees interactions' } }, coachNotes: { chris: 'Push on the how.', gates: '  ' }, themes: J.DEFAULT_THEMES, users: USERS });
  assert.match(sys, /feedback someone gave him/); assert.match(sys, /Can I see past the symptom/); assert.match(sys, /chains lack turn phase/); assert.match(sys, /Chris: Push on the how\./); assert.ok(!/Gates:\s*$/m.test(sys));
  assert.match(sys, /Chris: Go to the component parts\./); assert.ok(!sys.includes('my reply'), "only mentors' comments are listed as already said");
  assert.ok(!/\bscores?:|AI Scores|Describe=/i.test(sys), 'reads no scores (§15)');
  for (const t of Object.keys(J.ENTRY_TYPES)) assert.notEqual(buildChallengeSystem({ entryType: t }), buildChallengeSystem({ entryType: t === 'general' ? 'study' : 'general' }), `${t} has its own brief`);
  const msg = challengeUserMessage(e, { typeLabel: 'Feedback Received', reflection: J.reflectionText(e), connectionLabels: [] });
  assert.match(msg, /^Feedback Received — /); assert.match(msg, /Who gave the feedback[\s\S]*Chris after the 9\/18 call/); assert.match(msg, /Connections I tagged: none\./);
  ok('Challenge prompt: per type, themes, mentor gaps, coach notes, thread; no scores');
}

// ── 8. every type has prompts on the six shared columns ──────────────────────
for (const [t, ps] of Object.entries(J.PROMPTS_BY_TYPE)) { assert.ok(J.ENTRY_TYPES[t]); assert.deepEqual(ps.map((p) => p.id), J.FIELDS); assert.ok(J.activePrompts(t).length >= 3); }
assert.equal(Object.keys(J.ENTRY_TYPES).length, 6); ok('six entry types on the six Sheet columns');

// ── 9. a real export ─────────────────────────────────────────────────────────
const file = process.argv[2];
if (file && existsSync(file)) {
  const raw = JSON.parse(readFileSync(file, 'utf8')); const rows = Array.isArray(raw) ? raw : raw.rows || raw.data || [];
  const entries = rows.map(J.normalizeJournalRow).filter(Boolean).sort(J.byEntryDesc);
  for (const e of entries) {
    const src = rows.find((r) => String(r.id).trim() === e.id), back = J.contentRow(e);
    if (src) for (const f of [...J.FIELDS, 'context', 'location', 'conditions', 'videoUrl', 'resourceId', 'season', 'timestamp', 'depthLevel']) assert.equal(back[f], String(src[f] ?? '').trim(), `${e.id}.${f} survives load → save`);
    if (src) for (const f of ['connectionTags', 'themeIds']) assert.deepEqual(JSON.parse(back[f]), JSON.parse(src[f] || '[]'));
    const s = J.listSummary(e); assert.ok(s.title);
  }
  console.log(`     live export: ${rows.length} rows → ${entries.length} entries · entryType column: ${J.hasTypeColumn(rows)} · depth read on ${entries.filter((e) => J.topDepth(e)).length} · ${entries.reduce((a, e) => a + e.mentorComments.length, 0)} comments · undated ${entries.filter((e) => !e.date).length}`);
  for (const e of entries) { const s = J.listSummary(e); console.log(`     ${J.entryDay(e) || '—'}  ${s.title}\n                 ${s.moreLabel ? `[${s.moreLabel}] ` : ''}${s.more || '(no second line)'}`); }
  ok('live export round-trips');
}
console.log(`\n${n} groups passed`);
