// Operational data on Supabase Postgres (session 7b). Replaces the Google Apps Script as the store behind /api/sheet.
//
// The contract is the Apps Script's, exactly: a "sheet" is a named set of rows; a row is a map of column name → string;
// `getAll` returns every row with every column present ('' when empty); `update` writes only the keys it is given and
// creates the row when the id is new; `create` is the same (an id can exist once — the Apps Script could append a
// duplicate, both apps only ever `create` after a failed `update`); `delete` removes the row; `notify` mails mentors.
// Rows live as jsonb in one table (`ops_rows`), so a new column never needs DDL and a key is never silently dropped —
// the Apps Script wrote only keys that matched a header, which is how the Journal lost `entryType` for months.
//
// Server-side only (service key). Never import from the frontend. Dependency-free apart from supabase-js so the same
// two files (this + api/sheet.js) drop into the old app's Vercel project unchanged.
import { createClient } from '@supabase/supabase-js';

export const TABLE = 'ops_rows';
export const SHEETS = ['Config', 'Journal', 'MASessions'];

// Columns every row of a sheet reports even when no row has them yet (the Apps Script's `autoCreateTab` headers,
// plus `entryType`, which the live Journal tab gained on 2026-09-24). A key seen on any row is reported on all rows.
export const DEFAULT_HEADERS = {
  Config: ['id', 'data'],
  Journal: ['id', 'date', 'entryType', 'context', 'location', 'conditions', 'whatISaw', 'whatWasGoingOn', 'whatIDid', 'whyThatApproach', 'whatHappened', 'whatIdDoDifferently', 'videoUrl', 'connectionTags', 'themeIds', 'depthLevel', 'resourceId', 'season', 'timestamp', 'mentorPulse', 'mentorComments', 'data'],
  MASessions: ['id', 'date', 'type', 'context', 'who', 'activity', 'conditions', 'videoUrl', 'videoSkier', 'videoTime', 'transcript', 'sections', 'summary', 'notes', 'mentorFeedback', 'data'],
};

const PAGE = 500;

let _client;
function client() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set');
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

/** Default adapter: the real table. Tests pass an in-memory one with the same four methods. */
export const supabaseAdapter = {
  async select(sheet) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client().from(TABLE).select('id,row,seq').eq('sheet', sheet).order('seq', { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw new Error(`ops select ${sheet}: ${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < PAGE) return out;
    }
  },
  async get(sheet, id) {
    const { data, error } = await client().from(TABLE).select('id,row,seq').eq('sheet', sheet).eq('id', id).maybeSingle();
    if (error) throw new Error(`ops get ${sheet}/${id}: ${error.message}`);
    return data || null;
  },
  async upsert(sheet, id, row) {
    const { error } = await client().from(TABLE).upsert({ sheet, id, row, updated_at: new Date().toISOString() }, { onConflict: 'sheet,id' });
    if (error) throw new Error(`ops upsert ${sheet}/${id}: ${error.message}`);
  },
  async upsertMany(sheet, items) {   // [{ id, row }] — migration only
    const now = new Date().toISOString();
    const { error } = await client().from(TABLE).upsert(items.map(({ id, row }) => ({ sheet, id, row, updated_at: now })), { onConflict: 'sheet,id' });
    if (error) throw new Error(`ops upsertMany ${sheet}: ${error.message}`);
  },
  async remove(sheet, id) {
    const { data, error } = await client().from(TABLE).delete().eq('sheet', sheet).eq('id', id).select('id');
    if (error) throw new Error(`ops delete ${sheet}/${id}: ${error.message}`);
    return (data || []).length;
  },
};

// ── value rules ──────────────────────────────────────────────────────────────
// The Sheet held strings and both apps read strings. Objects are stored as JSON text (the Apps Script would have
// written "[object Object]"); numbers/booleans as their text; null/undefined mean "not sent" and are skipped.
export function cellValue(v) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const META = new Set(['_action', '_sheet', '_id', 'b']);

/** Payload → { id, cols }. `b` is the live MASessions' mislabeled id header (§17) — read as id when id is missing, never stored. */
export function splitPayload(data) {
  const id = String(data.id ?? data._id ?? data.b ?? '').trim();
  const cols = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (META.has(k) || k === 'id') continue;
    const s = cellValue(v);
    if (s !== undefined) cols[k] = s;
  }
  return { id, cols };
}

function checkSheet(sheet) {
  if (!sheet || typeof sheet !== 'string') throw new Error('No sheet given');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sheet)) throw new Error(`Bad sheet name: ${sheet}`);
}

// ── the five actions ─────────────────────────────────────────────────────────

/** Every row, every column ('' where empty), in insertion order — the Apps Script's `getAll`. */
export async function getAll(sheet, db = supabaseAdapter) {
  checkSheet(sheet);
  const raw = await db.select(sheet);
  const keys = [...(DEFAULT_HEADERS[sheet] || ['id', 'data'])];
  for (const r of raw) for (const k of Object.keys(r.row || {})) if (!keys.includes(k)) keys.push(k);
  const rows = raw.map((r) => { const o = {}; for (const k of keys) o[k] = k === 'id' ? String(r.id) : (r.row?.[k] ?? ''); return o; })
    .filter((o) => Object.values(o).some((v) => v !== ''));
  return { rows };
}

/** Upsert; only the given keys change. → { success, id, action: 'updated' | 'created' } */
export async function update(sheet, data, db = supabaseAdapter) {
  checkSheet(sheet);
  const { id, cols } = splitPayload(data);
  if (!id) return { error: 'No id provided for update' };
  const existing = await db.get(sheet, id);
  const row = { ...(existing?.row || {}), ...cols };
  await db.upsert(sheet, id, row);
  return { success: true, id, action: existing ? 'updated' : 'created' };
}

/** Same as update. The Apps Script appended blindly; an id exists once here, which is what both apps assume. */
export async function create(sheet, data, db = supabaseAdapter) {
  const r = await update(sheet, data, db);
  return r.error ? { error: r.error.replace('for update', 'for create') } : { success: true, id: r.id, action: r.action };
}

export async function remove(sheet, id, db = supabaseAdapter) {
  checkSheet(sheet);
  const target = String(id ?? '').trim();
  if (!target) return { error: 'No id provided for delete' };
  const n = await db.remove(sheet, target);
  if (!n) return { error: `Row not found with id: ${target}` };
  return { success: true, id: target };
}

// ── notify (was Apps Script MailApp) ─────────────────────────────────────────
// Resend when RESEND_API_KEY is set; otherwise { success: false, error } — never a throw, a journal save must not fail
// on mail. RESEND_FROM must be a sender Resend accepts (a verified domain, or onboarding@resend.dev while testing).

export function recipientsFrom(profilesJson) {
  let profiles = {};
  try { profiles = JSON.parse(profilesJson || '{}') || {}; } catch { profiles = {}; }
  return Object.values(profiles).filter((p) => p && p.email && p.notifications !== false).map((p) => String(p.email).trim()).filter(Boolean);
}

export async function notify(data, db = supabaseAdapter, { send = sendResend } = {}) {
  const subject = String(data?.subject || 'AT Journal Notification');
  const body = String(data?.body || 'Test notification');
  const profilesRow = await db.get('Config', '_MENTOR_PROFILES');
  const to = recipientsFrom(profilesRow?.row?.data);
  if (!to.length) return { success: false, error: 'No profiles found', sent: 0 };
  if (!process.env.RESEND_API_KEY) return { success: false, error: 'No email provider configured (RESEND_API_KEY)', sent: 0, wouldSend: to.length };
  let sent = 0; const errors = [];
  for (const email of to) {
    try { await send({ to: email, subject, body }); sent++; }
    catch (e) { errors.push(`${email}: ${String(e.message || e).slice(0, 120)}`); }
  }
  return { success: sent > 0, sent, ...(errors.length ? { error: errors.join('; ') } : {}) };
}

async function sendResend({ to, subject, body }) {
  const from = process.env.RESEND_FROM || 'AT Journal <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text: body }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// ── dispatcher: one request body in, one Apps Script-shaped result out ───────
export async function handle(body, db = supabaseAdapter, opts = {}) {
  const action = body?._action || '';
  const sheet = body?._sheet || '';
  try {
    switch (action) {
      case 'getAll': return await getAll(sheet, db);
      case 'update': return await update(sheet, body, db);
      case 'create': return await create(sheet, body, db);
      case 'delete': return await remove(sheet, body._id ?? body.id, db);
      case 'notify': return await notify(body, db, opts);
      case 'ping': return { status: 'ok', timestamp: new Date().toISOString(), store: 'postgres' };
      default: return { error: `Unknown action: ${action}` };
    }
  } catch (e) {
    return { error: String(e.message || e), transient: true };
  }
}

/** In-memory adapter with the same semantics — for tests and the migration's dry run. */
export function memoryAdapter(seed = {}) {
  const rows = new Map(); let seq = 0;
  for (const [sheet, list] of Object.entries(seed)) for (const r of list) { const { id, cols } = splitPayload(r); rows.set(`${sheet}\u0000${id}`, { id, row: cols, seq: ++seq }); }
  const key = (s, i) => `${s}\u0000${i}`;
  return {
    rows,
    async select(sheet) { return [...rows.entries()].filter(([k]) => k.startsWith(`${sheet}\u0000`)).map(([, v]) => ({ ...v, row: { ...v.row } })).sort((a, b) => a.seq - b.seq); },
    async get(sheet, id) { const v = rows.get(key(sheet, id)); return v ? { ...v, row: { ...v.row } } : null; },
    async upsert(sheet, id, row) { const prev = rows.get(key(sheet, id)); rows.set(key(sheet, id), { id, row: { ...row }, seq: prev ? prev.seq : ++seq }); },
    async upsertMany(sheet, items) { for (const { id, row } of items) await this.upsert(sheet, id, row); },
    async remove(sheet, id) { return rows.delete(key(sheet, id)) ? 1 : 0; },
  };
}
