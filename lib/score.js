// Scoring orchestration: extract → assemble → evaluate → normalize. Shared by /api/score and scripts/score.mjs.
// Output is the §8.3 shape. Existing fields keep their shape; everything else is additive.
import { MODELS, completeJson } from './llm.js';
import { extractSession } from './prompts/extract.js';
import { EVALUATE_SYSTEM, EVALUATE_VERSION, buildEvaluateUser } from './prompts/evaluate.js';
import { assemble } from './assembler.js';
import { SCORED, SCORED_CRITERIA, LEGACY_CRITERIA, PASS } from './vocab.js';

const clampScore = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(6, Math.max(1, n)) : null; };
const avg = (xs) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;
const normCite = (c) => { const m = String(c).match(/([0-9a-f]{8})/i); return m ? m[1].toLowerCase() : null; };

/**
 * Validate and complete the model's output. Pure; unit-tested offline.
 * - scores clamped to 1–6; a missing scored line is an error (never silently defaulted)
 * - section averages and meets_standards computed here, never trusted from the model
 * - citations reduced to ids that were actually in the context; invalid ones counted
 * - one deterministic guard: equipment not addressed ⇒ Equipment = 1 (scale point 1 = "not present")
 */
export function normalizeResult(raw, { extraction, chunkIndex }) {
  const out = { ...raw };
  const guards = [];
  out.scores = { ...(raw.scores || {}) };
  for (const k of [...SCORED_CRITERIA, ...LEGACY_CRITERIA]) out.scores[k] = clampScore(out.scores[k]);
  const missing = SCORED_CRITERIA.filter((k) => out.scores[k] == null);
  if (missing.length) throw new Error(`evaluator returned no score for: ${missing.join(', ')}`);
  for (const k of LEGACY_CRITERIA) if (out.scores[k] == null) { out.scores[k] = 1; guards.push(`${k}: legacy diagnostic missing from model output, set to 1`); }

  if (extraction?.equipment && extraction.equipment.addressed === false && out.scores.equipment > 1) {
    guards.push(`equipment: model gave ${out.scores.equipment}; extraction shows equipment not addressed ⇒ 1`);
    out.scores.equipment = 1;
  }

  out.section_averages = { ma: avg(SCORED.ma.map((k) => out.scores[k])), tu: avg(SCORED.tu.map((k) => out.scores[k])) };
  out.meets_standards = out.section_averages.ma >= PASS && out.section_averages.tu >= PASS;

  out.score_rationale = raw.score_rationale || {};
  out.justifications = raw.justifications || {};
  out.evidence_count = raw.evidence_count || {};
  out.gap_to_next = raw.gap_to_next || {};
  out.did_well = Array.isArray(raw.did_well) ? raw.did_well : [];
  out.opportunity = Array.isArray(raw.opportunity) ? raw.opportunity : [];
  out.key_learning = raw.key_learning || '';
  out.time_note = raw.time_note ?? null;
  out.chris_conflicts = Array.isArray(raw.chris_conflicts) ? raw.chris_conflicts : [];

  let invalid = 0;
  const used = new Set();
  out.citations = {};
  for (const k of SCORED_CRITERIA) {
    const ids = [...new Set((raw.citations?.[k] || []).map(normCite).filter(Boolean))];
    const ok = ids.filter((id) => chunkIndex[id]);
    invalid += ids.length - ok.length;
    ok.forEach((id) => used.add(id));
    out.citations[k] = ok.map((id) => `c:${id}`);
  }
  // Everything session 5 needs to render "Chris, Sep 17: '…'" without another round trip (§12.2).
  out.citation_details = Object.fromEntries([...used].map((id) => {
    const c = chunkIndex[id];
    return [`c:${id}`, { author: c.author, source: c.source, date: c.date, type: c.type, source_ref: c.source_ref, title: c.title, text: c.text.length > 700 ? `${c.text.slice(0, 700)}…` : c.text }];
  }));
  const uncited = SCORED_CRITERIA.filter((k) => !out.citations[k].length);
  // The ladder must actually be climbed: every scored line needs rungs 2–4 written, and none may be waved off.
  const skipped = SCORED_CRITERIA.filter((k) => { const j = out.justifications[k] || {}; return ['2', '3', '4'].some((l) => !j[l] || /no case needed/i.test(j[l])); });
  out.quality = { citations_invalid: invalid, criteria_without_citation: uncited, ladder_skipped: skipped, guards_applied: guards };
  return out;
}

/**
 * Score one session.
 * @param session  Sheet-shaped or in-app session: { id?, type, who, activity, conditions, date, transcript, sections }
 * @param opts     { includeSelf?, debug?, extraction? (reuse a Step 1 result), deps? }
 */
export async function scoreSession(session, opts = {}) {
  const t0 = Date.now();
  const step = opts.onStep || (() => {});
  if (!opts.extraction && !session?.transcript && !Object.keys(session?.sections || {}).length) throw new Error('session has no transcript or sections');

  step('extract (sonnet)…');
  const extraction = opts.extraction || await extractSession(session);
  const t1 = Date.now();
  step(`extract done ${Math.round((t1 - t0) / 1000)}s · assemble…`);
  const { context, manifest, chunkIndex, queryText } = await assemble(extraction, { sessionId: session.id || null, includeSelf: !!opts.includeSelf, deps: opts.deps });
  const t2 = Date.now();
  step(`assemble done ${Math.round((t2 - t1) / 1000)}s · evaluate (opus)…`);
  const raw = await completeJson({ model: MODELS.opus, system: EVALUATE_SYSTEM, user: buildEvaluateUser(context), maxTokens: 8000 });
  const t3 = Date.now();

  const result = normalizeResult(raw, { extraction, chunkIndex });
  result.extraction = extraction;                       // session 6 turns this + Chris's scores into the exemplar
  result.meta = {
    scorer: EVALUATE_VERSION, models: { extract: MODELS.sonnet, evaluate: MODELS.opus },
    session_id: session.id || null, scored_at: new Date().toISOString(),
    ms: { extract: t1 - t0, assemble: t2 - t1, evaluate: t3 - t2, total: t3 - t0 },
    context: manifest,
  };
  if (opts.debug) result.debug = { query_text: queryText, assembled_context: context };
  return result;
}
