// Step 1 — Extract (architecture §8.1). Runs on Sonnet. Built in session 1 because bootstrap
// needs it for past_session chunks; session 4 refines wording against real scoring runs.
//
// The point of a separate step: inventory everything demonstrated BEFORE any judgment, so the
// evaluator sees the whole picture instead of pattern-matching criteria while reading.
import { MODELS, completeJson } from '../llm.js';

export const EXTRACT_SYSTEM = `You are an inventory clerk for PSIA Alpine Trainer Movement Analysis (MA) practice sessions.
You read a session transcript and produce a structured JSON inventory of what the candidate (Mark) actually said and did.

You do NOT score. You do NOT judge quality. You do NOT say what was missing. You record what is present, precisely and completely, in normalized PSIA language.

Normalization rules:
- Name skills with these tags only: edging, pressure, rotary, balance_fore_aft, balance_lateral, ski_to_ski, upper_lower_separation, turn_shape, turn_phase, dirt, conditions, tactics, equipment, intent_verification, peer_dialog, idp_task, physics_sidecut, physics_forces, physics_camber, fitts_posner, l3_vs_at.
- Turn phases: initiation, shaping, finish (or transition). Locate every observation in a phase when the candidate did; otherwise phase = "unspecified".
- DIRT = duration, intensity, rate, timing. Record only what the candidate named.
- Physics concepts: sidecut engagement, reverse camber, edge platform, centripetal/centrifugal forces, three-joint constraint, pendulum, ski-snow interaction, etc. Mark each as "explicit" (candidate named the mechanism) or "implied" (candidate described the effect without the mechanism). Quote the words.
- Two audiences in AT Exam sessions: the peer (what/how, plain language) and the examiner (technical why). Keep them separate.
- Prompted vs unprompted: anything in the presentation or peer dialog is unprompted. Anything that first appears in Examiner Q&A is prompted. If a probe deepened an existing point it is "prompted_refinement"; if it introduced a new concept it is "prompted_creation".
- verbatim_key_phrases: 5–12 short exact quotes that best capture the candidate's diagnosis, chain, and prescription. These are used for retrieval; pick substance over filler.

Return ONLY the JSON object. No prose, no code fences.`;

export const EXTRACT_SCHEMA = `{
  "ma_type": "at_exam | written | scenario | reverse | compare | video",
  "observations": [{ "phase": "...", "ski_performance": "...", "body_performance": "...", "dirt": "..." }],
  "skills_referenced": ["edging"],
  "physics_concepts": [{ "concept": "...", "explicit_or_implied": "explicit | implied", "quote": "..." }],
  "cause_effect_chain": ["A → B → C"],
  "primary_fundamental_named": "... | null",
  "intent_verification": { "asked": true, "questions": ["..."], "peer_answers": ["..."] },
  "conditions_considered": "... | null",
  "prescription": { "task": "...", "rationale_to_examiner": "...", "delivery_to_peer": "...", "peer_restated": "quote | null" },
  "examiner_probes": [{ "question": "...", "mark_answer": "...", "deepened": true }],
  "unprompted_vs_prompted": { "unprompted": ["..."], "prompted_creation": ["..."], "prompted_refinement": ["..."] },
  "verbatim_key_phrases": ["..."]
}`;

const TYPE_MAP = {
  at_exam: 'at_exam', 'at ma exam': 'at_exam', 'at exam': 'at_exam',
  written: 'written', 'written ma': 'written',
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

/** Run Step 1 on a session. Returns the §8.1 JSON object. */
export async function extractSession(session) {
  const user = `${buildExtractInput(session)}\n\nProduce the inventory using exactly this schema:\n${EXTRACT_SCHEMA}`;
  const out = await completeJson({ model: MODELS.sonnet, system: EXTRACT_SYSTEM, user, maxTokens: 4000 });
  out.ma_type = normalizeMaType(out.ma_type || session.type);
  return out;
}

/** Flatten an extraction to the text that gets embedded (as chunk text and as retrieval query, §7.2). */
export function extractionToText(x) {
  const L = [];
  L.push(`MA type: ${x.ma_type}`);
  if (x.primary_fundamental_named) L.push(`Primary fundamental: ${x.primary_fundamental_named}`);
  if (x.skills_referenced?.length) L.push(`Skills: ${x.skills_referenced.join(', ')}`);
  for (const o of x.observations || []) {
    L.push(`Observation [${o.phase}]: ski=${o.ski_performance || '-'}; body=${o.body_performance || '-'}${o.dirt ? `; DIRT=${o.dirt}` : ''}`);
  }
  if (x.cause_effect_chain?.length) L.push(`Cause→effect: ${x.cause_effect_chain.join(' | ')}`);
  for (const p of x.physics_concepts || []) L.push(`Physics (${p.explicit_or_implied}): ${p.concept} — "${p.quote}"`);
  if (x.intent_verification?.asked) L.push(`Intent verification: ${(x.intent_verification.questions || []).join(' / ')} → ${(x.intent_verification.peer_answers || []).join(' / ')}`);
  if (x.conditions_considered) L.push(`Conditions: ${x.conditions_considered}`);
  if (x.prescription?.task) L.push(`Prescription: ${x.prescription.task}. To examiner: ${x.prescription.rationale_to_examiner || '-'}. To peer: ${x.prescription.delivery_to_peer || '-'}`);
  for (const q of x.examiner_probes || []) L.push(`Probe: ${q.question} → ${q.mark_answer}${q.deepened ? ' (deepened)' : ''}`);
  const u = x.unprompted_vs_prompted || {};
  if (u.prompted_creation?.length) L.push(`Prompted creation: ${u.prompted_creation.join('; ')}`);
  if (x.verbatim_key_phrases?.length) L.push(`Key phrases: ${x.verbatim_key_phrases.map((s) => `"${s}"`).join(' ')}`);
  return L.join('\n');
}
