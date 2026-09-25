// §12.3 — Zoom chunk approval. Mentor-only: only the author approves or edits his own statements (the endpoint enforces
// it; the UI lists his). Each pending statement shows the cleaned text with what was actually HEARD beside it (§17 —
// bracketed restorations in the 9/18 batch are guesses), its context, flags (hedged, check-speaker, watch, ASR fixes),
// tags, and the earlier approved statements it could replace. Approve embeds and makes it retrievable; Delete is a hard
// delete of pending only; Edit stays pending. The candidate sees the list read-only and may delete obvious junk.
import React, { useEffect, useMemo, useState } from "react";
import { C, inp } from "../theme.js";
import { Card, Hint, Button, Textarea } from "../components/index.jsx";
import { USERS } from "../lib/users.js";
import { loadPending, chunkAction } from "../api.js";
import { groupPending, isPriority, tallyDecisions } from "../lib/progress.js";
import { CRITERIA, SKILLS, TYPES, CRITERION_LABEL } from "../../lib/vocab.js";

const TONE = C.green;
const TYPE_COLOR = { correction: C.orange, principle: C.green, exemplar: C.examiner, physics: C.blue, mental_model: C.purple, definition: C.muted, idp_task: C.muted };
const LOG_KEY = "rmat_approval_log";
const load = (k, fb) => { try { return JSON.parse(window.localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const store = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* convenience only */ } };

const Chip = ({ children, color = C.muted, title }) => <span title={title} style={{ fontSize: 10, fontWeight: 700, color, border: `1px solid ${color}40`, borderRadius: 4, padding: "1px 6px", marginRight: 4, whiteSpace: "nowrap" }}>{children}</span>;

export default function ChunkApproval({ viewer, onAuth }) {
  const isMentor = viewer.role === "mentor";
  const [state, setState] = useState({ loading: true, error: "", pending: [], auth: null });
  const [selected, setSelected] = useState(() => new Set());
  const [log, setLog] = useState(() => load(LOG_KEY, []));
  const [bulk, setBulk] = useState("");
  useEffect(() => store(LOG_KEY, log), [log]);

  const reload = async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try { const d = await loadPending(isMentor ? { author: viewer.key } : {}); setState({ loading: false, error: "", pending: d.pending || [], auth: d.auth || null }); }
    catch (e) { if (e.auth) onAuth?.(); setState({ loading: false, error: e.auth ? "auth" : String(e.message || e), pending: [], auth: null }); }
  };
  useEffect(() => { reload(); }, [viewer.key]);   // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => groupPending(state.pending), [state.pending]);
  const done = (id, entry) => { setState((s) => ({ ...s, pending: s.pending.filter((p) => p.id !== id) })); setSelected((s) => { const n = new Set(s); n.delete(id); return n; }); if (entry) setLog((l) => [...l, { at: new Date().toISOString(), ...entry }].slice(-500)); };
  const patch = (id, fields) => setState((s) => ({ ...s, pending: s.pending.map((p) => (p.id === id ? { ...p, ...fields } : p)) }));

  const approveSelected = async () => {
    const ids = [...selected]; if (!ids.length) return;
    setBulk(`Approving ${ids.length}…`);
    try {
      const r = await chunkAction("approve", viewer.key, { ids });
      for (const x of r.results || [r]) if (!x.error) done(x.id, { action: "approve", type: state.pending.find((p) => p.id === x.id)?.type, bulk: true });
      const failed = (r.results || []).filter((x) => x.error);
      setBulk(failed.length ? `${failed.length} could not be approved: ${failed[0].error}` : "");
    } catch (e) { setBulk(`Couldn't approve: ${e.message}`); }
  };

  const tally = tallyDecisions(log);
  const total = Object.values(tally).reduce((a, t) => ({ approved: a.approved + t.approved, edited: a.edited + t.edited, deleted: a.deleted + t.deleted }), { approved: 0, edited: 0, deleted: 0 });

  return (
    <Card style={{ borderLeft: `3px solid ${TONE}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: TONE }}>Statements from your calls — waiting for your OK{state.pending.length ? ` (${state.pending.length})` : ""}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {isMentor && selected.size > 0 && <Button tone={TONE} onClick={approveSelected} disabled={!!bulk} style={{ padding: "5px 12px", fontSize: 12 }}>Approve {selected.size} selected</Button>}
          <button type="button" onClick={reload} style={{ background: "none", border: "none", color: C.dim, fontSize: 12, cursor: "pointer" }}>refresh</button>
        </div>
      </div>
      <Hint style={{ margin: "4px 0 8px", lineHeight: 1.5 }}>
        {isMentor
          ? "The AI pulled these out of your recorded calls. Nothing here is used until you approve it; once approved, the scorer can cite it as your words. Read the cleaned text against what was actually heard; fix anything the transcript garbled, or delete what you didn't mean."
          : "Chris's statements from recorded calls, pending his approval. Only he can approve or reword them; you can delete obvious junk (a stray Plaud message, a duplicate)."}
      </Hint>
      {state.auth === "open" && isMentor && <Hint style={{ color: C.orange, marginBottom: 6 }}>No access code is configured on the server yet — approvals are open to anyone with the URL until MENTOR_TOKEN is set.</Hint>}
      {bulk && <div style={{ fontSize: 12, color: bulk.startsWith("Couldn") || /could not/.test(bulk) ? C.red : C.amber, marginBottom: 6 }}>{bulk}</div>}
      {state.loading && <Hint>Loading…</Hint>}
      {state.error === "auth" && <div style={{ fontSize: 12, color: C.orange }}>Enter the mentor access code above to see pending statements.</div>}
      {state.error && state.error !== "auth" && <div style={{ fontSize: 12, color: C.red }}>Couldn't load: {state.error}</div>}
      {!state.loading && !state.error && !state.pending.length && <div style={{ fontSize: 13, color: C.muted }}>Nothing pending. {isMentor ? "When Mark ingests the next call, the statements land here." : ""}</div>}

      {groups.map((g) => (
        <div key={g.ref} style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.body, marginBottom: 4 }}>{g.title}{g.date ? <span style={{ color: C.dim, fontWeight: 500 }}> · {g.date}</span> : null} <span style={{ color: C.dim, fontWeight: 500 }}>· {g.items.length}</span></div>
          {g.items.some(isPriority) && <div style={{ fontSize: 11, color: C.amber, marginBottom: 6 }}>★ Start with the starred ones — they are the two Evaluate statements the scorer is still missing (what the comparison has to contain).</div>}
          {g.items.map((p) => <Pending key={p.id} p={p} viewer={viewer} selected={selected.has(p.id)} onSelect={(v) => setSelected((s) => { const n = new Set(s); v ? n.add(p.id) : n.delete(p.id); return n; })} onDone={done} onPatch={patch} />)}
        </div>
      ))}

      {log.length > 0 && (
        <Hint style={{ marginTop: 10 }}>This browser so far: {total.approved} approved ({total.edited} after editing) · {total.deleted} deleted
          {Object.keys(tally).length > 1 ? ` — by type: ${Object.entries(tally).map(([t, v]) => `${t} ${v.approved}✓ ${v.deleted}✗`).join(", ")}` : ""}.</Hint>
      )}
    </Card>
  );
}

function Pending({ p, viewer, selected, onSelect, onDone, onPatch }) {
  const isMentor = viewer.role === "mentor";
  const mine = isMentor && p.author === viewer.key;
  const [mode, setMode] = useState("");            // "" | "edit" | "replaces"
  const [text, setText] = useState(p.text);
  const [type, setType] = useState(p.type);
  const [criteria, setCriteria] = useState(p.criteria || []);
  const [skills, setSkills] = useState(p.skills || []);
  const [replaces, setReplaces] = useState(() => new Set());
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const edited = text.trim() !== p.text || type !== p.type || criteria.join() !== (p.criteria || []).join() || skills.join() !== (p.skills || []).join();
  const editBody = () => (edited ? { text: text.trim(), type, criteria, skills, ...(p.hedged ? { hedged: false } : {}) } : undefined);

  const run = async (action, label) => {
    setBusy(label); setErr("");
    try {
      const args = { id: p.id };
      if (action === "approve") { if (editBody()) args.edit = editBody(); if (replaces.size) args.replaces = [...replaces]; }
      if (action === "edit") args.edit = editBody() || { hedged: false };
      const r = await chunkAction(action, viewer.key, args);
      if (action === "edit") { onPatch(p.id, { text: r.text, type: r.type, criteria: r.criteria, skills: r.skills, hedged: false }); setMode(""); }
      else onDone(p.id, { action, type: p.type, edited: !!edited, replaced: replaces.size, ts: p.timestamp, ref: p.source_ref });
    } catch (e) { setErr(String(e.message || e).slice(0, 220)); }
    setBusy("");
  };
  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div style={{ padding: "8px 10px", marginBottom: 6, borderRadius: 8, background: isPriority(p) ? "rgba(232,160,80,0.05)" : "rgba(255,255,255,0.02)", border: `1px solid ${isPriority(p) ? "rgba(232,160,80,0.3)" : "rgba(255,255,255,0.05)"}` }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        {mine && <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} title="select for bulk approve" style={{ marginTop: 3 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 4, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2 }}>
            {isPriority(p) && <Chip color={C.amber}>★ first</Chip>}
            {p.timestamp && <Chip color={C.dim}>{p.timestamp}</Chip>}
            <Chip color={TYPE_COLOR[p.type] || C.muted}>{p.type}</Chip>
            {p.modeled && <Chip color={C.examiner} title="A delivery you modeled, kept whole">modeled</Chip>}
            {p.hedged && <Chip color={C.orange} title={p.hedge_note || ""}>hedged{p.hedge_note ? ` — ${p.hedge_note}` : ""}</Chip>}
            {p.attribution_check && <Chip color={C.red} title={p.attribution ? JSON.stringify(p.attribution) : ""}>check speaker — was this you?</Chip>}
            {(p.watch || []).map((w) => <Chip key={w} color={C.orange}>{w}</Chip>)}
            {(p.criteria || []).map((c) => <Chip key={c} color={C.blue} title={CRITERION_LABEL[c] || c}>{c}</Chip>)}
            {(p.skills || []).map((s) => <Chip key={s} color={C.muted}>{s}</Chip>)}
          </div>
          {mode !== "edit" && <div style={{ fontSize: 13, color: C.body, lineHeight: 1.55 }}>{p.text}</div>}
          {mode === "edit" && (
            <div>
              <Textarea value={text} onChange={setText} mic={false} style={{ minHeight: 70, fontSize: 13 }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...inp, width: "auto", padding: "4px 8px", fontSize: 12 }}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                <span style={{ fontSize: 11, color: C.dim }}>lines:</span>{CRITERIA.map((c) => <button key={c} type="button" onClick={() => toggle(criteria, setCriteria, c)} style={tagBtn(criteria.includes(c), C.blue)}>{c}</button>)}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}><span style={{ fontSize: 11, color: C.dim }}>skills:</span>{SKILLS.map((s) => <button key={s} type="button" onClick={() => toggle(skills, setSkills, s)} style={tagBtn(skills.includes(s), C.muted)}>{s}</button>)}</div>
            </div>
          )}
          {p.quote && p.quote.trim() !== p.text.trim() && (
            <div style={{ marginTop: 4, fontSize: 12, color: C.muted, lineHeight: 1.5 }}><b style={{ color: C.dim, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Heard: </b><i>“{p.quote}”</i>{p.asr_fixes?.length ? <span style={{ color: C.dim }}> — transcript fixes: {p.asr_fixes.map((f) => (typeof f === "string" ? f : `${f.heard || f.from} → ${f.meant || f.to}`)).join("; ")}</span> : null}</div>
          )}
          {p.text.includes("[") && <Hint style={{ color: C.orange, marginTop: 2 }}>Words in [brackets] were filled in by the AI, not heard — check them.</Hint>}
          {p.original_text && p.original_text !== p.text && <Hint style={{ marginTop: 2 }}>Edited; the extractor's version is kept underneath.</Hint>}
          {p.context && <details style={{ marginTop: 4 }}><summary style={{ fontSize: 11, color: C.dim, cursor: "pointer" }}>Context on the call</summary><div style={{ fontSize: 12, color: C.muted, whiteSpace: "pre-wrap", lineHeight: 1.5, marginTop: 3, padding: "4px 8px", borderLeft: `2px solid ${C.faint}` }}>{p.context}</div></details>}

          {p.replaces_candidates?.length > 0 && (
            <details open={mode === "replaces"} style={{ marginTop: 4 }}>
              <summary style={{ fontSize: 11, color: C.dim, cursor: "pointer" }}>Replaces an earlier statement? {p.replaces_candidates.length} candidate{p.replaces_candidates.length > 1 ? "s" : ""}{replaces.size ? ` · ${replaces.size} chosen` : ""}</summary>
              <Hint style={{ margin: "3px 0" }}>Tick one only if THIS statement supersedes it — the old one stops being retrieved. A correction never replaces a principle; it refines it (§5.6).</Hint>
              {p.replaces_candidates.map((c) => (
                <label key={c.id} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: C.muted, padding: "3px 0" }}>
                  {mine && <input type="checkbox" checked={replaces.has(c.id)} onChange={(e) => setReplaces((s) => { const n = new Set(s); e.target.checked ? n.add(c.id) : n.delete(c.id); return n; })} />}
                  <span><Chip color={C.dim}>{c.date || c.source_ref}</Chip><Chip color={TYPE_COLOR[c.type] || C.muted}>{c.type}</Chip>{c.text}</span>
                </label>
              ))}
            </details>
          )}

          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
            {mine && <Button tone={TONE} disabled={!!busy} onClick={() => run("approve", "Approving…")} style={{ padding: "5px 12px", fontSize: 12 }}>{busy === "Approving…" ? busy : `Approve${edited ? " with edits" : ""}${replaces.size ? ` · replaces ${replaces.size}` : ""}`}</Button>}
            {mine && mode !== "edit" && <button type="button" onClick={() => setMode("edit")} disabled={!!busy} style={linkBtn(C.blue)}>Edit</button>}
            {mine && mode === "edit" && <><button type="button" onClick={() => run("edit", "Saving…")} disabled={!!busy || (!edited && !p.hedged)} style={linkBtn(C.blue)}>{busy === "Saving…" ? busy : "Save (keep pending)"}</button><button type="button" onClick={() => { setMode(""); setText(p.text); setType(p.type); setCriteria(p.criteria || []); setSkills(p.skills || []); }} style={linkBtn(C.dim)}>cancel</button></>}
            {(mine || viewer.key === "mark") && <button type="button" disabled={!!busy} onClick={() => { if (window.confirm("Delete this statement? It is removed for good — nothing is kept.")) run("delete", "Deleting…"); }} style={linkBtn(C.red)}>{busy === "Deleting…" ? busy : "Delete"}</button>}
            {!mine && isMentor && <Hint>By {USERS[p.author]?.name || p.author} — only they can approve it.</Hint>}
          </div>
          {err && <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>{err}</div>}
        </div>
      </div>
    </div>
  );
}

const tagBtn = (on, tone) => ({ padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", border: `1px solid ${on ? tone : C.faint}`, background: on ? `${tone}22` : "transparent", color: on ? tone : C.dim });
const linkBtn = (tone) => ({ background: "none", border: `1px solid ${tone}40`, borderRadius: 5, padding: "4px 10px", color: tone, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
