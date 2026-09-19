// §6.3 — POST { sessionId, timestamp?, dryRun? }
// Called by the app after a mentor's comment is written to the Sheet. With `timestamp`, that one comment; without, every
// mentor comment on the session the store has not seen. Text is read from the Sheet row — the thread is the record.
import { preflight, readBody, resolveSession, fail } from '../../lib/http.js';
import { ingestComments } from '../../lib/ingest/comment.js';
import * as store from '../../lib/store.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const b = readBody(req);
    if (!b.sessionId) return res.status(400).json({ error: 'sessionId required' });
    const session = await resolveSession({ sessionId: b.sessionId });
    let item = null;
    if (b.timestamp) {
      item = (session.mentorFeedback || []).find((f) => f.timestamp === b.timestamp) || null;
      if (!item) return res.status(409).json({ error: `no comment with timestamp ${b.timestamp} on ${session.id} yet — the Sheet write may not have landed; retry` });
    }
    return res.status(200).json(await ingestComments({ session, item, dryRun: !!b.dryRun }, { store }));
  } catch (err) { return fail(res, err, 'ingest/comment'); }
}
