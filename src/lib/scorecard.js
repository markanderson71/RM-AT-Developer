// ONE SCORECARD. Every number the app shows for an MA session comes from scorecard(session) — nothing else reads
// `summary.scores`. (Session 5, Mark: "scores have not been consistent across the application.")
//
// The old app derived "the score" in eight places, each its own way: best attempt by sum-of-six on the exam screen,
// top-level scores in MA History, non-zero keys only in Progress, legacy keys by name in the prompts, and three
// different behaviours when the JSON didn't parse. The rules below are the only rules:
//
//   1. The canonical score is the summary's top-level `scores` — the best attempt, as chosen at save time.
//   2. Two forms, never mixed. A result is `2026` (six form lines, section averages, Meets / Does Not Meet) or
//      `legacy` (the pre-2026 six from the old scorer, known to run 1–2 high against Chris). Legacy numbers are shown
//      on their own lines, labelled, and are never averaged, trended, or compared with 2026 numbers. No conversion.
//   3. Missing is missing. A line with no score is null and renders "—". It is never 0 and never silently dropped:
//      a section with a missing line has no average, and a result with no average has no Meets / Does Not Meet.
//   4. One arithmetic. Section average = mean of its three lines, 2 dp; pass = both ≥ 4. Same as lib/score.js.
//      Stored averages are ignored and recomputed (a mismatch is reported in `warnings`).
//   5. Blind scoring lives here too (§9). For a mentor who has not submitted a score on a session, scorecard()
//      returns `sealed: true` and NO AI numbers, rationale, or coaching. Components cannot leak what they are not given.
import { SCORED, SCORED_CRITERIA, LEGACY_CRITERIA as DIAG_KEYS, PASS } from "../../lib/vocab.js";
import { parseSummary } from "../../lib/parseSummary.js";
import { USERS } from "./users.js";

export const SECTIONS = [
  { key: "ma", label: "Movement Analysis", lines: [
    { key: "cause_effect", label: "Cause & Effect", short: "CE" }, { key: "evaluate", label: "Evaluate", short: "Ev" }, { key: "prescription", label: "Prescription", short: "Rx" }] },
  { key: "tu", label: "Technical Understanding", lines: [
    { key: "desired_performances", label: "Desired Performances", short: "DP" }, { key: "biomechanics", label: "Bio / Physics", short: "Bio" }, { key: "equipment", label: "Equipment", short: "Eq" }] },
];
export const LINES = SECTIONS.flatMap((s) => s.lines.map((l) => ({ ...l, section: s.key })));
export const LINE_LABEL = Object.fromEntries(LINES.map((l) => [l.key, l.label]));
export const DIAGNOSTICS = [{ key: "describe", label: "Describe" }, { key: "communication", label: "Communication" }];
export const LEGACY_LINES = [
  { key: "describe", label: "Describe", short: "D" }, { key: "cause_effect", label: "Cause/Effect", short: "C" }, { key: "evaluate", label: "Evaluate", short: "E" },
  { key: "prescription", label: "Prescription", short: "P" }, { key: "biomechanics", label: "Bio/Physics", short: "B" }, { key: "communication", label: "Comm", short: "Co" },
];

/** A score is an integer 1–6 or it is null. 0, "", NaN, "4.5abc" → null. */
export const cleanScore = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 1 && n <= 6 ? Math.round(n) : null; };
const round2 = (n) => Math.round(n * 100) / 100;

/** Section averages + pass for a { line: score } map on the 2026 form. Null wherever a line is missing. */
export function formMath(scores) {
  const avg = (keys) => { const xs = keys.map((k) => cleanScore(scores?.[k])); return xs.every((x) => x != null) ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null; };
  const ma = avg(SCORED.ma), tu = avg(SCORED.tu);
  return { sections: { ma, tu }, meets: ma != null && tu != null ? ma >= PASS && tu >= PASS : null };
}

/** Which form a result is on. `equipment` present = 2026 evaluator; scorer:"legacy" always wins. */
export const formOf = (r) => (!r?.scores ? null : (r.scorer === "legacy" || r.meta?.scorer === "legacy" || r.scores.equipment == null) ? "legacy" : "2026");
export const isLegacyAttempt = (a) => formOf(a) === "legacy";

/** Any scorer result (a live attempt, or a parsed summary) → the card. No viewer logic here. */
export function resultCard(r) {
  const form = formOf(r);
  if (!form) return { status: r ? "unparsed" : "unscored", form: null, lines: [], sections: null, meets: null, diagnostics: [], scorer: null, detail: r || null, warnings: [] };
  const warnings = [];
  const defs = form === "2026" ? LINES : LEGACY_LINES;
  const lines = defs.map((l) => ({ ...l, score: cleanScore(r.scores[l.key]) }));
  lines.filter((l) => l.score == null).forEach((l) => warnings.push(`${l.label}: no score`));
  const math = form === "2026" ? formMath(r.scores) : { sections: null, meets: null };
  if (form === "2026" && r.section_averages && math.sections.ma != null && (Math.abs(r.section_averages.ma - math.sections.ma) > 0.011 || Math.abs(r.section_averages.tu - math.sections.tu) > 0.011)) warnings.push(`stored averages (${r.section_averages.ma}/${r.section_averages.tu}) differ from the lines (${math.sections.ma}/${math.sections.tu}) — showing the lines`);
  if (form === "2026" && typeof r.meets_standards === "boolean" && math.meets != null && r.meets_standards !== math.meets) warnings.push("stored Meets/Does Not Meet differs from the lines — showing the lines");
  return {
    status: "scored", form, lines, ...math,
    diagnostics: form === "2026" ? DIAGNOSTICS.map((d) => ({ ...d, score: cleanScore(r.scores[d.key]) })) : [],
    scorer: form === "legacy" ? "legacy" : (r.meta?.scorer || r.scorer || "rag"),
    scoredAt: r.meta?.scored_at || r.scoredAt || r.timestamp || null,
    detail: r, warnings,
  };
}

/** Rank for "best attempt": MA avg + TU avg — what the form passes on. Incomplete or legacy results rank below any complete 2026 result. */
export function attemptRank(a) {
  const c = resultCard(a);
  if (c.status !== "scored") return -2;
  if (c.form === "legacy") return -1 + c.lines.reduce((n, l) => n + (l.score || 0), 0) / 100;   // legacy only ever competes with legacy
  return c.sections.ma != null && c.sections.tu != null ? round2(c.sections.ma + c.sections.tu) : -1.5;
}
export const bestAttempt = (attempts) => (attempts || []).filter((a) => a?.scores).reduce((b, a) => (b == null || attemptRank(a) > attemptRank(b) ? a : b), null) || attempts?.[0] || null;

// ── mentor scores ────────────────────────────────────────────────────────────
const KEY_RE = new RegExp(`\\b(${[...SCORED_CRITERIA, "needs_safety", "behavior_management"].join("|")})\\s*[:=]?\\s*([1-6])\\b`, "gi");

/** The one text format for a mentor scorecard in the comment thread — what Mark posted by hand for 7n6ry6d, and what the blind form writes. */
export function formatScoreLine({ who, date, scores, blind, note }) {
  const f = (keys) => keys.map((k) => `${k} ${scores[k]}`).join(", ");
  const m = formMath(scores);
  return `${who} scorecard ${date} (2026 form${blind ? ", scored blind" : ""}): MA: ${f(SCORED.ma)} (avg ${m.sections.ma}) | TU: ${f(SCORED.tu)} (avg ${m.sections.tu}) | Overall: ${m.meets ? "Meets Standards" : "Does Not Meet Standards"}${note ? ` | Note: ${note}` : ""}`;
}
export function parseScoreLine(text) {
  if (!/scorecard/i.test(text || "")) return null;
  const scores = {}; let m; KEY_RE.lastIndex = 0;
  while ((m = KEY_RE.exec(text))) scores[m[1].toLowerCase()] = Number(m[2]);
  return SCORED_CRITERIA.every((k) => scores[k] != null) ? scores : null;
}

/** Every mentor scorecard on a session, newest per mentor. Structured items (blind form) and hand-posted lines both count. */
export function mentorScores(session) {
  const out = {};
  for (const f of session?.mentorFeedback || []) {
    let who = f.userId, scores = null, blind = false;
    if (f.kind === "blind_score" && f.scores) { scores = f.scores; blind = f.blind !== false; }
    else {
      scores = parseScoreLine(f.text);
      blind = !!scores && /scored blind/i.test(f.text);              // a verbal scorecard posted on his behalf can still be a blind one (7uk7lnh, 9/18 call)
      const named = scores && String(f.text).match(/^\s*(\w+)\s+scorecard/i)?.[1]?.toLowerCase();
      if (named && USERS[named]) who = named;                       // "Chris scorecard … posted by Mark" belongs to Chris
    }
    if (!scores || !USERS[who] || USERS[who].role !== "mentor") continue;
    const clean = Object.fromEntries(SCORED_CRITERIA.map((k) => [k, cleanScore(scores[k])]));
    out[who] = { who, scores: clean, ...formMath(clean), blind, note: f.note || "", timestamp: f.timestamp || null, postedBy: f.userId, aiAtSubmit: f.ai_at_submit || null };
  }
  return out;
}

/** Per-line AI − mentor. Only on the 2026 form, only where both have the line. */
export function deltas(card, mentor) {
  if (!mentor || card?.form !== "2026") return null;
  const per = card.lines.map((l) => ({ key: l.key, label: l.label, ai: l.score, mentor: mentor.scores[l.key], d: l.score != null && mentor.scores[l.key] != null ? l.score - mentor.scores[l.key] : null }));
  const ok = per.filter((p) => p.d != null);
  return { per, n: ok.length, exact: ok.filter((p) => p.d === 0).length, withinOne: ok.filter((p) => Math.abs(p.d) <= 1).length, sameResult: card.meets != null && mentor.meets != null ? card.meets === mentor.meets : null };
}

// ── blind vault ──────────────────────────────────────────────────────────────
// For a mentor who hasn't scored a session, the AI summary is taken OUT of the session object before it reaches React
// state and parked here, so no component, prop, or devtools panel holds it. It goes back on submit. (It is still in
// the browser's network response — this guards against anchoring, not against someone determined to look.)
const vault = new Map();
export function sealSessions(sessions, viewer) {
  if (viewer?.role !== "mentor") return sessions;
  return sessions.map((s) => {
    if (mentorScores(s)[viewer.key] || !s.summary) return s;
    vault.set(s.id, s.summary);
    return { ...s, summary: "", summarySealed: true };
  });
}
export const unseal = (s) => (s.summarySealed ? { ...s, summary: vault.get(s.id) || "", summarySealed: false } : s);
/** What the AI had scored at the moment a mentor submits — stored with his scorecard so agreement (§9) compares against the score he was blind to, even after a rescore. Never rendered. */
export function aiSnapshot(session) {
  const c = aiCard(unseal(session));
  return c.status === "scored" ? { form: c.form, scores: Object.fromEntries(c.lines.map((l) => [l.key, l.score])), scorer: c.scorer, scored_at: c.scoredAt } : null;
}

// ── the one entry point ──────────────────────────────────────────────────────
const cache = new WeakMap();
function aiCard(session) {
  if (cache.has(session)) return cache.get(session);
  const parsed = session?.summary ? parseSummary(session.summary) : null;
  const c = resultCard(parsed);
  if (parsed?.allAttempts?.length) {
    c.attempts = { total: parsed.totalAttempts || parsed.allAttempts.length, best: parsed.bestAttempt || null };
    const saved = parsed.allAttempts[(parsed.bestAttempt || 1) - 1]?.scores;
    if (saved && c.status === "scored" && c.lines.some((l) => cleanScore(saved[l.key]) !== l.score)) c.warnings.push("top-level scores differ from the attempt marked best");
  }
  if (session?.summary && c.status !== "scored") c.status = "unparsed";
  cache.set(session, c);
  return c;
}

/**
 * @param session  normalized MA session (src/api.js)
 * @param viewer   { key, role } — omit only in code that never renders to a mentor (e.g. the candidate's exam tab)
 */
export function scorecard(session, { viewer = null } = {}) {
  const mentors = mentorScores(session);
  const isMentor = viewer?.role === "mentor";
  const mine = isMentor ? mentors[viewer.key] || null : null;
  if (isMentor && !mine) {
    // Blind (§9). Not even "has the AI scored this" detail beyond a flag; and other mentors' scorecards stay hidden
    // too, so inter-rater comparison later means something.
    return { id: session.id, sealed: true, status: "sealed", form: null, lines: [], sections: null, meets: null, diagnostics: [], scorer: null, detail: null, warnings: [], mentors: {}, mine: null, delta: null, hasAi: vault.has(session.id) || aiCard(session).status === "scored" };
  }
  const c = aiCard(session);
  const visibleMentors = isMentor ? { [viewer.key]: mine } : mentors;
  return { id: session.id, sealed: false, ...c, mentors: visibleMentors, mine, delta: deltas(c, isMentor ? mine : mentors.chris || Object.values(mentors)[0]) };
}

/** Comment thread as this viewer may see it: while sealed, other people's scorecards are withheld. */
export function visibleFeedback(session, { viewer } = {}) {
  const sealed = viewer?.role === "mentor" && !mentorScores(session)[viewer.key];
  return (session?.mentorFeedback || []).filter((f) => !(sealed && (f.kind === "blind_score" || parseScoreLine(f.text))));
}
