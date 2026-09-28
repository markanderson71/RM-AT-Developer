// Shared two-step scoring run (session 9) for the modes that score a whole session: Written MA and Examiner Sparring.
// Same calls as the AT Exam (extract → evaluate), same card (resultCard), same failure handling: a failed run is shown
// as failed and retried; it is never scored another way (§15).
import React, { useState } from "react";
import { C } from "../theme.js";
import { Button, Hint } from "../components/index.jsx";
import { scoreExtract, scoreEvaluate } from "../api.js";
import { resultCard } from "../lib/scorecard.js";
import { ScoreGrid, MeetsBadge, Diagnostics, Block } from "../components/ScoreViews.jsx";
import Rationale from "./Rationale.jsx";

/** Runs the scorer on `session` (scoring shape) and returns the attempt via onResult. */
export function useScoreRun() {
  const [step, setStep] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (session, savedId) => {
    setBusy(true);
    try {
      setStep("Step 1 of 2 — taking inventory of what you actually said (about a minute)…");
      const extraction = await scoreExtract(session);
      setStep("Step 2 of 2 — scoring against the 2026 form and Chris's statements (1–2 minutes)…");
      const result = await scoreEvaluate(extraction, savedId || undefined);
      setStep(""); setBusy(false);
      return { ...result, scorer: result.meta?.scorer || "rag", timestamp: new Date().toISOString() };
    } catch (e) {
      setStep(""); setBusy(false);
      return { failed: true, scorer: "none", scorer_error: String(e.message || e).slice(0, 300), timestamp: new Date().toISOString() };
    }
  };
  return { run, step, busy };
}

export function ScoreResult({ attempt, tone = C.amber, onRetry, busy, step }) {
  if (!attempt) return null;
  if (attempt.failed) return (
    <div style={{ padding: "10px 12px", borderRadius: 6, background: "rgba(224,80,40,0.08)", border: "1px solid rgba(224,80,40,0.25)", marginTop: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.red }}>Scoring didn't complete — nothing was lost</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 4, overflowWrap: "anywhere" }}><b>Error:</b> {attempt.scorer_error}</div>
      {onRetry && <Button solid tone={tone} disabled={busy} onClick={onRetry} style={{ width: "100%", marginTop: 8 }}>{busy ? step || "Scoring…" : "Score again"}</Button>}
    </div>
  );
  const card = resultCard(attempt);
  return (
    <div style={{ padding: 12, borderRadius: 8, background: `${tone}0a`, border: `1px solid ${tone}1a`, marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><span style={{ fontSize: 13, fontWeight: 700, color: tone }}>Score</span><MeetsBadge meets={card.meets} /></div>
      {card.status === "scored" ? (<>
        <ScoreGrid card={card} />
        <Diagnostics card={card} />
        {attempt.key_learning && <Block tone={C.amber} label="Key focus">{attempt.key_learning}</Block>}
        {attempt.opportunity?.length > 0 && <Block tone={C.orange} label="Opportunity">{attempt.opportunity.join(" · ")}</Block>}
        <Rationale card={card} open />
      </>) : <Hint style={{ color: C.orange }}>The scorer didn't return usable JSON. Score again.</Hint>}
    </div>
  );
}
