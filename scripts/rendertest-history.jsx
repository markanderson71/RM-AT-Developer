// Render check for MA History against a real MASessions export (candidate, mentor sealed, mentor after submit).
// npx esbuild scripts/rendertest-history.jsx --bundle --platform=node --format=esm --jsx=automatic --loader:.js=jsx --external:react --external:react-dom --outfile=_rt.mjs && node _rt.mjs export.json
import React from "react";
import { renderToString } from "react-dom/server";
import fs from "fs";
import MAHistory from "../src/tabs/MAHistory.jsx";
import ATExam from "../src/tabs/ATExam.jsx";
import { normalizeMaRow } from "../src/api.js";
import { sealSessions, unseal, scorecard, formatScoreLine, aiSnapshot } from "../src/lib/scorecard.js";
import { USERS } from "../src/lib/users.js";
const ss = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).rows.map(normalizeMaRow).filter(Boolean);
const u = (k) => ({ key: k, ...USERS[k] });
const text = (h) => h.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&quot;/g, "'").replace(/\s+/g, " ").replace(/ ([,.:;)])/g, "$1").replace(/\( /g, "(");
const noop = () => {};

const markHtml = text(renderToString(<MAHistory user={u("mark")} maSessions={ss} loaded onUpdate={noop} onDelete={noop} />));
const chrisSessions = sealSessions(ss, u("chris"));
const chrisHtml = text(renderToString(<MAHistory user={u("chris")} maSessions={chrisSessions} loaded onUpdate={noop} onDelete={noop} />));
const s = chrisSessions.find((x) => x.id === "7uk7lnh");
const mine = { cause_effect: 2, evaluate: 2, prescription: 3, desired_performances: 2, biomechanics: 3, equipment: 3 };
const item = { userId: "chris", kind: "blind_score", form: "2026", blind: true, scores: mine, note: "One instance is not a 4.", ai_at_submit: aiSnapshot(s), timestamp: "2026-09-19T18:00:00Z", text: formatScoreLine({ who: "Chris", date: "2026-09-19", scores: mine, blind: true, note: "One instance is not a 4." }) };
const after = chrisSessions.map((x) => (x.id === s.id ? { ...unseal(x), mentorFeedback: [item] } : x));
const revealHtml = text(renderToString(<MAHistory user={u("chris")} maSessions={after} loaded onUpdate={noop} onDelete={noop} />));
const markAfter = text(renderToString(<MAHistory user={u("mark")} maSessions={ss.map((x) => (x.id === s.id ? { ...x, mentorFeedback: [item] } : x))} loaded onUpdate={noop} onDelete={noop} />));
globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
const examHtml = text(renderToString(<ATExam maSessions={ss} mentorAssessments={{}} referenceText="" onSaved={noop} />));

const ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok  ", m); };
const aiTells = ["Why each score", "Coaching — one move per line", "AI SUGGESTIONS", "Does Not Meet", "v2-rag-2", "OLD SCORER", "Key focus", "whole-body rotation means"];
ok(markHtml.includes("Coaching — one move per line") && markHtml.includes("Try that line again") && markHtml.includes("Chris, Sep 17"), "candidate: coaching panel, try-again, Chris citation inline");
ok(markHtml.includes("the peer supplied it for you") && markHtml.includes("examiner Q&A — prompted"), "candidate: peer-quoted and prompted originals are called out");
ok(markHtml.includes("OLD SCORER") && markHtml.includes("Does Not Meet"), "candidate: legacy sessions tagged; 2026 verdict shown");
// 7n6ry6d already carries a Chris scorecard (posted by Mark from his PDF), so that one is legitimately open to him. Check the rest.
const sealedOnly = text(renderToString(<MAHistory user={u("chris")} maSessions={chrisSessions.filter((x) => x.id !== "7n6ry6d")} loaded onUpdate={noop} onDelete={noop} />));
ok(aiTells.every((t) => !sealedOnly.includes(t)) && !sealedOnly.includes("3 4 3 2 3 4"), `mentor before scoring: no AI output anywhere (${aiTells.filter((t) => sealedOnly.includes(t)).join(",") || "clean"})`);
ok(chrisHtml.includes("OLD SCORER") && chrisHtml.includes("no line-by-line comparison") === false, "mentor: 7n6ry6d (already scored by him) shows the legacy AI score, tagged");
ok(chrisHtml.includes("Your scorecard — 2026 AT MA/TU form") && chrisHtml.includes("Needs your score") && chrisHtml.includes("Prescription delivery (to peer)") && chrisHtml.includes("So you want me to focus on initiating"), "mentor before scoring: form + full sections incl. peer delivery");
ok(!chrisHtml.includes("Delete session") && !chrisHtml.includes("Rescore"), "mentor: no delete, no rescore");
ok(revealHtml.includes("Agreement with Chris: exact 3/6 · within one 5/6 · same overall result") && revealHtml.includes("AI +2") && revealHtml.includes("Coaching — one move per line") && !revealHtml.includes("Try that line again"), "mentor after submit: AI revealed, delta per line, coaching visible read-only");
ok((revealHtml.match(/Needs your score/g) || []).length === (chrisHtml.match(/Needs your score/g) || []).length - 1, "mentor after submit: only that session unsealed");
ok(markAfter.includes("Agreement with Chris: exact 3/6") && markAfter.includes("Chris's note"), "candidate sees Chris's scorecard beside the AI's");
ok(examHtml.includes("Carry these in — from 2026-09-18") && examHtml.includes("Desired Performances (2)"), "pre-exam brief on the setup screen");
