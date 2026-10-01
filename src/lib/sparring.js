// Sparring modes (session 9) — registry, per-mode state persistence, session builders. Pure; components own React state.
// The AT Exam keeps its own model in exam.js. Everything else — chat coaches, Written MA, Examiner Sparring, line
// drills — is here. Nothing in this file reads summary.scores (§15: scorecard() is the only reader).
import { uid, today } from "./users.js";
import { OPEN_SYSTEM, SCENARIO_SYSTEM, REVERSE_SYSTEM, COMPARE_SYSTEM, VIDEO_SYSTEM, DRILLS, DRILL_ORDER } from "./sparringPrompts.js";
import { compactForSheet, fitSummary } from "./exam.js";

export const MODES = [
  { id: "atexam", label: "AT MA Exam", icon: "🏔️", color: "#d06060", kind: "exam", desc: "Full exam simulation — observe, verify with the peer, prescribe, present, take the examiner's questions." },
  { id: "examiner", label: "Examiner Sparring", icon: "🎓", color: "#e0a040", kind: "examiner", desc: "Present an MA; a strict examiner probes, one question at a time, then ends it. Two examiners debrief." },
  { id: "drill", label: "Line drills", icon: "🎯", color: "#3088cc", kind: "drill", desc: "Practise one form line at a time — the ideal for an IDP task, the two comparisons, tactics, equipment — scored on that line alone." },
  { id: "writtenma", label: "Written MA", icon: "📝", color: "#a0a0d0", kind: "written", desc: "Write a full MA of a video or a scenario; the examiner questions it; the scorer scores it." },
  { id: "scenario", label: "Scenario Drill", icon: "🧩", color: "#e07830", kind: "chat", system: SCENARIO_SYSTEM, opener: "Give me a scenario to analyze.", desc: "The coach describes an instructor; you analyze, the coach pushes." },
  { id: "reverse", label: "Reverse MA", icon: "🔄", color: "#28a858", kind: "chat", system: REVERSE_SYSTEM, opener: "Give me a reverse MA: describe what a trainer did — the task, terrain, progression, cue and the instructor's level — and I'll work backwards to what they saw.", desc: "Prescription first; you find the diagnosis." },
  { id: "compare", label: "Compare & Contrast", icon: "⚖️", color: "#3088cc", kind: "chat", system: COMPARE_SYSTEM, opener: "Give me two instructors with the same symptom and different root causes.", desc: "Two skiers, one symptom, two causes." },
  { id: "video", label: "Video Analysis", icon: "🎥", color: "#e8a050", kind: "chat", system: VIDEO_SYSTEM, opener: null, desc: "Paste your analysis of a video; the coach pushes it deeper." },
  { id: "open", label: "Open Chat", icon: "💬", color: "#c060a0", kind: "chat", system: OPEN_SYSTEM, opener: null, desc: "Free conversation with the AT coach." },
];
export const modeById = (id) => MODES.find((m) => m.id === id) || MODES[0];
export const MODE_KEY = "rmat_sparring_mode";

// ── per-mode persistence (the exam has its own key in exam.js) ─────────────────────────────────────────────────────
const ls = () => (typeof window !== "undefined" ? window.localStorage : null);
const KEY = (id) => `rmat_spar_${id}`;
export function loadMode(id, fresh) { try { const raw = ls()?.getItem(KEY(id)); const p = raw ? JSON.parse(raw) : null; return p && typeof p === "object" ? { ...fresh(), ...p } : fresh(); } catch { return fresh(); } }
export function persistMode(id, state, isEmpty) { try { if (isEmpty(state)) ls()?.removeItem(KEY(id)); else ls()?.setItem(KEY(id), JSON.stringify(state)); } catch { /* quota */ } }

// ── chat modes ────────────────────────────────────────────────────────────────────────────────────────────────────
export const freshChat = () => ({ messages: [], draft: "", savedId: null, savedCount: 0 });
export const chatEmpty = (s) => !s.messages.length && !s.draft.trim();
const lines = (msgs, me, them) => (msgs || []).map((m) => `${m.role === "user" ? me : them}: ${m.content}`).join("\n");

/** A chat saved to MA History: type = the mode, transcript = the dialog, no scores (the coach is not the scorer). */
export function chatSession(mode, state, { who = "", activity = "", conditions = "" } = {}) {
  const transcript = lines(state.messages, "Mark", "AI");
  return { id: state.savedId || uid(), date: today(), type: mode.id, context: mode.label, who, activity, conditions, videoUrl: "", videoSkier: "", videoTime: "",
    transcript, sections: {}, notes: "", summary: "", mentorFeedback: [] };   // no sections: the coach's words are not Mark's, and a chat is never scored
}

// ── Written MA ────────────────────────────────────────────────────────────────────────────────────────────────────
export const freshWritten = () => ({ phase: "setup", videoUrl: "", videoSkier: "", videoTime: "", who: "", activity: "", conditions: "", scenario: "", text: "", qa: [], drafts: { qa: "" }, attempts: [], savedId: null, savedHash: null });
export const writtenEmpty = (s) => s.phase === "setup" && !s.text.trim() && !s.scenario && !s.who && !s.activity && !s.videoUrl;
export function writtenSession(w, { bestAttempt } = {}) {
  const qaText = lines(w.qa, "Mark", "Examiner");
  const transcript = `${w.scenario ? `SCENARIO:\n${w.scenario}\n\n` : ""}WRITTEN ANALYSIS:\n${w.text}\n\nEXAMINER Q&A:\n${qaText}`;
  const real = (w.attempts || []).filter((a) => a?.scores);
  const best = bestAttempt ? bestAttempt(real) : real[real.length - 1];
  const summary = best ? fitSummary({ ...compactForSheet(best), allAttempts: real.map((a, i) => ({ attempt: i + 1, scores: a.scores, scorer: a.meta?.scorer || a.scorer || null })), bestAttempt: real.indexOf(best) + 1, totalAttempts: real.length, scoredAt: new Date().toISOString() }) : null;
  return { id: w.savedId || uid(), date: today(), type: "written", context: "Written MA", who: w.who, activity: w.activity, conditions: w.conditions,
    videoUrl: w.videoUrl || "", videoSkier: w.videoSkier || "", videoTime: w.videoTime || "", transcript,
    // Only Mark's words go in `sections` — the clerk inventories every section as his. The scenario is context, so it rides in `notes`.
    sections: { written_analysis: w.text, examiner_qa: qaText },
    notes: [w.videoUrl ? `Video: ${w.videoUrl}` : "", w.scenario ? `Scenario: ${w.scenario}` : ""].filter(Boolean).join("\n"), summary: summary ? JSON.stringify(summary) : "", mentorFeedback: [] };
}
/** What the scorer sees for a written MA: one written section (unprompted) and the Q&A (prompted). */
export const writtenScoringSession = (w) => ({ id: w.savedId || null, date: today(), type: "written", who: w.who, activity: w.activity, conditions: w.conditions, transcript: "", sections: { written_analysis: w.text, examiner_qa: lines(w.qa, "Mark", "Examiner") } });

// ── Examiner Sparring ─────────────────────────────────────────────────────────────────────────────────────────────
export const freshSparring = () => ({ phase: "setup", who: "", activity: "", conditions: "", presentation: "", probes: [], drafts: { probe: "" }, debrief: null, attempts: [], savedId: null, savedHash: null, chris: [] });
export const sparringEmpty = (s) => s.phase === "setup" && !s.presentation.trim() && !s.who && !s.activity;
export const probesOver = (msgs) => (msgs || []).some((m) => m.role === "assistant" && /^OK, thank you\.?$/i.test(String(m.content).trim()));
export function sparringSession(sp, { bestAttempt } = {}) {
  const qaText = lines(sp.probes, "Mark", "Examiner");
  const transcript = `PRESENTATION TO EXAMINER:\n${sp.presentation}\n\nEXAMINER Q&A:\n${qaText}${sp.debrief ? `\n\nDEBRIEF (AI):\nForm examiner: ${sp.debrief.form}\nChris's register: ${sp.debrief.chris}` : ""}`;
  const real = (sp.attempts || []).filter((a) => a?.scores);
  const best = bestAttempt ? bestAttempt(real) : real[real.length - 1];
  const summary = best ? fitSummary({ ...compactForSheet(best), allAttempts: real.map((a, i) => ({ attempt: i + 1, scores: a.scores, scorer: a.meta?.scorer || a.scorer || null })), bestAttempt: real.indexOf(best) + 1, totalAttempts: real.length, scoredAt: new Date().toISOString(), probe_lines: (sp.probes || []).filter((m) => m.line).map((m) => m.line) }) : null;
  return { id: sp.savedId || uid(), date: today(), type: "examiner_sparring", context: "Examiner Sparring", who: sp.who, activity: sp.activity, conditions: sp.conditions, videoUrl: "", videoSkier: "", videoTime: "",
    transcript, sections: { presentation: sp.presentation, examiner_qa: qaText },
    notes: sp.debrief ? `Debrief (AI) — Examiner A, the form: ${sp.debrief.form}\nExaminer B, Chris's register: ${sp.debrief.chris}` : "", summary: summary ? JSON.stringify(summary) : "", mentorFeedback: [] };
}
export const sparringScoringSession = (sp) => ({ id: sp.savedId || null, date: today(), type: "examiner_sparring", who: sp.who, activity: sp.activity, conditions: sp.conditions, transcript: "", sections: { presentation: sp.presentation, examiner_qa: lines(sp.probes, "Mark", "Examiner") } });
/** Transcript for the two debriefers — presentation and Q&A, nothing private. */
export const sparringTranscript = (sp) => `Subject: ${sp.who || "an instructor"} · Task: ${sp.activity || "unknown"} · Conditions: ${sp.conditions || "not stated"}\n\nPRESENTATION:\n${sp.presentation}\n\nEXAMINER Q&A:\n${lines(sp.probes, "Mark", "Examiner")}`;
/** Which form lines the examiner probed — from the hidden tags. */
export const probedLines = (probes) => [...new Set((probes || []).filter((m) => m.role === "assistant" && m.line).map((m) => m.line))];

// ── Line drills ───────────────────────────────────────────────────────────────────────────────────────────────────
export { DRILLS, DRILL_ORDER };
export const freshDrill = () => ({ line: null, task: null, scenario: "", peerIntent: "", passage: "", tries: [], followup: "", stage: "one", savedId: null, savedHash: null });
export const drillEmpty = (d) => !d.line && !d.passage.trim();
/** The drill's session for MA History: one line, scored on its own; `summary.drill` tells scorecard() the form. */
export function drillSession(d) {
  const last = [...(d.tries || [])].reverse().find((t) => t?.score != null);
  const def = DRILLS[d.line];
  const transcript = `LINE DRILL — ${def?.title || d.line}\n\nSCENARIO:\n${d.scenario}\n\nMARK:\n${d.passage}${d.followup ? `\n\nEXAMINER FOLLOW-UP:\n${d.followup}` : ""}`;
  const summary = last ? { drill: d.line, stage: d.line === "cause_effect" ? (d.stage || "one") : undefined, scores: { [d.line]: last.score }, score_rationale: { [d.line]: last.why || "" }, evidence_count: { [d.line]: last.evidence || "" }, gap_to_next: { [d.line]: last.gap || "" }, justifications: { [d.line]: last.justifications || {} }, citations: { [d.line]: last.citations || [] }, citation_details: last.citation_details || {}, unit: last.unit || null, tries: (d.tries || []).length, meta: { scorer: last.scorer || null, scored_at: last.at || null, drill: true } } : null;
  return { id: d.savedId || uid(), date: today(), type: "drill", context: `Line drill — ${def?.title || d.line}${d.line === "cause_effect" && d.stage && d.stage !== "one" ? ` (${d.stage})` : ""}`, who: "", activity: d.task?.name || "", conditions: "", videoUrl: "", videoSkier: "", videoTime: "",
    transcript, sections: { presentation: d.passage, ...(d.followup ? { examiner_qa: `Examiner: ${d.followup}` } : {}) }, notes: `Scenario: ${d.scenario}`, summary: summary ? JSON.stringify(summary) : "", mentorFeedback: [] };
}
/** Deal a task for a drill: AT-level tasks, deterministic from a seed so a reload keeps it. */
export function dealTask(tasks, seed) {
  const pool = (tasks || []).filter((t) => t.levels.includes("LEVEL III"));
  if (!pool.length) return null;
  let h = 2166136261; for (const ch of String(seed || "")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return pool[h % pool.length];
}
