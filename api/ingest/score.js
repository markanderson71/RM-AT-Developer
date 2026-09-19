// §6.4 — POST { sessionId, mentor?: 'chris', extraction?, reextract?, dryRun? }
// Called by the app right after a blind scorecard is written to the Sheet (fire-and-forget), and by scripts/ingest-scores.mjs.
// The scorecard is READ FROM THE SHEET, never taken from the request: the Sheet row is the record, and a client cannot
// post a scorecard into the knowledge store that the thread doesn't hold. → { exemplar_id, inserted, unchanged, … }
import { preflight, readBody, resolveSession, fail } from '../../lib/http.js';
import { ingestScore } from '../../lib/ingest/score.js';
import { extractSession, extractionToText } from '../../lib/prompts/extract.js';
import * as store from '../../lib/store.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const b = readBody(req);
    if (!b.sessionId) return res.status(400).json({ error: 'sessionId required' });
    const session = await resolveSession({ sessionId: b.sessionId });
    const out = await ingestScore({ session, mentor: b.mentor || 'chris', extraction: b.extraction || null, reextract: !!b.reextract, dryRun: !!b.dryRun }, { store, extractSession, extractionToText });
    return res.status(200).json(out);
  } catch (err) { return fail(res, err, 'ingest/score'); }
}
