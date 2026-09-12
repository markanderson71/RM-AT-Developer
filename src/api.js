// Fetch wrappers for /api/*. Harvested from ATDevelopmentJournal.jsx: response-shape guards on getAll
// ({rows}|{data}|array, wrapped in {response}), update-then-create upsert, never throws to the UI.

async function sheetPost(payload) {
  const res = await fetch("/api/sheet", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: `non-JSON response: ${text.slice(0, 200)}` }; }
  if (data && typeof data.response === "string") { try { data = JSON.parse(data.response); } catch { /* keep */ } }
  return { ok: res.ok && !data?.error, data };
}

export async function apiGet(sheetName) {
  try {
    const { data } = await sheetPost({ _action: "getAll", _sheet: sheetName });
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.rows)) return data.rows;
    if (Array.isArray(data?.data)) return data.data;
    console.warn("apiGet: unexpected shape for", sheetName, Object.keys(data || {}));
    return [];
  } catch (e) { console.error("apiGet", sheetName, e); return []; }
}

async function apiAction(action, sheetName, row) {
  try {
    const { ok, data } = await sheetPost({ ...row, _action: action, _sheet: sheetName });
    if (!ok) console.error("apiAction failed:", action, sheetName, row?.id, data?.error);
    return ok;
  } catch (e) { console.error("apiAction", action, e); return false; }
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
