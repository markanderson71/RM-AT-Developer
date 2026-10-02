import React, { useEffect, useRef, useState } from "react";
import { C } from "../theme.js";
import { Button, Composer, Field, Hint, Input, Select, Textarea, Thread, speakText } from "../components/index.jsx";
import { callClaude, saveMaSession, scoreExtract, scoreEvaluate } from "../api.js";
import { USERS, today } from "../lib/users.js";
import { parseAIJson } from "../lib/parseSummary.js";
import { PHASES, PHASE_LABEL, MAX_REVISIONS, freshExam, loadExam, persistExam, buildSession, examHash, hasUnsavedWork, hasContent, scoringSession, isFailedRun, YT_RE } from "../lib/exam.js";
import { scorecard, resultCard, bestAttempt, LINE_LABEL } from "../lib/scorecard.js";
import { briefLines } from "../../lib/coaching.js";
import { byDateDesc } from "../api.js";
import { ScoreChips, ScoreGrid, MeetsBadge, LegacyNotice, Diagnostics, Block, scoreColor } from "../components/ScoreViews.jsx";
import Rationale from "./Rationale.jsx";
import { PEER_SYSTEM, EXAMINER_SYSTEM, examinerTranscript, peerContext, mentorGapsBlock, examinerExemplarsBlock, parseExaminerReply } from "../lib/prompts.js";
import { dealIntent, renderPeerBrief, revealIntent } from "../lib/peerBrief.js";
import { loadIdpTasks, atTasks, findTask, renderTask } from "../lib/idp.js";
import { ASSESSMENT_FIELDS } from "../lib/progress.js";
import { chrisStatements } from "../api.js";

const TONE = C.exam;
const AUTOSPEAK_KEY = "rmat_autospeak";
// What callClaude returns when the call itself failed (src/api.js) — text, not a score.
const CALL_FAILED = /^(Error:|Unable to reach|No response\.)/;
const isFailedAttempt = isFailedRun;

/**
 * AT MA Exam — 7 phases: setup → observe → dialog → prescribe → present → debrief → scored.
 * Props: maSessions (for scorer comparison), mentorAssessments (Config._MENTOR_ASSESSMENTS),
 * onSaved(session) so the app can add it to its in-memory list.
 */
export default function ATExam({ maSessions, mentorAssessments, onSaved }) {
  const [exam, setExam] = useState(loadExam);
  const [loading, setLoading] = useState(false);
  const [scoreStep, setScoreStep] = useState("");
  const [saveState, setSaveState] = useState({ status: "idle", message: "" }); // idle | saving | saved | error
  const [autoSpeak, setAutoSpeak] = useState(() => { try { return window.localStorage.getItem(AUTOSPEAK_KEY) === "1"; } catch { return false; } });
  const examRef = useRef(exam); examRef.current = exam;
  const [tasks, setTasks] = useState([]);
  useEffect(() => { loadIdpTasks().then((t) => setTasks(atTasks(t))).catch(() => {}); }, []);

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
    const ex = examRef.current;
    // Session 9: the peer answers from a dealt intent (§17, Chris 9/24). Dealt once at "Start observation"; never shown to Mark before the score screen.
    const brief = ex.brief?.intent ? renderPeerBrief({ intent: ex.brief.intent, taskText: renderTask(findTask(tasks, ex.activity)), who: ex.who, activity: ex.activity, conditions: ex.conditions }) : "";
    const ctx = peerContext(ex, { prescribing, brief });
    const apiMsgs = msgs.map((m, i) => (i === 0 ? { role: "user", content: `${ctx}\n\nMark: ${m.content}` } : m));
    const resp = await callClaude(apiMsgs, PEER_SYSTEM);
    upd({ [key]: [...msgs, { role: "assistant", content: resp }] });
    setLoading(false); say(resp);
  };

  const examinerOpening = () => `${examinerTranscript(examRef.current)}${mentorGapsBlock(mentorAssessments, USERS)}${examinerExemplarsBlock(examRef.current.chris)}\n\nAsk your first question.`;
  // Session 9: each probe carries the form line it targets ("[line: …]"), stripped for display and speech, kept on the message.
  const examinerTurn = (raw) => { const { line, text } = parseExaminerReply(raw); return { role: "assistant", content: text, line }; };

  const startDebrief = async () => {
    upd({ phase: "debrief", debriefMessages: [] });
    setLoading(true);
    const chris = await chrisStatements(examRef.current.presentation);    // the examiner's register: what Chris has actually said, nearest this presentation
    upd({ chris });
    const turn = examinerTurn(await callClaude([{ role: "user", content: examinerOpening() }], EXAMINER_SYSTEM));
    upd({ debriefMessages: [turn] });
    setLoading(false); say(turn.content);
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
    const turn = examinerTurn(await callClaude([{ role: "user", content: examinerOpening() }, ...msgs.map((m) => ({ role: m.role, content: m.content }))], EXAMINER_SYSTEM));
    upd({ debriefMessages: [...msgs, turn] });
    setLoading(false); say(turn.content);
  };

  // Two-step RAG scorer (§8): extract → evaluate. If either call fails, fall back to the old single-prompt scorer
  // and SAY SO — a legacy score is on the pre-2026 lines and runs high against Chris; it must never pass as the real one.
  // opts.replaceFallback: the last attempt was the old scorer standing in for a failed new-scorer run — retry REPLACES it
  // (it was a consolation, not a revision). Anything else passed in (a click event) is ignored.
  const score = async (opts) => {
    const replaceFallback = opts?.replaceFallback === true;
    setLoading(true);
    const stamp = { timestamp: new Date().toISOString(), attemptNum: examRef.current.attempts.filter((a, i, all) => !isFailedAttempt(a) && !(replaceFallback && i === all.length - 1 && a.scorer === "legacy" && a.scorer_error)).length + 1 };
    let attempt;
    try {
      setScoreStep("Step 1 of 2 — taking inventory of what you actually said (about a minute)…");
      const extraction = await scoreExtract(scoringSession(examRef.current));
      setScoreStep("Step 2 of 2 — scoring against the 2026 form and Chris's feedback (1–2 minutes)…");
      const result = await scoreEvaluate(extraction, examRef.current.savedSessionId);
      attempt = { ...result, scorer: result.meta?.scorer || "rag", ...stamp };
    } catch (e) {
      console.error("score:", e);
      // No fallback (retired 2026-09-22, §15): a failed run is a failed run — shown as such, retried with "Score again".
      attempt = { failed: true, scorer: "none", scorer_error: String(e.message || e).slice(0, 300), ...stamp };
    }
    // A failed run never counts against the revision limit, and a retry replaces it (also clears ones stored before this fix).
    upd((p) => { const kept = p.attempts.filter((a, i, all) => !isFailedAttempt(a) && !(replaceFallback && i === all.length - 1 && a.scorer === "legacy" && a.scorer_error)); return { phase: "scored", result: attempt.scores ? attempt : null, attempts: [...kept, attempt], attemptNumber: kept.length + (attempt.failed ? 1 : 2) }; });
    setScoreStep(""); setLoading(false);
  };

  // ── save (hash-diff, update-then-create, retry) ────────────────────────────
  const saveToHistory = async () => {
    const session = buildSession(examRef.current, { parseAIJson });
    const h = examHash(examRef.current);
    if (examRef.current.savedHash === h) { setSaveState({ status: "saved", message: "Already saved — nothing changed." }); return; }
    setSaveState({ status: "saving", message: "" });
    const ok = await saveMaSession(session);
    if (ok) { upd({ savedSessionId: session.id, savedHash: h }); onSaved?.(session); setSaveState({ status: "saved", message: `Saved to MA History as ${session.date} · ${session.activity || "AT MA Exam"}.` }); }
    else setSaveState({ status: "error", message: "Save failed — the session is still here. Check the connection and retry." });
  };

  const reset = (skipConfirm) => { if (skipConfirm === true || !hasUnsavedWork(exam) || confirm("Start a new exam? This one isn't saved — its work will be lost.")) { setExam(freshExam()); setSaveState({ status: "idle", message: "" }); } };

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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
            <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} style={{ accentColor: C.orange }} /> Read replies aloud
          </label>
          {exam.phase !== "setup" && exam.phase !== "scored" && hasContent(exam) && <Button tone={TONE} onClick={() => reset()} disabled={loading} style={{ padding: "4px 10px", fontSize: 12 }}>＋ New exam</Button>}
        </div>
      </div>

      {/* 1 · Setup */}
      {exam.phase === "setup" && (
        <>
          <PreExamBrief maSessions={maSessions} mentorAssessments={mentorAssessments} />
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
            <Field label="Activity"><Input list="idp-tasks-exam" value={exam.activity} onChange={(e) => upd({ activity: e.target.value })} placeholder="IDP task or free text" /><datalist id="idp-tasks-exam">{tasks.map((t) => <option key={t.name} value={t.name} />)}</datalist></Field>
            <Field label="Conditions"><Input value={exam.conditions} onChange={(e) => upd({ conditions: e.target.value })} placeholder="e.g., Groomed blue, firm" /></Field>
          </div>
          <Hint style={{ marginBottom: 8 }}>The peer will be dealt an intent from Chris's menu — what they were actually trying to do on this run. You won't see it; you have to find it by asking. It's revealed with your score.</Hint>
          <Button tone={TONE} disabled={!exam.who || !exam.activity} onClick={() => { upd((p) => ({ brief: p.brief?.intent ? p.brief : { intent: dealIntent(`${Date.now()}-${p.activity}`) } })); go("observe"); }} style={{ width: "100%" }}>Start observation</Button>
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
          <Unsent draft={exam.drafts.dialog} verb="Ask" />
          <div style={{ display: "flex", gap: 6 }}>
            <Button tone={C.muted} onClick={() => go("observe")} disabled={loading}>Back</Button>
            <Button tone={TONE} onClick={() => go("prescribe")} disabled={loading || !!exam.drafts.dialog.trim() || exam.dialogMessages.filter((m) => m.role === "user").length < 1} style={{ flex: 1 }}>Move to prescription</Button>
          </div>
        </>
      )}

      {/* 4 · Prescribe */}
      {exam.phase === "prescribe" && (
        <>
          {contextLine}
          <Hint style={{ marginBottom: 8 }}>Deliver it as you would on the hill: what you saw them do, the change in performance that gets them closer to what they told you they're after, and why it serves that (Chris, 10/2: "it's not about picking a task — what is the change in performance?"). A task only if it helps. A sentence or two.</Hint>
          <Review title="Peer dialog">{exam.dialogMessages.map((m) => `${m.role === "user" ? "Mark" : "Peer"}: ${m.content}`).join("\n")}</Review>
          <Thread messages={exam.prescriptionDialog} me={C.mark} them={C.peer} meLabel="Mark (trainer)" themLabel={exam.who || "Peer"} loading={loading} loadingText="Peer is thinking…" maxHeight={260} />
          <Composer value={exam.drafts.prescribe} onChange={(v) => setDraft("prescribe", v)} onSend={(t) => askPeer("prescriptionDialog", t, true)} disabled={loading} tone={TONE} sendLabel="Say" placeholder={exam.prescriptionDialog.length ? "Continue — answer their question or add the detail they're missing…" : "Deliver your prescription to the instructor…"} />
          <Unsent draft={exam.drafts.prescribe} verb="Say" />
          <div style={{ display: "flex", gap: 6 }}>
            <Button tone={C.muted} onClick={() => go("dialog")} disabled={loading}>Back</Button>
            <Button tone={TONE} onClick={() => go("present")} disabled={loading || !!exam.drafts.prescribe.trim() || exam.prescriptionDialog.filter((m) => m.role === "user").length < 1} style={{ flex: 1 }}>Move to presentation</Button>
          </div>
        </>
      )}

      {/* 5 · Present */}
      {exam.phase === "present" && (
        <>
          {contextLine}
          <Hint style={{ marginBottom: 8 }}>The examiner heard the dialog and the prescription. Now the technical why: observations by phase, the cascade and root cause, why this task at the biomechanics level, why this terrain, how it serves the subject's intent.</Hint>
          <Review title="What you told the peer (prescription)">{exam.prescriptionDialog.map((m) => `${m.role === "user" ? "Mark" : "Peer"}: ${m.content}`).join("\n")}</Review>
          <Review title="Your private notes (examiner doesn't see these)">{`Observations: ${exam.observations}\n\nRoot cause: ${exam.rootCause}`}</Review>
          <Field label="Examiner – Present">
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
            ? <Hint style={{ marginBottom: 8, color: C.examiner }}>The examiner has finished{(() => { const ls = [...new Set(exam.debriefMessages.filter((m) => m.line).map((m) => LINE_LABEL[m.line]))]; return ls.length ? ` — probed: ${ls.join(", ")}` : ""; })()}. Score when you're ready.</Hint>
            : <Composer value={exam.drafts.debrief} onChange={(v) => setDraft("debrief", v)} onSend={answerExaminer} disabled={loading} tone={TONE} sendLabel="Reply" placeholder="Answer the examiner…" />}
          <div style={{ display: "flex", gap: 6 }}>
            <Button tone={C.muted} onClick={() => go("present")} disabled={loading}>Back</Button>
            <Button tone={C.amber} onClick={score} disabled={loading || exam.debriefMessages.filter((m) => m.role === "user").length < 1} style={{ flex: 1 }}>
              {loading ? "Scoring…" : exam.attempts.length === 0 ? "Score my MA" : `Score revision ${exam.attempts.length} of ${MAX_REVISIONS}`}
            </Button>
          </div>
          {scoreStep && <Hint style={{ marginTop: 8, color: C.amber }}>{scoreStep} Keep this tab open.</Hint>}
        </>
      )}

      {/* 7 · Scored */}
      {exam.phase === "scored" && <Scored exam={exam} saveState={saveState} onRevise={() => { setSaveState({ status: "idle", message: "" }); upd({ phase: "dialog", prescriptionDialog: [], presentation: "", debriefMessages: [], result: null }); }} onSave={saveToHistory} onNew={() => reset()} onRescore={score} loading={loading} scoreStep={scoreStep} />}

    </div>
  );
}

/**
 * Pre-exam brief (§13 row 5c): three lines to carry in, from the last session scored on the 2026 form.
 * Ranked by Chris's scorecard where he has given one, else the AI's. Read through scorecard() like everything else.
 */
function PreExamBrief({ maSessions, mentorAssessments }) {
  // Session 9: the mentors' "Where to challenge or push" rides in above the three lines (session 8 follow-up a).
  const pushes = Object.entries(mentorAssessments || {}).filter(([, a]) => String(a?.challenge || "").trim()).map(([k, a]) => ({ who: USERS[k]?.name || k, color: USERS[k]?.color || C.muted, text: a.challenge.trim() }));
  const last = [...(maSessions || [])].sort(byDateDesc).map((s) => ({ s, card: scorecard(s) })).find(({ card }) => card.status === "scored" && card.form === "2026" && card.detail?.gap_to_next);
  if (!last && !pushes.length) return null;
  const pushBlock = pushes.length > 0 && (
    <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(192,96,160,0.06)", border: "1px solid rgba(192,96,160,0.2)" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.purple, marginBottom: 4 }}>{ASSESSMENT_FIELDS.find((f) => f.key === "challenge")?.label || "Where to challenge or push"}</div>
      {pushes.map((p) => <div key={p.who} style={{ fontSize: 13, color: C.body, lineHeight: 1.5, marginBottom: 3 }}><b style={{ color: p.color }}>{p.who}: </b>{p.text}</div>)}
    </div>
  );
  if (!last) return pushBlock || null;
  const chris = last.card.mentors?.chris;
  const rank = chris ? chris.scores : Object.fromEntries(last.card.lines.map((l) => [l.key, l.score]));
  const lines = briefLines(last.card.detail, rank, 3);
  if (!lines.length) return pushBlock || null;
  return (<>
    {pushBlock}
    <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(232,160,80,0.05)", border: "1px solid rgba(232,160,80,0.18)" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, marginBottom: 2 }}>Carry these in — from {last.s.date} · {last.s.activity || "last session"}</div>
      <Hint style={{ marginBottom: 6 }}>Your three lowest lines {chris ? "on Chris's scorecard" : "(AI score)"}. The moves are AI suggestions.</Hint>
      {lines.map((l) => (
        <details key={l.key} style={{ marginBottom: 4 }}>
          <summary style={{ fontSize: 13, color: C.body, cursor: "pointer", lineHeight: 1.5 }}><b style={{ color: scoreColor(l.score) }}>{LINE_LABEL[l.key]} ({l.score})</b> — {l.gap.because ? l.gap.because[0].toUpperCase() + l.gap.because.slice(1) : l.gap.raw.slice(0, 180)}.</summary>
          {l.gap.say && <div style={{ fontSize: 12, color: C.muted, margin: "3px 0 4px 14px", lineHeight: 1.5 }}>Last time, instead of “{l.gap.instead}”, the suggestion was: “{l.gap.say}”</div>}
        </details>
      ))}
    </div>
  </>);
}

/** Score-screen reveal (session 9): what the peer was dealt, beside what Mark asked and what the peer told him. */
function Reveal({ exam, extraction }) {
  const r = revealIntent({ intent: exam.brief.intent, extraction, dialogMessages: exam.dialogMessages });
  return (
    <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(192,128,208,0.07)", border: "1px solid rgba(192,128,208,0.25)" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.peer, marginBottom: 3 }}>The peer's brief — revealed</div>
      <div style={{ fontSize: 13, color: C.body, lineHeight: 1.55 }}>They were dealt: <b>{r.dealt}</b>. In their words: “{r.peerWords}.”</div>
      <div style={{ fontSize: 12, color: r.askedIntent ? C.green : C.orange, marginTop: 4, fontWeight: 600 }}>{r.askedIntent ? "You asked what they were going for." : "You never asked what they were going for — every line is scored relative to that outcome (Chris, 9/24)."}</div>
      {r.peerAnswers.length > 0 && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>What the clerk heard the peer tell you: {r.peerAnswers.map((a) => `“${a}”`).join(" · ")}</div>}
    </div>
  );
}

/** Typed but never sent: the words are still in the box, not in the transcript. The move button stays off until they are said or cleared. */
function Unsent({ draft, verb }) {
  if (!draft?.trim()) return null;
  return <div style={{ margin: "-4px 0 8px", padding: "8px 10px", borderRadius: 6, background: "rgba(224,168,80,0.1)", border: "1px solid rgba(224,168,80,0.35)", fontSize: 13, color: C.amber, fontWeight: 600 }}>You have text in the box that the peer hasn't heard. Click <b>{verb}</b> to put it in the transcript, or clear the box, before moving on.</div>;
}

function Scored({ exam, saveState, onRevise, onSave, onNew, onRescore, loading, scoreStep }) {
  const current = exam.attempts[exam.attempts.length - 1];
  const failed = isFailedAttempt(current);
  const real = exam.attempts.filter((a) => !isFailedAttempt(a));
  const best = bestAttempt(exam.attempts);
  const card = resultCard(current?.scores ? current : null);      // same card MA History will show once this is saved
  const canRevise = real.length <= MAX_REVISIONS;
  const didWell = current?.did_well || current?.strengths || [];
  const opp = current?.opportunity || current?.gaps || [];
  return (
    <div style={{ padding: 14, borderRadius: 8, background: `${TONE}0a`, border: `1px solid ${TONE}1a` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TONE }}>{failed ? "Not scored" : real.length <= 1 ? "Initial score" : `Revision ${real.length - 1} of ${MAX_REVISIONS}`} · {today()}</div>
        <MeetsBadge meets={card.meets} />
      </div>

      {failed && (
        <div style={{ padding: "10px 12px", borderRadius: 6, background: "rgba(224,80,40,0.08)", border: "1px solid rgba(224,80,40,0.25)", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.red, marginBottom: 4 }}>Scoring didn't complete — nothing was lost</div>
          <div style={{ fontSize: 13, color: C.body, lineHeight: 1.55 }}>Your whole exam is still here and this does not count as an attempt. Score again; if it keeps failing, send Claude the line below.</div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginTop: 6, overflowWrap: "anywhere" }}><b>Error:</b> {current.scorer_error || "no detail"}{current.fallback_error ? <><br /><b>Old scorer (fallback, since retired):</b> {current.fallback_error}</> : null}</div>
          <Button solid tone={TONE} disabled={loading} onClick={onRescore} style={{ width: "100%", marginTop: 10, padding: 10 }}>{loading ? scoreStep || "Scoring…" : "Score again"}</Button>
        </div>
      )}
      {!failed && card.form === "legacy" && current?.scorer_error && <Hint style={{ color: C.orange, marginBottom: 4 }}>⚠ The new scorer was unavailable ({current.scorer_error}). Nothing below is on the 2026 form.</Hint>}
      {!failed && card.form === "legacy" && current?.scorer_error && <Button solid tone={TONE} disabled={loading} onClick={() => onRescore({ replaceFallback: true })} style={{ width: "100%", margin: "2px 0 10px", padding: 10 }}>{loading ? scoreStep || "Scoring…" : "Score again with the new scorer (replaces this, uses no revision)"}</Button>}
      <LegacyNotice card={card} />
      {exam.brief?.intent && <Reveal exam={exam} extraction={current?.extraction} />}

      {failed ? null : card.status === "scored" ? (
        <>
          <ScoreGrid card={card} />
          <Diagnostics card={card} />
          {current.key_learning && <Block tone={C.amber} label="Key focus">{current.key_learning}</Block>}
          {didWell.length > 0 && <Block tone={C.green} label="What you did well">{didWell.join(" · ")}</Block>}
          {opp.length > 0 && <Block tone={C.orange} label="Opportunity">{opp.join(" · ")}</Block>}
          {current.time_note && <Block tone={C.blue} label="Delivery">{current.time_note}</Block>}
          <Rationale card={card} open={card.form === "2026"} />
          {card.form === "2026" && <Hint style={{ marginBottom: 6 }}>Save this, then open it in MA History for line-by-line coaching and “try that line again”.</Hint>}
        </>
      ) : (
        <div style={{ padding: "10px 12px", borderRadius: 6, background: "rgba(255,255,255,0.02)", marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: C.body, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{String(current?.raw || "Score could not be parsed. Score again.")}</div>
          <Hint style={{ color: C.orange, marginTop: 6 }}>The scorer didn't return usable JSON — feedback shown as text. Revise or score again.</Hint>
        </div>
      )}

      {real.length > 1 && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>All attempts <span style={{ fontWeight: 400, color: C.dim }}>· ★ = best (MA avg + TU avg) — the one saved as this session's score</span></div>
          {real.map((a, i) => { const c = resultCard(a.scores ? a : null); return (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", borderBottom: "0.5px solid rgba(255,255,255,0.03)", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: a === best ? C.green : C.muted, minWidth: 75 }}>{a === best ? "★ " : ""}{i === 0 ? "Initial" : `Rev ${i}`}</span>
              <ScoreChips card={c} />
              <span style={{ fontSize: 11, color: C.dim }}>{c.form === "2026" && c.sections.ma != null ? `MA ${c.sections.ma.toFixed(2)} · TU ${c.sections.tu.toFixed(2)}` : c.form === "legacy" ? "old scorer — not comparable" : "not scored"}</span>
            </div>
          ); })}
        </div>
      )}

      {saveState.message && (
        <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, color: saveState.status === "error" ? C.red : C.green, background: saveState.status === "error" ? "rgba(224,80,40,0.1)" : "rgba(40,168,88,0.08)", border: `1px solid ${saveState.status === "error" ? "rgba(224,80,40,0.3)" : "rgba(40,168,88,0.2)"}` }}>{saveState.message}</div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        {canRevise && !failed && <Button tone={C.blue} onClick={onRevise} style={{ flex: 1 }}>Revise ({MAX_REVISIONS + 1 - real.length} left)</Button>}
        {!(failed && real.length === 0) && <Button tone={C.green} onClick={onSave} disabled={saveState.status === "saving"} style={{ flex: 1 }}>{saveState.status === "saving" ? "Saving…" : saveState.status === "error" ? "Retry save" : "Save to MA History"}</Button>}
        <Button tone={TONE} onClick={onNew} style={{ flex: 1 }}>＋ Start a new exam</Button>
      </div>
    </div>
  );
}
