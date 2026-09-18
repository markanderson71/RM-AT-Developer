// AT Exam state model + persistence. Pure; the component owns React state.
import { uid, today } from "./users.js";

export const PHASES = ["setup", "observe", "dialog", "prescribe", "present", "debrief", "scored"];
export const PHASE_LABEL = { setup: "Set up", observe: "Observe", dialog: "Peer dialog", prescribe: "Prescribe", present: "Examiner – Present", debrief: "Examiner – Q&A", scored: "Score" };

// 2026 AT MA/TU form (§5.3). Two sections, three lines each; pass = both section averages ≥ 4.
export const SECTIONS = [
  { key: "ma", label: "Movement Analysis", lines: [
    { key: "cause_effect", label: "Cause & Effect" }, { key: "evaluate", label: "Evaluate" }, { key: "prescription", label: "Prescription" }] },
  { key: "tu", label: "Technical Understanding", lines: [
    { key: "desired_performances", label: "Desired Performances" }, { key: "biomechanics", label: "Bio / Physics" }, { key: "equipment", label: "Equipment" }] },
];
export const CRITERIA = SECTIONS.flatMap((s) => s.lines);
/** Pre-2026 lines. Still scored as diagnostics; still required by the old app's hasFullScores. */
export const DIAGNOSTICS = [{ key: "describe", label: "Describe" }, { key: "communication", label: "Communication" }];
export const LEGACY_CRITERIA = ["describe", "cause_effect", "evaluate", "prescription", "biomechanics", "communication"];
export const MAX_REVISIONS = 3;

const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : 0);
/** Section averages for any attempt — computed here so legacy-scorer attempts and old rows render too. */
export function sectionAverages(a) {
  if (a?.section_averages) return a.section_averages;
  const avgOf = (sec) => mean(sec.lines.map((l) => Number(a?.scores?.[l.key])).filter((n) => n > 0));
  return { ma: avgOf(SECTIONS[0]), tu: avgOf(SECTIONS[1]) };
}
export const isLegacyAttempt = (a) => !!a?.scores && (a.scorer === "legacy" || a.scores.equipment == null);

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
    // Persistence protects work in progress. A scored exam that is already saved is finished: start clean.
    if (p.phase === "scored" && p.savedSessionId && p.savedHash) { window.localStorage.removeItem(STORAGE_KEY); return freshExam(); }
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

/** Rank for "best attempt": MA average + TU average (what the form passes on), not a sum of lines. */
export const attemptTotal = (a) => { if (!a?.scores) return 0; const v = sectionAverages(a); return Math.round((v.ma + v.tu) * 100) / 100; };

/** True when there is anything in the exam that a "New exam" click would destroy. */
/** Has Mark actually put anything into this exam? A blank form has nothing to start over from. */
export const hasContent = (exam) => !!(exam.observations?.trim() || exam.rootCause?.trim() || exam.presentation?.trim() || exam.dialogMessages?.length || exam.prescriptionDialog?.length || exam.debriefMessages?.length || exam.attempts?.length || Object.values(exam.drafts || {}).some((d) => d?.trim()));
export const hasUnsavedWork = (exam) => hasContent(exam) && !(exam.savedSessionId && exam.savedHash === examHash(exam));

/** The exam as the scorer sees it: sections only, no summary. Same shape buildSession saves. */
export function scoringSession(exam) {
  const s = buildSession({ ...exam, attempts: [] }, { parseAIJson: () => null });
  return { id: exam.savedSessionId || null, date: s.date, type: s.type, who: s.who, activity: s.activity, conditions: s.conditions, transcript: s.transcript, sections: s.sections };
}

/** Keep the Sheet cell under its 50K limit: drop debug + the retrieval manifest, shorten cited text; shed more only if needed. */
export function compactForSheet(a) {
  const { debug, raw, timestamp, attemptNum, ...r } = a || {};
  if (r.meta?.context) r.meta = { ...r.meta, context: { ...r.meta.context, chunks: undefined } };
  if (r.citation_details) r.citation_details = Object.fromEntries(Object.entries(r.citation_details).map(([k, v]) => [k, { ...v, text: v.text?.length > 400 ? `${v.text.slice(0, 400)}…` : v.text }]));
  return r;
}
/** Best = highest MA+TU among new-scorer attempts. An old-scorer fallback runs high and is on a different form, so it only wins if it's all there is. */
export const bestAttempt = (attempts) => {
  const scored = attempts.filter((a) => a?.scores);
  const pool = scored.some((a) => !isLegacyAttempt(a)) ? scored.filter((a) => !isLegacyAttempt(a)) : scored;
  return pool.reduce((b, a) => (attemptTotal(a) > attemptTotal(b) ? a : b), pool[0] || attempts[0] || null);
};

/** Session object in the exact shape the old app saved (transcript + sections + summary with allAttempts). */
export function buildSession(exam, { parseAIJson }) {
  const cleaned = exam.attempts.map((a) => { if (a.scores) return a; if (a.raw) { const r = parseAIJson(a.raw); if (r?.scores) return { ...a, ...r }; } return a; });
  const best = bestAttempt(cleaned);
  const dialogText = lines(exam.dialogMessages, "Mark", "Peer");
  const prescribeText = lines(exam.prescriptionDialog, "Mark", "Peer");
  const debriefText = lines(exam.debriefMessages, "Mark", "Examiner");
  const transcript = `PRIVATE NOTES:\n${exam.observations}\nRoot cause: ${exam.rootCause}\n\nPEER DIALOG:\n${dialogText}\n\nPRESCRIPTION DELIVERY (to peer):\n${prescribeText}\n\nPRESENTATION TO EXAMINER:\n${exam.presentation}\n\nEXAMINER Q&A:\n${debriefText}`;
  let summary = {
    ...(best ? compactForSheet(best) : {}),
    allAttempts: cleaned.map((a, i) => ({ attempt: i + 1, scores: a.scores || null, section_averages: a.scores ? sectionAverages(a) : null, scorer: a.scorer || a.meta?.scorer || null, did_well: a.did_well || a.strengths || [], opportunity: a.opportunity || a.gaps || [], key_learning: a.key_learning || "" })),
    bestAttempt: cleaned.indexOf(best) + 1, totalAttempts: cleaned.length, scoredAt: new Date().toISOString(),
  };
  for (const shed of ["extraction", "justifications", "citation_details"]) { if (JSON.stringify(summary).length < 45000) break; const { [shed]: _drop, ...rest } = summary; summary = { ...rest, shed: [...(summary.shed || []), shed] }; }
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

/** What "saved" means for an exam: same transcript, sections and attempts as the last successful save. */
export function examHash(exam) { const s = buildSession(exam, { parseAIJson: () => null }); return hashOf({ t: s.transcript, s: s.sections, a: exam.attempts }); }

/** Cheap stable hash for hash-diff-before-save. */
export function hashOf(obj) {
  const s = JSON.stringify(obj); let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return String(h);
}

export const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/;
