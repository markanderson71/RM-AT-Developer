// Progress tab (§13 row 8) — pure helpers, no React, no I/O. Every number here comes from scorecard() (§15 "one
// scorecard"); nothing reads summary.scores. A mentor's view is built from scorecard(session, { viewer }), so a session
// he has not scored contributes NO AI output (no lines, no gap_to_next, no rationale) — sealing is inherited, not re-done.
import { scorecard, LINES } from "./scorecard.js";
import { parseGap } from "../../lib/coaching.js";
import { mentorCites } from "./cites.js";

// ── Development Assessment (Config._MENTOR_ASSESSMENTS, one JSON blob keyed by mentor) ───────────────────────────────
// The three original fields, plus the fourth Mark asked for in session 8: where the mentor wants him challenged or pushed.
export const ASSESSMENT_FIELDS = [
  { key: "whatsWorking", label: "What's working", color: "#28a858", placeholder: "What is Mark doing well? What's consistent? What should he keep doing?" },
  { key: "consistentGaps", label: "Consistent gaps", color: "#e07830", placeholder: "What patterns keep showing up? Where does he repeatedly fall short of AT level?" },
  { key: "progress", label: "Progress I've noticed", color: "#3088cc", placeholder: "How has Mark's thinking evolved? What's improved since we started working together?" },
  { key: "challenge", label: "Where to challenge or push", color: "#c060a0", placeholder: "Where should he be pushed next? The question you'd keep asking him; the thing he stops short of; the standard you want him held to before the next exam." },
];
export const hasAssessment = (a) => !!a && ASSESSMENT_FIELDS.some((f) => String(a[f.key] || "").trim());

export function parseAssessments(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { const v = JSON.parse(raw); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; }
}

/**
 * One mentor's fields into the LIVE blob. The old app wrote the whole blob from memory on every keystroke, so two mentors
 * editing the same afternoon overwrote each other; here the caller re-reads Config first and merges only `mentorKey`.
 * Fields not in ASSESSMENT_FIELDS (e.g. lastUpdated) are kept from the live copy; empty strings are stored as empty.
 */
export function mergeAssessment(liveRaw, mentorKey, fields, day) {
  const all = parseAssessments(liveRaw);
  const mine = { ...(all[mentorKey] || {}) };
  for (const f of ASSESSMENT_FIELDS) if (fields[f.key] !== undefined) mine[f.key] = String(fields[f.key] || "");
  mine.lastUpdated = day;
  return { ...all, [mentorKey]: mine };
}
export const assessmentHash = (a) => JSON.stringify(ASSESSMENT_FIELDS.map((f) => String(a?.[f.key] || "")));

// ── Trends: the six 2026 lines per session, oldest → newest ──────────────────────────────────────────────────────────
const byDateAsc = (a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.id).localeCompare(String(b.id));

/**
 * @returns { rows: 2026-form sessions [{ id, date, label, lines{key:score}, sections, meets, scorer, mentor{key:{scores,…}} }],
 *            legacy: old-scorer sessions (labelled, separate — never in `rows`), sealed: sessions withheld from this viewer,
 *            unscored: count }
 */
export function trendRows(sessions, viewer) {
  const rows = [], legacy = [];
  let sealed = 0, unscored = 0;
  for (const s of [...(sessions || [])].sort(byDateAsc)) {
    const c = scorecard(s, { viewer });
    const label = `${s.activity || s.type || "MA"}${s.who ? ` — ${s.who}` : ""}`;
    if (c.sealed) { if (c.hasAi) sealed++; else unscored++; continue; }   // sealed but nothing behind the seal = unscored
    if (c.status !== "scored") { unscored++; continue; }
    const base = { id: s.id, date: s.date || "", label, scorer: c.scorer, lines: Object.fromEntries(c.lines.map((l) => [l.key, l.score])), mentors: c.mentors || {} };
    if (c.form === "legacy") legacy.push(base);
    else rows.push({ ...base, sections: c.sections, meets: c.meets });
  }
  return { rows, legacy, sealed, unscored };
}

/** Per line: the AI series and, where a mentor scored, his series. Missing stays null (never 0). */
export function lineSeries(rows, mentorKey = "chris") {
  return LINES.map((l) => ({
    ...l,
    ai: rows.map((r) => r.lines[l.key] ?? null),
    mentor: rows.map((r) => r.mentors?.[mentorKey]?.scores?.[l.key] ?? null),
  }));
}

// ── Recurring coaching gaps (§13 row 8, added 2026-09-19) ───────────────────────────────────────────────────────────
const STOP = new Set("a an the of to in on at and or but that this it is was were be been being as with for from by not no so than then had has have he she they his her their you your i my me we our its which who what when where how say said instead because what your you're cannot could would should makes means rather every time also into that this there these those about more most much just only".split(" "));
const toks = (s) => new Set((String(s || "").toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !STOP.has(w)));
const overlap = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };

/**
 * Every gap_to_next the evaluator wrote, grouped by line, newest first. A line RECURS when it has a gap in two or more
 * sessions; `theme` names the words the because-clauses keep sharing, so Mark can see whether it is the same gap
 * coming back or a new one each time. Sealed sessions contribute nothing (scorecard() gave no detail).
 */
export function gapHistory(sessions, viewer) {
  const perLine = Object.fromEntries(LINES.map((l) => [l.key, []]));
  let sealed = 0;
  for (const s of [...(sessions || [])].sort(byDateAsc).reverse()) {
    const c = scorecard(s, { viewer });
    if (c.sealed) { if (c.hasAi) sealed++; continue; }
    if (c.status !== "scored" || c.form !== "2026") continue;
    const d = c.detail;
    for (const l of c.lines) {
      const gap = parseGap(d.gap_to_next?.[l.key]); if (!gap) continue;
      const mentor = c.mentors?.chris?.scores?.[l.key] ?? null;
      perLine[l.key].push({ sessionId: s.id, date: s.date || "", label: `${s.activity || s.type || "MA"}${s.who ? ` — ${s.who}` : ""}`, score: l.score, mentor, gap, cite: mentorCites(d, l.key)[0] || null });
    }
  }
  const lines = LINES.map((l) => {
    const items = perLine[l.key];
    const bags = items.map((it) => toks(`${it.gap.because || ""} ${it.gap.say || ""}`));
    const counts = new Map();
    bags.forEach((b, i) => bags.slice(i + 1).forEach((o) => { for (const w of b) if (o.has(w)) counts.set(w, (counts.get(w) || 0) + 1); }));
    const theme = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([w]) => w);
    const same = items.length > 1 && bags.slice(1).every((b) => overlap(b, bags[0]) >= 3);
    const scored = items.filter((it) => it.score != null);
    return { ...l, items, recurs: items.length >= 2, theme, same, avg: scored.length ? Math.round((scored.reduce((n, it) => n + it.score, 0) / scored.length) * 10) / 10 : null };
  });
  // lowest average first, then most recurring; a line with nothing is last
  lines.sort((a, b) => (a.items.length ? 0 : 1) - (b.items.length ? 0 : 1) || (a.avg ?? 9) - (b.avg ?? 9) || b.items.length - a.items.length);
  return { lines, sealed, sessions: new Set(lines.flatMap((l) => l.items.map((i) => i.sessionId))).size };
}

// ── Agreement panel (§12.4) — view model over /api/agreement's response ─────────────────────────────────────────────
export const pctColor = (v, target) => (v == null ? "#4d6888" : v >= target ? "#28a858" : v >= target - 15 ? "#e8a050" : "#e05028");
export function agreementView(data) {
  if (!data) return null;
  const t = data.targets || { exact_pct: 60, within_one_pct: 85 };
  const per = LINES.map((l) => {
    const b = data.blind?.per_criterion?.[l.key] || {}; const a = data.all?.per_criterion?.[l.key] || {};
    return { ...l, blind: b, all: a, lean: b.n ? (b.mean_delta > 0.3 ? "AI high" : b.mean_delta < -0.3 ? "AI low" : "even") : null };
  });
  const sessions = (data.sessions || []).slice().reverse();   // newest first for the list
  return { targets: t, blind: data.blind || {}, notBlind: data.not_blind || {}, all: data.all || {}, per, trend: data.trend || [], byScorer: data.by_scorer || {}, sessions, excluded: data.excluded || [], window: data.window };
}

// ── Zoom approval (§12.3) ───────────────────────────────────────────────────────────────────────────────────────────
/** Approve these first (§17): the two Evaluate statements from the 9/18 call. One-off, by timestamp; remove once approved. */
export const PRIORITY = { "zoom:2026-09-18": ["00:42:23", "00:49:35"] };
export const isPriority = (p) => (PRIORITY[p.source_ref] || []).some((t) => String(p.timestamp || "").startsWith(t));
export const secOf = (t) => { const m = String(t || "").match(/(\d+):(\d+)(?::(\d+))?/); return m ? (m[3] != null ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2])) : 0; };

/** Group by call, call order inside; priority items float to the top of their call. */
export function groupPending(pending) {
  const groups = new Map();
  for (const p of pending || []) { if (!groups.has(p.source_ref)) groups.set(p.source_ref, []); groups.get(p.source_ref).push(p); }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([ref, items]) => ({
    ref, title: items[0]?.call_title || ref, date: items[0]?.date || null,
    items: items.slice().sort((a, b) => (isPriority(b) ? 1 : 0) - (isPriority(a) ? 1 : 0) || secOf(a.timestamp) - secOf(b.timestamp)),
  }));
}
/** What Chris does with the batch — the §17 "extraction quality" numbers, kept per browser. */
export function tallyDecisions(log) {
  const out = {};
  for (const d of log || []) { const t = (out[d.type] ||= { approved: 0, edited: 0, deleted: 0 }); if (d.action === "approve") t.approved++; else if (d.action === "delete") t.deleted++; if (d.edited) t.edited++; }
  return out;
}

// ── mentor access code (session 8 auth) ─────────────────────────────────────────────────────────────────────────────
const TOKEN_KEY = "rmat_token";
const ls = () => (typeof window !== "undefined" ? window.localStorage : null);
export const getToken = () => { try { return ls()?.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
export const setToken = (t) => { try { t ? ls()?.setItem(TOKEN_KEY, t) : ls()?.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

// ── AI analysis (mentor) — what the prompt is allowed to see ────────────────────────────────────────────────────────
/**
 * Context for "Suggest an assessment": the mentor's OWN scorecards with the AI's beside them (only on sessions he has
 * scored — a sealed session gives date, task and what Mark said, never a number), the evaluator's gap lines on those
 * sessions (labelled AI), journal reflections with depth reads and comments, and his current assessment.
 */
export function assessmentContext({ sessions, entries, viewer, assessment, users = {}, maxSessions = 8, maxEntries = 8 }) {
  const ma = [...(sessions || [])].sort(byDateAsc).reverse().slice(0, maxSessions).map((s) => {
    const c = scorecard(s, { viewer });
    const head = `[${s.date || "undated"} · ${s.activity || s.type || "MA"}${s.who ? ` · analyzing ${s.who}` : ""}]`;
    const said = String(s.sections?.presentation || s.sections?.written_analysis || s.transcript || "").trim().slice(0, 700);
    const lines = [head, said ? `Mark's analysis (excerpt): ${said}` : null];
    if (c.sealed) lines.push("(You have not scored this one yet — no scores shown.)");
    else if (c.status === "scored" && c.form === "2026") {
      const mine = c.mine;
      lines.push(`Your scores: ${mine ? LINES.map((l) => `${l.short} ${mine.scores[l.key] ?? "—"}`).join(" · ") : "(none)"}${mine?.note ? ` — your note: ${mine.note}` : ""}`);
      lines.push(`AI scores (${c.scorer}): ${c.lines.map((l) => `${l.short} ${l.score ?? "—"}`).join(" · ")}`);
      const gaps = c.lines.map((l) => { const g = parseGap(c.detail.gap_to_next?.[l.key]); return g?.say ? `${l.label}: ${g.say}${g.because ? ` (because ${g.because})` : ""}` : null; }).filter(Boolean);
      if (gaps.length) lines.push(`AI-suggested next moves (suggestions, not yours): ${gaps.join(" | ")}`);
    } else if (c.status === "scored") lines.push("(Old-scorer result — not on the 2026 form; numbers omitted.)");
    const comments = (s.mentorFeedback || []).filter((f) => f.text && !/scorecard/i.test(f.text)).slice(-3).map((f) => `${users[f.userId]?.name || f.userId}: ${String(f.text).slice(0, 220)}`);
    if (comments.length) lines.push(`Comments: ${comments.join(" / ")}`);
    return lines.filter(Boolean).join("\n");
  });
  const depthLabel = { surface: "Surface", connecting: "Connecting", integrated: "Integrated" };
  const journal = [...(entries || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, maxEntries).map((e) => {
    const lines = [`[${e.date || "undated"} · ${e.context || e.entryType || "entry"}]`];
    for (const [k, lab] of [["whatISaw", "Saw"], ["whatWasGoingOn", "Underneath"], ["whatIDid", "Did"], ["whatIdDoDifferently", "Would change"]]) if (e[k]) lines.push(`${lab}: ${String(e[k]).slice(0, 240)}`);
    const pulse = Object.entries(e.mentorPulse || {}).filter(([, v]) => v).map(([k, v]) => `${users[k]?.name || k}: ${depthLabel[v] || v}`);
    if (pulse.length) lines.push(`Depth reads: ${pulse.join(", ")}`);
    (e.mentorComments || []).slice(-2).forEach((c) => lines.push(`  ${users[c.userId]?.name || c.userId}: ${String(c.text || "").slice(0, 160)}`));
    return lines.join("\n");
  });
  const current = hasAssessment(assessment) ? ASSESSMENT_FIELDS.map((f) => `${f.label}: ${String(assessment[f.key] || "").trim() || "(empty)"}`).join("\n") : "";
  return { ma, journal, current };
}
