// AT Exam state model + persistence. Pure; the component owns React state.
import { uid, today } from "./users.js";

export const PHASES = ["setup", "observe", "dialog", "prescribe", "present", "debrief", "scored"];
export const PHASE_LABEL = { setup: "Set up", observe: "Observe", dialog: "Peer dialog", prescribe: "Prescribe", present: "Present", debrief: "Examiner Q&A", scored: "Score" };

export const CRITERIA = [
  { key: "describe", label: "Describe", short: "D" }, { key: "cause_effect", label: "Cause/Effect", short: "C" },
  { key: "evaluate", label: "Evaluate", short: "E" }, { key: "prescription", label: "Prescription", short: "P" },
  { key: "biomechanics", label: "Bio/Physics", short: "B" }, { key: "communication", label: "Communication", short: "Co" },
];

export const STORAGE_KEY = "rmat_exam_v1";

export function freshExam() {
  return {
    phase: "setup", videoUrl: "", videoSkier: "", videoTime: "", who: "", activity: "", conditions: "",
    observations: "", rootCause: "",
    dialogMessages: [], prescriptionDialog: [], presentation: "", debriefMessages: [],
    drafts: { dialog: "", prescribe: "", debrief: "" },   // composer text survives re-render and reload
    attempts: [], attemptNumber: 1, result: null,
    savedSessionId: null, savedHash: null,
  };
}

export function loadExam() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshExam();
    const p = JSON.parse(raw);
    if (!p || !PHASES.includes(p.phase)) return freshExam();
    return { ...freshExam(), ...p, drafts: { ...freshExam().drafts, ...(p.drafts || {}) } };
  } catch { return freshExam(); }
}

export function persistExam(exam) {
  try {
    if (exam.phase === "setup" && !exam.who && !exam.activity && !exam.videoUrl) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(exam));
  } catch { /* quota / private mode — in-memory state still works */ }
}

const lines = (msgs, me, them) => (msgs || []).map((m) => `${m.role === "user" ? me : them}: ${m.content}`).join("\n");

export const attemptTotal = (a) => (a?.scores ? CRITERIA.reduce((s, c) => s + (Number(a.scores[c.key]) || 0), 0) : 0);
export const bestAttempt = (attempts) => attempts.reduce((b, a) => (attemptTotal(a) > attemptTotal(b) ? a : b), attempts[0] || null);

/** Session object in the exact shape the old app saved (transcript + sections + summary with allAttempts). */
export function buildSession(exam, { parseAIJson }) {
  const cleaned = exam.attempts.map((a) => { if (a.scores) return a; if (a.raw) { const r = parseAIJson(a.raw); if (r?.scores) return { ...a, ...r }; } return a; });
  const best = bestAttempt(cleaned);
  const dialogText = lines(exam.dialogMessages, "Mark", "Peer");
  const prescribeText = lines(exam.prescriptionDialog, "Mark", "Peer");
  const debriefText = lines(exam.debriefMessages, "Mark", "Examiner");
  const transcript = `PRIVATE NOTES:\n${exam.observations}\nRoot cause: ${exam.rootCause}\n\nPEER DIALOG:\n${dialogText}\n\nPRESCRIPTION DELIVERY (to peer):\n${prescribeText}\n\nPRESENTATION TO EXAMINER:\n${exam.presentation}\n\nEXAMINER Q&A:\n${debriefText}`;
  const strip = (a) => { const { raw, timestamp, attemptNum, ...rest } = a || {}; return rest; };
  const summary = {
    ...(best ? strip(best) : {}),
    allAttempts: cleaned.map((a, i) => ({ attempt: i + 1, scores: a.scores || null, did_well: a.did_well || a.strengths || [], opportunity: a.opportunity || a.gaps || [], key_learning: a.key_learning || "" })),
    bestAttempt: cleaned.indexOf(best) + 1, totalAttempts: cleaned.length, scoredAt: new Date().toISOString(),
  };
  const rev = exam.attempts.length - 1;
  return {
    id: exam.savedSessionId || uid(), date: today(), type: "at_exam",
    context: `AT MA Exam${rev > 0 ? ` (${rev} revision${rev > 1 ? "s" : ""})` : ""}`,
    who: exam.who, activity: exam.activity, conditions: exam.conditions,
    videoUrl: exam.videoUrl || "", videoSkier: exam.videoSkier || "", videoTime: exam.videoTime || "",
    transcript,
    sections: { private_notes: exam.observations || "", root_cause: exam.rootCause || "", peer_dialog: dialogText, prescription_delivery: prescribeText, presentation: exam.presentation || "", examiner_qa: debriefText },
    notes: exam.videoUrl ? `Video: ${exam.videoUrl}${exam.videoSkier ? ` | Skier: ${exam.videoSkier}` : ""}${exam.videoTime ? ` | Time: ${exam.videoTime}` : ""}` : "",
    summary: JSON.stringify(summary), mentorFeedback: [],
  };
}

/** Cheap stable hash for hash-diff-before-save. */
export function hashOf(obj) {
  const s = JSON.stringify(obj); let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return String(h);
}

export const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/;
