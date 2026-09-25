// Offline checks for session 7b: the Postgres-backed /api/sheet keeps the Apps Script contract that both apps rely on.
//   npm run test:ops
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.window = { localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }, location: { origin: 'https://rm-at-developer.vercel.app' } };

const ops = await import('../lib/ops.js');
const { handle, memoryAdapter, splitPayload, recipientsFrom, DEFAULT_HEADERS } = ops;
let n = 0; const ok = (m) => { n++; console.log('ok  ', m); };

// ── 1. the five actions ──────────────────────────────────────────────────────
{
  const db = memoryAdapter();
  assert.deepEqual(await handle({ _action: 'getAll', _sheet: 'Journal' }, db), { rows: [] });
  let r = await handle({ _action: 'update', _sheet: 'Journal', id: 'j1', whatISaw: 'x', entryType: 'study' }, db);
  assert.deepEqual(r, { success: true, id: 'j1', action: 'created' }, 'update on a new id creates (Apps Script upsert)');
  r = await handle({ _action: 'update', _sheet: 'Journal', id: 'j1', mentorPulse: '{"chris":"connecting"}' }, db);
  assert.equal(r.action, 'updated');
  const { rows } = await handle({ _action: 'getAll', _sheet: 'Journal' }, db);
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]), DEFAULT_HEADERS.Journal, 'every header present on every row, in header order');
  assert.equal(rows[0].whatISaw, 'x', 'one-column update kept the other columns'); assert.equal(rows[0].mentorPulse, '{"chris":"connecting"}'); assert.equal(rows[0].date, '', 'unset column reads as empty string');
  assert.deepEqual(await handle({ _action: 'create', _sheet: 'Journal', id: 'j1', whatISaw: 'x' }, db), { success: true, id: 'j1', action: 'updated' }, 'create after update never duplicates');
  assert.equal((await handle({ _action: 'getAll', _sheet: 'Journal' }, db)).rows.length, 1);
  await handle({ _action: 'update', _sheet: 'Journal', id: 'j2', whatISaw: 'y', extraColumn: 'kept' }, db);
  const all = (await handle({ _action: 'getAll', _sheet: 'Journal' }, db)).rows;
  assert.deepEqual(all.map((x) => x.id), ['j1', 'j2'], 'insertion order'); assert.equal(all[0].extraColumn, '', 'a column any row has is reported on all'); assert.equal(all[1].extraColumn, 'kept', 'unknown keys are stored, not dropped');
  assert.deepEqual(await handle({ _action: 'delete', _sheet: 'Journal', _id: 'j1', id: 'j1' }, db), { success: true, id: 'j1' });
  assert.match((await handle({ _action: 'delete', _sheet: 'Journal', _id: 'j1' }, db)).error, /Row not found with id: j1/, 'delete of a missing row answers as the script did');
  assert.match((await handle({ _action: 'update', _sheet: 'Journal', whatISaw: 'no id' }, db)).error, /No id provided/);
  assert.match((await handle({ _action: 'bogus', _sheet: 'Journal' }, db)).error, /Unknown action: bogus/);
  assert.match((await handle({ _action: 'getAll', _sheet: 'Journal; drop' }, db)).error, /Bad sheet name/);
  assert.equal((await handle({ _action: 'ping' }, db)).store, 'postgres');
  ok('getAll / update / create / delete / ping: Apps Script shapes, upsert, per-column writes, header fill, order');
}

// ── 2. values and the `b` header ─────────────────────────────────────────────
{
  assert.deepEqual(splitPayload({ b: 'ma_x', id: 'ma_x', summary: '{}', _action: 'update', _sheet: 'MASessions' }), { id: 'ma_x', cols: { summary: '{}' } }, '`b` never stored; meta keys dropped');
  assert.deepEqual(splitPayload({ b: 'ma_y', date: '2026-09-24' }), { id: 'ma_y', cols: { date: '2026-09-24' } }, '`b` read as id when the row has no id (live MASessions header)');
  assert.deepEqual(splitPayload({ id: 'k', n: 3, t: true, o: { a: 1 }, u: undefined, z: null, s: '' }).cols, { n: '3', t: 'true', o: '{"a":1}', s: '' }, 'numbers/booleans → text, objects → JSON, null/undefined → not sent');
  const db = memoryAdapter({ MASessions: [{ b: 'ma_old', date: '2026-01-01', summary: 'S' }] });
  const { rows } = await handle({ _action: 'getAll', _sheet: 'MASessions' }, db);
  assert.equal(rows[0].id, 'ma_old'); assert.equal('b' in rows[0], false, 'migrated `b` rows come back with a real id column');
  await handle({ _action: 'update', _sheet: 'MASessions', id: 'ma_old', b: 'ma_old', summary: 'S2' }, db);
  assert.equal((await handle({ _action: 'getAll', _sheet: 'MASessions' }, db)).rows[0].summary, 'S2', 'the new app\'s `{ id, b }` write lands on the migrated row');
  ok('values coerced to text; `b`-for-id header handled at both ends');
}

// ── 3. both apps' write discipline through src/api.js against the store ──────
{
  const db = memoryAdapter();
  globalThis.fetch = async (url, init) => { assert.equal(url, '/api/sheet'); const out = await handle(JSON.parse(init.body), db); return { ok: true, status: 200, text: async () => JSON.stringify(out) }; };
  const api = await import('../src/api.js');
  const J = await import('../src/lib/journal.js');
  const e = { ...J.newEntry('study'), id: 'e1', whatISaw: 'first' };
  assert.equal(await api.saveJournalEntry(e, { isNew: true }), true);
  const stale = { ...e };                                                            // Mark's copy before the mentors act
  let p = await api.setJournalPulse('e1', 'chris', 'connecting'); assert.equal(p.ok, true);
  let c = await api.appendJournalComment('e1', { userId: 'gates', text: 'nice', timestamp: '2026-09-24T00:00:00Z' }); assert.equal(c.ok, true);
  assert.equal(await api.saveJournalEntry({ ...stale, whatISaw: 'edited later' }), true);
  const { entries, typeColumn } = await api.loadJournal();
  assert.equal(typeColumn, true, 'entryType column exists in Postgres from day one');
  assert.equal(entries.length, 1); assert.equal(entries[0].whatISaw, 'edited later'); assert.equal(entries[0].entryType, 'study');
  assert.deepEqual(entries[0].mentorPulse, { chris: 'connecting' }, 'Mark\'s save from a stale copy kept Chris\'s depth read'); assert.equal(entries[0].mentorComments.length, 1, '…and Gates\'s comment');
  p = await api.setJournalPulse('e1', 'chris', null); assert.deepEqual(p.mentorPulse, {}, 'deselect');
  assert.equal(await api.deleteJournalEntry('e1'), true);
  assert.equal((await api.setJournalPulse('e1', 'chris', 'surface')).reason, 'gone', 'a depth tap on a deleted entry creates nothing');
  assert.equal(db.rows.size, 0);
  // MA History: one-column writes, ids with the ma_ prefix and the `b` mirror
  const sess = { id: 'abc1234', date: '2026-09-24', type: 'MA', context: 'Training', who: 'Peer', activity: 'Bumps', conditions: '', transcript: '', sections: { root_cause: 'x' }, summary: '{"scores":{}}', notes: '', mentorFeedback: [] };
  assert.equal(await api.saveMaSession(sess), true);
  assert.equal(await api.saveMaSummary('abc1234', { scores: { cause_effect: 2 } }), true);
  const ma = (await handle({ _action: 'getAll', _sheet: 'MASessions' }, db)).rows;
  assert.equal(ma.length, 1); assert.equal(ma[0].id, 'ma_abc1234'); assert.equal(JSON.parse(ma[0].sections).root_cause, 'x', 'summary write left sections alone'); assert.equal(JSON.parse(ma[0].summary).scores.cause_effect, 2);
  assert.equal(await api.deleteMaSession('abc1234'), true); assert.equal(db.rows.size, 0);
  ok('src/api.js unchanged: journal stale-copy merge, pulse/comment ownership, MA per-column writes and delete');
}

// ── 4. the scorer's read path (lib/sheet.js) from the store ──────────────────
{
  const db = memoryAdapter({ MASessions: [{ b: 'ma_s1', date: '2026-09-20', type: 'MA', transcript: 'T', sections: '{"root_cause":"x"}', summary: '', mentorFeedback: '[]' }, { id: 'ma_s2', date: '2026-09-21', type: 'MA', transcript: 'U', sections: '{}', mentorFeedback: '' }], Config: [{ id: '_THEMES', data: '[]' }] });
  ops.supabaseAdapter.select = (sheet) => db.select(sheet);                          // point the store at memory
  process.env.SUPABASE_URL = 'x'; process.env.SUPABASE_SERVICE_KEY = 'y'; delete process.env.APP_BASE_URL; delete process.env.APPS_SCRIPT_URL;
  const S = await import('../lib/sheet.js');
  assert.equal(S.hasStore(), true);
  const sessions = await S.getMaSessions();
  assert.deepEqual(sessions.map((s) => s.id), ['s2', 's1'], 'newest first, ma_ stripped, `b` id read'); assert.deepEqual(sessions[1].sections, { root_cause: 'x' }); assert.deepEqual(sessions[0].mentorFeedback, []);
  assert.deepEqual(await S.getConfig(), { _THEMES: '[]' });
  await assert.rejects(S.getAll('Config', { via: 'http' }), /APP_BASE_URL/, 'the HTTP path is still there for the migration script');
  ok('lib/sheet.js reads Postgres directly when configured; HTTP path kept for the migration');
}

// ── 5. notify ────────────────────────────────────────────────────────────────
{
  assert.deepEqual(recipientsFrom('{"chris":{"email":"c@x.com"},"gates":{"email":""},"mike":{"email":"m@x.com","notifications":false},"bad":null}'), ['c@x.com']);
  assert.deepEqual(recipientsFrom('not json'), []);
  const db = memoryAdapter();
  delete process.env.RESEND_API_KEY;
  assert.deepEqual(await handle({ _action: 'notify', _sheet: 'Config', subject: 's', body: 'b' }, db), { success: false, error: 'No profiles found', sent: 0 }, 'same answer as the script with no profiles');
  await handle({ _action: 'update', _sheet: 'Config', id: '_MENTOR_PROFILES', data: '{"chris":{"email":"c@x.com"},"gates":{"email":"g@x.com"}}' }, db);
  let r = await handle({ _action: 'notify', _sheet: 'Config', subject: 's', body: 'b' }, db);
  assert.equal(r.success, false); assert.match(r.error, /RESEND_API_KEY/); assert.equal(r.wouldSend, 2, 'no provider: clear error, no throw');
  process.env.RESEND_API_KEY = 'k';
  const sent = []; const send = async (m) => { if (m.to === 'g@x.com') throw new Error('bounced'); sent.push(m); };
  r = await handle({ _action: 'notify', _sheet: 'Config', subject: 'New entry', body: 'Mark wrote' }, db, { send });
  assert.deepEqual(r, { success: true, sent: 1, error: 'g@x.com: bounced' }); assert.deepEqual(sent, [{ to: 'c@x.com', subject: 'New entry', body: 'Mark wrote' }]);
  delete process.env.RESEND_API_KEY;
  ok('notify: profiles from Config, Resend when configured, one bad address does not stop the others');
}

// ── 6. the endpoint: 200 for the script's own errors, 502 for a store failure ─
{
  const { default: handler } = await import('../api/sheet.js');
  const call = async (body, method = 'POST') => { let status = 0, json; const res = { setHeader() {}, status(s) { status = s; return res; }, json(j) { json = j; return res; }, end() { return res; } }; await handler({ method, body }, res); return { status, json }; };
  ops.supabaseAdapter.select = async () => { throw new Error('connection refused'); };
  ops.supabaseAdapter.get = async () => null;
  ops.supabaseAdapter.remove = async () => 0;
  let r = await call({ _action: 'getAll', _sheet: 'Journal' }); assert.equal(r.status, 502); assert.match(r.json.error, /connection refused/);
  r = await call({ _action: 'delete', _sheet: 'Journal', _id: 'nope' }); assert.equal(r.status, 200, 'a logic error is a 200 { error }, as the script sent it'); assert.match(r.json.error, /Row not found/);
  r = await call({ _action: 'bogus' }); assert.equal(r.status, 200); assert.match(r.json.error, /Unknown action/);
  r = await call(null, 'GET'); assert.equal(r.status, 405);
  r = await call({ _action: 'ping' }); assert.equal(r.status, 200); assert.equal(r.json.store, 'postgres');
  ok('api/sheet.js: status codes keep the client retry semantics');
}

console.log(`\n${n} groups passed`);
