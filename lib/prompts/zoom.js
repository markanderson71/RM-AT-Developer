// §6.2 — Zoom / call transcript → discrete calibration statements (Opus). Output is PENDING chunks; the mentor approves.
// The prompt never sees the store and never scores anything. Vocabulary comes from lib/vocab.js.
import { CRITERIA, CRITERION_LABEL, SKILLS } from '../vocab.js';

export const ZOOM_PROMPT_VERSION = 'zoom-2';
export const ZOOM_TYPES = ['principle', 'correction', 'mental_model', 'physics', 'exemplar'];

const criteriaLines = CRITERIA.map((c) => `  ${c}${CRITERION_LABEL[c] ? ` — ${CRITERION_LABEL[c]}` : c === 'general' ? ' — about AT-level MA as a whole, or no single line' : ''}`).join('\n');

export const zoomSystem = ({ mentor = 'chris', candidate = 'mark' } = {}) => `You extract calibration statements from a transcript of a coaching call between ${cap(mentor)}, a PSIA-RM Alpine Trainer (AT) assessor, and ${cap(candidate)}, an AT candidate. ${cap(mentor)} is the ground truth for how AT Movement Analysis (MA) and Technical Understanding (TU) are scored. Your output becomes a list ${cap(mentor)} reviews one by one: he approves, edits or deletes each item. Approved items are later retrieved, cited by an AI scorer, and shown to ${cap(candidate)} as "${cap(mentor)} said". So each item must be something ${cap(mentor)} actually said, in his words, and must stand on its own when read months later without the call.

WHAT TO EXTRACT — only ${cap(mentor)}'s statements about:
- how a line is scored, why something is or is not a given level, what separates AT from Level 3 work
- what he listens for / what he would probe as an examiner (his examiner-style questions count: "how do you create friction, and why does it matter?" tells the scorer what depth he expects)
- corrections of ${cap(candidate)}'s analysis, wording, questions to the peer, prescription, physics — with the reason he gives
- scores he gives for a session. Write them as "Scores for <the session, as identifiable from the call>: <Line> N, <Line> N, …" using the form's line names; drop false starts and mis-hearings (never output a number he did not clearly give). His reasons for a score are separate items that name the line they explain.
- mental models and physics/biomechanics explanations he gives
- a delivery he models out loud ("Hey, based on what I saw…"): keep the whole modeled delivery as ONE item, type "exemplar", "modeled": true. Do not split it and do not tidy it into something better than he said.

DO NOT EXTRACT
- anything ${cap(candidate)} says. If ${cap(mentor)} agrees with a point ${cap(candidate)} made ("perfect", "closer"), the item is ${cap(mentor)}'s agreement and must say what he agreed with, in "context" — never present ${cap(candidate)}'s words as ${cap(mentor)}'s.
- text ${cap(mentor)} reads aloud: ${cap(candidate)}'s written notes, the assessment form, or output from the practice app. Reading is not asserting. His reaction to it is the statement; what he was reading goes in "context". (Exception: when he quotes the form to make a point about it, the point is his.)
- logistics, small talk, family, software troubleshooting, the AI meeting assistant.
- advice about ${cap(candidate)}'s own skiing, training plan or gear purchases ("should I buy a slalom ski?"), and remarks about ${cap(candidate)}'s progress over time ("it's getting better"). Neither is calibration; both go stale. The only exception is when he explicitly ties it to how MA/TU is assessed.
- opinions about the practice app / AI sparring partner / AI scores themselves. Put those in "tool_feedback" ONLY — never also in "statements" ("I think it's slightly high" about the AI's scores is tool feedback). They are bug reports for the builder, not calibration for the scorer.

SPEAKER LABELS ARE UNRELIABLE. The labels come from automatic diarization: they flip mid-turn, split one person across labels, and merge two people into one turn. Treat the speaker map you are given as a prior, not as truth. Attribute by content: ${cap(mentor)} gives the feedback, asks the examiner-style questions, quotes the form, gives scores, says what he would do on an exam; ${cap(candidate)} defends his analysis, asks how to phrase things, describes what he meant. Set "speaker_basis" to "label" when the label and the content agree, "content" when you are overriding the label, and "uncertain" when you cannot tell — include uncertain items only when the statement is clearly valuable, so ${cap(mentor)} can decide.

COVERAGE. The most valuable items are the places where he disagrees with something ${cap(candidate)} said, wrote, asked, recommended or prescribed — every one of those must yield an item with his reason, even when the passage is rough. A long turn usually holds several distinct points; extract each. Rough speech recognition is not a reason to skip: this is alpine skiing, so expect words like gear, boots, fall line, tips and tails, base of support, center of mass, ski-to-snow contact, sidecut, radius, edge angle, leg turning, tipping, separation, initiation / shaping / finish, short swings, dynamic parallel, IDP, Level 2 / Level 3, and restore them when the intended word is evident (listing each fix).

RULES FOR EACH ITEM
0. Every item must make sense to someone who was not on the call and cannot see "context". A bare reaction ("we can have a debate about that one"), a bare question with no indication of what answer he wants, or a fragment that only completes ${cap(candidate)}'s sentence is NOT an item: join it to the sentences that give it meaning (his follow-up, his own answer, what he was reacting to in [brackets]) or drop it. When he asks an examiner-style question and then gives the answer he was looking for, that is ONE item: question plus answer.
1. One point per item. Keep a claim together with the reason or example he gives for it; do not merge two different points, and do not split one point into fragments that no longer make sense alone.
2. Do not generalize. If he said it about bump skiing, the item says bump skiing. If he said it about this one session, the item says so. Never turn "you did X here" into "candidates should always X".
3. "text" is his statement lightly cleaned: drop fillers, false starts and repetition; resolve pronouns only where the referent is unambiguous in the transcript (put the referent in [brackets]). Keep his vocabulary and his bluntness. Do not add reasoning he did not give.
4. The transcript has speech-recognition errors ("skeetus no contact" = "ski-to-snow contact"). Fix one only when you are confident what was said, and list every fix in "asr_fixes" as "heard → restored". If a passage is too garbled to restore with confidence, keep the clear part or skip it. Never guess a number or a score.
5. "quote" is copied VERBATIM from the transcript, errors and all — 8 to 40 consecutive words from the heart of the statement. It is used to verify the item mechanically; an item whose quote is not in the transcript is discarded.
6. "hedged": true when he is thinking out loud, posing a real (not rhetorical/examiner-style) question, speaking hypothetically, or signals it is debatable ("we can have a debate about that one", "that's my belief"). Say why in "hedge_note". He decides whether it stands.
7. "context": 1–2 sentences on what was being discussed and what prompted the statement (which session, which part of ${cap(candidate)}'s work, what ${cap(candidate)} had just said). Neutral, factual, no evaluation.
8. Turns marked "~" are context from the neighbouring part of the call. Extract only statements that START in an unmarked turn; you may read into following "~" turns to complete such a statement.
9. Expect roughly 20–60 items per hour of call. Most turns yield nothing. An empty list for a stretch of logistics is correct.

TAGS
criteria — one or more of:
${criteriaLines}
  Tag a scored line only when the statement bears on how that line is judged; otherwise "general". "describe" and "communication" are retrieval tags, not 2026 exam lines.
skills — zero or more of: ${SKILLS.join(', ')}. Tag generously; tags are a pre-filter.
type — exactly one of:
  principle — how he thinks about scoring, what he expects at AT level, what he listens for
  correction — he disagrees with something specific ${cap(candidate)} said, wrote, asked or scored, and says why; also the scores he gives for a session
  mental_model — a reusable frame or image (e.g. "one-fundamental land")
  physics — a mechanism explanation (forces, ski design, friction, biomechanics of a joint)
  exemplar — a delivery or question he models out loud as the way to do it

Return ONLY JSON:
{
  "statements": [{
    "turns": [12, 13],              // T-numbers the statement comes from
    "timestamp": "00:05:49",        // of the first turn
    "text": "...",
    "quote": "...",
    "speaker_basis": "label | content | uncertain",
    "criteria": ["cause_effect"],
    "skills": ["rotary"],
    "type": "principle",
    "modeled": false,
    "hedged": false,
    "hedge_note": null,
    "asr_fixes": [],
    "context": "..."
  }],
  "tool_feedback": [{ "timestamp": "00:00:00", "text": "what he said about the app / AI peer / AI score, lightly cleaned" }]
}`;

/** Render one window of turns. `turns` items: { i, t, speaker, text, ctx } where ctx marks context-only turns. */
export function zoomUser({ turns, date, title, speakerMap = {}, sessions = [], part, parts }) {
  const ses = sessions.length ? `\nSessions under discussion, by time (use the label when an item needs to name the session): ${sessions.map((s) => `${s.range} ${s.label || ''} (${s.id})`).join(' · ')}` : '';
  const map = Object.entries(speakerMap).map(([k, v]) => `${k} = ${v}`).join(' · ') || 'none given';
  const body = turns.map((x) => `[${x.ctx ? '~' : ''}T${x.i} ${x.t} ${x.speaker}] ${x.text}`).join('\n');
  return `Call date: ${date}${title ? ` · ${title}` : ''} · part ${part} of ${parts}
Speaker map (a prior, confirmed by the candidate as "mostly"; see the rules on labels): ${map}${ses}

TRANSCRIPT
${body}`;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
