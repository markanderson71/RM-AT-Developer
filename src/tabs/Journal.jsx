// Journal (§13 row 7). Same look as the old tab. What changed and why:
//  · the list shows two lines of each entry, not one (Mark, session 7);
//  · the form's working copy persists on the device, and a failed save keeps it;
//  · Mark's save, a mentor's depth tap and a comment each write their own columns after re-reading (src/api.js);
//  · the notification fires after the Sheet has CONFIRMED the new entry, and its result is shown;
//  · Challenge Me has its own prompt, knows the entry's type, reads no scores, and its reply survives "Back".
import React, { useState } from "react";
import { C } from "../theme.js";
import { Card, SectionLabel, Button, Hint, SpeakButton } from "../components/index.jsx";
import { USERS } from "../lib/users.js";
import { DOMAINS, ENTRY_TYPES, activePrompts, byEntryDesc, contentHash, entryDay, listSummary, topDepth, newEntry, loadDraft, clearDraft, reflectionText, notificationFor, notifyRecipients, themesFromConfig, loadChallenge, saveChallenge } from "../lib/journal.js";
import { resourceById } from "../lib/resources.js";
import { buildChallengeSystem, challengeUserMessage } from "../lib/prompts.js";
import { callClaude, saveJournalEntry, deleteJournalEntry, notifyMentors } from "../api.js";
import JournalEntryForm from "./JournalEntryForm.jsx";
import JournalThread from "./JournalThread.jsx";

const back = { background: "none", border: "none", color: C.muted, fontSize: 14, cursor: "pointer", padding: "0 0 10px", fontWeight: 600, fontFamily: "inherit" };
const Tag = ({ d, big }) => <span style={{ fontSize: big ? 12 : 10, fontWeight: 600, padding: big ? "3px 8px" : "2px 6px", borderRadius: big ? 4 : 3, background: `${d.color}12`, border: big ? `1px solid ${d.color}25` : "none", color: d.color }}>{d.label}</span>;
const meta = (e, full) => [entryDay(e) || "no date", e.context, e.location, full ? e.conditions : ""].filter(Boolean).join(" · ");

export default function Journal({ user, journal, loaded, config, mentorAssessments, onEntries, openId = null }) {
  const isMentor = user.role === "mentor";
  const entries = journal.entries;
  const themes = themesFromConfig(config?._THEMES);
  const activeThemes = themes.filter((t) => t.active !== false);
  const [mode, setMode] = useState(openId ? { view: "entry", id: openId } : { view: "list" });   // list | entry{id} | edit{id|null}; openId lets another tab (or a test) land on one entry
  const [themeFilter, setThemeFilter] = useState(null);
  const [notice, setNotice] = useState(null);                   // { id, tone, text } — notification result for a just-created entry
  const [draftTick, setDraftTick] = useState(0);                // re-read localStorage after a discard

  const put = (entry) => onEntries((prev) => [entry, ...prev.filter((x) => x.id !== entry.id)].sort(byEntryDesc));
  const current = mode.id ? entries.find((x) => x.id === mode.id) : null;

  // ── edit ──
  if (mode.view === "edit") {
    const saved = current || null;
    const draft = loadDraft(saved ? saved.id : "new");
    const initial = draft ? { ...(saved || {}), ...draft, mentorPulse: saved?.mentorPulse || {}, mentorComments: saved?.mentorComments || [] } : saved ? { ...saved } : newEntry();
    const onSave = async (entry) => {
      if (saved && contentHash(entry) === contentHash(saved)) { clearDraft(saved.id); setMode({ view: "entry", id: saved.id }); return true; }
      const ok = await saveJournalEntry(entry, { isNew: !saved });
      if (!ok) return false;
      clearDraft(saved ? saved.id : "new");
      put({ ...entry, mentorPulse: saved?.mentorPulse || {}, mentorComments: saved?.mentorComments || [] });
      setMode({ view: "entry", id: entry.id });
      if (!saved) {
        // Only once the row exists (the old app mailed mentors before the write had been answered).
        setNotice({ id: entry.id, tone: C.dim, text: "Saved. Notifying your mentors…" });
        const { subject, body } = notificationFor(entry, typeof window !== "undefined" ? window.location.origin : "");
        const r = await notifyMentors(subject, body);
        setNotice({ id: entry.id, ...(r.ok && r.sent > 0 ? { tone: C.green, text: `Saved. Email sent to ${r.sent} mentor${r.sent > 1 ? "s" : ""}.` } : { tone: C.amber, text: `Saved — but no notification email went out${r.error ? ` (${r.error})` : r.ok ? " (no mentor profile has an email)" : ""}.`, retry: { subject, body } }) });
      }
      return true;
    };
    return <JournalEntryForm key={`${saved?.id || "new"}:${draftTick}`} initial={initial} saved={saved} restored={!!draft} themes={themes} typeColumn={journal.typeColumn}
      recipients={notifyRecipients(config?._MENTOR_PROFILES)} onSave={onSave}
      onBack={() => setMode(saved ? { view: "entry", id: saved.id } : { view: "list" })}
      onDiscard={() => { setDraftTick((n) => n + 1); setMode(saved ? { view: "entry", id: saved.id } : { view: "list" }); }} />;
  }

  // ── one entry ──
  if (mode.view === "entry" && current) {
    const e = current;
    const type = e.typeKnown ? ENTRY_TYPES[e.entryType] : null;
    const res = e.resourceId ? resourceById(e.resourceId) : null;
    const tagged = themes.filter((t) => (e.themeIds || []).includes(t.id));
    return (
      <div>
        <button onClick={() => setMode({ view: "list" })} style={back}>← Back</button>
        {notice?.id === e.id && (
          <div style={{ fontSize: 12, color: notice.tone, marginBottom: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span>{notice.text}</span>
            {notice.retry && <button onClick={async () => { const rt = notice.retry; setNotice({ id: e.id, tone: C.dim, text: "Sending…" }); const r = await notifyMentors(rt.subject, rt.body); setNotice({ id: e.id, ...(r.ok && r.sent > 0 ? { tone: C.green, text: `Email sent to ${r.sent} mentor${r.sent > 1 ? "s" : ""}.` } : { tone: C.amber, text: `Still not sent${r.error ? ` (${r.error})` : ""}.`, retry: rt }) }); }} style={{ background: "none", border: `1px solid ${C.amber}60`, borderRadius: 5, color: C.amber, fontSize: 12, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit" }}>Send again</button>}
          </div>
        )}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.muted }}>{type ? `${type.icon} ${type.label} · ` : ""}{meta(e, true)}</div>
            {!isMentor && <button onClick={() => setMode({ view: "edit", id: e.id })} style={{ padding: "4px 10px", borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: C.muted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>{loadDraft(e.id) ? "Edit (unsaved changes)" : "Edit"}</button>}
          </div>
          {activePrompts(e.entryType).map((p) => (String(e[p.id] || "").trim() ? (
            <div key={p.id} style={{ marginBottom: 14 }}>
              <SectionLabel>{p.label}</SectionLabel>
              <p style={{ fontSize: 15, color: C.body, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{e[p.id]}</p>
            </div>
          ) : null))}
          {e.videoUrl && <div style={{ marginBottom: 14 }}><SectionLabel>Video</SectionLabel><a href={e.videoUrl} target="_blank" rel="noreferrer" style={{ color: C.blue, fontSize: 14, wordBreak: "break-all" }}>{e.videoUrl}</a></div>}
          {(e.connectionTags || []).length > 0 && (
            <div style={{ marginBottom: 14 }}><SectionLabel>Connections</SectionLabel>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{e.connectionTags.map((id) => { const d = DOMAINS.find((x) => x.id === id); return d ? <Tag key={id} d={d} big /> : null; })}</div>
            </div>
          )}
          {tagged.length > 0 && <div style={{ marginBottom: res ? 14 : 0 }}><SectionLabel>Themes</SectionLabel>{tagged.map((t) => <div key={t.id} style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>“{t.question}”</div>)}</div>}
          {res && <div><SectionLabel>Inspired by</SectionLabel><div style={{ fontSize: 13, color: C.muted }}>{res.id} — {res.title}</div></div>}
        </Card>

        {!isMentor && <Challenge entry={e} themes={themes} config={config} mentorAssessments={mentorAssessments} />}
        <JournalThread entry={e} user={user} onChange={put} />

        {!isMentor && (
          <div style={{ textAlign: "right" }}>
            <button onClick={async () => {
              if (!window.confirm("Delete this entry, with its mentor feedback? This can't be undone.")) return;
              if (await deleteJournalEntry(e.id)) { clearDraft(e.id); onEntries((prev) => prev.filter((x) => x.id !== e.id)); setMode({ view: "list" }); }
              else window.alert("Couldn't delete — the Sheet didn't answer. Nothing was removed.");
            }} style={{ background: "none", border: "none", color: C.faint, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Delete entry</button>
          </div>
        )}
      </div>
    );
  }

  // ── list ──
  const newDraft = !isMentor ? loadDraft("new") : null;
  const shown = entries.filter((e) => !themeFilter || (e.themeIds || []).includes(themeFilter));
  const fchip = (on) => ({ padding: "4px 10px", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", background: on ? "rgba(224,120,48,0.1)" : "rgba(255,255,255,0.02)", border: `1px solid ${on ? "rgba(224,120,48,0.3)" : "rgba(255,255,255,0.05)"}`, color: on ? C.amber : C.muted });
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: C.muted }}>{isMentor ? "Mark's reflections. Open one to mark how deep the thinking goes and to coach him on it." : "Capture your development — coaching, skiing, clinics, feedback, study."}</div>
        {!isMentor && <Button tone={C.amber} onClick={() => setMode({ view: "edit", id: null })} style={{ padding: "7px 14px", whiteSpace: "nowrap", flexShrink: 0 }}>{newDraft ? "Continue draft" : "+ New Entry"}</Button>}
      </div>

      {!isMentor && journal.typeColumn === false && (
        <Card style={{ borderLeft: `3px solid ${C.amber}`, padding: "10px 12px" }}>
          <div style={{ fontSize: 13, color: C.amber, fontWeight: 700, marginBottom: 2 }}>Entry types are not being saved</div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>The <b>Journal</b> tab of the Google Sheet has no <b>entryType</b> column, and the Apps Script only writes columns that exist — so the old app never stored a type either (every saved entry reloads as On-Hill Coaching). Fix: in the Sheet, type <b>entryType</b> into the first empty cell of row 1 on the Journal tab. No code or redeploy needed; then set the type on existing entries with Edit.</div>
        </Card>
      )}

      {activeThemes.length > 0 && entries.length > 0 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
          <button onClick={() => setThemeFilter(null)} style={fchip(!themeFilter)}>All</button>
          {activeThemes.map((t) => <button key={t.id} title={t.question} onClick={() => setThemeFilter(t.id)} style={fchip(themeFilter === t.id)}>{t.question.length > 30 ? `${t.question.slice(0, 30)}…` : t.question}</button>)}
        </div>
      )}

      {shown.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.4 }}>📓</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.muted }}>{!loaded ? "Loading the journal from the Sheet…" : entries.length ? "No reflections tagged with this theme" : "No reflections yet"}</div>
          {loaded && !entries.length && <div style={{ fontSize: 14, color: C.faint, marginTop: 4 }}>{isMentor ? "Mark hasn't written any yet." : "After your next on-snow session, come here and reflect on what happened."}</div>}
        </div>
      )}

      {shown.map((e) => {
        const depth = topDepth(e), s = listSummary(e), n = (e.mentorComments || []).length;
        const type = e.typeKnown ? ENTRY_TYPES[e.entryType] : null;
        const needsMe = isMentor && !e.mentorPulse?.[user.key];
        return (
          <div key={e.id} role="button" tabIndex={0} onClick={() => setMode({ view: "entry", id: e.id })} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setMode({ view: "entry", id: e.id }); } }} style={{ cursor: "pointer" }}>
            <Card style={{ borderLeft: `3px solid ${depth ? depth.color : "rgba(255,255,255,0.06)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{type ? `${type.icon} ${type.label} · ` : ""}{meta(e)}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.body, lineHeight: 1.4, overflowWrap: "anywhere" }}>{s.title}</div>
                  {s.more && <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.45, marginTop: 3, overflowWrap: "anywhere" }}>{s.moreLabel && <span style={{ color: C.dim }}>{s.moreLabel} </span>}{s.more}</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                  {depth && <span title={`${USERS[depth.who]?.name || depth.who}${depth.count > 1 ? ` (highest of ${depth.count})` : ""}`} style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: `${depth.color}15`, border: `1px solid ${depth.color}30`, color: depth.color }}>{depth.icon} {depth.label}</span>}
                  {needsMe && <span style={{ fontSize: 10, fontWeight: 700, color: C.amber }}>Needs your read</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                {(e.connectionTags || []).map((id) => { const d = DOMAINS.find((x) => x.id === id); return d ? <Tag key={id} d={d} /> : null; })}
                {n > 0 && <span style={{ fontSize: 10, color: C.green }}>💬 {n}</span>}
                {e.videoUrl && <span style={{ fontSize: 10, color: C.blue }}>🎥</span>}
                {!isMentor && loadDraft(e.id) && <span style={{ fontSize: 10, color: C.amber }}>unsaved edit</span>}
              </div>
            </Card>
          </div>
        );
      })}
    </>
  );
}

function Challenge({ entry, themes, config, mentorAssessments }) {
  const [reply, setReply] = useState(() => loadChallenge(entry)?.text || "");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    let coachNotes = {}; try { coachNotes = config?._COACH_NOTES ? JSON.parse(config._COACH_NOTES) : {}; } catch { /* none */ }
    const system = buildChallengeSystem(entry, { mentorAssessments, coachNotes, themes, users: USERS });
    const labels = (entry.connectionTags || []).map((id) => DOMAINS.find((d) => d.id === id)?.label).filter(Boolean);
    const text = await callClaude([{ role: "user", content: challengeUserMessage(entry, { typeLabel: ENTRY_TYPES[entry.entryType]?.label || "Journal entry", reflection: reflectionText(entry), connectionLabels: labels }) }], system, { max_tokens: 900 });
    const failed = /^(Error:|Unable to reach|No response\.)/.test(text);
    setReply(text); if (!failed) saveChallenge(entry, text);
    setBusy(false);
  };
  return (
    <Card style={{ borderLeft: `3px solid ${C.purple}` }}>
      <Button tone={C.purple} disabled={busy} onClick={run} style={{ width: "100%", padding: "10px 16px" }}>{busy ? "Thinking…" : reply ? "🧠 Challenge me again" : "🧠 Challenge My Thinking"}</Button>
      {reply && (
        <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 8, background: "rgba(192,96,160,0.04)", border: "1px solid rgba(192,96,160,0.1)" }}>
          <div style={{ fontSize: 14, color: C.body, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{reply}<SpeakButton text={reply} /></div>
          <Hint style={{ marginTop: 6 }}>AI challenge — not a mentor's view, and not saved to the Sheet. Kept on this device until you edit the entry.</Hint>
        </div>
      )}
    </Card>
  );
}
