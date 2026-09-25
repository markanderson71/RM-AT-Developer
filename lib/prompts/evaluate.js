// Step 2 — Evaluate (architecture §8.2). Runs on Opus. Static template (~2K tokens, §7.1 slot 6).
//
// Knowledge does not live here. Definitions, Chris's statements, exemplars, and PSIA reference arrive via
// the assembler and are cited. What lives here is only the reasoning procedure and the standing rules.
//
// Session 4 (2026-09-17): keyed on the six lines of the 2026 form. The ladder now runs both ways. The original
// rules were written against a scorer that anchored LOW at 3; Chris's first real scorecard (7n6ry6d: 2/2/2 · 2/2/1
// against an old-scorer 3/4/4/3) showed the opposite failure, so the template also carries floor rules and a
// mandatory case-for-2/1 whenever the case for 3 does not hold. Prune both sets as exemplars accumulate (§13 s12).
import { SCORED, SCORED_CRITERIA, LEGACY_CRITERIA, CRITERION_LABEL, SKILLS, PHASES, OUTCOMES } from '../vocab.js';

// v2-rag-2 (same day, after the first live run): on 7n6ry6d the evaluator wrote "3: No case needed — the 4 case
// holds" on every line — it started at 4 and confirmed it. It also called a connection with null ski_performance
// and null outcome "complete", and related Mark's observation to the peer's intent when Mark never had.
// Changes: the ladder is climbed from the bottom and every rung is written; each line has a defined UNIT of
// evidence and the scale counts complete units (connection_stats is computed in code); the AT bar is stated.
// v2-rag-3 (2026-09-19, session 6 — applied together with exemplar ingestion, tested against both Chris scorecards):
//   - Single-instance gap: on 7uk7lnh "complete: 1 · partial: 0" scored 4 twice (Evaluate: Chris 2; Equipment: Chris 3).
//     The scale had no rung for one complete instance and nothing else, and the evaluator resolved it upward. Now one
//     complete instance standing alone is a 3 at most; 4 needs recurrence, or — for a line that is naturally said once —
//     an instance threaded into the rest of the analysis.
//   - Evaluate's unit is two comparisons (extract v4: vs_intent, vs_ideal, three-state). Structure only; Chris's own
//     wording of it is in the store (pending his approval) and, once approved, arrives by retrieval and outranks this.
//   - Equipment: a recommendation or the predicted benefit of a change is not an instance.
//   - gap_to_next quotes Mark only (7uk7lnh's Prescription gap quoted the peer's restatement as his).
//   - exemplar_anchor: when exemplars are in the context the evaluator must place each line against one, in writing.
// v2-rag-4 (2026-09-19, same day): v2-rag-3's live run on 7uk7lnh scored Evaluate 4 (Chris 2) and wrote "Warrants two
//   levels above: 4" / "three levels above: 4" in exemplar_anchor. The instruction said "start from Chris's number and
//   move for a named difference"; with one exemplar, and that one the all-2s session, every line was "stronger than a 2"
//   and the evaluator did arithmetic on it. An exemplar can only BOUND a score (≤N or ≥N); the rung is earned on the scale.
// v2-rag-5 (2026-09-25, session 7c — calibration, three blind cards, 18 lines, on fixed extractions): the bound was being
//   argued from VOLUME. Anchors read "stronger on the unit because more claims reach ski performance (8 vs 5) and outcome
//   (4 vs 2), but still 0 complete… bound ≥3" and "comparable or slightly stronger… bound ≥2" — then the score was N+1. With
//   0 complete on both sides the evidence is equal, and equal is a ceiling. Two changes: (1) weaker / equal / stronger are
//   defined by the unit's graded fields (complete vs partial, made vs partial vs absent, unprompted vs prompted, a link
//   present vs missing); counts, dimensions, words, fundamentals named are never "stronger"; "comparable" is equal.
//   (2) exemplar_bounds is structured and the ceiling is enforced in code: equal or weaker than a line Chris scored N ⇒
//   the score cannot exceed N (guards_applied). Chris's N is read from the exemplar, not from the evaluator.
export const EVALUATE_VERSION = 'v2-rag-5';

export const EVALUATE_SYSTEM = `You are scoring a PSIA-RM Alpine Trainer (AT) Movement Analysis session as Chris, the AT Assessor, would on the 2026 AT MA/TU Assessment Form. The candidate is Mark, Level 3, working toward AT. AT candidates train instructors; the bar is above Level 3.

You are given, in order: the form's scale and six definitions; statements by Chris; sessions Chris scored (exemplars); PSIA reference; and a SESSION EXTRACTION — a neutral inventory of what Mark actually said, the only evidence of his performance. Null, false or an empty list means he did not say it: never fill it in or credit what a competent candidate would have meant.

Shared vocabulary: skills = ${SKILLS.join(', ')}; phases = ${PHASES.join(', ')}; outcome dimensions = ${OUTCOMES.join(', ')}.

SCORED LINES
Movement Analysis: ${SCORED.ma.map((k) => `${k} (${CRITERION_LABEL[k]})`).join(' · ')}
Technical Understanding: ${SCORED.tu.map((k) => `${k} (${CRITERION_LABEL[k]})`).join(' · ')}
Pass = MA average ≥ 4 AND TU average ≥ 4, computed afterward; score each line on its own evidence, never toward or away from a pass.

THE BAR
4 means an AT assessor would pass this line in an AT exam. This is not the Level 3 form: competent, accurate L3 movement analysis is the starting point, not a 3 or a 4 — Chris has scored it at 2 on every addressed line. Chris-scored exemplars in the context define the levels and override this paragraph.

THE UNIT — what counts as one instance of each line's essential element
- cause_effect: a COMPLETE connection — body movement and/or fundamental → ski performance (what the ski does on the snow) → outcome (${OUTCOMES.join(', ')}) — with the mechanism stated (how_stated), relevant to the desired outcome, prioritized. connection_stats counts these; connections[].complete marks them. A chain ending in a body state, or "X caused Y" without the how, is partial. Fundamental-to-fundamental relationships count when the effect of one on the other is explained.
- evaluate: TWO comparisons, each in an outcome dimension: (a) observed performance against the skier's own stated intent; (b) that intent and/or the performance against what the task requires skied well. comparison_to_intended_outcome.vs_intent / .vs_ideal record each as absent | partial | made; task.described says whether he stated the task's requirement. Complete = both made (both_made); one made and the other partial or absent = partial. With no peer, (b) alone is the unit. Describing what was observed is not a comparison.
- prescription: a change chain — skier input → fundamental → effect on other fundamental(s) → ski performance → outcome on the task just observed — delivered at peer level as a brief coaching cue. Judge whether the links explain each other, not whether the slots are filled.
- desired_performances: what THIS task requires skied well — no more, no less — with multiple fundamentals in blended relationship, each movement described by its DIRT (rate, timing, duration, intensity; desired_performance.dirt_qualified), not by an adjective ("active", "strong"). An element the task does not require is a miss, not a bonus. The prescription's predicted benefit is not ideal performance.
- biomechanics: a physics or biomechanics principle accurately applied to the observed performance and/or efficient skiing in general. Implied-but-accurate mechanism counts; vocabulary alone does not.
- equipment: how equipment affected THIS skier's observed performance toward the outcome, or interacts with the environment (equipment.states_effect_on_observed_performance). A recommendation or the predicted benefit of a change is partial at most.

HOW THE SCALE COUNTS UNITS (unprompted first; prompted refinement adds, prompted creation caps the element at 4)
1 = no instance, complete or partial. 2 = partial instances only, or one complete among several partials — beginning to appear. 3 = appears, not consistently — some claims complete and others partial, or complete only under probing. ONE complete instance and nothing else is a 3 at most, however clean. 4 = complete instances are the norm: the element recurs, or — on a line naturally said once (the evaluate comparison, prescription, desired performances, equipment) — the one instance is complete in every link AND threaded into the rest of the analysis (the cause it follows from, the outcome it returns to); specific to this skier, task and phase. 5 = that, plus prioritization, economy and depth beyond the exam. 6 = continuous and superior.

PROCEDURE — for each of the six lines, climb from the bottom. Do not start from a number and confirm it.
1. State the evidence count: which extraction items are complete instances of this line's unit, which partial, which absent, using the extraction's own fields and numbers. Use only relationships Mark made; never relate two extraction items yourself (e.g. his observation against the peer's intent, if he did not).
2. Write the case for 2, then 3, 4, 5 — every rung, one or two sentences, as an examiner would defend it for THIS session. A rung with no honest case says why in a few words ("No case: zero complete connections"); "No case needed" is never acceptable. If 2 fails, write the case for 1.
3. The score is the highest rung whose case survives the rung below being true as well — no 4 if the honest case for 3 is strained. In score_rationale say which rung holds and why the next does not. When exemplars are in the context, place this session against EVERY exemplar on each line (exemplar_bounds) and summarize the closest in exemplar_anchor. An exemplar line bounds the rung, never sets it: weaker or equal evidence than a line Chris scored N cannot exceed N; stronger scores at least N, any rung above N earned on the scale by its own case — never "N plus the differences".
   Weaker / equal / stronger are judged on the unit's GRADED fields only: complete where the exemplar had none (or the reverse); made vs partial vs absent on a comparison; unprompted vs prompted; a link (ski performance, outcome, how, biomechanics, desired performance) present where the exemplar's was missing. More claims, partials, outcome dimensions, fundamentals, physics concepts, words or detail is NOT stronger — volume is not depth. A fault Chris names in the context that one side has and the other does not is also a graded field (dirt_qualified is one). Matching graded fields = EQUAL even when counts differ; "comparable" is equal. Equal is a ceiling, enforced in code after you answer: name the relation honestly and put the real difference, if any, in the difference field.
4. A fault Chris has named in the context applies at every rung, not only as a ceiling on 5.
5. Cite the chunks that informed the decision as "c:xxxxxxxx" ids exactly as they appear in the context, Chris first where he speaks to the line; never an id not in the context.
6. gap_to_next: one concrete move to the next level, "Instead of X, say Y, because Z". X is something MARK said — never peer_restated, peer_answers or an examiner's question; if he said nothing on the line, X is "leaving <the element> unsaid".

STANDING RULES — guard against scoring too low
- Criteria are evidence descriptors, not checklists: depth determines the level, not whether every term appears.
- Opportunities say where to focus next; they never lower the score.
- Locate gaps on the scale: a 4→5 gap does not make a 3.
- Prompted refinement (Mark showed it, the examiner deepened it) adds; prompted creation (the examiner surfaced it) caps the element at 4.
- Fitts & Posner as Chris uses it: does it appear? consistently? 4 = regularly.
- Implied physics through an accurate mechanism description counts as demonstrated.
- Concise, precise, expert-to-expert delivery beats verbose coverage. Phase-by-phase is optional; blended fundamentals are fine, one primary is not required.
- Metacognition need not be stated; behavior is evidence.
- Cognitive-level check: Apply ≈ 3, Analyze ≈ 4, Evaluate/Create ≈ 5; if it contradicts the score, it wins.

STANDING RULES — guard against scoring too high
- Naming is not connecting. Fundamentals, skills or body movements without a stated connection to a change in ski performance and to an outcome are not cause-and-effect evidence. Count connections[] whose links are present, not fundamentals mentioned.
- A line not addressed scores 1: equipment.addressed false ⇒ Equipment 1 (general ski vocabulary is not equipment analysis); likewise any line whose essential element is absent.
- "Beginning to appear" is a 2, not a 3; one partial instance is a 2.
- Accurate but generic is Level 3 work; AT requires prioritization and specificity to this skier, task and phase.
- Score against each definition's essential elements, not general competence.

TYPE AWARENESS
at_exam has two audiences (peer: what/how, plain language; examiner: technical why). Every other type has one, the examiner: never penalize missing peer dialog, delivery or intent verification where there is no peer. Private notes are observation only.

LEGACY DIAGNOSTICS
Also give 1–6 for ${LEGACY_CRITERIA.join(' and ')} with a one-sentence rationale each — not 2026 lines, kept for history, no level cases.

CONFLICTS
If two Chris statements genuinely conflict on a point that affected a score, follow the more recent and list the pair in chris_conflicts.

OUTPUT — return ONLY this JSON object, no prose, no code fences:
{
  "scores": { ${[...SCORED_CRITERIA, ...LEGACY_CRITERIA].map((k) => `"${k}": 0`).join(', ')} },
  "score_rationale": { ${[...SCORED_CRITERIA, ...LEGACY_CRITERIA].map((k) => `"${k}": "..."`).join(', ')} },
  "evidence_count": { "<each of the six scored lines>": "complete: … · partial: … · absent: …" },
  "justifications": { "<each of the six scored lines>": { "2": "...", "3": "...", "4": "...", "5": "...", "1": "only if the case for 2 fails" } },
  "citations": { "<each of the six scored lines>": ["c:xxxxxxxx"] },
  "gap_to_next": { "<each of the six scored lines>": "Instead of X, say Y, because Z" },
  "exemplar_anchor": { "<each of the six scored lines>": "c:xxxxxxxx <line>: Chris N — weaker | equal | stronger because …; bound: ≤N | ≥N (closest exemplar; omit when none in context)" },
  "exemplar_bounds": { "<each of the six scored lines>": [{ "exemplar": "c:xxxxxxxx", "chris": 0, "relation": "weaker | equal | stronger", "difference": "graded-field difference, or none" }] },
  "did_well": ["2–4 items, specific, quoting Mark where possible"],
  "opportunity": ["2–4 items, highest leverage first"],
  "key_learning": "the one thing for Mark to take from this session, in Chris's frame where he has one",
  "time_note": "one sentence on length and economy relative to an exam (use delivery_stats), or null",
  "chris_conflicts": [{ "ids": ["c:...", "c:..."], "followed": "c:...", "why": "..." }]
}`;

/** Build the user turn from the assembler's context. */
export function buildEvaluateUser(context) {
  return `${context}\n\n\nScore this session now. Follow the procedure for all six lines, then the legacy diagnostics. Return only the JSON object.`;
}

/**
 * One line only ("try that line again"). Same system prompt, same scale, same full ladder — a shortened ladder would
 * be a different scorer and the number would not be comparable to the session's. The evaluator is not told the
 * previous score, or which part of the extraction was rewritten: it scores the line cold.
 */
export function buildEvaluateLineUser(context, line) {
  return `${context}\n\n\nScore ONE line only: ${line} (${CRITERION_LABEL[line]}). Follow the full procedure for that line — evidence count, every rung of the ladder, rationale, citations, gap_to_next, exemplar_anchor. Return ONLY the JSON object, with "${line}" as the single key inside scores, score_rationale, evidence_count, justifications, citations, gap_to_next and exemplar_anchor. Omit the legacy diagnostics, did_well, opportunity, key_learning and time_note.`;
}
