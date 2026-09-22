import React from "react";
import { C } from "../theme.js";
import { Card } from "../components/index.jsx";
import ATExam from "./ATExam.jsx";

/**
 * Sparring tab. Session 3 ships the AT MA Exam mode. The other sparring modes (Open chat, Scenario,
 * Reverse MA, Compare, Video, Written MA) stay on the old app until their session — see §17.
 */
export default function Sparring({ maSessions, mentorAssessments, onSaved }) {
  return (
    <>
      <div style={{ fontSize: 14, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>Full exam simulation — observe, verify with the peer, prescribe, present, take the examiner's questions.</div>
      <Card style={{ borderLeft: `3px solid ${C.exam}` }}>
        <div style={{ fontSize: 12, color: C.exam, marginBottom: 12, padding: "6px 10px", borderRadius: 5, background: `${C.exam}0c`, border: `1px solid ${C.exam}22` }}>
          🏔️ <strong>AT MA Exam</strong> — the examiner only scores what they heard. Notes are private.
        </div>
        <ATExam maSessions={maSessions} mentorAssessments={mentorAssessments} onSaved={onSaved} />
      </Card>
    </>
  );
}
