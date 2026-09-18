// POST /api/score — architecture §8, §10. Orchestrates extract → assemble → evaluate; returns the §8.3 shape.
//   { sessionId: "bzfutxv" }           score a session already in the Sheet (rescore)
//   { session: { type, who, activity, conditions, date, transcript, sections, id? } }   score an in-app session
//   optional: debug (bool) → adds the assembled context; includeSelf (bool) → debug only, disables self-exclusion
// Read-only: does not write to the Sheet or the store. The caller saves the summary (same as the old app).
import { scoreSession } from '../lib/score.js';
import { getMaSessions } from '../lib/sheet.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const debug = body.debug === true || req.query?.debug === '1';
  try {
    let session = body.session || null;
    if (!session && body.sessionId) {
      const id = String(body.sessionId).replace(/^ma_/, '');
      session = (await getMaSessions()).find((s) => s.id === id);
      if (!session) return res.status(404).json({ error: `session ${id} not found in MASessions` });
    }
    if (!session) return res.status(400).json({ error: 'sessionId or session required' });
    if (typeof session.sections === 'string') { try { session.sections = JSON.parse(session.sections); } catch { session.sections = {}; } }
    const result = await scoreSession(session, { debug, includeSelf: body.includeSelf === true });
    return res.status(200).json(result);
  } catch (err) {
    console.error('score error:', err);
    return res.status(500).json({ error: err.message });
  }
}
