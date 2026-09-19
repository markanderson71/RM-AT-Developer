// Step 1 — Extract (architecture §8.1). Runs on Sonnet. Inventory everything demonstrated BEFORE any
// judgment, so the evaluator sees the whole picture instead of pattern-matching criteria while reading.
//
// Session 4 revision (2026-09-17), driven by Chris's first real scorecard (session 7n6ry6d, all 2s, Equipment 1)
// against an old-scorer 3/4:
//   - `connections[]`: Chris's X→Y→Z frame as inventory. One record per causal claim, one slot per link,
//     null where Mark did not say it. The clerk must never complete a chain for him — a tidy "A → B → C"
//     written by the clerk reads to the evaluator as Mark's work and inflates Cause and Effect.
//   - `task`, `desired_performance`, `equipment`: absence is recorded explicitly (§17). Equipment 1 meant
//     "not addressed at all"; the evaluator must see `addressed: false`, not infer it from silence.
//   - `delivery_stats`: word counts computed in code, not by the model (peer piece = "coaching cue plus").
//   - `extractionToText` leads with substance; tag boilerplate moved to the end (§17 similarity-band item).
import { MODELS, completeJson } from '../llm.js';
import { SKILLS, PHASES, OUTCOMES, MA_TYPES } from '../vocab.js';
import { has, connectionStats, renderChains, comparisonFacts } from '../extractStats.js';
import { findOriginal } from '../coaching.js';

// v3 (2026-09-17, after the first live run on 7n6ry6d scored +2 on four lines): the v2 clerk was still generous.
//   It marked "X was caused by Y" as how_stated, put body consequences in the outcome slot, recorded the predicted
//   benefit of the fix as the desired performance of the task, and called a description of the observed turn a
//   "comparison to intended outcome". Each of those is now defined by what it is NOT. cause_effect_chain is no
//   longer asked of the model (it invited stitching); it is rendered in code from connections[].
// v4 (2026-09-19, session 6 — two Chris scorecards): three fields changed, each because a scorecard showed the old one wrong.
//   - comparison_to_intended_outcome was one boolean and drove Evaluate −1 on 7n6ry6d and +2 on 7uk7lnh. It is now two
//     comparisons — observed performance vs the skier's intent, and intent/performance vs the task's ideal — each
//     absent | partial | made, with the evidence quoted. `made`, `quote`, `intent_referenced_quote` are still written
//     (computed in code from the two) so older readers keep working.
//   - equipment gains `states_effect_on_observed_performance`: on 7uk7lnh a recommendation plus its predicted benefit
//     was inventoried as "addressed" and scored 4; Chris gave 3 — "it was a recommendation".
//   - prescription.delivery_to_peer is Mark's words only. On 7uk7lnh the peer's restatement landed there and the
//     evaluator coached Mark on a sentence he never said. Also checked in code against who actually spoke.
export const EXTRACT_VERSION = 4;

export const EXTRACT_SYSTEM = `You are an inventory clerk for PSIA Alpine Trainer Movement Analysis (MA) practice sessions.
You read a session transcript and produce a structured JSON inventory of what the candidate (Mark) actually said and did.

You do NOT score. You do NOT judge quality. You record what is present, precisely and completely, in normalized PSIA language. Where the schema asks whether something was present (true/false) you answer factually; false is a fact, not a criticism.

THE RULE THAT MATTERS MOST — never repair the candidate's reasoning.
- Record a causal link only if Mark stated it. If he named two fundamentals but never said how one affects the other, that is two records with null links, not one chain.
- Do not supply the mechanism, the ski performance, the outcome, the phase, or the "how" on his behalf, even when it is obvious to you. Obvious to you is not said by him.
- Every non-null link must be traceable to the quote you attach.
- Paraphrase only to normalize vocabulary. Never to add precision he did not have.
- Do not stitch. One connection = one claim Mark made in one place. If the ski performance is in the peer delivery and the outcome is in the examiner presentation and he never joined them, they are separate records. The attached quote must itself contain every non-null link of that record.
- Do not relate things Mark did not relate. If the peer stated an intent and Mark later described the turn without referring back to that intent, no comparison was made, however obvious the relevance.

Normalization rules:
- Skills: use these tags only: ${SKILLS.join(', ')}.
- Turn phases: ${PHASES.filter((p) => p !== 'unspecified').join(', ')}. Locate an observation in a phase only when the candidate did; otherwise "unspecified".
- DIRT = duration, intensity, rate, timing. Record only what the candidate named.
- Outcome dimensions: ${OUTCOMES.join(', ')}. Record an outcome only when Mark tied his point to one of these.
- Physics concepts: sidecut engagement, reverse camber, edge platform, centripetal/centrifugal forces, three-joint constraint, pendulum, ski-snow interaction, etc. Mark each "explicit" (he named the mechanism) or "implied" (he accurately described the effect without naming the mechanism). Quote the words.
- Two audiences in AT Exam sessions: the peer (what/how, plain language) and the examiner (technical why). Keep them separate.
- Prompted vs unprompted: anything in the presentation, written analysis, or peer dialog is unprompted. Anything that first appears in Examiner Q&A is prompted. A probe that deepened an existing point is "prompted_refinement"; a probe that surfaced a new concept is "prompted_creation".
- Private observation notes are observations only. They were never spoken; they are not communication, not cause-and-effect delivered to anyone.

Field guidance:
- task: the task/activity the observed skier was skiing. "described" is true only if Mark said what that task requires or looks like when skied well (not merely named it).
- desired_performance: Mark's description of what THIS TASK looks like when skied well — what the task requires of the skis and the body (e.g. "dynamic parallel in variable snow requires …"). It is NOT the predicted benefit of his prescription ("if she did X she would be able to Y" belongs in prescription.chain), and it is NOT the peer's stated goal. "stated" is false if he only named the task. "fundamentals_blended" lists fundamentals he explicitly described working TOGETHER in that ideal.
- comparison_to_intended_outcome: two separate comparisons. Describing what he observed — however precisely — is an observation, not a comparison, and is "absent" in both.
  · vs_intent: Mark sets the OBSERVED PERFORMANCE against THE SKIER'S OWN STATED INTENT. "made" = he refers to that intent AND says, in the same claim, how the performance matched or missed it in terms of an outcome dimension. "partial" = he refers to the intent but the match/miss is vague, has no outcome dimension, or sits in a different sentence he never joined to it. "absent" = he never refers to the skier's intent. reference_quote holds his words referring to the intent; quote holds the comparison.
  · vs_ideal: Mark sets the skier's intent and/or performance against WHAT THE TASK REQUIRES when skied well. "made" = he states that requirement AND says how the intent or the performance sits relative to it. "partial" = he gestures at a standard ("should be rounder", "not what we want in bumps") without saying what the task requires, or states the requirement without setting anything against it. "absent" = no reference to the task's ideal. reference_quote holds his words stating the ideal.
  · prompted is true when the comparison first appears in Examiner Q&A.
- equipment: any statement about how skis/boots/bindings/tune/sidecut/length/width affect this skier's performance or interact with snow/terrain. Naming "the ski" as the object that turns is not equipment. "addressed" false means he said nothing of the kind. states_effect_on_observed_performance is true only if he said how the equipment affected what THIS skier's skis or body did in the runs observed. A recommendation ("a softer ski would…"), or the benefit he predicts from a change, is not an effect on observed performance: false. Private notes do not count — they were never spoken.
- connections: one record per causal claim Mark made. Slots: body_movement → fundamental → linked_fundamental → body_consequence → ski_performance → outcome.
  · ski_performance is what the SKI does on/in the snow (tips, tails, edge angle, bend, grip, skid, pivot, path). What the skier's body does is never ski performance.
  · body_consequence is a resulting body state (weight moves inside, back seat, has to recenter). It is NOT an outcome.
  · outcome is only one of: ${OUTCOMES.join(', ')}. outcome_detail is null whenever outcome is null.
  · how_stated is true only if Mark gave the MECHANISM — the physical or biomechanical reason one link produces the next (e.g. "because the femur can no longer turn in the hip socket, the edge angle is set by the whole body tipping in, so…"). "X was caused by Y", "which led to", "leaving her…", "this required…" assert THAT it happens, not HOW: how_stated = false. When true, how_quote carries the mechanism words.
- prescription.delivery_to_peer and rationale_to_examiner: MARK'S WORDS ONLY. The peer's restatement of the prescription goes in peer_restated and nowhere else. Never place the peer's or the examiner's words in any field that records what Mark said.
- prescription.chain: for the prescribed change, which of these Mark stated: the input asked of the skier, the fundamental it changes, the other fundamental(s) that change as a result, the resulting ski performance, the resulting outcome relative to the task.
- verbatim_key_phrases: 5–12 short exact quotes that best capture the diagnosis, connections, and prescription. Used for retrieval; pick substance over filler.

Return ONLY the JSON object. No prose, no code fences.`;

export const EXTRACT_SCHEMA = `{
  "ma_type": "${MA_TYPES.join(' | ')}",
  "task": { "named": "... | null", "described": false, "quote": "... | null" },
  "desired_performance": { "stated": false, "quote": "... | null", "fundamentals_blended": ["edging"] },
  "observations": [{ "phase": "...", "ski_performance": "...", "body_performance": "...", "dirt": "..." }],
  "skills_referenced": ["edging"],
  "connections": [{
    "phase": "...", "section": "peer_dialog | prescription_delivery | presentation | written_analysis | examiner_qa | transcript",
    "body_movement": "... | null", "fundamental": "... | null", "linked_fundamental": "... | null", "body_consequence": "... | null",
    "ski_performance": "... | null", "outcome": "${OUTCOMES.join(' | ')} | null", "outcome_detail": "... | null",
    "how_stated": false, "how_quote": "... | null", "prompted": false, "quote": "..."
  }],
  "primary_fundamental_named": "... | null",
  "physics_concepts": [{ "concept": "...", "explicit_or_implied": "explicit | implied", "applied_to": "observed_skier | general_mechanics | both", "prompted": false, "quote": "..." }],
  "equipment": { "addressed": false, "prompted": false, "quote": "... | null", "states_effect_on_observed_performance": false, "linked_to_biomechanics": false, "linked_to_desired_performance": false, "linked_to_environment": false },
  "intent_verification": { "asked": true, "questions": ["..."], "peer_answers": ["..."] },
  "conditions_considered": "... | null",
  "comparison_to_intended_outcome": {
    "vs_intent": { "state": "absent | partial | made", "reference_quote": "... | null", "quote": "... | null", "prompted": false },
    "vs_ideal": { "state": "absent | partial | made", "reference_quote": "... | null", "quote": "... | null", "prompted": false },
    "outcome_dimensions": ["speed"]
  },
  "prescription": {
    "task": "...", "rationale_to_examiner": "...", "delivery_to_peer": "...", "peer_restated": "quote | null",
    "chain": { "skier_input": "... | null", "fundamental_changed": "... | null", "other_fundamentals_affected": "... | null", "ski_performance_change": "... | null", "outcome_change": "... | null", "tied_to_observed_task": false }
  },
  "examiner_probes": [{ "question": "...", "mark_answer": "...", "deepened": true }],
  "unprompted_vs_prompted": { "unprompted": ["..."], "prompted_creation": ["..."], "prompted_refinement": ["..."] },
  "verbatim_key_phrases": ["..."]
}`;

const TYPE_MAP = {
  at_exam: 'at_exam', 'at ma exam': 'at_exam', 'at exam': 'at_exam',
  written: 'written', 'written ma': 'written', written_ma: 'written',
  scenario: 'scenario', 'ai scenario + examiner q&a': 'scenario',
  reverse: 'reverse', 'reverse ma': 'reverse',
  compare: 'compare', 'compare & contrast': 'compare',
  video: 'video', 'video analysis': 'video',
};
export function normalizeMaType(t) {
  const k = String(t || '').trim().toLowerCase();
  if (TYPE_MAP[k]) return TYPE_MAP[k];
  if (k.includes('exam')) return 'at_exam';
  if (k.includes('written')) return 'written';
  if (k.includes('reverse')) return 'reverse';
  if (k.includes('compare')) return 'compare';
  if (k.includes('video')) return 'video';
  if (k.includes('scenario')) return 'scenario';
  return 'scenario';
}

/** Build the user turn from a session row (Sheet shape or in-app shape). */
export function buildExtractInput(session) {
  const s = session.sections || {};
  const parts = [];
  parts.push(`MA TYPE: ${normalizeMaType(session.type || session.context)}`);
  parts.push(`CONTEXT: who=${session.who || '?'} · activity=${session.activity || '?'} · conditions=${session.conditions || '?'} · date=${session.date || '?'}`);
  if (Object.keys(s).length) {
    if (s.private_notes || s.root_cause) {
      parts.push(`\n=== CANDIDATE'S PRIVATE OBSERVATION NOTES (written during observation, NOT spoken to peer or examiner — inventory as observations only, never as communication) ===\n${[s.private_notes, s.root_cause ? `Root cause noted: ${s.root_cause}` : ''].filter(Boolean).join('\n')}`);
    }
    if (s.peer_dialog) parts.push(`\n=== PEER DIALOG (unprompted) ===\n${s.peer_dialog}`);
    if (s.prescription_delivery) parts.push(`\n=== PRESCRIPTION DELIVERY TO PEER (unprompted) ===\n${s.prescription_delivery}`);
    if (s.presentation) parts.push(`\n=== PRESENTATION TO EXAMINER (unprompted) ===\n${s.presentation}`);
    if (s.written_analysis) parts.push(`\n=== WRITTEN ANALYSIS (unprompted) ===\n${s.written_analysis}`);
    if (s.examiner_qa) parts.push(`\n=== EXAMINER Q&A (prompted) ===\n${s.examiner_qa}`);
    const known = new Set(['private_notes', 'root_cause', 'peer_dialog', 'prescription_delivery', 'presentation', 'written_analysis', 'examiner_qa']);
    for (const [k, v] of Object.entries(s)) if (!known.has(k) && v) parts.push(`\n=== ${k.toUpperCase()} ===\n${v}`);
  } else {
    parts.push(`\n=== TRANSCRIPT ===\n${session.transcript || ''}`);
  }
  return parts.join('\n');
}

const words = (t) => (String(t || '').trim().match(/\S+/g) || []).length;
const sentences = (t) => (String(t || '').trim().match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || []).length;

/** Deterministic length facts. Only meaningful when the session has structured sections. */
export function deliveryStats(session) {
  const s = session.sections || {};
  if (!Object.keys(s).length) return null;
  return {
    peer_prescription_words: words(s.prescription_delivery), peer_prescription_sentences: sentences(s.prescription_delivery),
    peer_dialog_words: words(s.peer_dialog),
    examiner_presentation_words: words(s.presentation || s.written_analysis),
  };
}

// Deterministic facts live in ../extractStats.js (pure, no SDK import) so the browser bundle can share them.
export { connectionStats, renderChains };

/**
 * Who actually said it? The clerk is told delivery_to_peer is Mark's words only; this checks it against the session's
 * speaker labels. If the closest utterance is someone else's, the text moves to peer_restated (when that is empty) and
 * the field is cleared — the evaluator must not score, or coach, a sentence Mark never said. Returns the guards fired.
 */
export function speakerGuard(x, session) {
  const fired = [];
  const p = x.prescription;
  if (p && has(p.delivery_to_peer) && (Object.keys(session?.sections || {}).length || session?.transcript)) {
    const hit = findOriginal({ instead: p.delivery_to_peer, quoted: true }, session);
    if (hit.kind === 'quote' && hit.speaker && hit.speaker !== 'Mark') {
      fired.push(`prescription.delivery_to_peer was ${hit.speaker}'s words ("${String(p.delivery_to_peer).slice(0, 60)}…") — cleared`);
      if (!has(p.peer_restated)) p.peer_restated = p.delivery_to_peer;
      p.delivery_to_peer = null;
    }
  }
  return fired;
}

/** Run Step 1 on a session. Returns the §8.1 JSON object (+ delivery_stats, extract_version). */
export async function extractSession(session) {
  const user = `${buildExtractInput(session)}\n\nProduce the inventory using exactly this schema:\n${EXTRACT_SCHEMA}`;
  const out = await completeJson({ model: MODELS.sonnet, system: EXTRACT_SYSTEM, user, maxTokens: 6000 });
  out.ma_type = normalizeMaType(out.ma_type || session.type);
  out.connection_stats = connectionStats(out);
  out.cause_effect_chain = renderChains(out);
  out.comparison_to_intended_outcome = comparisonFacts(out.comparison_to_intended_outcome);
  out.extraction_guards = speakerGuard(out, session);
  out.delivery_stats = deliveryStats(session);
  out.extract_version = EXTRACT_VERSION;
  return out;
}

/**
 * Step 1 on ONE rewritten passage ("try that line again", §13 row 5). Same clerk, same rules, same schema — a looser
 * clerk here would make practice scores meaningless. The peer's stated intent and the task are given as reference so
 * a comparison to intent can be recognised; they are not inventoried again.
 */
export async function extractPassage({ session, section, passage, reference = {} }) {
  const sec = { peer_dialog: 'PEER DIALOG (unprompted)', prescription_delivery: 'PRESCRIPTION DELIVERY TO PEER (unprompted)', presentation: 'PRESENTATION TO EXAMINER (unprompted)', written_analysis: 'WRITTEN ANALYSIS (unprompted)', examiner_qa: 'EXAMINER Q&A (prompted)', transcript: 'TRANSCRIPT' }[section] || String(section || 'PASSAGE').toUpperCase();
  const ref = [
    reference.task ? `Task skied: ${reference.task}` : null,
    reference.peer_intent?.length ? `Peer's stated intent (from the peer dialog): ${reference.peer_intent.map((t) => `"${t}"`).join(' / ')}` : null,
  ].filter(Boolean).join('\n');
  const user = [
    `MA TYPE: ${normalizeMaType(session?.type || session?.context)}`,
    `CONTEXT: who=${session?.who || '?'} · activity=${session?.activity || '?'} · conditions=${session?.conditions || '?'}`,
    ref ? `\n=== REFERENCE ONLY — said earlier in the session by others or already inventoried. Do NOT inventory this. ===\n${ref}` : '',
    `\n=== ${sec} — ONE PASSAGE. Inventory only what Mark says here. ===\n${passage}`,
    `\nProduce the inventory using exactly this schema. Fields the passage does not touch stay false / null / empty:\n${EXTRACT_SCHEMA}`,
  ].join('\n');
  const out = await completeJson({ model: MODELS.sonnet, system: EXTRACT_SYSTEM, user, maxTokens: 2500 });
  out.connection_stats = connectionStats(out);
  out.comparison_to_intended_outcome = comparisonFacts(out.comparison_to_intended_outcome);
  out.extract_version = EXTRACT_VERSION;
  return out;
}

/**
 * Flatten an extraction to the text that gets embedded (as chunk text and as retrieval query, §7.2).
 * Substance first, tags last: identical leading boilerplate compressed every session into one similarity band.
 * Tolerates v1 extractions (no connections/task/equipment).
 */
export function extractionToText(x) {
  const L = [];
  if (x.verbatim_key_phrases?.length) L.push(`Key phrases: ${x.verbatim_key_phrases.map((s) => `"${s}"`).join(' ')}`);
  for (const o of x.observations || []) {
    L.push(`Observation [${o.phase}]: ski=${o.ski_performance || '-'}; body=${o.body_performance || '-'}${o.dirt ? `; DIRT=${o.dirt}` : ''}`);
  }
  for (const c of x.connections || []) {
    const links = [c.body_movement, c.fundamental, c.linked_fundamental, c.body_consequence, c.ski_performance, c.outcome_detail || c.outcome].filter(Boolean);
    if (links.length) L.push(`Connection [${c.phase || 'unspecified'}]: ${links.join(' → ')}`);
  }
  if (x.cause_effect_chain?.length) L.push(`Cause→effect: ${x.cause_effect_chain.join(' | ')}`);
  for (const p of x.physics_concepts || []) L.push(`Physics (${p.explicit_or_implied}): ${p.concept} — "${p.quote}"`);
  if (x.desired_performance?.stated) L.push(`Desired performance: ${x.desired_performance.quote || ''}`);
  if (x.equipment?.addressed) L.push(`Equipment: ${x.equipment.quote || ''}`);
  for (const k of ['vs_intent', 'vs_ideal']) { const c = x.comparison_to_intended_outcome?.[k]; if (c && c.state !== 'absent' && c.quote) L.push(`Comparison (${k === 'vs_intent' ? "skier's intent" : "task's ideal"}): ${c.quote}`); }
  if (x.intent_verification?.asked) L.push(`Intent verification: ${(x.intent_verification.questions || []).join(' / ')} → ${(x.intent_verification.peer_answers || []).join(' / ')}`);
  if (x.conditions_considered) L.push(`Conditions: ${x.conditions_considered}`);
  if (x.prescription?.task) L.push(`Prescription: ${x.prescription.task}. To examiner: ${x.prescription.rationale_to_examiner || '-'}. To peer: ${x.prescription.delivery_to_peer || '-'}`);
  for (const q of x.examiner_probes || []) L.push(`Probe: ${q.question} → ${q.mark_answer}${q.deepened ? ' (deepened)' : ''}`);
  const u = x.unprompted_vs_prompted || {};
  if (u.prompted_creation?.length) L.push(`Prompted creation: ${u.prompted_creation.join('; ')}`);
  if (x.task?.named) L.push(`Task: ${x.task.named}`);
  if (x.primary_fundamental_named) L.push(`Primary fundamental: ${x.primary_fundamental_named}`);
  if (x.skills_referenced?.length) L.push(`Skills: ${x.skills_referenced.join(', ')}`);
  L.push(`MA type: ${x.ma_type}`);
  return L.join('\n');
}
