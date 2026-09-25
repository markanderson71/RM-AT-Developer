// Shared bits for the /api/score* handlers.
import { getMaSessions } from './sheet.js';

export function preflight(req, res, methods = ['POST']) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', `${methods.join(', ')}, OPTIONS`);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-AT-Token');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  if (!methods.includes(req.method)) { res.status(405).json({ error: 'Method not allowed' }); return true; }
  return false;
}
/**
 * Session 8 (§17 "mutating endpoints have no real auth"): the endpoints that write ground truth (chunks/approve), list
 * unapproved Chris statements (chunks/pending) or return AI numbers (agreement) require the shared `MENTOR_TOKEN`, sent
 * as `X-AT-Token` (or `?token=`). The token is entered once in the app and kept in the browser. When the env var is not
 * set the gate is OPEN and says so in the log — the app keeps working before the token is configured; `pending` reports
 * `auth: "open"` so the UI can show it. Answers 401 with { error, auth: "required" } so the client knows to ask for it.
 * Returns true when the request was refused.
 */
export function requireToken(req, res) {
  const want = String(process.env.MENTOR_TOKEN || '').trim();
  if (!want) { console.warn('MENTOR_TOKEN is not set — endpoint is open'); return false; }
  const got = String(req.headers?.['x-at-token'] || req.query?.token || '').trim();
  if (got && got === want) return false;
  res.status(401).json({ error: 'A mentor access code is required for this action.', auth: 'required' });
  return true;
}
export const authMode = () => (String(process.env.MENTOR_TOKEN || '').trim() ? 'token' : 'open');

export const readBody = (req) => (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}));

/** Resolve { sessionId } (from the Sheet) or { session } (inline, e.g. an unsaved exam). Throws {status,message}. */
export async function resolveSession(body) {
  let session = body.session || null;
  if (!session && body.sessionId) {
    const id = String(body.sessionId).replace(/^ma_/, '');
    session = (await getMaSessions()).find((s) => s.id === id);
    if (!session) throw Object.assign(new Error(`session ${id} not found in MASessions`), { status: 404 });
  }
  if (!session) throw Object.assign(new Error('sessionId or session required'), { status: 400 });
  if (typeof session.sections === 'string') { try { session.sections = JSON.parse(session.sections); } catch { session.sections = {}; } }
  return session;
}
export const fail = (res, err, tag) => { console.error(`${tag} error:`, err); return res.status(err.status || 500).json({ error: err.message }); };

/**
 * Run slow work (a model call that is silent for minutes) without letting the connection go quiet.
 * A request that sends no bytes for ~2–3 minutes is dropped by VPNs, corporate proxies and some routers — the browser
 * reports "Failed to fetch" and the work is lost even though the function finished (seen 2026-09-21: Step 1 took 179 s).
 * Call this AFTER validation (4xx still answer with a real status). It commits 200, writes one space every `everyMs`
 * (JSON.parse ignores leading whitespace, so callers need no change), then the JSON. A failure arrives as { error } in
 * the body — every caller already treats `data.error` as a failure.
 */
export async function slow(res, work, tag, everyMs = 10_000) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(' ');
  const beat = setInterval(() => { try { res.write(' '); } catch { /* client went away */ } }, everyMs);
  try { const out = await work(); clearInterval(beat); res.end(JSON.stringify(out)); }
  catch (err) { clearInterval(beat); console.error(`${tag} error:`, err); res.end(JSON.stringify({ error: err.message || String(err), status: err.status || 500 })); }
}
