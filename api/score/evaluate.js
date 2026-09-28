// POST /api/score/evaluate — assemble + Step 2 (§7, §8.2, Opus). { extraction, sessionId? } → §8.3 result.
// Single-line practice (§13 row 5): add { lines: [key], passage, section, original?, session? } → one line's result,
// Line drill (session 9): { drill: true, lines: [key], passage, section, session: { activity, peer_intent? } } — no extraction needed.
// the passage re-extracted and merged first. Read-only either way.
// sessionId is only used for self-exclusion in retrieval; the session itself is not needed — the extraction is the evidence.
import { scoreSession, scoreLine } from '../../lib/score.js';
import { preflight, readBody, fail, slow } from '../../lib/http.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const body = readBody(req);
    const drill = body.drill === true;   // session 9: a line drill has no session extraction — the passage is extracted and retrieved on
    if (!drill && (!body.extraction || typeof body.extraction !== 'object')) return res.status(400).json({ error: 'extraction required (call /api/score/extract first)' });
    if (Array.isArray(body.lines) && body.lines.length) {
      if (body.lines.length !== 1) return res.status(400).json({ error: 'lines: exactly one line per call' });
      const sid = body.sessionId ? String(body.sessionId).replace(/^ma_/, '') : null;
      const session = { ...(body.session || {}), id: sid };
      return slow(res, () => scoreLine({ session, extraction: body.extraction, line: body.lines[0], section: body.section, passage: body.passage, original: body.original || null, drill }), 'score/evaluate(line)');
    }
    if (drill) return res.status(400).json({ error: 'drill requires lines: [line]' });
    const id = body.sessionId ? String(body.sessionId).replace(/^ma_/, '') : null;
    return slow(res, () => scoreSession({ id }, { extraction: body.extraction, debug: body.debug === true, includeSelf: body.includeSelf === true }), 'score/evaluate');
  } catch (err) { return fail(res, err, 'score/evaluate'); }
}
