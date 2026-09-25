// Render check for the Progress tab: candidate, Chris (one session scored), Gates (nothing scored). Uses fixtures
// (no live export needed); with a MASessions export as argv[2] it renders from that instead.
// npx esbuild scripts/rendertest-progress.jsx --bundle --platform=node --format=esm --jsx=automatic --loader:.js=jsx --external:react --external:react-dom --outfile=_rtp.mjs && node _rtp.mjs [MASessions.json] [Config.json]
import React from "react";
import { renderToString } from "react-dom/server";
import fs from "fs";
import Progress from "../src/tabs/Progress.jsx";
import { normalizeMaRow, byDateDesc } from "../src/api.js";
import { sealSessions, formatScoreLine } from "../src/lib/scorecard.js";
import { USERS } from "../src/lib/users.js";

const mem = new Map();
globalThis.window = { localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } };
globalThis.fetch = async () => { throw new Error("no network in the render test"); };
const u = (k) => ({ key: k, ...USERS[k] });
const text = (h) => h.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&quot;/g, "'").replace(/\s+/g, " ");
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok  ", m); };

// ── fixtures (same shapes as selftest-progress) ──
const gap = (a, b) => `Instead of '${a},' say '${b},' because the how is what makes the connection complete.`;
const summary = (scores, ce) => JSON.stringify({ scores, meta: { scorer: "v2-rag-4", scored_at: "2026-09-18T20:00:00Z" }, score_rationale: { cause_effect: "why" }, gap_to_next: { cause_effect: ce, evaluate: gap("describing the turn", "you wanted guided; it was pivoted") },
  citations: { cause_effect: ["c:aaaaaaaa"] }, citation_details: { "c:aaaaaaaa": { author: "chris", date: "2026-09-17", title: "T", text: "Chris on MA session x — T: answer the how in depth" } } });
const chrisCard = { cause_effect: 2, evaluate: 2, prescription: 3, desired_performances: 2, biomechanics: 3, equipment: 3 };
const ai1 = { cause_effect: 3, evaluate: 4, prescription: 3, desired_performances: 2, biomechanics: 3, equipment: 4 };
const blind = { userId: "chris", kind: "blind_score", form: "2026", blind: true, scores: chrisCard, note: "", ai_at_submit: { form: "2026", scores: ai1, scorer: "v2-rag-4" }, timestamp: "2026-09-19T00:00:00Z", text: formatScoreLine({ who: "Chris", date: "2026-09-19", scores: chrisCard, blind: true }) };
let sessions = [
  { id: "s1", date: "2026-09-18", type: "AT MA Exam", who: "Sam", activity: "Fall Line Bumps", sections: { presentation: "x" }, summary: summary(ai1, gap("whole-body rotation caused the ski to pivot", "whole-body rotation means the legs cannot turn independently, so the ski pivots")), mentorFeedback: [blind] },
  { id: "s2", date: "2026-09-22", type: "AT MA Exam", who: "Ben", activity: "Dynamic parallel", sections: { presentation: "y" }, summary: summary({ ...ai1, cause_effect: 2, equipment: 2 }, gap("the hips rotated", "hip rotation means the legs cannot turn independently, so the ski pivots")), mentorFeedback: [] },
  { id: "s3", date: "2026-05-01", type: "MA", who: "Chuck", activity: "Old one", sections: {}, summary: JSON.stringify({ scores: { describe: 4, cause_effect: 3, evaluate: 4, prescription: 4, biomechanics: 3, communication: 4 } }), mentorFeedback: [] },
];
let config = { _MENTOR_ASSESSMENTS: JSON.stringify({ chris: { whatsWorking: "Names the fundamental.", consistentGaps: "Stops at the body.", progress: "Some.", challenge: "Finish the chain to the outcome, unprompted.", lastUpdated: "2026-09-24" } }) };
if (process.argv[2]) { sessions = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).rows.map(normalizeMaRow).filter(Boolean).sort(byDateDesc); }
if (process.argv[3]) { config = Object.fromEntries(JSON.parse(fs.readFileSync(process.argv[3], "utf8")).rows.map((r) => [String(r.id).trim(), r.data])); }
const journal = { entries: [], typeColumn: true };
const render = (who) => text(renderToString(<Progress user={u(who)} maSessions={sealSessions(sessions, u(who))} journal={journal} config={config} loaded onConfig={() => {}} />));

const mark = render("mark");
ok(mark.includes("Mentor Development Assessments") && mark.includes("Where to challenge or push: Finish the chain to the outcome, unprompted."), "candidate: reads every mentor's four fields, the fourth included");
ok(!mark.includes("Your Development Assessment") && !mark.includes("Suggest an assessment"), "candidate: no form, no AI analysis");
ok(mark.includes("Recurring coaching gaps") && mark.includes("same gap every time") && mark.includes("Chris, Sep 17") && mark.includes("AI 2") && mark.includes("Chris 2"), "candidate: recurring gaps with the Chris citation and both numbers");
ok(mark.includes("Scores over time") && mark.includes("Sep 18") && mark.includes("Sep 22") && mark.includes("1 old-scorer session") && mark.includes("Does not"), "candidate: 2026 trend table, legacy listed separately");
ok(mark.includes("Agreement — AI scorer vs Chris") && mark.includes("Gates") && mark.includes("Mike"), "candidate: agreement panel with a mentor switch");
ok(mark.includes("pending his approval") && mark.includes("you can delete obvious junk"), "candidate: pending list is read-only-ish");
ok(mark.includes("no access code set"), "candidate: access-code affordance present");

const chris = render("chris");
ok(chris.includes("Your Development Assessment of Mark") && ["What's working", "Consistent gaps", "Progress I've noticed", "Where to challenge or push"].every((l) => chris.includes(l)) && chris.includes("Last updated 2026-09-24"), "mentor: four-field form with his saved text");
ok(chris.includes("Suggest an assessment") && chris.includes("2 withheld"), "mentor: AI analysis offered; withheld sessions counted");
ok(chris.includes("Statements from your calls") && chris.includes("Nothing here is used until you approve it"), "mentor: approval view in his voice");
ok(chris.includes("Sep 18") && !chris.includes("Sep 22") && chris.includes("2 sessions you haven't scored yet are not shown") && !chris.includes("old-scorer session"), "mentor: trends show only the session he scored; no numbers from the others");
ok(chris.includes("Recurring coaching gaps") && !chris.includes("hip rotation means") && chris.includes("whole-body rotation means"), "mentor: gap text only from the session he scored");
ok(!chris.includes("Agreement — AI scorer vs Gates") && chris.includes("Agreement — AI scorer vs Chris") && !chris.includes("Mike"), "mentor: agreement locked to himself");
ok(!/\b(Dynamic parallel)\b/.test(chris), "mentor: the unscored session's name never appears with a score");

const gates = render("gates");
ok(gates.includes("Your Development Assessment of Mark") && gates.includes("Nothing saved yet") && gates.includes("Score a session in MA History and it appears here") && gates.includes("Score a session and its coaching lines appear here"), "Gates: empty form, no scores anywhere");
ok(!gates.includes("Sep 18") && !gates.includes("Chris 2"), "Gates: nothing from Chris's card or the AI");
