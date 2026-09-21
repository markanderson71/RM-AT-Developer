// Fetch wrappers for /api/*. Harvested from ATDevelopmentJournal.jsx: response-shape guards on getAll
// ({rows}|{data}|array, wrapped in {response}), update-then-create upsert, never throws to the UI.
import { normalizeJournalRow, hasTypeColumn, byEntryDesc, contentRow, createRow, applyPulse, mergeComment } from "./lib/journal.js";

// The Apps Script endpoint fails transiently: the 302 drops the POST and the proxy hands back a Google HTML page
// (seen as 404 / non-JSON), or the script replies "Unknown action: ". Both clear on the next try. Reads AND writes
// retry these; a real answer ("Row not found…") is never retried. Without the write retry, a transient failure on
// update fell through to create and could duplicate the row.
const TRANSIENT = /Unknown action|non-JSON|<!DOCTYPE|<html|HTTP 5\d\d|HTTP 404|Failed to fetch|NetworkError|timeout/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sheetPostOnce(payload) {
  try {
    const res = await fetch("/api/sheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: `non-JSON response: ${text.slice(0, 200)}` }; }
    if (data && typeof data.response === "string") { try { data = JSON.parse(data.response); } catch { /* keep */ } }
    if (!res.ok && !data?.error) data = { ...(data || {}), error: `HTTP ${res.status}` };
    return { ok: res.ok && !data?.error, data };
  } catch (e) { return { ok: false, data: { error: String(e?.message || e) } }; }
}

async function sheetPost(payload, attempts = 4) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await sheetPostOnce(payload);
    const err = typeof last.data?.error === "string" ? last.data.error : last.data?.error ? JSON.stringify(last.data.error) : "";
    if (last.ok || !TRANSIENT.test(err)) return last;
    console.warn(`sheet ${payload._action} ${payload._sheet}: transient (${err.slice(0, 80)}), retry ${i + 1}/${attempts - 1}`);
    if (i < attempts - 1) await sleep(800 * (i + 1));
  }
  return last;
}

/** Sheets whose last getAll failed after retries — lets the UI tell "empty" from "couldn't load". */
export const sheetHealth = { failed: new Set() };

export async function apiGet(sheetName) {
  const { data } = await sheetPost({ _action: "getAll", _sheet: sheetName });
  const rows = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.data) ? data.data : null;
  if (rows) { sheetHealth.failed.delete(sheetName); return rows; }
  console.warn("apiGet: failed or unexpected shape for", sheetName, data?.error || Object.keys(data || {}));
  sheetHealth.failed.add(sheetName);
  return [];
}

async function apiAction(action, sheetName, row) {
  const { ok, data } = await sheetPost({ ...row, _action: action, _sheet: sheetName });
  if (!ok) console.error("apiAction failed:", action, sheetName, row?.id, data?.error);
  return ok;
}
export const apiCreate = (s, row) => apiAction("create", s, row);
export const apiUpdate = (s, row) => apiAction("update", s, row);
export const apiDelete = (s, id) => apiAction("delete", s, { _id: id, id });
export async function apiUpsert(s, row) { return (await apiUpdate(s, row)) || apiCreate(s, row); }

/** Sparring/chat call through the existing /api/claude function. Returns text; errors come back as text. */
export async function callClaude(messages, system, { model = "claude-sonnet-4-6", max_tokens = 4000 } = {}) {
  try {
    const res = await fetch("/api/claude", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens, system, messages }),
    });
    const data = await res.json();
    if (data.error) { console.error("claude:", data.error); return `Error: ${typeof data.error === "string" ? data.error.slice(0, 200) : "request failed"}`; }
    return (data.text || "").trim() || "No response.";
  } catch (e) {
    console.error("claude:", e);
    return "Unable to reach the sparring partner right now.";
  }
}

// ── Scoring (§8): two calls so neither nears the function time limit. Throws on failure — the caller decides the fallback. ──
async function postJson(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let data = null; try { data = await res.json(); } catch { /* HTML error page / timeout */ }
  if (!res.ok || !data || data.error) throw new Error(data?.error || `${url} → HTTP ${res.status}`);
  return data;
}
export const scoreExtract = async (session) => (await postJson("/api/score/extract", { session })).extraction;
export const scoreEvaluate = (extraction, sessionId) => postJson("/api/score/evaluate", { extraction, sessionId: sessionId || undefined });

// ── MA sessions ────────────────────────────────────────────────────────────────
// Column-mapping guards harvested from the old loader: id column mislabeled `b`, JSON blob in the
// data/date column, JSON-string fields (sections, mentorFeedback), legacy Config rows ignored.
export function normalizeMaRow(r) {
  const idRaw = r.id ?? r.b ?? Object.values(r)[0] ?? "";
  const id = String(idRaw).trim();
  if (!id.startsWith("ma_")) return null;
  const safe = (v, fb) => { if (v == null || v === "") return fb; if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return fb; } };
  // Older rows carry a JSON blob in `data` (or, from a migration bug, in `date`) as well as columns.
  const blobStr = r.data || (typeof r.date === "string" && r.date.startsWith("{") ? r.date : "");
  const blob = typeof blobStr === "string" && blobStr.startsWith("{") ? safe(blobStr, null) : null;
  const hasCols = !!(r.transcript || r.type);
  if (!hasCols && !blob) return null;
  const cols = hasCols ? {
    id: id.replace(/^ma_/, ""), date: r.date || "", type: r.type || r.context || "", context: r.context || r.type || "",
    who: r.who || "", activity: r.activity || "", conditions: r.conditions || "",
    videoUrl: r.videoUrl || "", videoSkier: r.videoSkier || "", videoTime: r.videoTime || "",
    transcript: r.transcript || "", sections: safe(r.sections, {}), summary: r.summary || "", notes: r.notes || "",
    mentorFeedback: safe(r.mentorFeedback, []),
  } : {};
  // Columns win; the blob fills anything the columns don't have (e.g. `sections` on April-era rows).
  const merged = { ...(blob || {}), ...Object.fromEntries(Object.entries(cols).filter(([, v]) => v !== "" && !(Array.isArray(v) && v.length === 0) && !(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0))) };
  return { mentorFeedback: [], sections: {}, ...merged, id: merged.id || id.replace(/^ma_/, "") };
}

export const byDateDesc = (a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "");

export async function loadMaSessions() {
  const rows = await apiGet("MASessions");
  return rows.map(normalizeMaRow).filter(Boolean).sort(byDateDesc);
}

export async function loadConfig() {
  const rows = await apiGet("Config");
  const out = {};
  for (const r of rows) {
    const id = String(r.id ?? Object.values(r)[0] ?? "").trim();
    if (id) out[id] = r.data ?? Object.values(r)[1] ?? "";
  }
  return out;
}

/** Row shape is unchanged from the old app — the Sheet, Chris's view, and bootstrap.mjs all read it. */
export function maSessionToRow(s) {
  return {
    id: `ma_${s.id}`, date: s.date || "", type: s.type || s.context || "", context: s.context || s.type || "",
    who: s.who || "", activity: s.activity || "", conditions: s.conditions || "",
    videoUrl: s.videoUrl || "", videoSkier: s.videoSkier || "", videoTime: s.videoTime || "",
    transcript: s.transcript || "", sections: s.sections ? JSON.stringify(s.sections) : "",
    summary: typeof s.summary === "string" ? s.summary : (s.summary ? JSON.stringify(s.summary) : ""),
    notes: s.notes || "", mentorFeedback: JSON.stringify(s.mentorFeedback || []),
  };
}

export async function saveMaSession(session) {
  // The live Sheet's A1 header reads `b` instead of `id` (§17). The Apps Script maps payload keys to header
  // names, so without this the id column is written empty and the row can never be updated again.
  // Harmless once the header is corrected — an unknown key is ignored.
  const row = maSessionToRow(session);
  row.b = row.id;
  if (await apiUpdate("MASessions", row)) return true;
  return apiCreate("MASessions", row);
}

// ── MA History writes (session 5) ─────────────────────────────────────────────
// The Apps Script `update` writes only the columns it is given. Every MA History write sends ONE column, so a comment
// from Chris can never overwrite a summary Mark just rescored, and a rescore can never drop a comment.
async function updateMaColumns(sessionId, cols) {
  const id = `ma_${String(sessionId).replace(/^ma_/, "")}`;
  return apiUpdate("MASessions", { id, b: id, ...cols });
}
export const saveMaSummary = (sessionId, summaryObj) => updateMaColumns(sessionId, { summary: JSON.stringify(summaryObj) });

const fbKey = (f) => `${f.userId}|${f.timestamp}|${(f.text || "").slice(0, 40)}`;
/**
 * Append to a session's comment thread. Re-reads the row first and merges, so two people commenting from stale
 * copies both keep their comments (the old app saved the whole row from memory — last writer won).
 * → { ok, mentorFeedback } with the merged thread.
 */
export async function appendFeedback(sessionId, item) {
  const bare = String(sessionId).replace(/^ma_/, "");
  const rows = await apiGet("MASessions");
  const live = rows.map(normalizeMaRow).filter(Boolean).find((s) => s.id === bare);
  if (!live && sheetHealth.failed.has("MASessions")) return { ok: false, mentorFeedback: null };
  const merged = [...(live?.mentorFeedback || [])];
  if (!merged.some((f) => fbKey(f) === fbKey(item))) merged.push(item);
  merged.sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));
  const ok = await updateMaColumns(bare, { mentorFeedback: JSON.stringify(merged) });
  if (ok) feedKnowledge(bare, item);
  return { ok, mentorFeedback: merged };
}

/**
 * §6.3 / §6.4 — after the Sheet has the item, tell the knowledge store. Fire-and-forget: the Sheet is the record, the
 * server re-reads the item from it, and `npm run ingest:scores` picks up anything missed — so a failure here never
 * blocks or fails the post. One retry, because Apps Script can take a moment to show a row it has just written (409).
 */
function feedKnowledge(bare, item) {
  const who = String(item?.userId || "").toLowerCase();
  if (!["chris", "gates", "mike"].includes(who)) return;
  const call = item.kind === "blind_score"
    ? () => postJson("/api/ingest/score", { sessionId: bare, mentor: who })
    : () => postJson("/api/ingest/comment", { sessionId: bare, timestamp: item.timestamp });
  call().catch(() => new Promise((r) => setTimeout(r, 4000)).then(call)).catch((e) => console.warn("knowledge ingest deferred:", e?.message || e));
}
export const deleteMaSession = (sessionId) => apiDelete("MASessions", `ma_${String(sessionId).replace(/^ma_/, "")}`);

/** "Try that line again": one passage, one line (§13 row 5). Read-only on the server. */
export const scoreLineTry = ({ session, extraction, line, section, passage, original }) =>
  postJson("/api/score/evaluate", { lines: [line], extraction, section, passage, original: original || null, sessionId: session.id || undefined,
    session: { type: session.type, context: session.context, who: session.who, activity: session.activity, conditions: session.conditions, sections: session.sections, transcript: Object.keys(session.sections || {}).length ? undefined : session.transcript } });

// ── Journal (session 7) ───────────────────────────────────────────────────────
// Same write discipline as MA History: Mark's save sends the content columns; a depth tap sends `mentorPulse`; a comment
// sends `mentorComments` — the last two after re-reading the live row, so nobody writes over anybody from a stale copy.

/** → { entries, typeColumn } — typeColumn false means the Sheet has no `entryType` header and types cannot be saved. */
export async function loadJournal() {
  const rows = await apiGet("Journal");
  return { entries: rows.map(normalizeJournalRow).filter(Boolean).sort(byEntryDesc), typeColumn: hasTypeColumn(rows) };
}

/** Apps Script `update` creates the row when the id is new, so one call covers both and a retry can never duplicate. */
export const saveJournalEntry = (entry, { isNew = false } = {}) => apiUpdate("Journal", isNew ? createRow(entry) : contentRow(entry));

async function liveJournalEntry(id) {
  const rows = await apiGet("Journal");
  if (sheetHealth.failed.has("Journal")) return { live: null, reason: "unreachable" };
  const live = rows.map(normalizeJournalRow).filter(Boolean).find((e) => e.id === id) || null;
  // `update` upserts: writing one column to an id that is gone would resurrect an empty row.
  return { live, reason: live ? "" : "gone" };
}

/** value: "surface" | "connecting" | "integrated" | null (deselect). → { ok, reason, mentorPulse } */
export async function setJournalPulse(id, mentorKey, value) {
  const { live, reason } = await liveJournalEntry(id);
  if (!live) return { ok: false, reason, mentorPulse: null };
  const mentorPulse = applyPulse(live.mentorPulse, mentorKey, value);
  const ok = await apiUpdate("Journal", { id, mentorPulse: JSON.stringify(mentorPulse) });
  return { ok, reason: ok ? "" : "write", mentorPulse, mentorComments: live.mentorComments };
}

/** → { ok, reason, mentorComments } with the merged thread. */
export async function appendJournalComment(id, item) {
  const { live, reason } = await liveJournalEntry(id);
  if (!live) return { ok: false, reason, mentorComments: null };
  const mentorComments = mergeComment(live.mentorComments, item);
  const ok = await apiUpdate("Journal", { id, mentorComments: JSON.stringify(mentorComments) });
  return { ok, reason: ok ? "" : "write", mentorComments, mentorPulse: live.mentorPulse };
}

export const deleteJournalEntry = (id) => apiDelete("Journal", id);

/** Existing Apps Script `notify` action (mails every `_MENTOR_PROFILES` entry with an email). → { ok, sent, error } */
export async function notifyMentors(subject, body) {
  const { ok, data } = await sheetPost({ _action: "notify", _sheet: "Config", subject, body });
  return { ok: ok && data?.success !== false, sent: Number(data?.sent) || 0, error: data?.error ? String(data.error) : "" };
}
