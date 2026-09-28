// Written MA (session 9): write a full analysis of a video or a generated scenario → the examiner questions it (single
// audience, target line tagged) → the two-step scorer scores it → save to MA History as type `written`.
import React, { useEffect, useRef, useState } from "react";
import { C } from "../theme.js";
import { Button, Composer, Field, Hint, Input, Textarea, Thread, speakText } from "../components/index.jsx";
import { callClaude, saveMaSession, chrisStatements } from "../api.js";
import { USERS } from "../lib/users.js";
import { bestAttempt, LINE_LABEL } from "../lib/scorecard.js";
import { mentorGapsBlock, examinerExemplarsBlock, parseExaminerReply } from "../lib/prompts.js";
import { SCENARIO_SYSTEM, WRITTEN_EXAMINER_SYSTEM } from "../lib/sparringPrompts.js";
import { freshWritten, writtenEmpty, writtenSession, writtenScoringSession, loadMode, persistMode, probesOver } from "../lib/sparring.js";
import { hashOf, YT_RE } from "../lib/exam.js";
import { useScoreRun, ScoreResult } from "./ScoreRun.jsx";

const TONE = "#a0a0d0";
const MAX_Q = 4;

export default function WrittenMA({ mentorAssessments, onSaved }) {
  const [w, setW] = useState(() => loadMode("writtenma", freshWritten));
  const [loading, setLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const { run, step, busy } = useScoreRun();
  const ref = useRef(w); ref.current = w;
  useEffect(() => persistMode("writtenma", w, writtenEmpty), [w]);
  const upd = (p) => setW((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) }));

  const generate = async () => {
    setLoading(true);
    const resp = await callClaude([{ role: "user", content: "Generate a scenario for a written MA: an instructor, their level, the task, terrain and snow, what they said they were working on, and what their skiing looked like by phase. One paragraph. No diagnosis." }], `${SCENARIO_SYSTEM}${mentorGapsBlock(mentorAssessments, USERS)}`);
    upd({ scenario: resp, phase: "write" }); setLoading(false);
  };
  const opening = (chris) => `${ref.current.scenario ? `SCENARIO:\n${ref.current.scenario}\n\n` : ""}Subject: ${ref.current.who || "unknown"} · Task: ${ref.current.activity || "unknown"} · Conditions: ${ref.current.conditions || "not stated"}\n\nMARK'S WRITTEN ANALYSIS:\n${ref.current.text}${mentorGapsBlock(mentorAssessments, USERS)}${examinerExemplarsBlock(chris)}\n\nAsk your first question.`;
  const submit = async () => {
    setLoading(true);
    const chris = await chrisStatements(ref.current.text);
    const raw = await callClaude([{ role: "user", content: opening(chris) }], WRITTEN_EXAMINER_SYSTEM);
    const { line, text } = parseExaminerReply(raw);
    upd({ phase: "qa", qa: [{ role: "assistant", content: text, line }], chris }); setLoading(false);
  };
  const answer = async (t) => {
    const msgs = [...ref.current.qa, { role: "user", content: t }];
    upd((s) => ({ qa: msgs, drafts: { ...s.drafts, qa: "" } }));
    if (msgs.filter((m) => m.role === "user").length >= MAX_Q) { upd({ qa: [...msgs, { role: "assistant", content: "OK, thank you." }] }); return; }
    setLoading(true);
    const raw = await callClaude([{ role: "user", content: opening(ref.current.chris) }, ...msgs.map((m) => ({ role: m.role, content: m.content }))], WRITTEN_EXAMINER_SYSTEM);
    const { line, text } = parseExaminerReply(raw);
    upd({ qa: [...msgs, { role: "assistant", content: text, line }] }); setLoading(false);
  };
  const score = async () => { const a = await run(writtenScoringSession(ref.current), ref.current.savedId); upd((s) => ({ phase: "scored", attempts: [...s.attempts.filter((x) => !x.failed), a] })); };
  const save = async () => {
    const s = writtenSession(ref.current, { bestAttempt });
    const h = hashOf({ t: s.transcript, a: ref.current.attempts });
    if (ref.current.savedHash === h) { setSaveMsg("Already saved."); return; }
    setSaveMsg("Saving…");
    const ok = await saveMaSession(s);
    if (ok) { upd({ savedId: s.id, savedHash: h }); onSaved?.(s); setSaveMsg(`Saved to MA History as ${s.date} · Written MA.`); } else setSaveMsg("Save failed — everything is still here.");
  };
  const reset = () => { if (writtenEmpty(w) || w.savedHash || confirm("Start a new written MA? This one isn't saved.")) { setW(freshWritten()); setSaveMsg(""); } };
  const ytId = (w.videoUrl || "").match(YT_RE)?.[1];
  const last = w.attempts[w.attempts.length - 1];

  return (
    <div>
      {w.phase !== "setup" && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}><Button tone={TONE} onClick={reset} disabled={loading || busy} style={{ padding: "4px 10px", fontSize: 12 }}>＋ New written MA</Button></div>}
      {w.phase === "setup" && (<>
        <Field label="Video link (optional)"><Input value={w.videoUrl} onChange={(e) => upd({ videoUrl: e.target.value })} placeholder="YouTube or Drive link to analyze" /></Field>
        {ytId && <a href={w.videoUrl} target="_blank" rel="noreferrer" style={{ display: "block", marginBottom: 8 }}><img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" style={{ width: "100%", maxWidth: 320, borderRadius: 8 }} /></a>}
        {w.videoUrl && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}><Field label="Skier"><Input value={w.videoSkier} onChange={(e) => upd({ videoSkier: e.target.value })} placeholder="Red jacket, second from left" /></Field><Field label="Time"><Input value={w.videoTime} onChange={(e) => upd({ videoTime: e.target.value })} placeholder="0:32 – 1:15" /></Field></div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
          <Field label="Who"><Input value={w.who} onChange={(e) => upd({ who: e.target.value })} placeholder="e.g., L2 candidate" /></Field>
          <Field label="Activity"><Input value={w.activity} onChange={(e) => upd({ activity: e.target.value })} placeholder="e.g., Dynamic Short Turns" /></Field>
          <Field label="Conditions"><Input value={w.conditions} onChange={(e) => upd({ conditions: e.target.value })} placeholder="e.g., Groomed blue, firm" /></Field>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Button tone={TONE} onClick={() => upd({ phase: "write" })} style={{ flex: 1 }}>📝 Write my MA</Button>
          <Button tone={C.orange} disabled={loading} onClick={generate} style={{ flex: 1 }}>{loading ? "Generating…" : "🧩 Generate a scenario"}</Button>
        </div>
      </>)}
      {(w.phase === "write" || w.phase === "qa" || w.phase === "scored") && w.scenario && (
        <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(224,120,48,0.04)", border: "1px solid rgba(224,120,48,0.12)", marginBottom: 8 }}><div style={{ fontSize: 10, fontWeight: 700, color: C.orange }}>SCENARIO</div><div style={{ fontSize: 13, color: C.body, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{w.scenario}</div></div>
      )}
      {w.phase === "write" && (<>
        <Field label="Your MA — the full analysis, one audience (the examiner)">
          <Textarea value={w.text} onChange={(v) => upd({ text: v })} style={{ minHeight: 200, fontSize: 14, lineHeight: 1.7 }} placeholder={"By phase: what the ski did, what the body did… The cascade and the root cause, with the how… The comparison — to what they intended, and to what the task requires… The ideal for this task… Equipment on this skier in this snow… The prescription and why."} />
        </Field>
        <div style={{ display: "flex", gap: 6 }}>
          <Button tone={C.muted} onClick={() => upd({ phase: "setup" })}>Back</Button>
          <Button tone={TONE} disabled={!w.text.trim() || loading} onClick={submit} style={{ flex: 1 }}>{loading ? "Examiner reading…" : "Submit to the examiner"}</Button>
        </div>
      </>)}
      {(w.phase === "qa" || w.phase === "scored") && (<>
        <details style={{ marginBottom: 8 }}><summary style={{ fontSize: 11, color: C.dim, cursor: "pointer" }}>Your written analysis</summary><div style={{ fontSize: 12, color: C.body, whiteSpace: "pre-wrap", padding: "6px 8px", marginTop: 4, background: "rgba(255,255,255,0.02)", borderRadius: 5, maxHeight: 200, overflowY: "auto" }}>{w.text}</div></details>
        <Thread messages={w.qa} me={C.mark} them={C.examiner} meLabel="Mark" themLabel="Examiner" loading={loading} loadingText="Examiner thinking…" maxHeight={300} />
        {w.phase === "qa" && !probesOver(w.qa) && <Composer value={w.drafts.qa} onChange={(v) => upd((s) => ({ drafts: { ...s.drafts, qa: v } }))} onSend={answer} disabled={loading} tone={TONE} sendLabel="Reply" placeholder="Answer the examiner…" />}
        {probesOver(w.qa) && <Hint style={{ color: C.examiner, marginBottom: 6 }}>The examiner has finished{w.qa.some((m) => m.line) ? ` — probed: ${[...new Set(w.qa.filter((m) => m.line).map((m) => LINE_LABEL[m.line]))].join(", ")}` : ""}.</Hint>}
        {w.phase === "qa" && <div style={{ display: "flex", gap: 6 }}><Button tone={C.amber} disabled={busy || loading || w.qa.filter((m) => m.role === "user").length < 1} onClick={score} style={{ flex: 1 }}>{busy ? "Scoring…" : "Score my MA"}</Button></div>}
        {busy && step && <Hint style={{ marginTop: 6, color: C.amber }}>{step} Keep this tab open.</Hint>}
        {w.phase === "scored" && <ScoreResult attempt={last} tone={TONE} onRetry={score} busy={busy} step={step} />}
        {w.phase === "scored" && (<>
          {saveMsg && <Hint style={{ marginTop: 6, color: /failed/.test(saveMsg) ? C.red : C.green }}>{saveMsg}</Hint>}
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {last && !last.failed && <Button tone={C.green} onClick={save} style={{ flex: 1 }}>Save to MA History</Button>}
            <Button tone={C.muted} onClick={() => speakText(w.qa[w.qa.length - 1]?.content || "")} style={{ padding: "6px 10px" }}>🔊</Button>
          </div>
        </>)}
      </>)}
    </div>
  );
}
