// Context assembler. Architecture §7. Input: a Step 1 extraction (+ the session id being scored).
// Output: the slot-filled context for Step 2 plus a manifest of exactly what went in.
//
// Guarantees encoded here rather than in a prompt:
//   - Fixed budget (§7.1). Slots are capped in tokens; new knowledge competes, the total never grows.
//   - Chris first (§7.3.3). His slot is filled before PSIA reference is even queried, and is never trimmed.
//   - Nothing unapproved or superseded (§7.3.1) — enforced in match_chunks; this file never sets includeUnapproved.
//   - A session never retrieves itself. Chunks whose source_ref is `session:<id>` for the session being scored
//     are dropped: Chris's comment on a session must not leak into that session's score, or agreement with
//     his blind score (§9) would be measuring retrieval, not judgment.
//   - Exemplar slot takes Chris-scored exemplars only (source chris_score). past_session chunks carry OLD-scorer
//     numbers, which ran 1–2 high against Chris on 7n6ry6d; feeding them as examples would teach that bias.
//     Chris's only (author filter): Gates's and Mike's scorecards are stored for inter-rater data, but the levels the
//     evaluator is taught are the assessor's. Written by lib/ingest/score.js (session 6); embedded on the extraction
//     text, i.e. on the same thing the query is. PSIA reference takes the slack up to its own cap while the slot is thin.
import { embedQuery } from './embed.js';
import * as store from './store.js';
import { extractionToText } from './prompts/extract.js';
import { SKILLS, TYPES } from './vocab.js';

/** §7.1, in tokens. `psia_max` caps how much slack PSIA may absorb when Chris/exemplar slots under-fill. */
export const BUDGET = {
  total: 30_000,
  definitions: 2_000,
  chris: 8_000,
  exemplars: 6_000,
  extraction: 4_000,
  template: 3_000,      // was 2K; v2-rag-2 added unit definitions + bottom-up ladder. Total unchanged — PSIA absorbs it.
  psia_max: 12_000,
};
export const CHRIS_MAX_CHUNKS = 25;
export const EXEMPLAR_MAX = 3;
export const DEFINITIONS_PREFIX = 'at-ma-tu-assessment-form-2026.md#';
const CHRIS_SOURCES = ['chris_comment', 'chris_zoom', 'chris_score', 'mentor_assessment'];

/** ~4 chars/token for English prose; deliberately a little conservative. */
export const estTokens = (s) => Math.ceil(String(s || '').length / 3.8);
export const shortId = (id) => String(id).slice(0, 8);

const isSelf = (chunk, sessionId) => {
  if (!sessionId) return false;
  const bare = String(sessionId).replace(/^ma_/, '');
  return chunk.source_ref === `session:${bare}` || chunk.metadata?.session_id === bare;
};

/** Take ranked chunks in order until the token cap or count cap is hit. A chunk that doesn't fit is skipped, not truncated. */
function fill(ranked, capTokens, maxCount = Infinity) {
  const taken = []; let used = 0;
  for (const c of ranked) {
    if (taken.length >= maxCount) break;
    const t = estTokens(c.text) + 40;          // + header line
    if (used + t > capTokens) continue;
    taken.push(c); used += t;
  }
  return { taken, used };
}

/** Compact the extraction to fit its slot. Drops retrieval-only fields first, then trims long probe answers. */
export function renderExtraction(x, capTokens = BUDGET.extraction) {
  const clone = JSON.parse(JSON.stringify(x));
  let text = JSON.stringify(clone, null, 1);
  if (estTokens(text) <= capTokens) return text;
  delete clone.verbatim_key_phrases;
  for (const p of clone.examiner_probes || []) if (p.mark_answer?.length > 400) p.mark_answer = `${p.mark_answer.slice(0, 400)}…`;
  text = JSON.stringify(clone);
  if (estTokens(text) <= capTokens) return text;
  for (const o of clone.observations || []) delete o.dirt;
  clone.unprompted_vs_prompted && delete clone.unprompted_vs_prompted.unprompted;
  return JSON.stringify(clone);
}

const header = (c) => {
  const who = c.author === 'psia' ? 'PSIA' : (c.author || c.source);
  const bits = [`[c:${shortId(c.id)}]`, who, c.date || null, c.type, c.metadata?.title || c.source_ref].filter(Boolean);
  return bits.join(' · ');
};
const renderChunks = (chunks) => chunks.map((c) => `${header(c)}\n${c.text}`).join('\n\n---\n\n');

/**
 * Assemble the evaluate-step context.
 * @param extraction  Step 1 output
 * @param opts.sessionId  id of the session being scored (self-exclusion). Optional for unsaved sessions.
 * @param opts.includeSelf  debug only: allow the session's own chunks (to measure leakage effect).
 * @param opts.evidence  single-line practice only: retrieve on `extraction` (the session as scored) but show the
 *   evaluator `evidence` (the same session with one passage rewritten). Retrieval stays put; only the evidence moves.
 * @param opts.deps  { embedQuery, store } — injectable for offline tests.
 */
export async function assemble(extraction, { sessionId = null, includeSelf = false, evidence = null, deps = {} } = {}) {
  const embed = deps.embedQuery || embedQuery;
  const db = deps.store || store;
  const notSelf = (c) => includeSelf || !isSelf(c, sessionId);

  // §7.2 — the extraction, not the transcript, is the query.
  const queryText = extractionToText(extraction);
  const embedding = await embed(queryText);

  // Slot 1 — definitions: fetched, not searched. Scale + the six scored lines of the 2026 form.
  const defsAll = await db.getBySourceRefPrefix(DEFINITIONS_PREFIX, { source: 'psia_doc' });
  const defs = defsAll.filter((c) => !/Instructor Decisions/i.test(c.source_ref));   // continual-assessment lines aren't scored here
  if (defs.length < 7) throw new Error(`definitions slot: expected scale + 6 criteria under ${DEFINITIONS_PREFIX}, found ${defs.length}. Ingest reference/at-ma-tu-assessment-form-2026.md.`);
  const defSlot = { taken: defs, used: defs.reduce((n, c) => n + estTokens(c.text) + 40, 0) };

  // Slot 2 — Chris. No skill filter: his general principles should surface (§7.3.1). Exemplars go to slot 3 — excluded in
  // the query, not after it, so a growing pile of exemplars can never use up this slot's candidates.
  const chrisRanked = (await db.searchByEmbedding(embedding, { authors: ['chris'], sources: CHRIS_SOURCES, types: TYPES.filter((t) => t !== 'exemplar'), limit: CHRIS_MAX_CHUNKS * 2 }))
    .filter(notSelf).filter((c) => c.type !== 'exemplar');
  // Recency tiebreak (§7.3.4): within 0.01 similarity, newer first.
  chrisRanked.sort((a, b) => (Math.abs(a.similarity - b.similarity) < 0.01 ? String(b.date || '').localeCompare(String(a.date || '')) : b.similarity - a.similarity));
  const chrisSlot = fill(chrisRanked, BUDGET.chris, CHRIS_MAX_CHUNKS);

  // Slot 3 — exemplars: Chris-scored only. Prefer same MA type, then similarity.
  const exRanked = (await db.searchByEmbedding(embedding, { types: ['exemplar'], sources: ['chris_score'], authors: ['chris'], limit: 12 })).filter(notSelf);
  exRanked.sort((a, b) => ((b.metadata?.ma_type === extraction.ma_type) - (a.metadata?.ma_type === extraction.ma_type)) || b.similarity - a.similarity);
  const exSlot = fill(exRanked, BUDGET.exemplars, EXEMPLAR_MAX);

  // Slot 5 — extraction (always).
  const extractionText = renderExtraction(evidence || extraction);
  const extractionTokens = estTokens(extractionText);

  // Slot 4 — PSIA reference gets what's left, capped. Trim order on overflow is PSIA first by construction.
  const fixed = defSlot.used + chrisSlot.used + exSlot.used + extractionTokens + BUDGET.template;
  const psiaCap = Math.max(0, Math.min(BUDGET.psia_max, BUDGET.total - fixed));
  const skills = (extraction.skills_referenced || []).filter((s) => SKILLS.includes(s));
  const seen = new Set(defs.map((c) => c.id));
  const psiaRanked = (await db.searchByEmbedding(embedding, { sources: ['psia_doc', 'web'], skills: skills.length ? skills : null, limit: 40 }))
    .filter((c) => !seen.has(c.id) && !c.source_ref?.startsWith('at-ma-tu-assessment-form'));
  const psiaSlot = fill(psiaRanked, psiaCap);

  const slots = { definitions: defSlot, chris: chrisSlot, exemplars: exSlot, psia: psiaSlot };
  const chunkIndex = {};
  for (const [slot, s] of Object.entries(slots)) {
    for (const c of s.taken) {
      chunkIndex[shortId(c.id)] = {
        id: c.id, slot, source: c.source, author: c.author, date: c.date, type: c.type, source_ref: c.source_ref,
        title: c.metadata?.title || null, session_id: c.metadata?.session_id || null, similarity: c.similarity != null ? Number(c.similarity.toFixed(4)) : null,
        scores: slot === 'exemplars' ? (c.metadata?.scores || null) : undefined,   // Chris's numbers, for the exemplar-bound guard (lib/score.js)
        text: c.text,
      };
    }
  }

  const context = [
    `## CRITERION DEFINITIONS — 2026 AT MA/TU Assessment Form (the scale and the six scored lines)\n\n${renderChunks(defSlot.taken)}`,
    chrisSlot.taken.length
      ? `## CHRIS (AT Assessor) — GROUND TRUTH. Where Chris and any other source differ, Chris wins. Where two Chris statements differ, the more recent wins; report the pair in chris_conflicts.\n\n${renderChunks(chrisSlot.taken)}`
      : '## CHRIS (AT Assessor)\n\n(no approved Chris statements retrieved for this session)',
    exSlot.taken.length
      ? `## EXEMPLARS — sessions Chris scored himself, line by line: what Mark said, then Chris's number. These define the levels. An exemplar line BOUNDS your score; it never sets it and is never a starting point for arithmetic. Evidence weaker than or equal to a line Chris scored N cannot score above N. Evidence stronger than a line Chris scored N scores at least N — how far above N, if at all, is decided by the scale and the ladder alone, never by counting the ways it is stronger. Compare on the line's UNIT (complete and partial instances), not on volume. Cite an exemplar only on lines where it actually bounded the score. An exemplar is evidence of level, not of content: never credit this session with something only the exemplar session said.\n\n${renderChunks(exSlot.taken)}`
      : '## EXEMPLARS\n\n(none yet — Chris-scored exemplars arrive with blind scoring)',
    `## PSIA REFERENCE\n\n${psiaSlot.taken.length ? renderChunks(psiaSlot.taken) : '(none retrieved)'}`,
    `## SESSION EXTRACTION — inventory of what Mark actually said and did. Null / false / empty means he did not say it. This is the ONLY evidence of his performance.\n\n${extractionText}`,
  ].join('\n\n\n');

  const manifest = {
    budget: BUDGET,
    tokens: {
      definitions: defSlot.used, chris: chrisSlot.used, exemplars: exSlot.used, psia: psiaSlot.used,
      extraction: extractionTokens, template_reserved: BUDGET.template,
      total: defSlot.used + chrisSlot.used + exSlot.used + psiaSlot.used + extractionTokens + BUDGET.template,
    },
    counts: { definitions: defSlot.taken.length, chris: chrisSlot.taken.length, exemplars: exSlot.taken.length, psia: psiaSlot.taken.length },
    exemplar_sessions: exSlot.taken.map((c) => c.metadata?.session_id || c.source_ref),
    chris_under_min: chrisSlot.taken.length < 5,     // §7.1 minimum 5 — a store-size fact until Zoom chunks land, surfaced not hidden
    self_excluded: !includeSelf && !!sessionId,
    skills_filter: skills,
    chunks: Object.fromEntries(Object.entries(chunkIndex).map(([k, v]) => [k, { slot: v.slot, source: v.source, author: v.author, date: v.date, source_ref: v.source_ref, session_id: v.session_id, similarity: v.similarity }])),
  };
  if (manifest.tokens.total > BUDGET.total) throw new Error(`assembler over budget: ${manifest.tokens.total} > ${BUDGET.total}`);

  return { context, manifest, chunkIndex, queryText };
}
