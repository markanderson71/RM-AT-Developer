// Examiner Sparring (§13 row 11, built in session 9): Mark presents an MA; a strict examiner probes one question at a
// time in Chris's register, tags each probe with the form line it targets (hidden until the end), and ends with
// "OK, thank you." Then two examiners debrief — one holds the form, one holds Chris's register — labelled AI. Scored
// by the same two-step scorer; saved to MA History as type `examiner_sparring`.
import React, { useEffect, useRef, useState } from "react";
import { C } from "../theme.js";
import { Button, Composer, Field, Hint, Input, Select, Textarea, Thread, speakText } from "../components/index.jsx";
import { callClaude, saveMaSession, chrisStatements } from "../api.js";
import { USERS } from "../lib/users.js";
import { bestAttempt, LINE_LABEL } from "../lib/scorecard.js";
import { parseExaminerReply } from "../lib/prompts.js";
import { EXAMINER_SPARRING_SYSTEM, sparringOpening, DEBRIEF_FORM_SYSTEM, DEBRIEF_CHRIS_SYSTEM, debriefUser } from "../lib/sparringPrompts.js";
import { freshSparring, sparringEmpty, sparringSession, sparringScoringSession, sparringTranscript, probesOver, probedLines, loadMode, persistMode } from "../lib/sparring.js";
import { loadIdpTasks, atTasks, findTask, renderTask } from "../lib/idp.js";
import { hashOf } from "../lib/exam.js";
import { useScoreRun, ScoreResult } from "./ScoreRun.jsx";

const TONE = C.examiner;
const MAX_Q = 4;

export default function ExaminerSparring({ mentorAssessments, onSaved }) {
  const [sp, setSp] = useState(() => loadMode("examiner", freshSparring));
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(false);
  const { run, step, busy } = useScoreRun();
  const ref = useRef(sp); ref.current = sp;
  useEffect(() => persistMode("examiner", sp, sparringEmpty), [sp]);
  useEffect(() => { loadIdpTasks().then((t) => setTasks(atTasks(t))).catch(() => {}); }, []);
  const upd = (p) => setSp((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) }));
  const say = (t) => { if (autoSpeak) speakText(t); };

  const opening = () => sparringOpening({ ...ref.current, taskText: renderTask(findTask(tasks, ref.current.activity)), mentorAssessments, users: USERS, chrisChunks: ref.current.chris });
  const begin = async () => {
    setLoading(true);
    const chris = await chrisStatements(ref.current.presentation);
    upd({ chris, phase: "probe" });
    const raw = await callClaude([{ role: "user", content: opening() }], EXAMINER_SPARRING_SYSTEM);
    const { line, text } = parseExaminerReply(raw);
    upd({ probes: [{ role: "assistant", content: text, line }] }); setLoading(false); say(text);
  };
  const answer = async (t) => {
    const msgs = [...ref.current.probes, { role: "user", content: t }];
    upd((s) => ({ probes: msgs, drafts: { ...s.drafts, probe: "" } }));
    if (msgs.filter((m) => m.role === "user").length >= MAX_Q) { upd({ probes: [...msgs, { role: "assistant", content: "OK, thank you." }] }); say("OK, thank you."); return; }
    setLoading(true);
    const raw = await callClaude([{ role: "user", content: opening() }, ...msgs.map((m) => ({ role: m.role, content: m.content }))], EXAMINER_SPARRING_SYSTEM);
    const { line, text } = parseExaminerReply(raw);
    upd({ probes: [...msgs, { role: "assistant", content: text, line }] }); setLoading(false); say(text);
  };
  const debrief = async () => {
    setLoading(true);
    const user = debriefUser({ transcript: sparringTranscript(ref.current), chrisChunks: ref.current.chris });
    const [form, chris] = await Promise.all([callClaude([{ role: "user", content: user }], DEBRIEF_FORM_SYSTEM, { max_tokens: 600 }), callClaude([{ role: "user", content: user }], DEBRIEF_CHRIS_SYSTEM, { max_tokens: 600 })]);
    upd({ debrief: { form, chris }, phase: "debrief" }); setLoading(false);
  };
  const score = async () => { const a = await run(sparringScoringSession(ref.current), ref.current.savedId); upd((s) => ({ attempts: [...s.attempts.filter((x) => !x.failed), a] })); };
  const save = async () => {
    const s = sparringSession(ref.current, { bestAttempt });
    const h = hashOf({ t: s.transcript, a: ref.current.attempts });
    if (ref.current.savedHash === h) { setSaveMsg("Already saved."); return; }
    setSaveMsg("Saving…");
    const ok = await saveMaSession(s);
    if (ok) { upd({ savedId: s.id, savedHash: h }); onSaved?.(s); setSaveMsg(`Saved to MA History as ${s.date} · Examiner Sparring.`); } else setSaveMsg("Save failed — everything is still here.");
  };
  const reset = () => { if (sparringEmpty(sp) || sp.savedHash || confirm("Start a new sparring session? This one isn't saved.")) { setSp(freshSparring()); setSaveMsg(""); } };
  const last = sp.attempts[sp.attempts.length - 1];
  const lines = probedLines(sp.probes);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}><input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} style={{ accentColor: C.orange }} /> Read the examiner aloud</label>
        {sp.phase !== "setup" && <Button tone={TONE} onClick={reset} disabled={loading || busy} style={{ padding: "4px 10px", fontSize: 12 }}>＋ New session</Button>}
      </div>
      {sp.phase === "setup" && (<>
        <Hint style={{ marginBottom: 8, lineHeight: 1.5 }}>Present your MA as you would to the examiner — the run you watched (real or from a video), by phase, the cause, the comparison, the ideal, equipment, the prescription and why. Then the questions start. No peer in this mode.</Hint>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
          <Field label="Who"><Select value={sp.who} onChange={(e) => upd({ who: e.target.value })}><option value="">Select level…</option><option>Weak L3 candidate</option><option>Solid L3 candidate</option><option>Strong L3 candidate</option><option>Advanced AT candidate</option></Select></Field>
          <Field label="Task"><Input list="idp-tasks" value={sp.activity} onChange={(e) => upd({ activity: e.target.value })} placeholder="IDP task or free text" /><datalist id="idp-tasks">{tasks.map((t) => <option key={t.name} value={t.name} />)}</datalist></Field>
          <Field label="Conditions"><Input value={sp.conditions} onChange={(e) => upd({ conditions: e.target.value })} placeholder="e.g., firm groomed blue" /></Field>
        </div>
        <Field label="Your presentation"><Textarea value={sp.presentation} onChange={(v) => upd({ presentation: v })} style={{ minHeight: 170, fontSize: 14, lineHeight: 1.7 }} placeholder="What you saw by phase — ski and body… the cascade and the how… what she intended and what the task asks… the ideal… equipment in this snow… the prescription and the one reason." /></Field>
        <Button tone={TONE} disabled={!sp.presentation.trim() || !sp.who || loading} onClick={begin} style={{ width: "100%" }}>{loading ? "Examiner reading…" : "Submit to the examiner"}</Button>
      </>)}
      {sp.phase !== "setup" && (<>
        <details style={{ marginBottom: 8 }}><summary style={{ fontSize: 11, color: C.dim, cursor: "pointer" }}>Your presentation</summary><div style={{ fontSize: 12, color: C.body, whiteSpace: "pre-wrap", padding: "6px 8px", marginTop: 4, background: "rgba(255,255,255,0.02)", borderRadius: 5, maxHeight: 200, overflowY: "auto" }}>{sp.presentation}</div></details>
        <Thread messages={sp.probes} me={C.mark} them={TONE} meLabel="Mark" themLabel="Examiner" loading={loading && sp.phase === "probe"} loadingText="Examiner thinking…" maxHeight={320} />
        {sp.phase === "probe" && !probesOver(sp.probes) && <Composer value={sp.drafts.probe} onChange={(v) => upd((s) => ({ drafts: { ...s.drafts, probe: v } }))} onSend={answer} disabled={loading} tone={TONE} sendLabel="Answer" placeholder="Answer the examiner…" />}
        {probesOver(sp.probes) && sp.phase === "probe" && (<>
          <Hint style={{ color: TONE, marginBottom: 6 }}>"OK, thank you." — that's the end of the exam. {lines.length ? `The examiner was probing: ${lines.map((l) => LINE_LABEL[l]).join(", ")}.` : ""}</Hint>
          <Button tone={C.purple} disabled={loading} onClick={debrief} style={{ width: "100%" }}>{loading ? "Two examiners conferring…" : "Debrief — two examiners"}</Button>
        </>)}
        {sp.phase === "debrief" && sp.debrief && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, marginBottom: 4 }}>DEBRIEF · AI — two readings of the same transcript, not Chris's words{lines.length ? ` · probed: ${lines.map((l) => LINE_LABEL[l]).join(", ")}` : ""}</div>
            <Voice label="Examiner A — holds the form" color={C.blue} text={sp.debrief.form} />
            <Voice label="Examiner B — Chris's register" color={C.examiner} text={sp.debrief.chris} />
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <Button tone={C.amber} disabled={busy} onClick={score} style={{ flex: 1 }}>{busy ? "Scoring…" : last ? "Score again" : "Score this session"}</Button>
              {last && !last.failed && <Button tone={C.green} onClick={save} style={{ flex: 1 }}>Save to MA History</Button>}
            </div>
            {busy && step && <Hint style={{ marginTop: 6, color: C.amber }}>{step} Keep this tab open.</Hint>}
            <ScoreResult attempt={last} tone={TONE} onRetry={score} busy={busy} step={step} />
            {saveMsg && <Hint style={{ marginTop: 6, color: /failed/.test(saveMsg) ? C.red : C.green }}>{saveMsg}</Hint>}
          </div>
        )}
      </>)}
    </div>
  );
}

const Voice = ({ label, color, text }) => (
  <div style={{ padding: "8px 10px", borderRadius: 6, borderLeft: `3px solid ${color}`, background: `${color}08`, marginBottom: 6 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 13, color: C.body, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{text}</div>
  </div>
);
