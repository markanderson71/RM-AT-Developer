// POST /api/score/evaluate — assemble + Step 2 (§7, §8.2, Opus). { extraction, sessionId? } → §8.3 result.
// sessionId is only used for self-exclusion in retrieval; the session itself is not needed — the extraction is the evidence.
import { scoreSession } from '../../lib/score.js';
import { preflight, readBody, fail } from '../../lib/http.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const body = readBody(req);
    if (!body.extraction || typeof body.extraction !== 'object') return res.status(400).json({ error: 'extraction required (call /api/score/extract first)' });
    const id = body.sessionId ? String(body.sessionId).replace(/^ma_/, '') : null;
    const result = await scoreSession({ id }, { extraction: body.extraction, debug: body.debug === true, includeSelf: body.includeSelf === true });
    return res.status(200).json(result);
  } catch (err) { return fail(res, err, 'score/evaluate'); }
}
