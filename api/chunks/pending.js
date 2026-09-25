// §6.2 approval view data. GET ?sourceRef=zoom:2026-09-18&author=chris   (or POST the same fields)
// Returns pending chunks in call order, each with its context, tags, flags and "Replaces earlier →" candidates (§5.6).
// Trimmed shape on purpose: no embeddings, no raw metadata. Requires MENTOR_TOKEN when set (session 8).
import { preflight, readBody, fail, requireToken, authMode } from '../../lib/http.js';
import { listPending, liveStatements, supersessionCandidates } from '../../lib/store.js';

export default async function handler(req, res) {
  if (preflight(req, res, ['GET', 'POST'])) return;
  if (requireToken(req, res)) return;   // session 8 — see lib/http.js
  try {
    const p = req.method === 'GET' ? (req.query || {}) : readBody(req);
    const rows = await listPending({ source: p.source || 'chris_zoom', sourceRef: p.sourceRef || null, author: p.author || null });
    const pools = {};
    for (const a of new Set(rows.map((r) => r.author).filter(Boolean))) pools[a] = await liveStatements(a);
    const pending = rows.map((r) => {
      const m = r.metadata || {};
      return {
        id: r.id, short_id: r.id.slice(0, 8), source: r.source, source_ref: r.source_ref, author: r.author, date: r.date,
        timestamp: m.timestamp || null, call_title: m.call_title || null,
        text: r.text, original_text: m.original_text || null, type: r.type, criteria: r.criteria, skills: r.skills,
        context: m.context || '', quote: m.quote || '', modeled: !!m.modeled,
        hedged: !!m.hedged, hedge_note: m.hedge_note || null, asr_fixes: m.asr_fixes || [],
        attribution_check: !!m.attribution?.check, attribution: m.attribution || null, watch: m.watch || [],
        replaces_candidates: supersessionCandidates(r, pools[r.author] || []).map((c) => ({
          id: c.id, short_id: c.id.slice(0, 8), source: c.source, source_ref: c.source_ref, date: c.date, type: c.type,
          overlap: c.overlap, text: c.text.length > 320 ? `${c.text.slice(0, 320)}…` : c.text,
        })),
      };
    });
    const by = (f) => pending.filter(f).length;
    return res.status(200).json({
      count: pending.length, auth: authMode(),
      summary: { hedged: by((x) => x.hedged), attribution_check: by((x) => x.attribution_check), watch: by((x) => x.watch.length), with_candidates: by((x) => x.replaces_candidates.length),
        by_type: pending.reduce((a, x) => ({ ...a, [x.type]: (a[x.type] || 0) + 1 }), {}), calls: [...new Set(pending.map((x) => x.source_ref))] },
      pending,
    });
  } catch (err) { return fail(res, err, 'chunks/pending'); }
}
