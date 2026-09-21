// New / edit entry. The form owns a working copy; every change is written to localStorage, so a reload, a tab switch
// or a failed save never costs Mark what he typed (the old form kept it in React state only). The draft is cleared on
// a confirmed save or an explicit discard — nothing else.
import React, { useEffect, useState } from "react";
import { C, lbl } from "../theme.js";
import { Card, Field, Input, Select, Textarea, Button, Hint } from "../components/index.jsx";
import { ENTRY_TYPES, CONTEXTS, DOMAINS, activePrompts, contentHash, hasText, saveDraft, clearDraft } from "../lib/journal.js";
import { RESOURCES } from "../lib/resources.js";

const chip = (on, tone = C.amber) => ({ padding: "5px 10px", borderRadius: 5, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", background: on ? `${tone}1a` : "rgba(255,255,255,0.02)", border: `1.5px solid ${on ? tone : "rgba(255,255,255,0.06)"}`, color: on ? tone : C.muted });

/**
 * @param initial     entry to edit (a saved one, a restored draft, or newEntry())
 * @param saved       the saved version when editing, null for a new entry — drives hash-diff and the title
 * @param restored    true when `initial` came from a draft
 * @param onSave      async (entry) => true | "error text"
 */
export default function JournalEntryForm({ initial, saved, restored, themes, typeColumn, recipients, onSave, onBack, onDiscard }) {
  const isNew = !saved;
  const draftId = isNew ? "new" : saved.id;
  const [e, setE] = useState(initial);
  const [wasRestored] = useState(!!restored);   // the parent re-renders once autosave has written a draft; only the mount-time answer is true
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const upd = (f, v) => setE((p) => ({ ...p, [f]: v }));
  const toggle = (f, id) => setE((p) => ({ ...p, [f]: (p[f] || []).includes(id) ? p[f].filter((x) => x !== id) : [...(p[f] || []), id] }));

  const dirty = isNew ? hasText(e) || !!e.location || !!e.videoUrl : contentHash(e) !== contentHash(saved);
  useEffect(() => { if (dirty) saveDraft(draftId, e); else clearDraft(draftId); }, [e, dirty, draftId]);

  const prompts = activePrompts(e.entryType);
  const hidden = ["whyThatApproach", "whatHappened", "whatIdDoDifferently"].filter((f) => !prompts.some((p) => p.id === f) && String(e[f] || "").trim());
  const activeThemes = (themes || []).filter((t) => t.active !== false);

  const save = async () => {
    if (busy) return;
    if (!hasText(e)) { setErr("Write something under at least one prompt first."); return; }
    setBusy(true); setErr("");
    const r = await onSave(e);
    if (r !== true) { setErr(typeof r === "string" ? r : "Couldn't save to the Sheet. Your entry is kept on this device — try again."); setBusy(false); }
  };

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, fontSize: 14, cursor: "pointer", padding: "0 0 10px", fontWeight: 600, fontFamily: "inherit" }}>← Back{dirty ? " (draft kept)" : ""}</button>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{isNew ? "New Entry" : "Edit Entry"}</div>
          {(wasRestored || dirty) && (
            <div style={{ fontSize: 12, color: C.dim }}>
              {wasRestored ? "Restored from your unsaved draft · " : "Draft saved on this device · "}
              <button onClick={() => { if (window.confirm(isNew ? "Discard this draft?" : "Discard your unsaved changes?")) { clearDraft(draftId); onDiscard(); } }} style={{ background: "none", border: "none", color: C.red, fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>Discard</button>
            </div>
          )}
        </div>

        <div role="radiogroup" aria-label="Entry type" style={{ display: "flex", gap: 4, marginBottom: typeColumn === false ? 6 : 14, flexWrap: "wrap" }}>
          {Object.entries(ENTRY_TYPES).map(([key, t]) => (
            <button key={key} role="radio" aria-checked={e.entryType === key} onClick={() => setE((p) => ({ ...p, entryType: key, typeKnown: true }))} style={{ ...chip(e.entryType === key), borderWidth: 1 }}>{t.icon} {t.label}</button>
          ))}
        </div>
        {typeColumn === false && <Hint style={{ marginBottom: 14, color: C.amber }}>The Journal sheet has no <b>entryType</b> column yet, so the type won't survive a reload. See the note on the Journal list.</Hint>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 4 }}>
          <Field label="Date"><Input type="date" value={e.date} onChange={(ev) => upd("date", ev.target.value)} /></Field>
          <Field label="Context"><Select value={e.context} onChange={(ev) => upd("context", ev.target.value)}>{!CONTEXTS.includes(e.context) && <option value={e.context}>{e.context || "—"}</option>}{CONTEXTS.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
          <Field label="Location"><Input value={e.location} onChange={(ev) => upd("location", ev.target.value)} placeholder="e.g., Keystone — Run 6" /></Field>
          <Field label="Conditions"><Input value={e.conditions} onChange={(ev) => upd("conditions", ev.target.value)} placeholder="e.g., firm groomed, flat light" /></Field>
        </div>

        {prompts.map((p, i) => (
          <div key={p.id} style={{ marginBottom: 14 }}>
            <label style={lbl}>{i + 1}. {p.label}</label>
            <Textarea value={e[p.id] || ""} onChange={(v) => upd(p.id, v)} placeholder={p.placeholder} />
          </div>
        ))}
        {hidden.length > 0 && <Hint style={{ marginBottom: 14, color: C.amber }}>{ENTRY_TYPES[e.entryType].label} has {prompts.length} prompts. {hidden.length} answer{hidden.length > 1 ? "s" : ""} you wrote under another type {hidden.length > 1 ? "aren't" : "isn't"} shown and won't be saved — switch back to keep {hidden.length > 1 ? "them" : "it"}.</Hint>}

        <Field label="Video link (optional)"><Input value={e.videoUrl || ""} onChange={(ev) => upd("videoUrl", ev.target.value)} placeholder="YouTube or Google Drive link" /></Field>

        <div style={{ margin: "14px 0" }}>
          <label style={lbl}>What domains did you connect? (select all that apply)</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {DOMAINS.map((d) => { const on = (e.connectionTags || []).includes(d.id); return <button key={d.id} aria-pressed={on} onClick={() => toggle("connectionTags", d.id)} style={chip(on, d.color)}>{d.label}</button>; })}
          </div>
        </div>

        {activeThemes.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Which themes does this push on?</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {activeThemes.map((t) => {
                const on = (e.themeIds || []).includes(t.id);
                return (
                  <label key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: on ? "rgba(224,120,48,0.06)" : "rgba(255,255,255,0.015)", border: `1px solid ${on ? "rgba(224,120,48,0.2)" : "rgba(255,255,255,0.04)"}` }}>
                    <input type="checkbox" checked={on} onChange={() => toggle("themeIds", t.id)} style={{ marginTop: 2, accentColor: C.orange }} />
                    <span style={{ fontSize: 13, color: on ? C.body : C.muted, lineHeight: 1.4 }}>{t.question}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <Field label="Inspired by a resource? (optional)">
          <Select value={e.resourceId || ""} onChange={(ev) => upd("resourceId", ev.target.value)}>
            <option value="">— None —</option>
            {Object.entries(RESOURCES).map(([cat, r]) => <optgroup key={cat} label={cat}>{r.items.map((it) => <option key={it.id} value={it.id}>{it.id} — {it.title}</option>)}</optgroup>)}
          </Select>
        </Field>

        {err && <div style={{ fontSize: 13, color: C.red, margin: "10px 0 0" }}>{err}</div>}
        <Button solid tone={C.orange} disabled={busy} onClick={save} style={{ width: "100%", padding: 12, fontSize: 15, marginTop: 12 }}>{busy ? "Saving…" : !isNew && !dirty ? "No changes — close" : "Save Reflection"}</Button>
        {isNew && <Hint style={{ marginTop: 6, textAlign: "center" }}>{recipients.length ? `Saving emails ${recipients.map((r) => `${r.key} (${r.email})`).join(", ")}.` : "No mentor has an email in their profile — nobody will be notified."}</Hint>}
      </Card>
    </div>
  );
}
