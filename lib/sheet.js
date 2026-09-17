// Read operational data from the Google Sheet via the existing /api/sheet proxy (or APPS_SCRIPT_URL directly).
// Column-mapping guards harvested from ATDevelopmentJournal.jsx: id column mislabeled, JSON blob in the
// wrong column, double-encoded JSON fields, legacy _MA_SESSIONS row.
import { parseSummary, hasFullScores } from './parseSummary.js';

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
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`sheet ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`sheet returned non-JSON: ${text.slice(0, 200)}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Apps Script answers POSTs with a redirect; the proxy sometimes follows it as a body-less GET and
 * the script replies "Unknown action: ". Harvested from the old JSX: retry, it clears on the next try.
 */
export async function getAll(sheet, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const json = await post({ _action: 'getAll', _sheet: sheet });
      if (json.error) throw new Error(`sheet ${sheet}: ${json.error}`);
      return json.rows || [];
    } catch (e) {
      lastErr = e;
      const transient = /Unknown action|non-JSON|5\d\d/.test(e.message);
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
export async function getConfig() {
  const rows = await getAll('Config');
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
export async function getMaSessions(config = null) {
  const rows = await getAll('MASessions');
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
