// §9 / §12.4 — GET or POST { mentor?: 'chris', window?: 20 } → per-criterion exact %, within-one %, trend. Read-only.
// Scorecards come from the Sheet; the AI score each is compared with is the one the mentor was blind to (lib/agreement.js).
// The response holds AI numbers — session 8's panel must only request it for a viewer who is not sealed on any session
// it lists, or ask for `mentor=<viewer>` rows only (every row is, by construction, a session that mentor has scored).
// Requires MENTOR_TOKEN when set (session 8).
import { preflight, readBody, fail, requireToken } from '../lib/http.js';
import { getMaSessions } from '../lib/sheet.js';
import { listExemplars } from '../lib/store.js';
import { agreement } from '../lib/agreement.js';
import { MENTORS } from '../lib/vocab.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (preflight(req, res, ['GET', 'POST'])) return;
  if (requireToken(req, res)) return;   // session 8 — see lib/http.js
  try {
    const b = req.method === 'GET' ? (req.query || {}) : readBody(req);
    const mentor = String(b.mentor || 'chris').toLowerCase();
    if (!MENTORS.includes(mentor)) return res.status(400).json({ error: `mentor must be one of ${MENTORS.join(', ')}` });
    const [sessions, exemplars] = await Promise.all([getMaSessions(), listExemplars({ author: mentor }).catch(() => [])]);
    const pins = Object.fromEntries(exemplars.filter((e) => e.metadata?.ai_at_submit?.scores).map((e) => [String(e.metadata.session_id), e.metadata.ai_at_submit]));
    return res.status(200).json(agreement(sessions, { mentor, pins, window: Math.min(100, Math.max(1, Number(b.window) || 20)) }));
  } catch (err) { return fail(res, err, 'agreement'); }
}
