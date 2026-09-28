// Line drills (session 9 — Mark: "practise bits of the exam: the IDP ideal presentation and outcomes, equipment,
// tactics"). One form line at a time. The scenario is dealt (IDP task) or generated (one short call); Mark answers in
// one passage; that line alone is scored by the evaluator through the drill path (lib/score.js scoreLine, drill: true)
// — same clerk, same ladder, same guards as a real session. Then one examiner follow-up aimed at what the scorer said
// was missing, and he tries again. Saved to MA History as type `drill` (one line; never trended with full sessions).
import React, { useEffect, useRef, useState } from "react";
import { C } from "../theme.js";
import { Button, Hint, Textarea } from "../components/index.jsx";
import { callClaude, saveMaSession, scoreDrill } from "../api.js";
import { scoreColor } from "../components/ScoreViews.jsx";
import { MentorQuote } from "./Rationale.jsx";
import { DRILLS, DRILL_ORDER, DRILL_SCENARIO_SYSTEM, drillScenarioUser, DRILL_FOLLOWUP_SYSTEM, drillFollowupUser } from "../lib/sparringPrompts.js";
import { freshDrill, drillEmpty, drillSession, dealTask, loadMode, persistMode } from "../lib/sparring.js";
import { loadIdpTasks, renderTask } from "../lib/idp.js";
import { hashOf } from "../lib/exam.js";

export default function LineDrill({ onSaved }) {
  const [d, setD] = useState(() => loadMode("drill", freshDrill));
  const [tasks, setTasks] = useState([]);
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(""); const [secs, setSecs] = useState(0);
  const [saveMsg, setSaveMsg] = useState("");
  const timer = useRef(null);
  const ref = useRef(d); ref.current = d;
  useEffect(() => persistMode("drill", d, drillEmpty), [d]);
  useEffect(() => { loadIdpTasks().then(setTasks).catch(() => {}); return () => clearInterval(timer.current); }, []);
  const upd = (p) => setD((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) }));
  const tick = () => { clearInterval(timer.current); const t0 = Date.now(); setSecs(0); timer.current = setInterval(() => setSecs(Math.round((Date.now() - t0) / 1000)), 1000); };

  const start = async (line) => {
    const def = DRILLS[line];
    const task = dealTask(tasks, `${line}-${Date.now()}`);
    setErr(""); setSaveMsg("");
    if (!def.generate) { upd({ ...freshDrill(), line, task, scenario: renderTask(task) }); return; }
    setBusy("Setting up the scenario…");
    upd({ ...freshDrill(), line, task });
    const resp = await callClaude([{ role: "user", content: drillScenarioUser(def, task) }], DRILL_SCENARIO_SYSTEM, { max_tokens: 500 });
    const peerIntent = line === "evaluate" ? (resp.match(/["“]([^"”]{12,200})["”]/)?.[1] || "") : "";
    upd({ scenario: resp, peerIntent }); setBusy("");
  };
  const score = async () => {
    const cur = ref.current; if (!cur.passage.trim()) return;
    setErr(""); setBusy("Reading your answer, then scoring that line against the form and Chris's statements (about a minute)…"); tick();
    try {
      const r = await scoreDrill({ line: cur.line, passage: cur.passage.trim(), activity: cur.task?.name, peerIntent: cur.peerIntent });
      const t = { at: new Date().toISOString(), passage: cur.passage.trim(), score: r.score, why: r.score_rationale, gap: r.gap_to_next, evidence: r.evidence_count, unit: r.unit, justifications: r.justifications, citations: r.citations, citation_details: r.citation_details, scorer: r.meta?.scorer, secs: Math.round((r.meta?.ms?.total || 0) / 1000) };
      upd((s) => ({ tries: [...s.tries, t].slice(-6), followup: "" }));
      setBusy("Examiner's follow-up…");
      const q = await callClaude([{ role: "user", content: drillFollowupUser({ line: cur.line, passage: cur.passage, gap: r.gap_to_next, unit: DRILLS[cur.line].unit }) }], DRILL_FOLLOWUP_SYSTEM, { max_tokens: 120 });
      upd({ followup: /^(Error:|Unable to reach)/.test(q) ? "" : q.trim() });
    } catch (e) { setErr(String(e.message || e).slice(0, 220)); }
    clearInterval(timer.current); setBusy("");
  };
  const save = async () => {
    const s = drillSession(ref.current); const h = hashOf({ t: s.transcript, s: s.summary });
    if (ref.current.savedHash === h) { setSaveMsg("Already saved."); return; }
    setSaveMsg("Saving…");
    const ok = await saveMaSession(s);
    if (ok) { upd({ savedId: s.id, savedHash: h }); onSaved?.(s); setSaveMsg(`Saved to MA History as ${s.date} · ${s.context}.`); } else setSaveMsg("Save failed — everything is still here.");
  };
  const def = d.line ? DRILLS[d.line] : null;
  const last = d.tries[d.tries.length - 1];
  const prev = d.tries[d.tries.length - 2];
  const cites = last ? Object.entries(last.citation_details || {}).map(([id, c]) => ({ id, ...c })).filter((c) => ["chris", "gates", "mike"].includes(c.author) && c.type !== "exemplar") : [];

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {DRILL_ORDER.map((k) => { const x = DRILLS[k]; const on = d.line === k; return (
          <button key={k} type="button" disabled={!!busy} onClick={() => { if (!d.line || drillEmpty(d) || d.savedHash || !d.tries.length || confirm("Start a different drill? This one isn't saved.")) start(k); }} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", background: on ? `${x.color}18` : "rgba(255,255,255,0.02)", border: `1.5px solid ${on ? x.color : "rgba(255,255,255,0.07)"}`, color: on ? x.color : C.muted }}>{x.title}</button>
        ); })}
        {d.line && <button type="button" disabled={!!busy} onClick={() => start(d.line)} style={{ marginLeft: "auto", background: "none", border: `1px solid ${C.faint}`, borderRadius: 6, color: C.muted, fontSize: 12, cursor: "pointer", padding: "4px 10px", fontFamily: "inherit" }}>↻ New scenario</button>}
      </div>
      {!d.line && <Hint style={{ lineHeight: 1.6 }}>Pick a line. Each drill is scored on that line alone, by the same scorer and the same bar as a full exam — the definition of "done" under each is the scorer's own unit for the line. Nothing here changes a session's score.</Hint>}
      {def && (<>
        <div style={{ padding: "8px 10px", borderRadius: 6, background: `${def.color}08`, border: `1px solid ${def.color}22`, marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: def.color }}>{def.title}{d.task ? ` · ${d.task.name}` : ""}</div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginTop: 2 }}><b style={{ color: C.dim }}>What counts: </b>{def.unit}</div>
        </div>
        {busy && !d.scenario && <Hint style={{ color: C.amber }}>{busy}</Hint>}
        {d.scenario && <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", marginBottom: 8 }}><div style={{ fontSize: 10, fontWeight: 700, color: C.dim, marginBottom: 3 }}>{def.generate ? "SCENARIO" : "THE TASK"}</div><div style={{ fontSize: 13, color: C.body, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{d.scenario}</div></div>}
        {d.scenario && (<>
          <div style={{ fontSize: 13, fontWeight: 600, color: def.color, marginBottom: 4 }}>{def.ask}</div>
          {d.followup && <div style={{ padding: "6px 10px", borderRadius: 6, borderLeft: `3px solid ${C.examiner}`, background: `${C.examiner}0a`, fontSize: 13, color: C.body, marginBottom: 6 }}><b style={{ color: C.examiner }}>Examiner: </b>{d.followup}</div>}
          <Textarea value={d.passage} onChange={(v) => upd({ passage: v })} style={{ minHeight: 120, fontSize: 14, lineHeight: 1.7 }} placeholder={d.followup ? "Rework your answer to cover it — say the whole thing again, not just the missing piece." : "Say it as you would to the examiner. Type or use the mic."} />
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            <Button tone={def.color} disabled={!!busy || d.passage.trim().length < 20} onClick={score} style={{ padding: "7px 14px", fontSize: 13 }}>{busy ? `Scoring… ${secs}s` : d.tries.length ? `Score again (try ${d.tries.length + 1})` : "Score this line"}</Button>
            {last && <Button tone={C.green} disabled={!!busy} onClick={save} style={{ padding: "7px 14px", fontSize: 13 }}>Save to MA History</Button>}
            <Hint>Practice — the score is on this line only.</Hint>
          </div>
          {busy && <Hint style={{ color: C.amber, marginTop: 4 }}>{busy}</Hint>}
          {err && <div style={{ color: C.red, fontSize: 12, marginTop: 4 }}>Couldn't score it: {err}</div>}
          {saveMsg && <Hint style={{ marginTop: 4, color: /failed/.test(saveMsg) ? C.red : C.green }}>{saveMsg}</Hint>}
        </>)}
        {last && (
          <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 6, background: "rgba(48,136,204,0.06)", border: "1px solid rgba(48,136,204,0.18)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: scoreColor(last.score) }}>{prev ? <><span style={{ color: scoreColor(prev.score) }}>{prev.score}</span><span style={{ color: C.dim, fontSize: 14 }}> → </span></> : null}{last.score}</span>
              <span style={{ fontWeight: 700, color: last.unit?.complete ? C.green : C.orange }}>{last.unit?.complete ? "✓ Complete unit" : "✗ Unit not complete"}</span>
              <span style={{ fontSize: 11, color: C.dim }}>{last.secs ? `${last.secs}s · ` : ""}try {d.tries.length}{last.scorer ? ` · ${last.scorer}` : ""}</span>
            </div>
            {!last.unit?.complete && last.unit?.missing?.length > 0 && <div style={{ fontSize: 12, color: C.body, marginTop: 3 }}>Still missing: {last.unit.missing.join(" · ")}.</div>}
            {last.evidence && <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>Evidence — {last.evidence}</div>}
            <div style={{ fontSize: 12, color: "#b0b8c0", marginTop: 4, lineHeight: 1.55 }}>{last.why}</div>
            {last.gap && <div style={{ fontSize: 12, color: C.amber, marginTop: 3 }}>→ {last.gap}</div>}
            {cites.slice(0, 2).map((c) => <MentorQuote key={c.id} c={c} />)}
            {d.tries.length > 1 && <Hint style={{ marginTop: 4 }}>Tries: {d.tries.map((t) => t.score).join(" → ")}</Hint>}
          </div>
        )}
      </>)}
    </div>
  );
}
