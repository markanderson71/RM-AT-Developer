// Progress (§13 row 8). Mentor: Development Assessment (four fields, autosaved per mentor), AI-suggested assessment,
// Zoom statements to approve (§12.3), Agreement (§12.4), then the trends and recurring gaps for the sessions he has
// scored. Candidate: mentors' assessments, recurring coaching gaps across sessions, trends, agreement, pending list.
// Every number comes from scorecard() through src/lib/progress.js; a mentor's unscored sessions contribute nothing.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { C, inp } from "../theme.js";
import { Card, Hint, Button, Textarea } from "../components/index.jsx";
import { USERS, today } from "../lib/users.js";
import { callClaude, saveAssessment } from "../api.js";
import { ASSESSMENT_FIELDS, hasAssessment, parseAssessments, assessmentHash, trendRows, lineSeries, gapHistory, assessmentContext, getToken, setToken } from "../lib/progress.js";
import { ASSESSMENT_SYSTEM, buildAssessmentUser, parseAssessmentReply } from "../lib/prompts.js";
import { scoreColor } from "../components/ScoreViews.jsx";
import { MentorQuote, shortDate } from "./Rationale.jsx";
import AgreementPanel from "./AgreementPanel.jsx";
import ChunkApproval from "./ChunkApproval.jsx";

const Avatar = ({ u, size = 22 }) => <div style={{ width: size, height: size, borderRadius: "50%", background: `${u.color}20`, border: `1.5px solid ${u.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.45, fontWeight: 800, color: u.color, flexShrink: 0 }}>{u.name[0]}</div>;
const Section = ({ tone, title, children, hint }) => (
  <Card style={{ borderLeft: `3px solid ${tone}` }}>
    <div style={{ fontSize: 15, fontWeight: 700, color: tone, marginBottom: 4 }}>{title}</div>
    {hint && <Hint style={{ marginBottom: 8, lineHeight: 1.5 }}>{hint}</Hint>}
    {children}
  </Card>
);

export default function Progress({ user, maSessions, journal, config, loaded, onConfig }) {
  const isMentor = user.role === "mentor";
  const assessments = useMemo(() => parseAssessments(config?._MENTOR_ASSESSMENTS), [config]);
  const [needToken, setNeedToken] = useState(false);
  const [tokenTick, setTokenTick] = useState(0);
  const [append, setAppend] = useState(null);      // { key, text, n } — a suggested section the mentor chose to take into his field
  const onAuth = () => setNeedToken(true);

  return (
    <>
      <div style={{ fontSize: 14, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
        {isMentor ? "Your development assessment of Mark sets the bar for everything the AI does — the examiner probes where you say to probe and the scorer is calibrated against your scores. Below it: your recorded statements to approve, and how often the scorer agrees with you." : "Your mentors' assessments, the coaching gaps that keep coming back, your scores over time, and how closely the AI tracks Chris."}
      </div>
      {(needToken || !getToken()) && <TokenGate onSet={() => { setNeedToken(false); setTokenTick((n) => n + 1); }} required={needToken} />}

      {isMentor
        ? <AssessmentForm user={user} mine={assessments[user.key] || {}} append={append} onSaved={(all) => onConfig?.({ _MENTOR_ASSESSMENTS: JSON.stringify(all) })} />
        : <AssessmentsRead assessments={assessments} loaded={loaded} />}
      {isMentor && <AiAnalysis user={user} sessions={maSessions} entries={journal?.entries || []} mine={assessments[user.key] || {}} onUse={(key, text) => setAppend((a) => ({ key, text, n: (a?.n || 0) + 1 }))} />}
      {isMentor && <ChunkApproval key={`a${tokenTick}`} viewer={user} onAuth={onAuth} />}
      {!isMentor && <RecurringGaps sessions={maSessions} viewer={user} />}
      <Trends sessions={maSessions} viewer={user} />
      {isMentor && <RecurringGaps sessions={maSessions} viewer={user} />}
      <AgreementPanel key={`g${tokenTick}`} viewer={user} onAuth={onAuth} />
      {!isMentor && <ChunkApproval key={`c${tokenTick}`} viewer={user} onAuth={onAuth} />}
    </>
  );
}

// ── access code (session 8 auth) ─────────────────────────────────────────────────────────────────────────────────────
function TokenGate({ onSet, required }) {
  const [v, setV] = useState(getToken());
  const [open, setOpen] = useState(required);
  if (!open) return <div style={{ marginBottom: 8 }}><button type="button" onClick={() => setOpen(true)} style={{ background: "none", border: "none", color: C.dim, fontSize: 11, cursor: "pointer", padding: 0 }}>{getToken() ? "access code set — change" : "no access code set"}</button></div>;
  return (
    <Card style={{ borderLeft: `3px solid ${C.orange}`, padding: "10px 14px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.orange }}>{required ? "Access code needed" : "Mentor access code"}</div>
      <Hint style={{ margin: "2px 0 6px" }}>Approving statements and reading agreement need the code Mark set on the server. It is kept in this browser only.</Hint>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="password" value={v} onChange={(e) => setV(e.target.value)} placeholder="access code" style={{ ...inp, maxWidth: 220 }} onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { setToken(v.trim()); onSet(); setOpen(false); } }} />
        <Button tone={C.orange} disabled={!v.trim()} onClick={() => { setToken(v.trim()); onSet(); setOpen(false); }} style={{ padding: "6px 12px", fontSize: 12 }}>Use it</Button>
        {!required && <button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: C.dim, fontSize: 12, cursor: "pointer" }}>later</button>}
      </div>
    </Card>
  );
}

// ── Development Assessment ───────────────────────────────────────────────────────────────────────────────────────────
function AssessmentForm({ user, mine, append, onSaved }) {
  const [fields, setFields] = useState(() => Object.fromEntries(ASSESSMENT_FIELDS.map((f) => [f.key, mine[f.key] || ""])));
  const [status, setStatus] = useState({ kind: "", text: mine.lastUpdated ? `Last updated ${mine.lastUpdated}` : "" });
  const savedHash = useRef(assessmentHash(mine));
  const timer = useRef(null);
  // A change elsewhere (another device) is taken only while nothing is being typed here.
  useEffect(() => { if (assessmentHash(mine) !== savedHash.current && !timer.current) { setFields(Object.fromEntries(ASSESSMENT_FIELDS.map((f) => [f.key, mine[f.key] || ""]))); savedHash.current = assessmentHash(mine); } }, [mine]);
  const save = async (f) => {
    timer.current = null;
    if (assessmentHash(f) === savedHash.current) return;   // no change → no write (harvested hash-diff rule)
    setStatus({ kind: "busy", text: "Saving…" });
    const { ok, reason, all } = await saveAssessment(user.key, f, today());
    if (ok) { savedHash.current = assessmentHash(f); setStatus({ kind: "ok", text: `Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` }); onSaved(all); }
    else setStatus({ kind: "err", text: reason === "unreachable" ? "Couldn't reach the store — your text is still here; it will save on the next change." : "Save failed — try again." });
  };
  const change = (key, v) => { const f = { ...fields, [key]: v }; setFields(f); clearTimeout(timer.current); timer.current = setTimeout(() => save(f), 1500); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (append) change(append.key, fields[append.key]?.trim() ? `${fields[append.key].trim()}\n\n${append.text}` : append.text); }, [append?.n]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Section tone={C.green} title="Your Development Assessment of Mark" hint="Autosaves as you type. Each mentor's fields are saved separately, so nobody overwrites anybody. The fourth field is new: where you want him pushed, and what you'd accept as done.">
      {ASSESSMENT_FIELDS.map((f) => (
        <div key={f.key} style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: f.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>{f.label}</label>
          <Textarea value={fields[f.key]} onChange={(v) => change(f.key, v)} placeholder={f.placeholder} style={{ minHeight: f.key === "challenge" ? 70 : 50, fontSize: 13 }} />
        </div>
      ))}
      <div style={{ fontSize: 10, color: status.kind === "err" ? C.red : status.kind === "ok" ? C.green : C.dim }}>{status.text || "Nothing saved yet."}</div>
    </Section>
  );
}

function AssessmentsRead({ assessments, loaded }) {
  const list = Object.entries(assessments).filter(([, a]) => hasAssessment(a));
  return (
    <Section tone={C.green} title="Mentor Development Assessments" hint={list.length ? "Read by the AI examiner every time you practise, and by the scorer as its bar." : null}>
      {!list.length && <div style={{ fontSize: 13, color: C.muted }}>{loaded ? "No assessments yet — your mentors will add theirs here." : "Loading…"}</div>}
      {list.map(([key, a]) => {
        const u = USERS[key] || { name: key, color: C.muted };
        return (
          <div key={key} style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 8, background: `${u.color}06`, border: `1px solid ${u.color}12` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><Avatar u={u} /><span style={{ fontSize: 14, fontWeight: 700, color: u.color }}>{u.name}</span>{a.lastUpdated && <span style={{ fontSize: 10, color: C.dim }}>Updated {a.lastUpdated}</span>}</div>
            {ASSESSMENT_FIELDS.filter((f) => String(a[f.key] || "").trim()).map((f) => (
              <div key={f.key} style={{ marginBottom: 4 }}><span style={{ fontSize: 10, fontWeight: 700, color: f.color, textTransform: "uppercase" }}>{f.label}: </span><span style={{ fontSize: 13, color: C.body, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{a[f.key]}</span></div>
            ))}
          </div>
        );
      })}
    </Section>
  );
}

// ── AI analysis (mentor) ─────────────────────────────────────────────────────────────────────────────────────────────
function AiAnalysis({ user, sessions, entries, mine, onUse }) {
  const [busy, setBusy] = useState(false); const [text, setText] = useState("");
  const parsed = useMemo(() => parseAssessmentReply(text), [text]);
  const run = async () => {
    setBusy(true); setText("");
    const ctx = assessmentContext({ sessions, entries, viewer: user, assessment: mine, users: USERS });
    const r = await callClaude([{ role: "user", content: buildAssessmentUser({ ...ctx, mentorName: user.name }) }], ASSESSMENT_SYSTEM, { max_tokens: 1500 });
    setText(r); setBusy(false);
  };
  const sealedN = sessions.filter((s) => s.summarySealed).length;
  return (
    <Section tone={C.purple} title="AI analysis of Mark's development" hint={`A suggested assessment from his sessions, your scores and comments, and his journal. It reads no AI score on a session you haven't scored yet${sealedN ? ` (${sealedN} withheld)` : ""}. You are the ground truth — take what resonates into the fields above, in your words.`}>
      <Button tone={C.purple} disabled={busy || (!sessions.length && !entries.length)} onClick={run} style={{ width: "100%" }}>{busy ? "Reading his sessions and reflections…" : text ? "Suggest again" : "Suggest an assessment"}</Button>
      {text && (
        <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 8, background: "rgba(192,96,160,0.04)", border: "1px solid rgba(192,96,160,0.1)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.purple, textTransform: "uppercase", marginBottom: 6 }}>AI suggested assessment</div>
          {Object.keys(parsed).length ? ASSESSMENT_FIELDS.filter((f) => parsed[f.key]).map((f) => (
            <div key={f.key} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}><span style={{ fontSize: 10, fontWeight: 700, color: f.color, textTransform: "uppercase" }}>{f.label}</span><button type="button" onClick={() => onUse(f.key, parsed[f.key])} style={{ background: "none", border: `1px solid ${f.color}40`, borderRadius: 4, color: f.color, fontSize: 10, fontWeight: 700, cursor: "pointer", padding: "1px 7px", fontFamily: "inherit" }}>append to my field</button></div>
              <div style={{ fontSize: 13, color: C.body, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{parsed[f.key]}</div>
            </div>
          )) : <div style={{ fontSize: 13, color: C.body, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{text}</div>}
          <Hint style={{ marginTop: 6 }}>Suggestion only. Nothing is saved until it is in your fields.</Hint>
        </div>
      )}
    </Section>
  );
}

// ── Trends ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function Trends({ sessions, viewer }) {
  const t = useMemo(() => trendRows(sessions, viewer), [sessions, viewer]);
  const series = useMemo(() => lineSeries(t.rows, "chris"), [t.rows]);
  const isMentor = viewer.role === "mentor";
  return (
    <Section tone={C.amber} title="Scores over time — 2026 form" hint={`${t.rows.length} session${t.rows.length === 1 ? "" : "s"} on the six exam lines, oldest first. Chris's number sits under the AI's where he has scored the session.${t.sealed ? ` ${t.sealed} session${t.sealed === 1 ? "" : "s"} you haven't scored yet ${t.sealed === 1 ? "is" : "are"} not shown.` : ""}${t.legacy.length ? ` ${t.legacy.length} old-scorer session${t.legacy.length === 1 ? "" : "s"} listed separately below — never mixed in.` : ""}`}>
      {!t.rows.length && <div style={{ fontSize: 13, color: C.muted }}>{isMentor && t.sealed ? "Score a session in MA History and it appears here." : "No session scored on the 2026 form yet."}</div>}
      {t.rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 460 }}>
            <thead><tr style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <th style={th}>Line</th>{t.rows.map((r) => <th key={r.id} style={{ ...th, textAlign: "center" }} title={r.label}>{shortDate(r.date) || r.id}</th>)}
            </tr></thead>
            <tbody>
              {series.map((l) => (
                <tr key={l.key} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={td}><b style={{ color: C.body }}>{l.label}</b></td>
                  {l.ai.map((v, i) => <td key={i} style={{ ...td, textAlign: "center" }}><span style={{ fontSize: 16, fontWeight: 800, color: scoreColor(v) }}>{v ?? "—"}</span>{l.mentor[i] != null && <div style={{ fontSize: 10, color: scoreColor(l.mentor[i]) }}>Chris {l.mentor[i]}</div>}</td>)}
                </tr>
              ))}
              <tr style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <td style={td}><b style={{ color: C.muted }}>MA / TU · result</b></td>
                {t.rows.map((r) => <td key={r.id} style={{ ...td, textAlign: "center", fontSize: 11 }}>{r.sections?.ma ?? "—"} / {r.sections?.tu ?? "—"}<div style={{ fontSize: 10, fontWeight: 700, color: r.meets == null ? C.dim : r.meets ? C.green : C.red }}>{r.meets == null ? "—" : r.meets ? "Meets" : "Does not"}</div></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {t.legacy.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 11, color: C.orange, cursor: "pointer" }}>{t.legacy.length} session{t.legacy.length === 1 ? "" : "s"} scored by the old scorer (pre-2026 lines, ran 1–2 high — history only)</summary>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{t.legacy.map((r) => <div key={r.id}>{shortDate(r.date) || r.id} — {r.label}: {Object.entries(r.lines).map(([k, v]) => `${k.slice(0, 4)} ${v ?? "—"}`).join(" · ")}</div>)}</div>
        </details>
      )}
    </Section>
  );
}
const th = { textAlign: "left", padding: "4px 8px", fontWeight: 700 };
const td = { padding: "5px 8px", color: C.muted, whiteSpace: "nowrap" };

// ── Recurring coaching gaps ──────────────────────────────────────────────────────────────────────────────────────────
function RecurringGaps({ sessions, viewer }) {
  const g = useMemo(() => gapHistory(sessions, viewer), [sessions, viewer]);
  const isMentor = viewer.role === "mentor";
  const shown = g.lines.filter((l) => l.items.length);
  return (
    <Section tone={C.orange} title="Recurring coaching gaps" hint={`The evaluator's one move per line, across ${g.sessions} session${g.sessions === 1 ? "" : "s"}, lowest line first. A line that comes back is what to fix before the next exam.${g.sealed ? ` ${g.sealed} session${g.sealed === 1 ? "" : "s"} you haven't scored ${g.sealed === 1 ? "is" : "are"} not shown.` : ""} AI suggestions — not Chris's words; his quoted statement sits under each.`}>
      {!shown.length && <div style={{ fontSize: 13, color: C.muted }}>{isMentor && g.sealed ? "Score a session and its coaching lines appear here." : "No coaching lines yet — score a session on the 2026 form."}</div>}
      {shown.map((l) => (
        <details key={l.key} open={l.recurs} style={{ padding: "6px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <summary style={{ cursor: "pointer", fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ color: scoreColor(l.avg == null ? null : Math.round(l.avg)) }}>{l.label}</b>
            <span style={{ fontSize: 11, color: C.muted }}>avg {l.avg ?? "—"} · {l.items.length} session{l.items.length === 1 ? "" : "s"}</span>
            {l.recurs && <span style={{ fontSize: 10, fontWeight: 700, color: l.same ? C.red : C.orange, border: `1px solid ${l.same ? C.red : C.orange}40`, borderRadius: 4, padding: "1px 6px" }}>{l.same ? "same gap every time" : "recurs"}</span>}
            {l.theme.length > 0 && <span style={{ fontSize: 10, color: C.dim }}>keeps coming back to: {l.theme.join(", ")}</span>}
          </summary>
          {l.items.map((it) => (
            <div key={it.sessionId} style={{ margin: "6px 0 0 8px", fontSize: 12, lineHeight: 1.55 }}>
              <div style={{ color: C.muted }}><b style={{ color: C.body }}>{shortDate(it.date) || it.sessionId}</b> · {it.label} · AI <b style={{ color: scoreColor(it.score) }}>{it.score ?? "—"}</b>{it.mentor != null && <> · Chris <b style={{ color: scoreColor(it.mentor) }}>{it.mentor}</b></>}</div>
              {it.gap.say ? <div><span style={{ color: C.amber, fontWeight: 700 }}>Say: </span><span style={{ color: C.body }}>“{it.gap.say}”</span>{it.gap.because && <span style={{ color: C.muted }}> — because {it.gap.because}.</span>}</div> : <div style={{ color: C.body }}>{it.gap.raw}</div>}
              {it.cite && <MentorQuote c={it.cite} />}
            </div>
          ))}
        </details>
      ))}
    </Section>
  );
}
