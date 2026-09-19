// §9 / §12.1 — the mentor scores first. Six 1–6 tap rows on the 2026 form, one optional note, Submit.
// This component is only ever given a SEALED card, so there is no AI number in its props to leak.
// A submitted scorecard is final: changing it after the reveal would be an anchored score.
import React, { useEffect, useState } from "react";
import { C, txta } from "../theme.js";
import { Button, Hint } from "../components/index.jsx";
import { SECTIONS, LINES, formMath } from "../lib/scorecard.js";
import { scoreColor, MeetsBadge } from "../components/ScoreViews.jsx";

const SCALE = { 1: "not observed", 2: "beginning to appear", 3: "appears, not with consistency", 4: "appears regularly", 5: "frequently, above required", 6: "continuously, superior" };
const draftKey = (id, who) => `rmat_blind_${who}_${id}`;

export default function BlindScoreForm({ session, viewer, onSubmit }) {
  const [state, setState] = useState(() => { try { return JSON.parse(window.localStorage.getItem(draftKey(session.id, viewer.key))) || { scores: {}, note: "" }; } catch { return { scores: {}, note: "" }; } });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { try { window.localStorage.setItem(draftKey(session.id, viewer.key), JSON.stringify(state)); } catch { /* in-memory still works */ } }, [state, session.id, viewer.key]);

  const done = LINES.every((l) => state.scores[l.key]);
  const math = formMath(state.scores);
  const submit = async () => {
    if (!done || busy) return;
    if (!confirm("Submit your scorecard? It can't be changed once the AI score is revealed.")) return;
    setBusy(true); setErr("");
    const ok = await onSubmit({ scores: state.scores, note: state.note.trim() });
    if (ok) { try { window.localStorage.removeItem(draftKey(session.id, viewer.key)); } catch { /* ignore */ } }
    else { setErr("Couldn't save to the Sheet — your scores are still here. Try again."); setBusy(false); }
  };

  return (
    <div style={{ padding: 12, borderRadius: 8, background: `${viewer.color}0a`, border: `1px solid ${viewer.color}26`, marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: viewer.color, marginBottom: 2 }}>Your scorecard — 2026 AT MA/TU form</div>
      <Hint style={{ marginBottom: 10, lineHeight: 1.5 }}>Score from the transcript above. The AI's score and its coaching notes stay hidden until you submit, so yours is an independent read.</Hint>
      {SECTIONS.map((sec) => (
        <div key={sec.key} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            <span>{sec.label}</span>{math.sections[sec.key] != null && <span style={{ textTransform: "none", letterSpacing: 0 }}>average <b style={{ color: scoreColor(math.sections[sec.key]) }}>{math.sections[sec.key].toFixed(2)}</b></span>}
          </div>
          {sec.lines.map((l) => (
            <div key={l.key} role="radiogroup" aria-label={l.label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, color: C.body, minWidth: 150, flex: "1 1 150px" }}>{l.label}</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4, 5, 6].map((n) => { const on = state.scores[l.key] === n; return (
                  <button key={n} type="button" role="radio" aria-checked={on} title={SCALE[n]} onClick={() => setState((p) => ({ ...p, scores: { ...p.scores, [l.key]: on ? undefined : n } }))}
                    style={{ width: 38, height: 38, borderRadius: 7, fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", color: on ? "#fff" : C.muted, background: on ? scoreColor(n) : "rgba(255,255,255,0.03)", border: `1px solid ${on ? scoreColor(n) : "rgba(255,255,255,0.1)"}` }}>{n}</button>
                ); })}
              </div>
            </div>
          ))}
        </div>
      ))}
      <Hint style={{ marginBottom: 8 }}>1 not observed · 2 beginning to appear · 3 inconsistent · 4 appears regularly (pass) · 5 frequent · 6 continuous</Hint>
      <textarea value={state.note} onChange={(e) => setState((p) => ({ ...p, note: e.target.value }))} placeholder="Optional — why these scores. One or two sentences per line you feel strongly about is what calibrates the scorer." style={{ ...txta, minHeight: 56, fontSize: 13, marginBottom: 8 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Button tone={viewer.color} solid disabled={!done || busy} onClick={submit}>{busy ? "Saving…" : done ? "Submit and reveal the AI score" : `Score all six lines (${LINES.filter((l) => state.scores[l.key]).length}/6)`}</Button>
        {done && <MeetsBadge meets={math.meets} />}
      </div>
      {err && <div style={{ fontSize: 12, color: C.red, marginTop: 6, fontWeight: 600 }}>{err}</div>}
    </div>
  );
}
