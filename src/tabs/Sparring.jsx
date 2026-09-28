// Sparring tab (session 9): the modes are back, one component per kind. The AT Exam is ATExam.jsx (session 3);
// the rest are new files. Mode choice is remembered; each mode keeps its own in-progress state (src/lib/sparring.js).
import React, { useState } from "react";
import { C } from "../theme.js";
import { Card } from "../components/index.jsx";
import { MODES, modeById, MODE_KEY } from "../lib/sparring.js";
import ATExam from "./ATExam.jsx";
import ChatMode from "./ChatMode.jsx";
import WrittenMA from "./WrittenMA.jsx";
import ExaminerSparring from "./ExaminerSparring.jsx";
import LineDrill from "./LineDrill.jsx";

export default function Sparring({ maSessions, mentorAssessments, config, onSaved }) {
  const [modeId, setModeId] = useState(() => { try { return modeById(window.localStorage.getItem(MODE_KEY) || "atexam").id; } catch { return "atexam"; } });
  const mode = modeById(modeId);
  const pick = (id) => { setModeId(id); try { window.localStorage.setItem(MODE_KEY, id); } catch { /* ignore */ } };
  const common = { maSessions, mentorAssessments, config, onSaved };
  return (
    <>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        {MODES.map((m) => (
          <button key={m.id} type="button" onClick={() => pick(m.id)} style={{ padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", background: modeId === m.id ? `${m.color}14` : "rgba(255,255,255,0.02)", border: `1.5px solid ${modeId === m.id ? m.color : "rgba(255,255,255,0.06)"}`, color: modeId === m.id ? m.color : C.muted }}>{m.icon} {m.label}</button>
        ))}
      </div>
      <Card style={{ borderLeft: `3px solid ${mode.color}` }}>
        <div style={{ fontSize: 12, color: mode.color, marginBottom: 12, padding: "6px 10px", borderRadius: 5, background: `${mode.color}0c`, border: `1px solid ${mode.color}22` }}>
          {mode.icon} <strong>{mode.label}</strong> — {mode.desc}
        </div>
        {mode.kind === "exam" && <ATExam {...common} />}
        {mode.kind === "examiner" && <ExaminerSparring {...common} />}
        {mode.kind === "drill" && <LineDrill {...common} />}
        {mode.kind === "written" && <WrittenMA {...common} />}
        {mode.kind === "chat" && <ChatMode key={mode.id} mode={mode} {...common} />}
      </Card>
    </>
  );
}
