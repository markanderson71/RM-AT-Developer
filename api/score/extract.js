// POST /api/score/extract — Step 1 only (§8.1, Sonnet). { sessionId } | { session } → { extraction, ms }
import { extractSession } from '../../lib/prompts/extract.js';
import { preflight, readBody, resolveSession, fail, slow } from '../../lib/http.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await resolveSession(readBody(req));
    if (!session.transcript && !Object.keys(session.sections || {}).length) return res.status(400).json({ error: 'session has no transcript or sections' });
    const t0 = Date.now();
    return slow(res, async () => ({ extraction: await extractSession(session), ms: Date.now() - t0 }), 'score/extract');
  } catch (err) { return fail(res, err, 'score/extract'); }
}
