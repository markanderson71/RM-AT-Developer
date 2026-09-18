// POST /api/score — one-shot extract → assemble → evaluate (§8). 150–200s: fine for scripts, too long for a button.
// The app uses /api/score/extract then /api/score/evaluate instead (two calls, each well under the function limit).
//   { sessionId } | { session: {...} }   optional: debug, includeSelf (A/B only)
// Read-only: never writes to the Sheet or the store.
import { scoreSession } from '../lib/score.js';
import { preflight, readBody, resolveSession, fail } from '../lib/http.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const body = readBody(req);
    const session = await resolveSession(body);
    const result = await scoreSession(session, { debug: body.debug === true || req.query?.debug === '1', includeSelf: body.includeSelf === true });
    return res.status(200).json(result);
  } catch (err) { return fail(res, err, 'score'); }
}
