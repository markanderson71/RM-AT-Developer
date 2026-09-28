// Render check for session 9: the Sparring tab in every mode, the exam setup with the pre-exam brief carrying
// "Where to challenge or push", a scored exam with the peer-brief reveal, and a drill / sparring session in MA History.
// npm run render:sparring
import React from "react";
import { renderToString } from "react-dom/server";
import Sparring from "../src/tabs/Sparring.jsx";
import ATExam from "../src/tabs/ATExam.jsx";
import LineDrill from "../src/tabs/LineDrill.jsx";
import ExaminerSparring from "../src/tabs/ExaminerSparring.jsx";
import MAHistory from "../src/tabs/MAHistory.jsx";
import { USERS } from "../src/lib/users.js";
import { MODE_KEY, freshDrill, freshSparring, drillSession, sparringSession } from "../src/lib/sparring.js";
import { freshExam, STORAGE_KEY } from "../src/lib/exam.js";
import { dealIntent, intentText } from "../src/lib/peerBrief.js";
import { sealSessions } from "../src/lib/scorecard.js";

const mem = new Map();
globalThis.window = { localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } };
globalThis.fetch = async () => { throw new Error("no network in the render test"); };
const u = (k) => ({ key: k, ...USERS[k] });
const text = (h) => h.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&quot;/g, "'").replace(/\s+/g, " ");
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok  ", m); };
const noop = () => {};
const assessments = { chris: { consistentGaps: "stops at the body", challenge: "Finish the chain to the outcome, unprompted.", lastUpdated: "2026-09-24" } };

// every mode renders
for (const id of ["atexam", "examiner", "drill", "writtenma", "scenario", "reverse", "compare", "video", "open"]) {
  mem.set(MODE_KEY, id);
  const h = text(renderToString(<Sparring maSessions={[]} mentorAssessments={assessments} config={{}} onSaved={noop} />));
  ok(h.includes("AT MA Exam") && h.includes("Examiner Sparring") && h.includes("Line drills") && h.includes("Written MA") && h.includes("Open Chat"), `mode ${id}: picker shows all nine modes`);
  if (id === "drill") ok(h.includes("IDP ideal") && h.includes("Two comparisons") && h.includes("Tactics") && h.includes("Equipment") && h.includes("Pick a line"), "drill mode: four drills offered, none started");
  if (id === "examiner") ok(h.includes("Submit to the examiner") && h.includes("No peer in this mode"), "examiner mode: setup screen");
  if (id === "writtenma") ok(h.includes("Write my MA") && h.includes("Generate a scenario"), "written mode: two ways in");
  if (id === "scenario") ok(h.includes("Scenario Drill — start"), "scenario chat: opener button");
  if (id === "open") ok(h.includes("leading a clinic tomorrow"), "open chat: hints");
}
ok(!text(renderToString(<Sparring maSessions={[]} mentorAssessments={{}} config={{}} onSaved={noop} />)).includes("Question bank"), "no question bank anywhere");

// exam setup: pre-exam brief carries the fourth field; hint about the dealt intent
mem.delete(STORAGE_KEY);
const setup = text(renderToString(<ATExam maSessions={[]} mentorAssessments={assessments} onSaved={noop} />));
ok(setup.includes("Where to challenge or push") && setup.includes("Finish the chain to the outcome, unprompted.") && setup.includes("Chris:"), "exam setup: 'Where to challenge or push' shown with the mentor's name");
ok(setup.includes("dealt an intent from Chris's menu") && !setup.includes("They were dealt"), "exam setup: the intent is promised, never shown");

// scored exam: the reveal
const intent = dealIntent("render");
const scored = { ...freshExam(), phase: "scored", who: "Solid L3 candidate", activity: "Dynamic Short Turns", brief: { intent }, presentation: "p",
  dialogMessages: [{ role: "user", content: "How did the top of the turn feel?" }, { role: "assistant", content: "Rushed." }],
  attempts: [{ scores: { cause_effect: 3, evaluate: 2, prescription: 3, desired_performances: 2, biomechanics: 3, equipment: 2, describe: 3, communication: 3 }, meta: { scorer: "v2-rag-5b" }, score_rationale: { evaluate: "why" }, extraction: { intent_verification: { asked: false, peer_answers: [] } }, timestamp: "t" }] };
mem.set(STORAGE_KEY, JSON.stringify(scored));
const sc = text(renderToString(<ATExam maSessions={[]} mentorAssessments={{}} onSaved={noop} />));
ok(sc.includes("The peer's brief — revealed") && sc.includes(intentText(intent)) && sc.includes("You never asked what they were going for"), "scored exam: the dealt intent is revealed with the verdict on whether Mark asked");
mem.delete(STORAGE_KEY);

// a drill in progress with one try
const d = { ...freshDrill(), line: "equipment", task: { name: "Dynamic Short Turns", levels: ["LEVEL III"], ski: [], body: [], terrain: [] }, scenario: "SCEN", passage: "long enough passage about her skis on ice", followup: "And the boot flex?",
  tries: [{ at: "t", passage: "x", score: 2, why: "why-text", gap: "Instead of X, say Y, because Z", evidence: "complete: 0 · partial: 1", unit: { complete: false, missing: ["the outcome"] }, citations: [], citation_details: {}, scorer: "v2-rag-5b", secs: 41 }] };
mem.set("rmat_spar_drill", JSON.stringify(d));
const dr = text(renderToString(<LineDrill onSaved={noop} />));
ok(dr.includes("Equipment · Dynamic Short Turns") && dr.includes("What counts:") && dr.includes("SCENARIO SCEN") && dr.includes("Examiner: And the boot flex?") && dr.includes("Unit not complete") && dr.includes("Still missing: the outcome") && dr.includes("Score again (try 2)") && dr.includes("Save to MA History"), "drill: scenario, unit, follow-up, result, try again, save");

// examiner sparring after "OK, thank you." with a debrief
const sp = { ...freshSparring(), phase: "debrief", who: "Solid L3 candidate", activity: "Dynamic Short Turns", presentation: "PRES", probes: [{ role: "assistant", content: "What was she intending?", line: "evaluate" }, { role: "user", content: "Guiding." }, { role: "assistant", content: "OK, thank you." }], debrief: { form: "F-line", chris: "C-line" } };
mem.set("rmat_spar_examiner", JSON.stringify(sp));
const es = text(renderToString(<ExaminerSparring mentorAssessments={{}} onSaved={noop} />));
ok(es.includes("Examiner A — holds the form") && es.includes("F-line") && es.includes("Examiner B — Chris's register") && es.includes("C-line") && es.includes("probed: Evaluate") && es.includes("not Chris's words") && !es.includes("[line:"), "examiner sparring: dual debrief labelled AI, probed lines named, tag never shown");

// MA History: a drill session and a sparring session, as Mark and as Chris
const drillSess = { ...drillSession(d), id: "dr1", date: "2026-09-28" };
const spSess = { ...sparringSession({ ...sp, attempts: [{ scores: { cause_effect: 3, evaluate: 2, prescription: 3, desired_performances: 2, biomechanics: 3, equipment: 2 }, meta: { scorer: "v2-rag-5b" }, score_rationale: {} }] }), id: "sp1", date: "2026-09-27" };
const hm = text(renderToString(<MAHistory user={u("mark")} maSessions={[drillSess, spSess]} loaded onUpdate={noop} onDelete={noop} />));
ok(hm.includes("Line drill — Equipment") && hm.includes("Scenario: SCEN") && hm.includes("Line drill — this line only") && hm.includes("Examiner Sparring"), "MA History (Mark): the drill opens with its scenario and one-line grid; the sparring session is listed");
const hm2 = text(renderToString(<MAHistory user={u("mark")} maSessions={[spSess]} loaded onUpdate={noop} onDelete={noop} />));
ok(hm2.includes("Debrief (AI)") && hm2.includes("Examiner A, the form: F-line"), "MA History (Mark): the sparring session's debrief shows from notes");
const hc = text(renderToString(<MAHistory user={u("chris")} maSessions={sealSessions([drillSess, spSess], u("chris"))} loaded onUpdate={noop} onDelete={noop} />));
ok(hc.includes("Needs your score") && (hc.match(/Needs your score/g) || []).length === 1, "MA History (Chris): the sparring session needs his score; the drill does not");
