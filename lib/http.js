// Shared bits for the /api/score* handlers.
import { getMaSessions } from './sheet.js';

export function preflight(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return true; }
  return false;
}
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
