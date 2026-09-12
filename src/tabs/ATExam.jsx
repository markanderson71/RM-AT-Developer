import React, { useEffect, useRef, useState } from "react";
import { C } from "../theme.js";
import { Button, Composer, Field, Hint, Input, Select, Textarea, Thread, speakText } from "../components/index.jsx";
import { callClaude, saveMaSession } from "../api.js";
import { USERS, today } from "../lib/users.js";
import { parseAIJson, parseSummary } from "../lib/parseSummary.js";
import { PHASES, PHASE_LABEL, CRITERIA, freshExam, loadExam, persistExam, buildSession, hashOf, attemptTotal, bestAttempt, YT_RE } from "../lib/exam.js";
import { PEER_SYSTEM, EXAMINER_SYSTEM, examinerTranscript, peerContext, mentorGapsBlock, buildScorerSystem, buildScoreInput } from "../lib/prompts.js";

const TONE = C.exam;
const scoreColor = (v) => (v >= 4 ? C.green : v >= 3 ? C.orange : C.red);
const AUTOSPEAK_KEY = "rmat_autospeak";

/**
 * AT MA Exam — 7 phases: setup → observe → dialog → prescribe → present → debrief → scored.
 * Props: maSessions (for scorer comparison), mentorAssessments (Config._MENTOR_ASSESSMENTS), referenceText,
 * onSaved(session) so the app can add it to its in-memory list.
 */
export default function ATExam({ maSessions, mentorAssessments, referenceText, onSaved }) {
  const [exam, setExam] = useState(loadExam);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState({ status: "idle", message: "" }); // idle | saving | saved | error
  const [autoSpeak, setAutoSpeak] = useState(() => { try { return window.localStorage.getItem(AUTOSPEAK_KEY) === "1"; } catch { return false; } });
  const examRef = useRef(exam); examRef.current = exam;

  useEffect(() => persistExam(exam), [exam]);
  useEffect(() => { try { window.localStorage.setItem(AUTOSPEAK_KEY, autoSpeak ? "1" : "0"); } catch { /* ignore */ } }, [autoSpeak]);

  const upd = (patch) => setExam((p) => ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) }));
  const setDraft = (k, v) => setExam((p) => ({ ...p, drafts: { ...p.drafts, [k]: v } }));
  const go = (phase) => upd({ phase });
  const say = (text) => { if (autoSpeak) speakText(text); };

  // ── model calls ────────────────────────────────────────────────────────────
  const askPeer = async (key, text, prescribing) => {
    const msgs = [...examRef.current[key], { role: "user", content: text }];
    upd((p) => ({ [key]: msgs, drafts: { ...p.drafts, [prescribing ? "prescribe" : "dialog"]: "" } }));
    setLoading(true);
    const ctx = peerContext(examRef.current, { prescribing });
    const apiMsgs = msgs.map((m, i) => (i === 0 ? { role: "user", content: `${ctx}\n\nMark: ${m.content}` } : m));
    const resp = await callClaude(apiMsgs, PEER_SYSTEM);
    upd({ [key]: [...msgs, { role: "assistant", content: resp }] });
    setLoading(false); say(resp);
  };

  const examinerOpening = () => `${examinerTranscript(examRef.current)}${mentorGapsBlock(mentorAssessments, USERS)}\n\nAsk your first question.`;

  const startDebrief = async () => {
    upd({ phase: "debrief", debriefMessages: [] });
    setLoading(true);
    const resp = await callClaude([{ role: "user", content: examinerOpening() }], EXAMINER_SYSTEM);
    upd({ debriefMessages: [{ role: "assistant", content: resp }] });
    setLoading(false); say(resp);
  };

  const MAX_EXAMINER_QUESTIONS = 4;
  const EXAMINER_END = "OK, thank you.";
  const debriefOver = (msgs) => msgs.some((m) => m.role === "assistant" && /^OK, thank you\.?$/i.test(m.content.trim()));

  const answerExaminer = async (text) => {
    const msgs = [...examRef.current.debriefMessages, { role: "user", content: text }];
    upd((p) => ({ debriefMessages: msgs, drafts: { ...p.drafts, debrief: "" } }));
    // Real exam: the examiner stops. Enforced here, not left to the prompt.
    if (msgs.filter((m) => m.role === "user").length >= MAX_EXAMINER_QUESTIONS) { upd({ debriefMessages: [...msgs, { role: "assistant", content: EXAMINER_END }] }); say(EXAMINER_END); return; }
    setLoading(true);
    const resp = await callClaude([{ role: "user", content: examinerOpening() }, ...msgs], EXAMINER_SYSTEM);
    upd({ debriefMessages: [...msgs, { role: "assistant", content: resp }] });
    setLoading(false); say(resp);
  };

  const score = async () => {
    setLoading(true);
    const system = buildScorerSystem({ mentorAssessments, maSessions, users: USERS, referenceText });
    const input = buildScoreInput(examRef.current, { pastSessions: maSessions, parseSummary });
    const resp = await callClaude([{ role: "user", content: input }], system);
    const parsed = parseAIJson(resp);
    const attempt = { ...(parsed && typeof parsed === "object" ? parsed : { raw: String(resp) }), timestamp: new Date().toISOString(), attemptNum: examRef.current.attemptNumber };
    upd((p) => ({ phase: "scored", result: parsed, attempts: [...p.attempts, attempt], attemptNumber: p.attemptNumber + 1 }));
    setLoading(false);
  };

  // ── save (hash-diff, update-then-create, retry) ────────────────────────────
  const saveToHistory = async () => {
    const session = buildSession(examRef.current, { parseAIJson });
    const h = hashOf({ t: session.transcript, s: session.sections, a: examRef.current.attempts });
    if (examRef.current.savedHash === h) { setSaveState({ status: "saved", message: "Already saved — nothing changed." }); return; }
    setSaveState({ status: "saving", message: "" });
    const ok = await saveMaSession(session);
    if (ok) { upd({ savedSessionId: session.id, savedHash: h }); onSaved?.(session); setSaveState({ status: "saved", message: `Saved to MA History as ${session.date} · ${session.activity || "AT MA Exam"}.` }); }
    else setSaveState({ status: "error", message: "Save failed — the session is still here. Check the connection and retry." });
  };

  const reset = (skipConfirm) => { if (skipConfirm === true || exam.phase === "setup" || confirm("Discard this exam? Unsaved work will be lost.")) { setExam(freshExam()); setSaveState({ status: "idle", message: "" }); } };

  // ── UI ─────────────────────────────────────────────────────────────────────
  const ytId = (exam.videoUrl || "").match(YT_RE)?.[1];
  const videoLink = exam.videoUrl && (
    <a href={exam.videoUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", marginBottom: 8, borderRadius: 4, background: "rgba(48,136,204,0.06)", color: C.blue, fontSize: 12, textDecoration: "none" }}>▶ Watch video{exam.videoTime ? ` (${exam.videoTime})` : ""}</a>
  );
  const contextLine = <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Analyzing: {exam.who}{exam.activity ? ` · ${exam.activity}` : ""}{exam.conditions ? ` · ${exam.conditions}` : ""}</div>;
  const Review = ({ title, children }) => (
    <details style={{ marginBottom: 8 }}>
      <summary style={{ fontSize: 11, color: C.dim, cursor: "pointer" }}>{title}</summary>
      <div style={{ padding: "6px 8px", borderRadius: 5, background: "rgba(255,255,255,0.02)", fontSize: 12, color: C.body, whiteSpace: "pre-wrap", marginTop: 4, maxHeight: 180, overflowY: "auto" }}>{children}</div>
    </details>
  );

  const stepIdx = PHASES.indexOf(exam.phase);

  return (
    <div>
      {/* Phase strip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {PHASES.map((ph, i) => (
            <span key={ph} style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, color: i === stepIdx ? TONE : i < stepIdx ? C.muted : C.faint, background: i === stepIdx ? `${TONE}14` : "transparent", border: `1px solid ${i === stepIdx ? TONE + "40" : "rgba(255,255,255,0.05)"}` }}>{i + 1}. {PHASE_LABEL[ph]}</span>
          ))}
        </div>
        <label style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
          <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} style={{ accentColor: C.orange }} /> Read replies aloud
        </label>
      </div>

      {/* 1 · Setup */}
      {exam.phase === "setup" && (
        <>
          <Field label="Video link"><Input value={exam.videoUrl} onChange={(e) => upd({ videoUrl: e.target.value })} placeholder="YouTube or Google Drive link to the skiing you'll analyze" /></Field>
          {exam.videoUrl && <Field label="Video time range"><Input value={exam.videoTime} onChange={(e) => upd({ videoTime: e.target.value })} placeholder="e.g., 0:32 - 1:15" /></Field>}
          {ytId && <a href={exam.videoUrl} target="_blank" rel="noreferrer" style={{ display: "block", marginBottom: 8 }}><img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" style={{ width: "100%", maxWidth: 320, borderRadius: 8 }} /></a>}
          <Field label="Skier description"><Input value={exam.videoSkier} onChange={(e) => upd({ videoSkier: e.target.value })} placeholder="e.g., Red jacket, second skier from left" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
            <Field label="Fellow candidate">
              <Select value={exam.who} onChange={(e) => upd({ who: e.target.value })}>
                <option value="">Select level…</option>
                <option value="Weak L3 candidate">Weak L3</option>
                <option value="Solid L3 candidate">Solid L3</option>
                <option value="Strong L3 candidate">Strong L3</option>
                <option value="Advanced AT candidate">Advanced AT candidate</option>
              </Select>
            </Field>
            <Field label="Activity"><Input value={exam.activity} onChange={(e) => upd({ activity: e.target.value })} placeholder="e.g., Dynamic Short Turns" /></Field>
            <Field label="Conditions"><Input value={exam.conditions} onChange={(e) => upd({ conditions: e.target.value })} placeholder="e.g., Groomed blue, firm" /></Field>
          </div>
          <Button tone={TONE} disabled={!exam.who || !exam.activity} onClick={() => go("observe")} style={{ width: "100%" }}>Start observation</Button>
        </>
      )}

      {/* 2 · Observe */}
      {exam.phase === "observe" && (
        <>
          {videoLink}{contextLine}
          <Field label="What do you see? (by turn phase)">
            <Textarea value={exam.observations} onChange={(v) => upd({ observations: v })} placeholder="Ski performance, body performance — initiation, shaping, finish, transition. Which leg, which joint, DIRT." style={{ minHeight: 110, fontSize: 14, lineHeight: 1.7 }} />
          </Field>
          <Field label="Root cause">
            <Textarea value={exam.rootCause} onChange={(v) => upd({ rootCause: v })} placeholder="Primary fundamental, the cascade, where in the turn it starts." style={{ minHeight: 60, fontSize: 14, lineHeight: 1.7 }} />
          </Field>
          <Hint style={{ marginBottom: 8 }}>Private notes. The examiner never sees these and they aren't scored.</Hint>
          <div style={{ display: "flex", gap: 6 }}>
            <Button tone={C.muted} onClick={() => go("setup")} style={{ flex: 0 }}>Back</Button>
            <Button tone={TONE} onClick={() => go("dialog")} style={{ flex: 1 }}>{exam.observations.trim() ? "Begin peer dialog" : "Skip notes, begin peer dialog"}</Button>
          </div>
        </>
      )}

      {/* 3 · Peer dialog */}
      {exam.phase === "dialog" && (
        <>
          {contextLine}
          <Hint style={{ marginBottom: 8 }}>Verify before you diagnose: intent, what they felt, what the ski did. Aim for about 3 questions.</Hint>
          {(exam.observations || exam.rootCause) && <Review title="Your notes">{exam.observations}{exam.rootCause ? `\n\nRoot cause: ${exam.rootCause}` : ""}</Review>}
          <Thread messages={exam.dialogMessages} me={C.mark} them={C.peer} meLabel="Mark (trainer)" themLabel={exam.who || "Peer"} loading={loading} loadingText="Peer is thinking…" maxHeight={260} />
          <Composer value={exam.drafts.dialog} onChange={(v) => setDraft("dialog", v)} onSend={(t) => askPeer("dialogMessages", t, false)} disabled={loading} tone={TONE} sendLabel="Ask" placeholder="Ask about their intent, focus, what they felt, what the ski did…" />
          <Hint style={{ marginBottom: 8 }}>{exam.dialogMessages.filter((m) => m.role === "user").length}/3 questions asked</Hint>
          <div style={{ display: "flex", gap: 6 }}>
            <Button tone={C.muted} onClick={() => go("observe")} disabled={loading}>Back</Button>
            <Button tone={TONE} onClick={() => go("prescribe")} disabled={loading || exam.dialogMessages.filter((m) => m.role === "user").length < 1} style={{ flex: 1 }}>Move to prescription</Button>
          </div>
        </>
      )}

      {/* 4 · Prescribe */}
      {exam.phase === "prescribe" && (
        <>
          {contextLine}
          <Hint style={{ marginBottom: 8 }}>Deliver it as you would on the hill: the IDP task, variations, terrain, and how it serves what they told you they're working on. Task and why-it-helps — not the physics.</Hint>
          <Review title="Peer dialog">{exam.dialogMessages.map((m) => `${m.role === "user" ? "Mark" : "Peer"}: ${m.content}`).join("\n")}</Review>
          <Thread messages={exam.prescriptionDialog} me={C.mark} them={C.peer} meLabel="Mark (trainer)" themLabel={exam.who || "Peer"} loading={loading} loadingText="Peer is thinking…" maxHeight={260} />
          <Composer value={exam.drafts.prescribe} onChange={(v) => setDraft("prescribe", v)} onSend={(t) => askPeer("prescriptionDialog", t, true)} disabled={loading} tone={TONE} sendLabel="Say" placeholder={exam.prescriptionDialog.length ? "Continue — answer their question or add the detail they're missing…" : "Deliver your prescription to the instructor…"} />
          <div style={{ display: "flex", gap: 6 }}>
            <Button tone={C.muted} onClick={() => go("dialog")} disabled={loading}>Back</Button>
            <Button tone={TONE} onClick={() => go("present")} disabled={loading || exam.prescriptionDialog.filter((m) => m.role === "user").length < 1} style={{ flex: 1 }}>Move to presentation</Button>
          </div>
        </>
      )}

      {/* 5 · Present */}
      {exam.phase === "present" && (
        <>
          {contextLine}
          <Hint style={{ marginBottom: 8 }}>The examiner heard the dialog and the prescription. Now the technical why: observations by phase, the cascade and root cause, why this task at the biomechanics level, why this terrain, how it serves the subject's intent.</Hint>
          <Review title="Your private notes (examiner doesn't see these)">{`Observations: ${exam.observations}\n\nRoot cause: ${exam.rootCause}`}</Review>
          <Field label="Presentation to the examiner">
            <Textarea value={exam.presentation} onChange={(v) => upd({ presentation: v })} style={{ minHeight: 160, fontSize: 14, lineHeight: 1.7 }} placeholder="Observed by phase — ski and body… Primary fundamental and the cascade… Why this IDP task, why this terrain… How it serves their intent." />
          </Field>
          <div style={{ display: "flex", gap: 6 }}>
            <Button tone={C.muted} onClick={() => go("prescribe")} disabled={loading}>Back</Button>
            <Button tone={TONE} onClick={startDebrief} disabled={!exam.presentation.trim() || loading} style={{ flex: 1 }}>{loading ? "Examiner preparing…" : "Submit to examiner Q&A"}</Button>
          </div>
        </>
      )}

      {/* 6 · Examiner Q&A */}
      {exam.phase === "debrief" && (
        <>
          <Review title="Your presentation (what the examiner heard)">{exam.presentation}</Review>
          <Thread messages={exam.debriefMessages} me={C.mark} them={C.examiner} meLabel="Mark" themLabel="Examiner" loading={loading} loadingText="Examiner thinking…" maxHeight={320} />
          {debriefOver(exam.debriefMessages)
            ? <Hint style={{ marginBottom: 8, color: C.examiner }}>The examiner has finished. Score when you're ready.</Hint>
            : <Composer value={exam.drafts.debrief} onChange={(v) => setDraft("debrief", v)} onSend={answerExaminer} disabled={loading} tone={TONE} sendLabel="Reply" placeholder="Answer the examiner…" />}
          <div style={{ display: "flex", gap: 6 }}>
            <Button tone={C.muted} onClick={() => go("present")} disabled={loading}>Back</Button>
            <Button tone={C.amber} onClick={score} disabled={loading || exam.debriefMessages.filter((m) => m.role === "user").length < 1} style={{ flex: 1 }}>
              {loading ? "Scoring…" : exam.attempts.length === 0 ? "Score my MA" : `Score revision ${exam.attempts.length} of 3`}
            </Button>
          </div>
        </>
      )}

      {/* 7 · Scored */}
      {exam.phase === "scored" && <Scored exam={exam} saveState={saveState} onRevise={() => { setSaveState({ status: "idle", message: "" }); upd({ phase: "dialog", prescriptionDialog: [], presentation: "", debriefMessages: [], result: null }); }} onSave={saveToHistory} onNew={() => reset(!!exam.savedSessionId)} />}

      {exam.phase !== "setup" && exam.phase !== "scored" && (
        <div style={{ textAlign: "right", marginTop: 12 }}><button onClick={() => reset()} style={{ background: "none", border: "none", color: C.faint, fontSize: 11, cursor: "pointer" }}>Discard exam</button></div>
      )}
    </div>
  );
}

function Scored({ exam, saveState, onRevise, onSave, onNew }) {
  const current = exam.attempts[exam.attempts.length - 1];
  const best = bestAttempt(exam.attempts);
  const canRevise = exam.attempts.length < 4;
  const didWell = current?.did_well || current?.strengths || [];
  const opp = current?.opportunity || current?.gaps || [];
  return (
    <div style={{ padding: 14, borderRadius: 8, background: `${TONE}0a`, border: `1px solid ${TONE}1a` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TONE }}>{exam.attempts.length <= 1 ? "Initial score" : `Revision ${exam.attempts.length - 1} of 3`} · {today()}</div>
        {exam.attempts.length > 1 && <div style={{ fontSize: 11, color: C.green }}>★ best attempt</div>}
      </div>

      {current?.scores ? (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {CRITERIA.map((c) => (
              <div key={c.key} style={{ textAlign: "center", minWidth: 52 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(current.scores[c.key] || 0) }}>{current.scores[c.key] || "—"}</div>
                <div style={{ fontSize: 9, color: C.muted, fontWeight: 600 }}>{c.label}</div>
              </div>
            ))}
          </div>
          {current.score_rationale && (
            <details style={{ marginBottom: 8 }}>
              <summary style={{ fontSize: 11, color: C.muted, cursor: "pointer" }}>Score rationale</summary>
              <div style={{ padding: "6px 8px", borderRadius: 4, background: "rgba(255,255,255,0.02)", marginTop: 4 }}>
                {CRITERIA.map((c) => current.score_rationale[c.key] && (
                  <div key={c.key} style={{ marginBottom: 6, fontSize: 12, lineHeight: 1.45 }}><span style={{ fontWeight: 700, color: scoreColor(current.scores[c.key] || 0) }}>{c.label} ({current.scores[c.key]}): </span><span style={{ color: "#b0b8c0" }}>{current.score_rationale[c.key]}</span></div>
                ))}
              </div>
            </details>
          )}
          {didWell.length > 0 && <Block tone={C.green} label="What you did well">{didWell.join(" · ")}</Block>}
          {opp.length > 0 && <Block tone={C.orange} label="Opportunity">{opp.join(" · ")}</Block>}
          {current.key_learning && <Block tone={C.amber} label="Key focus">{current.key_learning}</Block>}
        </>
      ) : (
        <div style={{ padding: "10px 12px", borderRadius: 6, background: "rgba(255,255,255,0.02)", marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: C.body, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{String(current?.raw || "Score could not be parsed. Score again.")}</div>
          <Hint style={{ color: C.orange, marginTop: 6 }}>The scorer didn't return usable JSON — feedback shown as text. Revise or score again.</Hint>
        </div>
      )}

      {exam.attempts.length > 1 && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>All attempts</div>
          {exam.attempts.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 0", borderBottom: "0.5px solid rgba(255,255,255,0.03)" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: a === best ? C.green : C.muted, minWidth: 75 }}>{a === best ? "★ " : ""}{i === 0 ? "Initial" : `Rev ${i}`}</span>
              <div style={{ display: "flex", gap: 3 }}>
                {CRITERIA.map((c) => { const v = a.scores?.[c.key] || 0; return <div key={c.key} style={{ width: 22, height: 22, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: scoreColor(v), background: `${scoreColor(v)}12`, border: `1px solid ${scoreColor(v)}30` }}>{v || "—"}</div>; })}
              </div>
              <span style={{ fontSize: 11, color: C.dim }}>Total {attemptTotal(a)}</span>
            </div>
          ))}
        </div>
      )}

      {saveState.message && (
        <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, color: saveState.status === "error" ? C.red : C.green, background: saveState.status === "error" ? "rgba(224,80,40,0.1)" : "rgba(40,168,88,0.08)", border: `1px solid ${saveState.status === "error" ? "rgba(224,80,40,0.3)" : "rgba(40,168,88,0.2)"}` }}>{saveState.message}</div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        {canRevise && <Button tone={C.blue} onClick={onRevise} style={{ flex: 1 }}>Revise ({4 - exam.attempts.length} left)</Button>}
        <Button tone={C.green} onClick={onSave} disabled={saveState.status === "saving"} style={{ flex: 1 }}>{saveState.status === "saving" ? "Saving…" : saveState.status === "error" ? "Retry save" : "Save to MA History"}</Button>
      </div>
      <div style={{ textAlign: "right", marginTop: 10 }}><button onClick={onNew} style={{ background: "none", border: "none", color: C.faint, fontSize: 11, cursor: "pointer" }}>{exam.savedSessionId ? "Start a new exam" : "Discard and start over"}</button></div>
    </div>
  );
}

const Block = ({ tone, label, children }) => (
  <div style={{ marginBottom: 6, padding: "6px 8px", borderRadius: 4, background: `${tone}0f`, border: `1px solid ${tone}1f` }}>
    <span style={{ fontSize: 10, fontWeight: 700, color: tone, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}: </span>
    <span style={{ fontSize: 12, color: C.body }}>{children}</span>
  </div>
);
