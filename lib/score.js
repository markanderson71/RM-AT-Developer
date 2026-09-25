// Scoring orchestration: extract → assemble → evaluate → normalize. Shared by /api/score and scripts/score.mjs.
// Output is the §8.3 shape. Existing fields keep their shape; everything else is additive.
import { MODELS, completeJson } from './llm.js';
import { extractSession, extractPassage } from './prompts/extract.js';
import { EVALUATE_SYSTEM, EVALUATE_VERSION, buildEvaluateUser, buildEvaluateLineUser } from './prompts/evaluate.js';
import { mergePassage, unitCheck, applyRewrite } from './coaching.js';
import { deliveryStats } from './prompts/extract.js';
import { assemble } from './assembler.js';
import { SCORED, SCORED_CRITERIA, LEGACY_CRITERIA, PASS } from './vocab.js';

const clampScore = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(6, Math.max(1, n)) : null; };
const avg = (xs) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;
const normCite = (c) => { const m = String(c).match(/([0-9a-f]{8})/i); return m ? m[1].toLowerCase() : null; };

/**
 * Exemplar bound, enforced (v2-rag-5). For one line: every entry in exemplar_bounds whose exemplar is in the context's
 * exemplar slot and whose relation is equal or weaker sets a ceiling at Chris's number FOR THAT LINE — read from the
 * exemplar's stored scorecard, never from the evaluator. Returns { score, bounds, guard } — `guard` is a message when
 * the score was lowered, null otherwise. A floor is not enforced: "stronger" was the direction that inflated scores.
 */
export function exemplarBound(line, score, rawBounds, chunkIndex) {
  const entries = Array.isArray(rawBounds) ? rawBounds : [];
  const bounds = [];
  let ceiling = Infinity, by = null;
  for (const e of entries) {
    const id = normCite(e?.exemplar);
    const c = id && chunkIndex[id];
    const rel = String(e?.relation || '').toLowerCase();
    const chris = c?.slot === 'exemplars' ? Number(c.scores?.[line]) : NaN;
    const ok = !!c && c.slot === 'exemplars' && Number.isFinite(chris) && ['weaker', 'equal', 'stronger'].includes(rel);
    bounds.push({ exemplar: id ? `c:${id}` : String(e?.exemplar || ''), chris: Number.isFinite(chris) ? chris : null, stated_chris: e?.chris ?? null, relation: rel || null, difference: e?.difference || '', valid: ok });
    if (ok && rel !== 'stronger' && chris < ceiling) { ceiling = chris; by = `c:${id}`; }
  }
  if (score > ceiling) return { score: ceiling, bounds, guard: `${line}: model gave ${score} while calling the evidence ${bounds.find((b) => b.exemplar === by).relation} to exemplar ${by} (Chris ${ceiling}) ⇒ ${ceiling}` };
  return { score, bounds, guard: null };
}

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

  out.exemplar_bounds = {};
  for (const k of SCORED_CRITERIA) {
    const b = exemplarBound(k, out.scores[k], raw.exemplar_bounds?.[k], chunkIndex);
    out.exemplar_bounds[k] = b.bounds;
    if (b.guard) { guards.push(b.guard); out.scores[k] = b.score; }
  }

  out.section_averages = { ma: avg(SCORED.ma.map((k) => out.scores[k])), tu: avg(SCORED.tu.map((k) => out.scores[k])) };
  out.meets_standards = out.section_averages.ma >= PASS && out.section_averages.tu >= PASS;

  out.score_rationale = raw.score_rationale || {};
  out.justifications = raw.justifications || {};
  out.evidence_count = raw.evidence_count || {};
  out.gap_to_next = raw.gap_to_next || {};
  out.exemplar_anchor = raw.exemplar_anchor && typeof raw.exemplar_anchor === 'object' ? raw.exemplar_anchor : {};
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
  // §13 row 6 done-when, checkable on every result: were Chris-scored exemplars in the context, and did the evaluator cite one?
  const exIn = Object.entries(chunkIndex).filter(([, c]) => c.slot === 'exemplars').map(([id]) => `c:${id}`);
  const exCited = exIn.filter((c) => used.has(c.slice(2)));
  out.quality = { citations_invalid: invalid, criteria_without_citation: uncited, ladder_skipped: skipped, guards_applied: guards, exemplars_in_context: exIn, exemplars_cited: exCited, exemplar_lines_anchored: SCORED_CRITERIA.filter((k) => out.exemplar_anchor[k]).length };
  if (extraction?.extraction_guards?.length) out.quality.extraction_guards = extraction.extraction_guards;
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
  const raw = await completeJson({ model: MODELS.opus, system: EVALUATE_SYSTEM, user: buildEvaluateUser(context), maxTokens: 12000 });
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

/** normalizeResult for a single line. Same clamps, same citation validation, same equipment guard. Pure. */
export function normalizeLine(raw, { line, extraction, chunkIndex }) {
  if (!SCORED_CRITERIA.includes(line)) throw new Error(`not a scored line: ${line}`);
  const guards = [];
  let score = clampScore(raw.scores?.[line]);
  if (score == null) throw new Error(`evaluator returned no score for: ${line}`);
  if (line === 'equipment' && extraction?.equipment && extraction.equipment.addressed === false && score > 1) { guards.push(`equipment: model gave ${score}; not addressed ⇒ 1`); score = 1; }
  const eb = exemplarBound(line, score, raw.exemplar_bounds?.[line], chunkIndex);
  if (eb.guard) { guards.push(eb.guard); score = eb.score; }
  const ids = [...new Set((raw.citations?.[line] || []).map(normCite).filter(Boolean))];
  const ok = ids.filter((id) => chunkIndex[id]);
  const j = raw.justifications?.[line] || {};
  return {
    line, score,
    score_rationale: raw.score_rationale?.[line] || '', evidence_count: raw.evidence_count?.[line] || '',
    justifications: j, gap_to_next: raw.gap_to_next?.[line] || '', exemplar_anchor: raw.exemplar_anchor?.[line] || '', exemplar_bounds: eb.bounds,
    citations: ok.map((id) => `c:${id}`),
    citation_details: Object.fromEntries(ok.map((id) => { const c = chunkIndex[id]; return [`c:${id}`, { author: c.author, source: c.source, date: c.date, type: c.type, source_ref: c.source_ref, title: c.title, text: c.text.length > 400 ? `${c.text.slice(0, 400)}…` : c.text }]; })),
    quality: { citations_invalid: ids.length - ok.length, ladder_skipped: ['2', '3', '4'].some((l) => !j[l] || /no case needed/i.test(j[l])), guards_applied: guards },
  };
}

/**
 * "Try that line again" (§13 row 5). One passage rewritten → that line alone re-scored.
 *   1. Step 1 on the passage only (Sonnet, small).
 *   2. Merge into the session's extraction: what he said, with this passage in place of the original sentence.
 *   3. Assemble with the ORIGINAL extraction as the retrieval query, so the evaluator sees the same Chris statements
 *      and definitions the session was scored against; only the evidence changes.
 *   4. Step 2 on one line, full ladder (Opus).
 * Read-only: nothing is written to the Sheet or the store. Practice is not a session.
 */
export async function scoreLine({ session, extraction, line, section, passage, original = null }, opts = {}) {
  const t0 = Date.now();
  if (!SCORED_CRITERIA.includes(line)) throw Object.assign(new Error(`line must be one of: ${SCORED_CRITERIA.join(', ')}`), { status: 400 });
  if (!extraction || typeof extraction !== 'object') throw Object.assign(new Error('extraction required'), { status: 400 });
  if (!String(passage || '').trim()) throw Object.assign(new Error('passage required'), { status: 400 });

  const patch = await (opts.deps?.extractPassage || extractPassage)({
    session, section, passage,
    reference: { task: extraction.task?.named || session?.activity || null, peer_intent: extraction.intent_verification?.peer_answers || [] },
  });
  const t1 = Date.now();
  const merged = mergePassage(extraction, patch, { section, replacedText: original });
  if (session?.sections && Object.keys(session.sections).length) merged.delivery_stats = deliveryStats(applyRewrite(session, { section, original, passage }).session);

  const { context, manifest, chunkIndex } = await assemble(extraction, { sessionId: session?.id || null, evidence: merged, deps: opts.deps });
  const t2 = Date.now();
  const raw = await (opts.deps?.completeJson || completeJson)({ model: MODELS.opus, system: EVALUATE_SYSTEM, user: buildEvaluateLineUser(context, line), maxTokens: 2000 });
  const t3 = Date.now();

  return {
    ...normalizeLine(raw, { line, extraction: merged, chunkIndex }),
    unit: unitCheck(line, patch),
    passage_extraction: patch,
    meta: { scorer: EVALUATE_VERSION, practice: true, session_id: session?.id || null, scored_at: new Date().toISOString(), ms: { extract: t1 - t0, assemble: t2 - t1, evaluate: t3 - t2, total: t3 - t0 }, context: { counts: manifest.counts, tokens: manifest.tokens } },
  };
}
