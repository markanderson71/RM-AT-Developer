// §6.2 — POST { transcript, date: "YYYY-MM-DD", title?, mentor?: "chris", speakerMap?, dryRun?, replacePending? }
// No speakerMap → returns the speaker report (needs: "speakerMap"); nothing is extracted or stored.
// With speakerMap → Opus extraction in parallel windows → guards → PENDING chunks (approved: false, no embedding).
// dryRun: true returns the chunks without storing them.
import { preflight, readBody, fail } from '../../lib/http.js';
import { ingestZoom } from '../../lib/ingest/zoom.js';

const MENTORS = ['chris', 'gates', 'mike'];

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const b = readBody(req);
    if (!b.transcript || typeof b.transcript !== 'string') return res.status(400).json({ error: 'transcript (string) required' });
    const mentor = String(b.mentor || 'chris').toLowerCase();
    if (!MENTORS.includes(mentor)) return res.status(400).json({ error: `mentor must be one of ${MENTORS.join(', ')}` });
    const out = await ingestZoom({ transcript: b.transcript, date: b.date, title: b.title || null, mentor, speakerMap: b.speakerMap || null, dryRun: !!b.dryRun, replacePending: !!b.replacePending });
    if (!b.verbose && out.chunks) out.chunks = out.chunks.map((c) => ({ timestamp: c.metadata.timestamp, type: c.type, criteria: c.criteria, skills: c.skills, text: c.text, context: c.metadata.context, hedged: c.metadata.hedged, attribution_check: c.metadata.attribution.check, watch: c.metadata.watch || [] }));
    return res.status(200).json(out);
  } catch (err) { return fail(res, err, 'ingest/zoom'); }
}
