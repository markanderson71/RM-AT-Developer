// Coaching (§13 row 5, a–b). For each of the six lines: what Mark actually said, the evaluator's rewrite, the Chris
// statement it rests on — and "try that line again", which re-scores that one line with the rewritten passage.
// These are AI suggestions, labelled as such. The panel is only ever rendered from an UNSEALED card, so a mentor who
// hasn't scored never sees it (same rule as the AI score).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { C } from "../theme.js";
import { Button, Hint, Textarea } from "../components/index.jsx";
import { scoreExtract, scoreLineTry } from "../api.js";
import { hashOf } from "../lib/exam.js";
import { parseGap, findOriginal, lineQuotes, defaultSection, sectionLabel } from "../../lib/coaching.js";
import { scoreColor } from "../components/ScoreViews.jsx";
import { mentorCites, MentorQuote } from "./Rationale.jsx";

const xKey = (s) => `rmat_x_${s.id}_${hashOf({ t: s.transcript, s: s.sections })}`;
const triesKey = (s) => `rmat_tries_${s.id}`;
const load = (k, fb) => { try { return JSON.parse(window.localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const store = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota — practice log is a convenience */ } };

export default function CoachingPanel({ session, card, canPractice }) {
  const d = card.detail;
  const rows = useMemo(() => card.lines.map((l) => {
    const gap = parseGap(d.gap_to_next?.[l.key]); if (!gap) return null;
    return { ...l, gap, original: findOriginal(gap, session, lineQuotes(l.key, d.extraction)), cite: mentorCites(d, l.key)[0] || null };
  }).filter(Boolean), [card, session, d]);
  const [tries, setTries] = useState(() => load(triesKey(session), {}));
  useEffect(() => store(triesKey(session), tries), [tries, session]);
  if (card.form !== "2026" || !rows.length) return null;

  return (
    <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(232,160,80,0.05)", border: "1px solid rgba(232,160,80,0.18)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>Coaching — one move per line</div>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.dim, border: `1px solid ${C.faint}`, borderRadius: 4, padding: "1px 6px" }}>AI SUGGESTIONS · not Chris's words</span>
      </div>
      <Hint style={{ marginBottom: 8, lineHeight: 1.5 }}>Lowest lines first. The rewrite is the evaluator's; the quoted statement under it is what Chris actually said.</Hint>
      {rows.slice().sort((a, b) => (a.score ?? 9) - (b.score ?? 9)).map((r) => (
        <Line key={r.key} r={r} session={session} extraction={d.extraction} canPractice={canPractice} tries={tries[r.key] || []} onTry={(t) => setTries((p) => ({ ...p, [r.key]: [...(p[r.key] || []), t].slice(-5) }))} />
      ))}
    </div>
  );
}

function Line({ r, session, extraction, canPractice, tries, onTry }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(""); const [secs, setSecs] = useState(0);
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);
  const o = r.original;
  const mine = o.kind === "quote" && o.speaker === "Mark";
  const last = tries[tries.length - 1];

  const start = () => { setOpen(true); if (!text) setText(mine && o.spoken ? o.text : ""); };
  const run = async () => {
    setErr(""); setSecs(0); clearInterval(timer.current); const t0 = Date.now(); timer.current = setInterval(() => setSecs(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      let x = extraction || load(xKey(session), null);
      if (!x) { setBusy("This session's inventory wasn't kept — rebuilding it once (about a minute)…"); x = await scoreExtract(session); store(xKey(session), x); }
      setBusy("Reading your line, then scoring it against the same Chris statements…");
      const section = mine && o.spoken ? o.section : defaultSection(r.key, session);
      const res = await scoreLineTry({ session, extraction: x, line: r.key, section, passage: text.trim(), original: mine && o.spoken ? o.text : null });
      onTry({ at: new Date().toISOString(), passage: text.trim(), score: res.score, was: r.score, unit: res.unit, why: res.score_rationale, gap: res.gap_to_next, evidence: res.evidence_count, secs: Math.round((Date.now() - t0) / 1000) });
    } catch (e) { setErr(String(e.message || e).slice(0, 200)); }
    clearInterval(timer.current); setBusy("");
  };

  return (
    <div style={{ padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 12, lineHeight: 1.55 }}>
      <div style={{ fontWeight: 700, color: scoreColor(r.score), marginBottom: 3 }}>{r.label} ({r.score ?? "—"})</div>
      <div style={{ color: C.muted }}>
        <b style={{ color: C.dim }}>{o.kind === "quote" ? (mine ? "You said" : `${o.speaker} said`) : o.kind === "description" ? "What the AI saw" : "You said"}: </b>
        {o.kind === "none" ? <i>nothing the AI could point to — this wasn't said in the session.</i> : <span style={{ color: C.body }}>{o.kind === "quote" ? `“${o.text}”` : o.text}</span>}
        {o.kind === "quote" && <span style={{ color: C.dim }}> — {sectionLabel(o.section)}</span>}
      </div>
      {o.kind === "quote" && !mine && <div style={{ color: C.orange, fontSize: 11 }}>That line was the {o.speaker.toLowerCase()}'s, not yours — the peer supplied it for you. The suggestion is what you could have said first.</div>}
      {o.kind === "quote" && mine && !o.spoken && <div style={{ color: C.orange, fontSize: 11 }}>This was in your private notes. The examiner never heard it, so it earned nothing.</div>}
      {r.gap.say && <div style={{ marginTop: 3 }}><b style={{ color: C.amber }}>AI suggestion: </b><span style={{ color: C.body }}>“{r.gap.say}”</span></div>}
      {r.gap.because && <div style={{ color: C.muted }}><b style={{ color: C.dim }}>Because: </b>{r.gap.because}.</div>}
      {!r.gap.say && <div style={{ color: C.body }}>{r.gap.raw}</div>}
      {r.cite && <MentorQuote c={r.cite} />}

      {canPractice && !open && <button type="button" onClick={start} style={{ marginTop: 6, background: "none", border: `1px solid ${C.blue}40`, borderRadius: 5, padding: "3px 10px", color: C.blue, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>↻ Try that line again{tries.length ? ` (${tries.length})` : ""}</button>}
      {canPractice && open && (
        <div style={{ marginTop: 6 }}>
          <Textarea value={text} onChange={setText} placeholder="Say it again, in your words — not the AI's. Type or use the mic." style={{ minHeight: 70, fontSize: 13 }} />
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 5, flexWrap: "wrap" }}>
            <Button tone={C.blue} disabled={!!busy || text.trim().length < 20} onClick={run} style={{ padding: "6px 12px", fontSize: 12 }}>{busy ? `Scoring… ${secs}s` : "Score this line"}</Button>
            <button type="button" onClick={() => setOpen(false)} disabled={!!busy} style={{ background: "none", border: "none", color: C.dim, fontSize: 12, cursor: "pointer" }}>close</button>
            <Hint>Practice only — nothing is saved to the Sheet and the session's score doesn't change.</Hint>
          </div>
          {busy && <Hint style={{ color: C.amber, marginTop: 4 }}>{busy}</Hint>}
          {err && <div style={{ color: C.red, fontSize: 12, marginTop: 4 }}>Couldn't score it: {err}</div>}
        </div>
      )}
      {canPractice && last && (
        <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 5, background: "rgba(48,136,204,0.06)", border: "1px solid rgba(48,136,204,0.18)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}><span style={{ color: scoreColor(last.was) }}>{last.was ?? "—"}</span><span style={{ color: C.dim }}> → </span><span style={{ color: scoreColor(last.score) }}>{last.score}</span></span>
            <span style={{ fontWeight: 700, color: last.unit?.complete ? C.green : C.orange }}>{last.unit?.complete ? "✓ This sentence is a complete unit" : "✗ Unit not complete yet"}</span>
            <span style={{ color: C.dim, fontSize: 11 }}>{last.secs}s · try {tries.length}</span>
          </div>
          {!last.unit?.complete && last.unit?.missing?.length > 0 && <div style={{ color: C.body, marginTop: 2 }}>Still missing: {last.unit.missing.join(" · ")}.</div>}
          {last.unit?.complete && last.score === last.was && <div style={{ color: C.muted, marginTop: 2 }}>The line didn't move because it is scored on the whole analysis: one complete unit among partials is still inconsistent. Say the rest of your connections this way and it will.</div>}
          <div style={{ color: "#b0b8c0", marginTop: 3 }}>{last.why}</div>
          {last.gap && <div style={{ color: C.amber, marginTop: 2 }}>→ {last.gap}</div>}
        </div>
      )}
    </div>
  );
}
