// Mentor feedback on one journal entry: depth assessment (set / change / tap again to clear) and the comment thread.
// Each action re-reads the live row and writes its own column only (src/api.js) — the entry handed back to the parent
// carries the MERGED pulse and thread, so what is on screen is what is in the Sheet.
import React, { useState } from "react";
import { C, txta } from "../theme.js";
import { Card, SectionLabel, MicButton } from "../components/index.jsx";
import { USERS } from "../lib/users.js";
import { PULSE_OPTIONS } from "../lib/journal.js";
import { setJournalPulse, appendJournalComment } from "../api.js";
import { shortDate } from "./Rationale.jsx";

const WHY = { unreachable: "Couldn't reach the Sheet — nothing was changed. Try again.", gone: "This entry is no longer in the Sheet (deleted elsewhere?). Go back and reload.", write: "The Sheet didn't accept the change. Try again." };

const Avatar = ({ who, size = 20 }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: `${who.color}20`, border: `1.5px solid ${who.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.45, fontWeight: 800, color: who.color }}>{who.name[0]}</div>
);

export default function JournalThread({ entry, user, onChange }) {
  const isMentor = user.role === "mentor";
  const [busyPulse, setBusyPulse] = useState("");
  const [err, setErr] = useState("");
  const mine = entry.mentorPulse?.[user.key] || "";
  const others = Object.entries(entry.mentorPulse || {}).filter(([k]) => !isMentor || k !== user.key);

  const tap = async (pulseId) => {
    if (busyPulse) return;
    setBusyPulse(pulseId); setErr("");
    const r = await setJournalPulse(entry.id, user.key, mine === pulseId ? null : pulseId);
    if (r.ok) onChange({ ...entry, mentorPulse: r.mentorPulse, mentorComments: r.mentorComments });
    else setErr(WHY[r.reason] || WHY.write);
    setBusyPulse("");
  };

  return (
    <Card>
      <SectionLabel>Mentor Feedback</SectionLabel>

      {others.map(([k, pulseId]) => {
        const who = USERS[k], pulse = PULSE_OPTIONS.find((p) => p.id === pulseId);
        if (!who || !pulse) return null;
        return (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "6px 8px", borderRadius: 5, background: `${pulse.color}08`, flexWrap: "wrap" }}>
            <Avatar who={who} />
            <span style={{ fontSize: 12, fontWeight: 700, color: who.color }}>{who.name}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: pulse.color }}>{pulse.icon} {pulse.label}</span>
            <span style={{ fontSize: 11, color: C.dim }}>{pulse.desc}</span>
          </div>
        );
      })}
      {!isMentor && others.length === 0 && (entry.mentorComments || []).length === 0 && <div style={{ fontSize: 13, color: C.faint, marginBottom: 8 }}>No mentor has read this one yet.</div>}

      {isMentor && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4 }}>How deep is Mark's thinking here?{mine ? " — tap your choice again to clear it" : ""}</div>
          <div style={{ display: "flex", gap: 6 }}>
            {PULSE_OPTIONS.map((p) => {
              const on = mine === p.id, busy = busyPulse === p.id;
              return (
                <button key={p.id} onClick={() => tap(p.id)} disabled={!!busyPulse} aria-pressed={on} title={p.desc} style={{ flex: 1, padding: "8px 6px", borderRadius: 6, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: busyPulse ? "default" : "pointer", background: on ? `${p.color}20` : `${p.color}08`, border: `1.5px solid ${on ? p.color : p.color + "30"}`, color: p.color, opacity: busyPulse && !busy ? 0.5 : 1 }}>
                  {busy ? "Saving…" : `${p.icon} ${p.label}`}
                </button>
              );
            })}
          </div>
          {mine && <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{PULSE_OPTIONS.find((p) => p.id === mine)?.desc}</div>}
        </div>
      )}
      {err && <div style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{err}</div>}

      <Comments entry={entry} user={user} onChange={onChange} />
    </Card>
  );
}

function Comments({ entry, user, onChange }) {
  const draftKey = `rmat_jc_${user.key}_${entry.id}`;
  const [text, setText] = useState(() => { try { return window.localStorage.getItem(draftKey) || ""; } catch { return ""; } });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const setDraft = (v) => { setText(v); try { v ? window.localStorage.setItem(draftKey, v) : window.localStorage.removeItem(draftKey); } catch { /* ignore */ } };
  const post = async () => {
    const t = text.trim(); if (!t || busy) return;
    setBusy(true); setErr("");
    const r = await appendJournalComment(entry.id, { userId: user.key, text: t, timestamp: new Date().toISOString() });
    if (r.ok) { onChange({ ...entry, mentorComments: r.mentorComments, mentorPulse: r.mentorPulse }); setDraft(""); }
    else setErr(r.reason === "gone" ? WHY.gone : "Couldn't post — your comment is still in the box. Try again.");
    setBusy(false);
  };
  return (
    <>
      {(entry.mentorComments || []).map((c, i) => {
        const who = USERS[c.userId] || { name: String(c.userId || "?"), color: C.muted };
        return (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, padding: "8px 10px", borderRadius: 6, background: `${who.color}06`, border: `1px solid ${who.color}12` }}>
            <Avatar who={who} size={22} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: who.color }}>{who.name}</span>
                <span style={{ fontSize: 10, color: C.dim }}>{shortDate(c.timestamp)}</span>
              </div>
              <div style={{ fontSize: 14, color: C.body, lineHeight: 1.5, whiteSpace: "pre-wrap", marginTop: 2, overflowWrap: "anywhere" }}>{c.text}</div>
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginTop: 6 }}>
        <textarea value={text} onChange={(e) => setDraft(e.target.value)} placeholder={user.role === "mentor" ? "Coach Mark on this reflection…" : "Respond to mentor feedback…"} style={{ ...txta, minHeight: 36, flex: 1, fontSize: 13 }} />
        <MicButton onResult={(t) => setDraft(text ? `${text} ${t}` : t)} />
        <button onClick={post} disabled={busy || !text.trim()} style={{ padding: "6px 12px", borderRadius: 5, fontSize: 13, fontWeight: 700, fontFamily: "inherit", background: `${user.color}12`, border: `1px solid ${user.color}30`, color: user.color, cursor: busy ? "default" : "pointer", flexShrink: 0, opacity: busy || !text.trim() ? 0.5 : 1 }}>{busy ? "Posting…" : "Post"}</button>
      </div>
      {err && <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>{err}</div>}
    </>
  );
}
