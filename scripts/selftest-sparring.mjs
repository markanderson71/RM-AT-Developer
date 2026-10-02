// Offline checks for session 9 (sparring modes, peer brief, examiner tags, line drills).   npm run test:sparring
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const mem = new Map();
globalThis.window = { localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } };

const IDP = await import('../src/lib/idp.js');
const PB = await import('../src/lib/peerBrief.js');
const PR = await import('../src/lib/prompts.js');
const SP = await import('../src/lib/sparringPrompts.js');
const S = await import('../src/lib/sparring.js');
const SC = await import('../src/lib/scorecard.js');
const P = await import('../src/lib/progress.js');
const E = await import('../src/lib/exam.js');
const { scoreLine } = await import('../lib/score.js');
const { buildExtractInput } = await import('../lib/prompts/extract.js');

let n = 0; const ok = (m) => { n++; console.log('ok  ', m); };
const mark = { key: 'mark', role: 'candidate' }, chris = { key: 'chris', role: 'mentor' };

// ── 1. IDP parser ────────────────────────────────────────────────────────────────────────────────────────────────────
const tasks = IDP.parseIdp(readFileSync(new URL('../reference/skiing-idp-2025.md', import.meta.url), 'utf8'));
assert.equal(tasks.length, 44, `44 assessment activities (got ${tasks.length})`);
const dst = IDP.findTask(tasks, 'Dynamic Short Turns');
assert.equal(dst.category, 'Versatility'); assert.deepEqual(dst.levels, ['LEVEL I', 'LEVEL II', 'LEVEL III']);
assert.ok(dst.ski.some((l) => /short radius/.test(l)) && dst.body.some((l) => /Orient the upper body/.test(l)) && dst.terrain.some((l) => /snowcat/.test(l)));
const ss = IDP.findTask(tasks, 'sideslips with edge set'); assert.equal(ss.focus.slice(0, 19), 'Control edge angles'); assert.deepEqual(ss.levels, ['LEVEL I']);
assert.ok(IDP.atTasks(tasks).length >= 25 && IDP.atTasks(tasks).every((t) => t.levels.includes('LEVEL III')));
assert.ok(IDP.renderTask(dst).startsWith('IDP TASK: Dynamic Short Turns') && IDP.renderTask(dst).includes('Ski performance:\n- '));
assert.equal(IDP.findTask(tasks, 'Short Turns | Bumps (variant A)')?.name, 'Short Turns | Bumps (variant A)');
assert.equal(IDP.findTask(tasks, ''), null);
ok('IDP: 44 tasks parsed with focus / ski / body / terrain; AT pool is Level III only');

// ── 2. peer brief ────────────────────────────────────────────────────────────────────────────────────────────────────
const i1 = PB.dealIntent('seed-a'), i2 = PB.dealIntent('seed-a'), i3 = PB.dealIntent('seed-b');
assert.deepEqual(i1, i2, 'deterministic'); assert.ok(PB.OUTCOMES.some((o) => o.key === i1.outcome) && PB.SKI_PERFORMANCES.some((s) => s.key === i1.ski));
const seen = new Set(Array.from({ length: 200 }, (_, k) => `${PB.dealIntent(`x${k}`).outcome}|${PB.dealIntent(`x${k}`).ski}`)); assert.ok(seen.size >= 15, `covers the menu (${seen.size}/20)`);
void i3;
const brief = PB.renderPeerBrief({ intent: i1, taskText: IDP.renderTask(dst), who: 'Solid L3 candidate', activity: 'Dynamic Short Turns', conditions: 'firm' });
assert.ok(brief.includes('YOUR BRIEF (private') && brief.includes(PB.intentText(i1)) && brief.includes('Volunteer nothing') && brief.includes('IDP TASK: Dynamic Short Turns'));
const ctx = PR.peerContext({ who: 'Solid L3 candidate', activity: 'Dynamic Short Turns', conditions: 'firm', dialogMessages: [] }, { brief });
assert.ok(ctx.includes('YOUR BRIEF') && ctx.startsWith('You are a Solid L3 candidate'));
assert.ok(!PR.peerContext({ who: 'x', activity: 'y' }, {}).includes('BRIEF'), 'no brief → nothing added');
assert.ok(PR.PEER_SYSTEM.includes('nobody says they were "working on pivoting"') && PR.PEER_SYSTEM.includes('under 22 words') && PR.PEER_SYSTEM.includes('Give enough to be useful and no more'));
const rv = PB.revealIntent({ intent: i1, extraction: { intent_verification: { asked: true, peer_answers: ['I wanted to guide them'] } }, dialogMessages: [{ role: 'user', content: 'What were you working on?' }] });
assert.equal(rv.askedIntent, true); assert.deepEqual(rv.peerAnswers, ['I wanted to guide them']); assert.equal(rv.dealt, PB.intentText(i1));
assert.equal(PB.revealIntent({ intent: i1, extraction: null, dialogMessages: [{ role: 'user', content: 'How did the tails feel?' }] }).askedIntent, false);
ok('peer brief: dealt deterministically from the menu, rendered into the peer context only, revealed with what was asked');

// exam model carries the brief in notes (never in sections), and the examiner tag on a message survives the save
const ex = { ...E.freshExam(), who: 'Solid L3 candidate', activity: 'Dynamic Short Turns', brief: { intent: i1 }, presentation: 'p', dialogMessages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }], debriefMessages: [{ role: 'assistant', content: 'What was she intending?', line: 'evaluate' }, { role: 'user', content: 'x' }] };
const sess = E.buildSession(ex, { parseAIJson: () => null });
assert.ok(sess.notes.includes(`Peer brief (dealt, hidden until scored): the peer was trying to ${PB.intentText(i1)}`));
assert.ok(!Object.keys(sess.sections).some((k) => /brief/.test(k)) && !sess.transcript.includes('Peer brief'), 'the brief is not among the words the clerk inventories');
assert.ok(!buildExtractInput(sess).includes('dealt'), 'and the clerk input never sees it');
assert.ok(sess.sections.examiner_qa.includes('Examiner: What was she intending?') && !sess.sections.examiner_qa.includes('[line:'));
ok('exam: the brief rides in notes; the tag is stripped from what is saved');

// ── 3. examiner tags and register ────────────────────────────────────────────────────────────────────────────────────
assert.deepEqual(PR.parseExaminerReply('[line: cause_effect] What is the outside ski doing at initiation?'), { line: 'cause_effect', text: 'What is the outside ski doing at initiation?' });
assert.deepEqual(PR.parseExaminerReply('[LINE: Evaluate ]  Was that the snow or a choice?'), { line: 'evaluate', text: 'Was that the snow or a choice?' });
assert.deepEqual(PR.parseExaminerReply('OK, thank you.'), { line: null, text: 'OK, thank you.' });
assert.deepEqual(PR.parseExaminerReply('[line: nonsense] q'), { line: null, text: 'q' });
assert.equal(PR.examinerExemplarsBlock([]), ''); assert.equal(PR.examinerExemplarsBlock(null), '');
const blk = PR.examinerExemplarsBlock([{ text: 'Go to the component parts.\nAlways in relationships between fundamentals.' }, { text: 'x'.repeat(500) }]);
assert.ok(blk.includes('WHAT CHRIS (the real assessor) HAS SAID') && blk.includes('- Go to the component parts. Always in relationships') && !blk.includes('x'.repeat(400)));
assert.ok(PR.EXAMINER_SYSTEM.includes('[line: cause_effect]') && PR.EXAMINER_SYSTEM.includes('what were you intending, top half to bottom half'));
assert.ok(SP.EXAMINER_SPARRING_SYSTEM.includes('"OK, thank you."') && SP.EXAMINER_SPARRING_SYSTEM.includes('Never a third ask'));
assert.equal(S.probesOver([{ role: 'assistant', content: 'OK, thank you.' }]), true); assert.equal(S.probesOver([{ role: 'assistant', content: 'OK?' }]), false);
assert.deepEqual(S.probedLines([{ role: 'assistant', line: 'evaluate' }, { role: 'assistant', line: 'evaluate' }, { role: 'assistant', line: 'equipment' }, { role: 'user', line: 'x' }]), ['evaluate', 'equipment']);
const op = SP.sparringOpening({ who: 'Solid L3', activity: 'Dynamic Short Turns', conditions: 'firm', presentation: 'PRES', taskText: IDP.renderTask(dst), mentorAssessments: { chris: { consistentGaps: 'g', challenge: 'push here' } }, users: { chris: { name: 'Chris' } }, chrisChunks: [{ text: 'his words' }] });
assert.ok(op.includes('WHAT THE TASK REQUIRES') && op.includes("MARK'S PRESENTATION:\nPRES") && op.includes('push him on — push here') && op.includes('- his words') && op.endsWith('Ask your first question.'));
ok('examiner: tag parsed and stripped, Chris statements ride as the register, sparring opening carries task + assessment + Chris');

// ── 4. sparring / written / chat sessions: only Mark's words in sections ─────────────────────────────────────────────
const sp = { ...S.freshSparring(), who: 'Solid L3 candidate', activity: 'Dynamic Short Turns', presentation: 'P', probes: [{ role: 'assistant', content: 'Q1', line: 'evaluate' }, { role: 'user', content: 'A1' }, { role: 'assistant', content: 'OK, thank you.' }], debrief: { form: 'F', chris: 'C' },
  attempts: [{ scores: { cause_effect: 3, evaluate: 2, prescription: 3, desired_performances: 2, biomechanics: 3, equipment: 2 }, meta: { scorer: 'v2-rag-5b' }, score_rationale: {} }] };
const sps = S.sparringSession(sp, { bestAttempt: SC.bestAttempt });
assert.equal(sps.type, 'examiner_sparring'); assert.deepEqual(Object.keys(sps.sections), ['presentation', 'examiner_qa']); assert.ok(sps.notes.startsWith('Debrief (AI)') && sps.notes.includes('F') && sps.notes.includes('C'));
assert.ok(sps.transcript.includes('DEBRIEF (AI)'), 'the transcript (for reading) keeps the debrief; sections (for scoring) do not');
const ps = JSON.parse(sps.summary); assert.deepEqual(ps.probe_lines, ['evaluate']); assert.equal(SC.scorecard(sps, { viewer: mark }).form, '2026');
assert.equal(SC.scorecard(sps, { viewer: chris }).sealed, true, 'a sparring session is a real session: sealed for a mentor until he scores it');
assert.ok(!buildExtractInput(S.sparringScoringSession(sp)).includes('Form examiner'));
const w = { ...S.freshWritten(), scenario: 'SCEN', text: 'MY MA', qa: [{ role: 'assistant', content: 'Q', line: 'equipment' }, { role: 'user', content: 'A' }], who: 'L2', activity: 'Carved Long Turns' };
const ws = S.writtenSession(w, { bestAttempt: SC.bestAttempt });
assert.equal(ws.type, 'written'); assert.deepEqual(Object.keys(ws.sections), ['written_analysis', 'examiner_qa']); assert.ok(ws.notes.includes('Scenario: SCEN')); assert.equal(ws.summary, '', 'unscored → no summary');
assert.ok(!buildExtractInput(S.writtenScoringSession(w)).includes('SCEN') && buildExtractInput(S.writtenScoringSession(w)).includes('WRITTEN ANALYSIS (unprompted) ===\nMY MA'));
const cs = S.chatSession(S.modeById('scenario'), { ...S.freshChat(), messages: [{ role: 'user', content: 'go' }, { role: 'assistant', content: 'scenario text' }] });
assert.equal(cs.type, 'scenario'); assert.deepEqual(cs.sections, {}); assert.ok(cs.transcript.includes('AI: scenario text')); assert.equal(SC.scorecard(cs, { viewer: mark }).status, 'unscored');
assert.equal(S.MODES.length, 9); assert.ok(!S.MODES.some((m) => /question bank/i.test(m.label)), 'no question bank (Mark, session 9)');
ok('sessions: sparring / written / chat save with only Mark\'s words in sections; scenario and debrief in notes');

// ── 5. line drills ───────────────────────────────────────────────────────────────────────────────────────────────────
assert.deepEqual(S.DRILL_ORDER, ['cause_effect', 'desired_performances', 'evaluate', 'prescription', 'equipment']);
assert.equal(S.DRILLS.cause_effect.coach, true); assert.ok(S.DRILLS.cause_effect.generate.includes('never say "because"'));
// chain coach: the scaffold names the FIRST missing link in the order the coach asks for them
// links in Chris's order: movement/fundamental · where/which ski · what the ski did · outcome · the how (9/24 31:41–33:48, 51:02)
assert.deepEqual(SP.CHAIN_LINKS.map((l) => l.key), ['body_movement', 'where', 'ski_performance', 'outcome', 'how_stated']);
const st1 = SP.chainStatus({ connections: [{ body_movement: 'hip rotation', fundamental: 'rotary', how_stated: false, ski_performance: null, outcome: null, phase: 'unspecified', quote: 'her hips rotated' }] });
assert.deepEqual(st1.map((l) => l.present), [true, false, false, false, false]); assert.equal(st1[0].text, 'hip rotation / rotary');
const st2 = SP.chainStatus({ connections: [{ body_movement: 'x', phase: 'initiation', quote: 'at initiation the outside ski', how_stated: true, how_quote: 'legs cannot turn under the pelvis', ski_performance: 'pivots', outcome: 'turn_shape', outcome_detail: 'Z-shaped top', complete: true }, { body_movement: 'y' }] });
assert.deepEqual(st2.map((l) => l.present), [true, true, true, true, true]); assert.equal(st2[1].text, 'initiation · outside ski'); assert.equal(st2[4].text, 'legs cannot turn under the pelvis'); assert.equal(st2[3].text, 'turn_shape / Z-shaped top');
assert.equal(SP.whereStatus({ phase: 'unspecified', quote: 'tipping both lower legs above the fall line' }).text, 'above the fall line · both lower legs', 'specificity read from his own words when the clerk left phase unspecified');
assert.equal(SP.whereStatus({ phase: 'unspecified', quote: 'tipping the legs' }).present, false);
assert.deepEqual(SP.chainStatus({ connections: [] }).map((l) => l.present), [false, false, false, false, false]); assert.deepEqual(SP.chainStatus(null).map((l) => l.present), [false, false, false, false, false]);
assert.ok(SP.CHAIN_COACH_SYSTEM.includes('A quick twist doesn\'t allow a variation of rate') && SP.CHAIN_COACH_SYSTEM.includes('in ANY order') && SP.CHAIN_COACH_SYSTEM.includes('Never ask for a link you already asked for') && SP.CHAIN_COACH_SYSTEM.includes('did not credit the mechanism') && SP.CHAIN_COACH_SYSTEM.includes('each link said ONCE') && SP.CHAIN_COACH_SYSTEM.includes('a sentence or two per phase'), 'the coach: Chris\'s chain, any order, no repeat asks, how at his size, brevity');
const cu2 = SP.chainCoachUser({ passage: 'now', status: st1, task: 'T', intent: '', previous: 'before', lastAsk: 'What did the ski do?' });
assert.ok(cu2.includes('HIS PREVIOUS PASSAGE:\nbefore') && cu2.includes('WHAT YOU ASKED HIM LAST TIME:\nWhat did the ski do?'), 'the coach is given his previous try and its own last question');
assert.ok(!SP.chainCoachUser({ passage: 'p', status: st1, task: 'T' }).includes('PREVIOUS'), 'first try: no memory block');
assert.ok(!SP.chainCoachUser({ passage: 'a b c', status: st1, task: 'T' }).includes('words)'), 'no word count to the coach (Chris 10/2: "I don\'t find value in word count")');
assert.ok(SP.CHAIN_COACH_SYSTEM.includes('root blend') && SP.CHAIN_COACH_SYSTEM.includes('Never flag a word') && SP.CHAIN_COACH_SYSTEM.includes('A term is not a link; what it stands for is') && SP.BLEND_COACH_SYSTEM.includes('Never flag a word'), 'coaches: root blend; terms are fine when specific, only a term carrying a link is questioned');
assert.ok(SP.DRILLS.prescription.ask.includes("it's not about picking a task") && SP.DRILLS.equipment.unit.includes('AND how the equipment choice interacts with the environment'), 'drill text carries the 10/2 prescription and equipment points');
assert.ok(PR.PEER_SYSTEM.includes('Vocabulary itself never bothers you') && PR.PEER_SYSTEM.includes('so tip more, or turn more?'), 'the peer asks only when there is no plain what-to-do, never about a word');
assert.ok(!SP.CHAIN_STAGES.one.ask.includes('→') && SP.CHAIN_STAGES.one.ask.includes('in your own order'), 'the drill does not prescribe a sentence order');
const cu = SP.chainCoachUser({ passage: 'P', status: st1, task: 'Dynamic Short Turns', intent: 'guide' });
assert.ok(cu.includes('- Movement / fundamental: present — "hip rotation / rotary"') && cu.includes('- Where · which ski: MISSING') && cu.includes('- What the ski did: MISSING') && cu.includes('What the skier was going for: guide'));
assert.ok(SP.CHAIN_COACH_SYSTEM.includes('FIRST missing link') && SP.CHAIN_COACH_SYSTEM.includes('never inventing what the skier did'));
// stage 2 — blend: fundamentals named, a relationship between them, and one chain from the blend
const bx = { primary_fundamental_named: 'rotary', connections: [
  { body_movement: 'hip rotation', fundamental: 'rotary', linked_fundamental: 'edging', quote: 'she rotated the hips instead of tipping, so the edge came late', how_stated: true, how_quote: 'legs cannot turn under the pelvis', ski_performance: 'pivots', outcome: 'turn_shape', complete: true },
  { body_movement: 'x', fundamental: 'pressure' } ] };
const bs = SP.blendStatus(bx);
assert.deepEqual(bs.fundamentals, ['rotary', 'edging', 'pressure']); assert.equal(bs.blendNamed, true); assert.equal(bs.related, true); assert.equal(bs.accent, 'rotary'); assert.equal(bs.complete, true);
assert.deepEqual(bs.chain.map((l) => l.present), [true, false, true, true, true]);
const bs1 = SP.blendStatus({ connections: [{ fundamental: 'rotary', body_movement: 'a', quote: 'she rotated' }] }); assert.equal(bs1.blendNamed, false); assert.equal(bs1.related, false); assert.equal(bs1.accent, null);
const bs2 = SP.blendStatus({ connections: [{ body_movement: 'tipping with too much pressure on the inside ski', quote: 'she was tipping with too much pressure on the inside ski' }] });
assert.equal(bs2.blendNamed, true, 'two fundamentals read from his own words when the clerk tagged none'); assert.equal(bs2.related, true);
const bcu = SP.blendCoachUser({ passage: 'P', blend: bs, task: 'T', intent: '' });
assert.ok(bcu.includes('Fundamentals named: rotary, edging, pressure (two or more)') && bcu.includes('Relationship between them stated: yes') && bcu.includes('Accented / leading fundamental named: rotary') && bcu.includes('THE CHAIN from the blend'));
assert.ok(SP.blendCoachUser({ passage: 'P', blend: bs1, task: 'T' }).includes('Relationship between them stated: NO'));
assert.ok(SP.BLEND_COACH_SYSTEM.includes('how these things are interacting') && SP.BLEND_COACH_SYSTEM.includes('over-reliance on one affects the integration of the others') && SP.BLEND_COACH_SYSTEM.includes('a relationship, not a line'), 'the blend coach carries Chris\'s and the Performance Guide\'s words');
assert.ok(!('cascadeStatus' in SP) && !SP.CHAIN_STAGES.cascade, 'cascade is gone');
assert.deepEqual(Object.keys(SP.CHAIN_STAGES), ['one', 'blend']);
assert.equal(SP.allChains(bx).length, 2); assert.deepEqual(SP.allChains(bx)[1].map((l) => l.present), [true, false, false, false, false]); assert.deepEqual(SP.allChains(null), []);
// the one-chain hint reaches the clerk on a cause_effect drill only, and says what it must say
{
  const { extractPassage } = await import('../lib/prompts/extract.js');
  const { scoreLine: sl } = await import('../lib/score.js');
  let hinted = null;
  const defs7 = Array.from({ length: 9 }, (_, i) => ({ id: `${i}`.padStart(32, 'a'), text: `def ${i}`, source: 'psia_doc', source_ref: `at-ma-tu-assessment-form-2026.md#MA › ${i}`, criteria: ['general'], skills: [], type: 'definition', author: 'psia', date: null, metadata: {}, similarity: 0.5 }));
  const deps = { store: { getBySourceRefPrefix: async () => defs7, searchByEmbedding: async () => [] }, embedQuery: async () => [0.1], extractPassage: async (a) => { hinted = a.reference.one_chain; return { connections: [{ body_movement: 'tipping both lower legs', fundamental: 'edging', how_stated: true, how_quote: 'sidecut engaged, ski bent, edge sank', ski_performance: 'did not skid, tails followed tips', outcome: 'ski_snow_interaction', complete: true }] }; },
    completeJson: async () => ({ scores: { cause_effect: 3 }, score_rationale: { cause_effect: 'r' }, evidence_count: { cause_effect: 'complete: 1' }, justifications: { cause_effect: { 2: 'a', 3: 'b', 4: 'c', 5: 'd' } }, citations: { cause_effect: [] }, gap_to_next: { cause_effect: 'g' } }) };
  const r = await sl({ session: { activity: 'Carved Long Turns' }, line: 'cause_effect', section: 'presentation', passage: 'p', drill: true }, { deps });
  assert.equal(hinted, true); assert.equal(r.unit.complete, true); assert.equal(r.score, 3);
  void extractPassage;
}
assert.equal(S.freshDrill().stage, 'one');
const cds = S.drillSession({ ...S.freshDrill(), line: 'cause_effect', stage: 'blend', scenario: 's', passage: 'p', tries: [{ score: 3, unit: { complete: true } }] });
assert.equal(cds.context, 'Line drill — Chain coach (blend)'); assert.equal(JSON.parse(cds.summary).stage, 'blend');
assert.equal(JSON.parse(S.drillSession({ ...S.freshDrill(), line: 'equipment', scenario: 's', passage: 'p', tries: [{ score: 2 }] }).summary).stage, undefined);
// drill history on Progress
const dh = P.drillHistory([{ id: 'a', date: '2026-09-28', drill: 'cause_effect', score: 2, unitComplete: false }, { id: 'b', date: '2026-09-29', drill: 'cause_effect', score: 3, unitComplete: true, stage: 'one' }, { id: 'c', date: '2026-09-27', drill: 'cause_effect', score: 2 }, { id: 'd', date: '2026-09-29', drill: 'equipment', score: 2 }]);
assert.equal(dh[0].line, 'cause_effect'); assert.deepEqual(dh[0].items.map((i) => i.id), ['c', 'a', 'b']); assert.equal(dh[0].best, 3); assert.equal(dh[0].complete, 1); assert.equal(dh[0].recent, 2.3); assert.equal(dh[1].line, 'equipment');
const tr2 = P.trendRows([{ ...cds, id: 'z', date: '2026-09-29' }], mark); assert.equal(tr2.drills[0].stage, 'blend'); assert.equal(tr2.drills[0].unitComplete, true); assert.equal(tr2.drills[0].score, 3);
for (const k of S.DRILL_ORDER) assert.ok(S.DRILLS[k].unit.length > 80 && S.DRILLS[k].ask && (k === 'desired_performances' ? S.DRILLS[k].generate === false : S.DRILLS[k].generate.length > 50));
const t1 = S.dealTask(tasks, 'a'); assert.ok(t1.levels.includes('LEVEL III')); assert.equal(S.dealTask(tasks, 'a').name, t1.name);
assert.ok(SP.drillScenarioUser(S.DRILLS.equipment, dst).includes('Use this task: Dynamic Short Turns'));
assert.ok(SP.drillFollowupUser({ line: 'equipment', passage: 'p', gap: 'g', unit: 'u' }).includes('Form line: Equipment'));
const d = { ...S.freshDrill(), line: 'equipment', task: dst, scenario: 'SCEN', passage: 'Her 88-underfoot ski on that boilerplate meant the edge never bit above the fall line, so the top of the turn skidded and the shape went Z.', followup: 'And the boot?',
  tries: [{ at: 't', passage: 'x', score: 2, why: 'w', gap: 'Instead of X, say Y, because Z', evidence: 'complete: 0 · partial: 1', unit: { complete: false, missing: ['the outcome'] }, justifications: { 2: 'a', 3: 'b' }, citations: ['c:1'], citation_details: { 'c:1': { author: 'chris', text: 'Chris on … — T\n\nhis words' } }, scorer: 'v2-rag-5b' }] };
const ds = S.drillSession(d);
assert.equal(ds.type, 'drill'); assert.equal(ds.context, 'Line drill — Equipment'); assert.equal(ds.activity, 'Dynamic Short Turns');
assert.deepEqual(Object.keys(ds.sections), ['presentation', 'examiner_qa']); assert.ok(ds.notes.startsWith('Scenario: SCEN'));
const dsum = JSON.parse(ds.summary); assert.equal(dsum.drill, 'equipment'); assert.deepEqual(dsum.scores, { equipment: 2 }); assert.equal(dsum.tries, 1);
const dc = SC.scorecard(ds, { viewer: mark });
assert.equal(dc.form, 'drill'); assert.equal(dc.lines.length, 1); assert.equal(dc.lines[0].key, 'equipment'); assert.equal(dc.lines[0].score, 2); assert.equal(dc.sections, null); assert.equal(dc.meets, null); assert.equal(dc.scorer, 'v2-rag-5b');
assert.equal(SC.scorecard(ds, { viewer: chris }).sealed, false, 'a drill is never sealed (no form to score blind)');
assert.equal(SC.sealSessions([ds], chris)[0], ds);
assert.ok(SC.attemptRank(dsum) < SC.attemptRank({ scores: { cause_effect: 1, evaluate: 1, prescription: 1, desired_performances: 1, biomechanics: 1, equipment: 1 } }), 'a drill never outranks a full 2026 result');
const full = { id: 'f', date: '2026-09-20', type: 'AT MA Exam', summary: JSON.stringify({ scores: { cause_effect: 3, evaluate: 2, prescription: 3, desired_performances: 2, biomechanics: 3, equipment: 2 }, meta: { scorer: 'v2-rag-5b' }, score_rationale: {}, gap_to_next: {} }), mentorFeedback: [], sections: {} };
const tr = P.trendRows([full, { ...ds, date: '2026-09-21' }], mark);
assert.deepEqual(tr.rows.map((r) => r.id), ['f']); assert.equal(tr.drills.length, 1); assert.equal(tr.drills[0].drill, 'equipment'); assert.equal(tr.legacy.length, 0);
assert.equal(P.gapHistory([full, ds], mark).sessions, 0, 'drills never feed recurring gaps');
ok('drills: four lines with the scorer\'s units, dealt task, session shape, scorecard form "drill", never trended with full sessions');

// drill scoring path: no session extraction — the passage is extracted, retrieved on, scored; nothing written
{
  let extractedWith = null, embedded = null;
  const mkc = (n, o) => ({ id: `0000000${n}`.slice(-8).padEnd(32, '0'), text: o.text || `chunk ${n} `.repeat(30), source: 'psia_doc', source_ref: `x#${n}`, criteria: ['general'], skills: [], type: 'principle', author: 'psia', date: null, metadata: {}, similarity: 0.5, ...o });
  const defs = Array.from({ length: 9 }, (_, i) => mkc(100 + i, { type: 'definition', source_ref: `at-ma-tu-assessment-form-2026.md#MA › ${i}` }));
  const store = { getBySourceRefPrefix: async () => defs, searchByEmbedding: async (_e, o) => (o.authors ? [mkc(1, { author: 'chris', source: 'chris_comment', source_ref: 'session:abc', date: '2026-09-17', text: 'Equipment is the effect on what she did, not a recommendation.' })] : []) };
  const deps = {
    store, embedQuery: async (q) => { embedded = q; return [0.1]; },
    extractPassage: async (a) => { extractedWith = a; return { equipment: { addressed: true, quote: a.passage, states_effect_on_observed_performance: true }, connections: [], physics_concepts: [], observations: [], skills_referenced: ['equipment'] }; },
    completeJson: async () => ({ scores: { equipment: 3 }, score_rationale: { equipment: 'r' }, evidence_count: { equipment: 'complete: 1' }, justifications: { equipment: { 2: 'a', 3: 'b', 4: 'c', 5: 'd' } }, citations: { equipment: ['c:00000001'] }, gap_to_next: { equipment: 'Instead of X, say Y, because Z' } }),
  };
  const r = await scoreLine({ session: { activity: 'Dynamic Short Turns', peer_intent: 'guide the ski' }, line: 'equipment', section: 'presentation', passage: d.passage, drill: true }, { deps });
  assert.equal(r.score, 3); assert.equal(r.meta.drill, true); assert.equal(r.meta.practice, true);
  assert.equal(extractedWith.reference.task, 'Dynamic Short Turns'); assert.deepEqual(extractedWith.reference.peer_intent, ['guide the ski']); assert.equal(extractedWith.reference.one_chain, false, 'equipment drill: no one-chain hint');
  assert.ok(embedded.includes('Equipment: Her 88-underfoot'), 'retrieval ran on the passage\'s own extraction, not on an empty skeleton');
  assert.ok(r.unit && typeof r.unit.complete === 'boolean'); assert.equal(r.citations[0], 'c:00000001');
  await assert.rejects(() => scoreLine({ session: {}, line: 'equipment', section: 'presentation', passage: 'p', drill: true }, { deps: { ...deps, extractPassage: async () => ({}) } }).then((x) => { assert.ok(x.meta.drill); throw new Error('ok-empty'); }), /ok-empty/, 'an empty inventory still scores (query falls back to the passage text)');
}
ok('drill scoring path wired (drill: true → passage extracted, task + intent as reference)');

console.log(`\nselftest-sparring: ${n} groups passed`);
