// MA History (§13 row 5). Same layout as the old tab; every number comes from scorecard().
// Candidate: coaching panel, scores, rationale with citations, rescore, thread, delete.
// Mentor: full transcript → blind scorecard → reveal with per-line delta → thread.
import React, { useState } from "react";
import { C, txta } from "../theme.js";
import { Card, Hint, Button, MicButton } from "../components/index.jsx";
import { USERS, SPEAKER } from "../lib/users.js";
import { appendFeedback, deleteMaSession, saveMaSummary, scoreExtract, scoreEvaluate, byDateDesc } from "../api.js";
import { scorecard, visibleFeedback, formatScoreLine, aiSnapshot, unseal, resultCard, parseScoreLine } from "../lib/scorecard.js";
import { compactForSheet, fitSummary, sectionAverages } from "../lib/exam.js";
import { today } from "../lib/users.js";
import { ScoreChips, ScoreGrid, MeetsBadge, ScorerTag, LegacyNotice, Diagnostics, Block } from "../components/ScoreViews.jsx";
import Rationale, { shortDate } from "./Rationale.jsx";
import BlindScoreForm from "./BlindScoreForm.jsx";
import CoachingPanel from "./CoachingPanel.jsx";

const TONE = C.purple;
const PEER_BEHAVIOR = [["weak", "May struggle to articulate, self-assessment may be inaccurate"], ["solid", "Good self-awareness, describes what they feel, may not connect to fundamentals"], ["strong", "Articulate, connects to fundamentals, approaching AT-level self-analysis"], ["advanced", "Highly self-aware, precise terminology, may challenge analysis"]];
const SECTION_TITLES = [["private_notes", "Private notes — never spoken, not scored"], ["root_cause", "Root cause (private note)"], ["peer_dialog", "Peer dialog"], ["prescription_delivery", "Prescription delivery (to peer)"], ["presentation", "Presentation to examiner"], ["written_analysis", "Written analysis"], ["examiner_qa", "Examiner Q&A"]];

export default function MAHistory({ user, maSessions, loaded, onUpdate, onDelete }) {
  const isMentor = user.role === "mentor";
  const sessions = [...maSessions].sort(byDateDesc);
  const [openId, setOpenId] = useState(null);
  const firstId = sessions[0]?.id;
  return (
    <>
      <div style={{ fontSize: 14, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
        {isMentor ? "Mark's MA sessions. Score a session from its transcript first; the AI's score appears beside yours once you submit." : "Your MA practice history. Open a session for its coaching notes; mentors score each one blind."}
      </div>
      {sessions.length === 0 && (
        <Card style={{ textAlign: "center", padding: "50px 20px" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.muted }}>{loaded ? "No MA sessions yet" : "Loading sessions from the Sheet…"}</div>
          {loaded && <div style={{ fontSize: 14, color: C.faint, marginTop: 4 }}>{isMentor ? "Mark hasn't recorded any MA sessions yet." : "Run an AT Exam in the Sparring Partner tab and save it."}</div>}
        </Card>
      )}
      {sessions.map((s) => <SessionCard key={s.id} s={s} user={user} open={(openId ?? firstId) === s.id} onToggle={() => setOpenId((openId ?? firstId) === s.id ? "" : s.id)} onUpdate={onUpdate} onDelete={onDelete} />)}
    </>
  );
}

function SessionCard({ s, user, open, onToggle, onUpdate, onDelete }) {
  const isMentor = user.role === "mentor";
  const card = scorecard(s, { viewer: user });
  const mentorList = Object.values(card.mentors || {});
  const compare = isMentor ? card.mine : mentorList.find((m) => m.who === "chris") || mentorList[0] || null;
  const compareName = compare ? USERS[compare.who]?.name : null;
  const w = (s.who || "").toLowerCase();
  const behavior = /exam/i.test(`${s.type} ${s.context}`) ? PEER_BEHAVIOR.find(([k]) => w.includes(k))?.[1] : null;

  return (
    <Card style={{ borderLeft: `3px solid ${TONE}` }}>
      <div onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, cursor: "pointer", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: C.muted }}>{s.date}{s.context ? ` · ${s.context}` : ""}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.body }}>{s.activity || "MA Session"}{s.who ? ` — analyzing ${s.who}` : ""}</div>
          {behavior && <div style={{ fontSize: 10, color: C.dim, marginTop: 2, fontStyle: "italic" }}>Peer behavior: {behavior}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          {card.sealed
            ? <span style={{ fontSize: 11, fontWeight: 700, color: user.color, border: `1px solid ${user.color}40`, borderRadius: 4, padding: "2px 8px" }}>Needs your score</span>
            : <>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><ScoreChips card={card} who={compare ? "AI" : null} /><ScorerTag card={card} /></div>
                {compare && <ScoreChips who={compareName} card={resultCard({ scores: compare.scores })} />}
                <MeetsBadge small meets={compare ? compare.meets : card.meets} />
              </>}
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          {!card.sealed && card.status === "scored" && <CoachingPanel session={s} card={card} canPractice={!isMentor} />}
          <Transcript s={s} open={isMentor} />
          {card.sealed
            ? <BlindScoreForm session={s} viewer={user} onSubmit={async ({ scores, note }) => {
                const item = { userId: user.key, kind: "blind_score", form: "2026", blind: true, scores, note, ai_at_submit: aiSnapshot(s), timestamp: new Date().toISOString(),
                  text: formatScoreLine({ who: user.name, date: today(), scores, blind: true, note }) };
                const { ok, mentorFeedback } = await appendFeedback(s.id, item);
                if (ok) onUpdate({ ...unseal(s), mentorFeedback });
                return ok;
              }} />
            : <Analysis s={s} card={card} compare={compare} compareName={compareName} isMentor={isMentor} onUpdate={onUpdate} />}
          <ThreadBox s={s} user={user} onUpdate={onUpdate} />
          {!isMentor && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.04)", textAlign: "right" }}>
              <button onClick={async () => { if (confirm("Delete this MA session? This cannot be undone.")) { if (await deleteMaSession(s.id)) onDelete(s.id); else alert("Delete failed — the Sheet didn't confirm. Try again."); } }}
                style={{ background: "none", border: "1px solid rgba(224,80,40,0.15)", borderRadius: 4, padding: "4px 10px", color: C.red, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Delete session</button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── transcript ───────────────────────────────────────────────────────────────
const SPEAKER_RE = [[/^(Mark(?:\s*\([^)]*\))?)\s*:/, SPEAKER.mark.color], [/^(Peer|[A-Z][a-z]+\s*\(peer\))\s*:/, SPEAKER.peer.color], [/^(Examiner)\s*:/, SPEAKER.examiner.color], [/^(AI)\s*:/, SPEAKER.ai.color]];
const HEADER_RE = /^(PEER DIALOG|PRESCRIPTION DELIVER[A-Z]*[^:]*|PRESENTATION TO EXAMINER|EXAMINER Q&A|PRIVATE NOTES|WRITTEN ANALYSIS|Root cause)\s*:/;
const Lines = ({ text }) => String(text || "").split("\n").map((line, i) => {
  if (HEADER_RE.test(line)) return <div key={i} style={{ fontWeight: 700, color: C.muted, marginTop: 10, marginBottom: 2, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{line}</div>;
  for (const [re, color] of SPEAKER_RE) { const m = line.match(re); if (m) return <div key={i} style={{ marginBottom: 4 }}><span style={{ fontWeight: 700, color }}>{m[1]}:</span>{line.slice(m[0].length)}</div>; }
  return <div key={i} style={{ minHeight: line ? undefined : 6 }}>{line}</div>;
});

function Transcript({ s, open }) {
  const secs = SECTION_TITLES.filter(([k]) => s.sections?.[k]);
  const video = (s.videoUrl || s.notes?.match(/Video:\s*(https?:\/\/\S+)/)?.[1] || "").trim();
  return (
    <details style={{ marginBottom: 8 }} open={open}>
      <summary style={{ fontSize: 12, color: TONE, cursor: "pointer", fontWeight: 600 }}>Mark's MA analysis</summary>
      <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)", fontSize: 13, color: C.body, lineHeight: 1.6, marginTop: 4 }}>
        {/* Structured sections when the session has them: every section in full, so the peer delivery is never cut short (Chris, 9/18). */}
        {secs.length ? secs.map(([k, title]) => (
          <div key={k} style={{ opacity: k === "private_notes" || k === "root_cause" ? 0.7 : 1 }}>
            <div style={{ fontWeight: 700, color: C.muted, marginTop: 10, marginBottom: 2, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
            <Lines text={s.sections[k]} />
          </div>
        )) : <Lines text={s.transcript || "No transcript"} />}
      </div>
      {(video || s.conditions) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 4, fontSize: 11, color: C.muted }}>
          {video && <a href={video} target="_blank" rel="noreferrer" style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(48,136,204,0.08)", color: C.blue, textDecoration: "none" }}>▶ Video</a>}
          {s.videoSkier && <span>Skier: {s.videoSkier}</span>}{s.videoTime && <span>Time: {s.videoTime}</span>}{s.conditions && <span>Conditions: {s.conditions}</span>}
        </div>
      )}
    </details>
  );
}

// ── AI analysis (+ reveal) ───────────────────────────────────────────────────
function Analysis({ s, card, compare, compareName, isMentor, onUpdate }) {
  const [step, setStep] = useState(""); const [err, setErr] = useState("");
  const d = card.detail || {};
  const didWell = d.did_well || d.strengths || [], opp = d.opportunity || d.gaps || [];
  const dl = card.delta;

  const rescore = async () => {
    if (card.status === "scored" && !confirm(card.form === "legacy" ? "Rescore on the 2026 form? The old-scorer numbers are kept in this session's score history." : "Rescore this session? The current score is kept in its score history.")) return;
    setErr("");
    try {
      setStep("Step 1 of 2 — taking inventory of what you said (about a minute)…");
      const extraction = await scoreExtract({ id: s.id, date: s.date, type: s.type, context: s.context, who: s.who, activity: s.activity, conditions: s.conditions, transcript: s.transcript, sections: s.sections });
      setStep("Step 2 of 2 — scoring against the 2026 form and Chris's feedback (1–2 minutes)…");
      const result = await scoreEvaluate(extraction, s.id);
      const prev = card.status === "scored" ? { form: card.form, scorer: card.scorer, scored_at: card.scoredAt, scores: Object.fromEntries(card.lines.map((l) => [l.key, l.score])) } : null;
      const scorer = result.meta?.scorer || "rag";
      const summary = fitSummary({
        ...compactForSheet(result), scorer,
        allAttempts: [{ attempt: 1, scores: result.scores, section_averages: sectionAverages(result), scorer, did_well: result.did_well, opportunity: result.opportunity, key_learning: result.key_learning }],
        bestAttempt: 1, totalAttempts: 1, scoredAt: new Date().toISOString(), rescored: true,
        score_history: [...(d.score_history || []), ...(prev ? [prev] : [])].slice(-6),
      });
      setStep("Saving…");
      if (await saveMaSummary(s.id, summary)) onUpdate({ ...s, summary: JSON.stringify(summary) });
      else setErr("Scored, but the Sheet didn't take the save. The old score is unchanged — try again.");
    } catch (e) { setErr(`Rescore failed — the existing score is unchanged. (${String(e.message || e).slice(0, 160)})`); }
    setStep("");
  };

  return (
    <details style={{ marginBottom: 8 }} open>
      <summary style={{ fontSize: 12, color: "#a0a0d0", cursor: "pointer", fontWeight: 600 }}>AI analysis{compare ? ` · beside ${compareName}'s scorecard` : ""}</summary>
      <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(160,160,208,0.04)", marginTop: 4 }}>
        {card.status === "scored" ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: C.dim }}>AI</span><MeetsBadge small meets={card.meets} />
                {compare && <><span style={{ fontSize: 11, color: C.dim }}>{compareName}</span><MeetsBadge small meets={compare.meets} /></>}
              </div>
              <ScorerTag card={card} />
            </div>
            <LegacyNotice card={card} />
            <ScoreGrid card={card} compare={card.form === "2026" ? compare : null} compareLabel={compareName} />
            {compare && card.form === "legacy" && <Hint style={{ marginBottom: 8 }}>{compareName} scored this on the 2026 form ({Object.values(compare.scores).join(" ")}). The AI score here is on the old lines, so there is no line-by-line comparison. Rescore to get one.</Hint>}
            {dl && dl.n > 0 && (
              <div style={{ fontSize: 12, color: C.body, marginBottom: 10, padding: "6px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                <b>Agreement with {compareName}:</b> exact {dl.exact}/{dl.n} · within one {dl.withinOne}/{dl.n}{dl.sameResult != null ? ` · ${dl.sameResult ? "same" : "different"} overall result` : ""}
                {!compare.blind && <span style={{ color: C.dim }}> · not a blind score (posted by {USERS[compare.postedBy]?.name || compare.postedBy})</span>}
                {compare.aiAtSubmit?.scored_at && card.scoredAt && compare.aiAtSubmit.scored_at !== card.scoredAt && <span style={{ color: C.dim }}> · AI has been rescored since {compareName} submitted</span>}
              </div>
            )}
            {compare?.note && <Block tone={USERS[compare.who]?.color || C.green} label={`${compareName}'s note`}>{compare.note}</Block>}
            <Diagnostics card={card} />
            {d.key_learning && <Block tone={C.amber} label="Key focus">{d.key_learning}</Block>}
            {didWell.length > 0 && <Block tone={C.green} label="What you did well">{didWell.join(" · ")}</Block>}
            {opp.length > 0 && <Block tone={C.orange} label="Opportunity">{opp.join(" · ")}</Block>}
            {d.time_note && <Block tone={C.blue} label="Delivery">{d.time_note}</Block>}
            <Rationale card={card} />
            {card.attempts?.total > 1 && <Hint>{card.attempts.total - 1} revision{card.attempts.total > 2 ? "s" : ""} · showing the best attempt ({card.attempts.best === 1 ? "initial" : `revision ${card.attempts.best - 1}`})</Hint>}
            {d.score_history?.length > 0 && <Hint>Earlier scores: {d.score_history.map((h) => `${shortDate(h.scored_at) || "—"} ${h.form === "legacy" ? "old scorer" : h.scorer} ${Object.values(h.scores).map((v) => v ?? "—").join("")}`).join(" · ")}</Hint>}
            {card.warnings.length > 0 && <Hint style={{ color: C.orange }}>Check: {card.warnings.join("; ")}</Hint>}
          </>
        ) : (
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 4 }}>{card.status === "unparsed" ? "A score was saved for this session but it can't be read. Rescore to replace it." : "No AI analysis yet."}</div>
        )}
        {!isMentor && (s.transcript || Object.keys(s.sections || {}).length > 0) && (
          <div style={{ marginTop: 8 }}>
            <Button tone={TONE} disabled={!!step} onClick={rescore} style={{ padding: "5px 12px", fontSize: 12 }}>{step ? "Rescoring…" : card.form === "legacy" ? "Rescore on the 2026 form" : card.status === "scored" ? "Rescore" : "Score this session"}</Button>
            {step && <Hint style={{ color: C.amber, marginTop: 5 }}>{step} Keep this tab open.</Hint>}
            {err && <div style={{ fontSize: 12, color: C.red, marginTop: 5 }}>{err}</div>}
          </div>
        )}
      </div>
    </details>
  );
}

// ── comment thread ───────────────────────────────────────────────────────────
function ThreadBox({ s, user, onUpdate }) {
  const draftKey = `rmat_fb_${user.key}_${s.id}`;
  const [text, setText] = useState(() => { try { return window.localStorage.getItem(draftKey) || ""; } catch { return ""; } });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const setDraft = (v) => { setText(v); try { v ? window.localStorage.setItem(draftKey, v) : window.localStorage.removeItem(draftKey); } catch { /* ignore */ } };
  const thread = visibleFeedback(s, { viewer: user });
  const post = async () => {
    const t = text.trim(); if (!t || busy) return;
    setBusy(true); setErr("");
    const { ok, mentorFeedback } = await appendFeedback(s.id, { userId: user.key, text: t, timestamp: new Date().toISOString() });
    if (ok) { onUpdate({ ...s, mentorFeedback }); setDraft(""); } else setErr("Couldn't post — your comment is still in the box. Try again.");
    setBusy(false);
  };
  return (
    <>
      {thread.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.green, marginBottom: 4, textTransform: "uppercase" }}>Mentor feedback</div>
          {thread.map((f, i) => {
            const who = USERS[f.userId] || { name: f.userId, color: C.muted };
            const isScore = f.kind === "blind_score" || !!parseScoreLine(f.text);
            return (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, padding: "8px 10px", borderRadius: 6, background: `${who.color}06`, border: `1px solid ${who.color}12` }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: `${who.color}20`, border: `1.5px solid ${who.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: who.color }}>{who.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: who.color }}>{who.name}</span>
                    <span style={{ fontSize: 10, color: C.dim }}>{shortDate(f.timestamp)}{isScore ? " · scorecard" : ""}</span>
                  </div>
                  <div style={{ fontSize: isScore ? 12 : 13, color: isScore ? C.muted : C.body, lineHeight: 1.5, whiteSpace: "pre-wrap", marginTop: 2, overflowWrap: "anywhere" }}>{f.text}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        <textarea value={text} onChange={(e) => setDraft(e.target.value)} placeholder={user.role === "mentor" ? "Coaching feedback for Mark — what would you push on? Where did he miss? What's improving?" : "Add a note or respond to mentor feedback…"} style={{ ...txta, minHeight: 36, flex: 1, fontSize: 12 }} />
        <MicButton onResult={(t) => setDraft(text ? `${text} ${t}` : t)} />
        <button onClick={post} disabled={busy || !text.trim()} style={{ padding: "6px 12px", borderRadius: 5, fontSize: 12, fontWeight: 700, background: `${user.color}12`, border: `1px solid ${user.color}30`, color: user.color, cursor: busy ? "default" : "pointer", flexShrink: 0, fontFamily: "inherit", opacity: busy || !text.trim() ? 0.5 : 1 }}>{busy ? "Posting…" : "Post"}</button>
      </div>
      {err && <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>{err}</div>}
    </>
  );
}
