// Read operational data — from Postgres directly when SUPABASE_URL / SUPABASE_SERVICE_KEY are set (session 7b), else
// through /api/sheet (APP_BASE_URL) or the Apps Script (APPS_SCRIPT_URL). The HTTP path is what `scripts/migrate-sheet.mjs`
// uses to read the Sheet before the cut-over; `getAll(sheet, { via: 'http' })` forces it.
// Column-mapping guards harvested from ATDevelopmentJournal.jsx: id column mislabeled, JSON blob in the
// wrong column, double-encoded JSON fields, legacy _MA_SESSIONS row.
import { parseSummary, hasFullScores } from './parseSummary.js';
import { getAll as opsGetAll } from './ops.js';

function endpoint() {
  const base = process.env.APP_BASE_URL;           // e.g. https://at-dev-tracker.vercel.app
  if (base) return `${base.replace(/\/$/, '')}/api/sheet`;
  const direct = process.env.APPS_SCRIPT_URL;
  if (direct) return direct;
  throw new Error('APP_BASE_URL (preferred) or APPS_SCRIPT_URL must be set');
}

async function post(body) {
  const res = await fetch(endpoint(), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`sheet ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`sheet returned non-JSON: ${text.slice(0, 200)}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const hasStore = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

/**
 * Rows of a sheet. Postgres when the store is configured (one query, no retries needed); otherwise the HTTP path with
 * the harvested retry — Apps Script answers POSTs with a redirect and sometimes replies "Unknown action: ".
 */
export async function getAll(sheet, opts = {}) {
  const { via = hasStore() ? 'store' : 'http', attempts = 6 } = typeof opts === 'number' ? { attempts: opts } : opts;
  if (via === 'store') return (await opsGetAll(sheet)).rows;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const json = await post({ _action: 'getAll', _sheet: sheet });
      if (json.error) throw new Error(`sheet ${sheet}: ${json.error}`);
      return json.rows || [];
    } catch (e) {
      lastErr = e;
      const transient = /Unknown action|non-JSON|5\d\d|404|timeout|TimeoutError|AbortError/.test(e.message + e.name);
      if (!transient || i === attempts - 1) throw e;
      console.log(`  sheet ${sheet}: transient (${e.message.slice(0, 40)}), retry ${i + 1}/${attempts - 1}`);
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

function safeJson(v, fallback) {
  if (v == null || v === '') return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

/** Config rows keyed by id. */
export async function getConfig(opts) {
  const rows = await getAll('Config', opts);
  const out = {};
  for (const r of rows) {
    const id = r.id ?? Object.values(r)[0];
    if (id) out[String(id).trim()] = r.data ?? Object.values(r)[1] ?? '';
  }
  return out;
}

/**
 * MA sessions, normalized. Handles: header 'b' instead of 'id' (seen in the live Sheet), JSON blob
 * stored in data/date column, and the legacy Config _MA_SESSIONS array as fallback.
 */
export async function getMaSessions(config = null, opts) {
  const rows = await getAll('MASessions', opts);
  const sessions = [];
  for (const r of rows) {
    const idRaw = r.id ?? r.b ?? Object.values(r)[0] ?? '';
    const blob = r.data || (typeof r.date === 'string' && r.date.startsWith('{') ? r.date : '');
    const looksLikeJson = typeof blob === 'string' && blob.startsWith('{') && blob.includes('"id"');
    let s;
    if (!looksLikeJson && (r.transcript || r.type)) {
      s = {
        id: String(idRaw).replace(/^ma_/, ''),
        date: r.date || '', type: r.type || r.context || '', context: r.context || r.type || '',
        who: r.who || '', activity: r.activity || '', conditions: r.conditions || '',
        transcript: r.transcript || '', sections: safeJson(r.sections, {}),
        summary: r.summary || '', notes: r.notes || '', mentorFeedback: safeJson(r.mentorFeedback, []),
      };
    } else {
      const parsed = safeJson(blob, null);
      if (!parsed) continue;
      s = { ...parsed, id: String(parsed.id || idRaw).replace(/^ma_/, '') };
      s.sections = safeJson(s.sections, s.sections || {});
      s.mentorFeedback = safeJson(s.mentorFeedback, s.mentorFeedback || []);
    }
    if (!s.id) continue;
    s.parsedSummary = parseSummary(s.summary);
    s.scored = hasFullScores(s.parsedSummary);
    sessions.push(s);
  }
  if (!sessions.length && config?._MA_SESSIONS) {
    for (const s of safeJson(config._MA_SESSIONS, [])) {
      s.parsedSummary = parseSummary(s.summary); s.scored = hasFullScores(s.parsedSummary);
      sessions.push(s);
    }
  }
  // Sort newest first, tiebreak on id (harvested).
  return sessions.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
}
