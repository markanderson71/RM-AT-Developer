// Offline checks for MA History (session 5): one scorecard, the blind gate, the score-line format, coaching helpers,
// and the single-line merge.   npm run test:history [path/to/MASessions-getAll.json]
// With a real Sheet export as the argument, every saved summary shape is run through scorecard() too.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const mem = new Map();
globalThis.window = { localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } };
const SC = await import('../src/lib/scorecard.js');
const E = await import('../src/lib/exam.js');
const { normalizeMaRow } = await import('../src/api.js');
const CO = await import('../lib/coaching.js');
const { normalizeLine } = await import('../lib/score.js');
const { parseAIJson } = await import('../lib/parseSummary.js');

const mark = { key: 'mark', role: 'candidate' }, chris = { key: 'chris', role: 'mentor' }, gates = { key: 'gates', role: 'mentor' };
const v2 = { scores: { cause_effect: 3, evaluate: 4, prescription: 3, desired_performances: 2, biomechanics: 3, equipment: 4, describe: 4, communication: 3 }, section_averages: { ma: 3.33, tu: 3 }, meets_standards: false,
  score_rationale: { cause_effect: 'why' }, gap_to_next: { cause_effect: "Instead of 'whole-body rotation caused the ski to rapidly pivot to an edge, causing little shape to the top of the turn,' say 'whole-body rotation means the skier's legs can't turn independently, so the ski pivots,' because the 'how' is what makes the connection complete.", evaluate: "Instead of evaluating only the gap, say 'Your ski was guided — that matched your intent,' because nuance.", prescription: "Instead of 'Focus on initiating with a guided ski from the top of the turn,' say 'keep your upper body facing downhill,' because the peer needs the how." },
  citations: { cause_effect: ['c:55e734f5', 'c:f9fe2820'] }, citation_details: { 'c:55e734f5': { author: 'chris', date: '2026-09-17', title: 'T', text: 'Chris on MA session x — T: answer the how' }, 'c:f9fe2820': { author: 'psia', title: 'Cause and Effect', text: 'def' } },
  meta: { scorer: 'v2-rag-2', scored_at: '2026-09-18T20:00:00Z' }, did_well: [], opportunity: [] };
const legacy = { scores: { describe: 4, cause_effect: 3, evaluate: 4, prescription: 4, biomechanics: 3, communication: 4 }, did_well: [], opportunity: [] };
const sess = (id, summary, fb = []) => ({ id, date: '2026-09-18', type: 'at_exam', summary: summary ? JSON.stringify(summary) : '', mentorFeedback: fb, sections: {
  peer_dialog: 'Mark: What were you working on?\nPeer: Speed control through the trough.', prescription_delivery: 'Mark: The top of the turn was more pivoted than guided.\nPeer: So you want me to focus on initiating with a guided ski from the top of the turn, not just through the trough?',
  presentation: 'It was whole-body rotation, which caused the ski to begin to rapidly pivot to an edge. This caused there to be little shape to the top of the turn. The ankles had a higher rate of flexion than the knees.', examiner_qa: 'Examiner: Why?\nMark: Because of the boot.', private_notes: 'A more rigid cuff might allow better fore/aft control.' } });

// ── 1. one arithmetic, missing is missing ────────────────────────────────────
assert.deepEqual(SC.formMath(v2.scores), { sections: { ma: 3.33, tu: 3 }, meets: false });
assert.deepEqual(SC.formMath({ ...v2.scores, equipment: 0 }), { sections: { ma: 3.33, tu: null }, meets: null }, 'a missing line → no average, no verdict (never an average over two lines)');
assert.equal(SC.cleanScore(0), null); assert.equal(SC.cleanScore('4'), 4); assert.equal(SC.cleanScore(7), null); assert.equal(SC.cleanScore(undefined), null);
assert.deepEqual(SC.formMath({ cause_effect: 4, evaluate: 4, prescription: 4, desired_performances: 4, biomechanics: 5, equipment: 3 }).meets, true);
assert.deepEqual(SC.formMath({ cause_effect: 6, evaluate: 6, prescription: 6, desired_performances: 4, biomechanics: 4, equipment: 3 }).meets, false, 'a strong MA section does not carry a TU section under 4');

// ── 2. two forms, never mixed ────────────────────────────────────────────────
const cv2 = SC.scorecard(sess('a', v2), { viewer: mark }), cl = SC.scorecard(sess('b', legacy), { viewer: mark });
assert.equal(cv2.form, '2026'); assert.deepEqual(cv2.lines.map((l) => l.score), [3, 4, 3, 2, 3, 4]); assert.equal(cv2.meets, false); assert.deepEqual(cv2.diagnostics.map((d) => d.score), [4, 3]);
assert.equal(cl.form, 'legacy'); assert.equal(cl.sections, null); assert.equal(cl.meets, null, 'a legacy score never gets a pass/fail'); assert.equal(cl.lines.length, 6); assert.equal(cl.scorer, 'legacy');
assert.equal(SC.scorecard(sess('c', null), { viewer: mark }).status, 'unscored');
assert.equal(SC.scorecard({ id: 'd', summary: 'not json at all', mentorFeedback: [] }, { viewer: mark }).status, 'unparsed');
assert.ok(SC.scorecard(sess('e', { ...v2, section_averages: { ma: 4, tu: 4 }, meets_standards: true }), { viewer: mark }).warnings.length === 2, 'stored averages that disagree with the lines are reported, and the lines win');
assert.equal(SC.scorecard(sess('e2', { ...v2, section_averages: { ma: 4, tu: 4 }, meets_standards: true }), { viewer: mark }).meets, false);
// best attempt: one rule
assert.equal(SC.bestAttempt([{ ...legacy, scorer: 'legacy' }, v2]), v2, 'a legacy attempt never outranks a 2026 attempt');
const hi = { ...v2, scores: { ...v2.scores, evaluate: 5 } }; assert.equal(SC.bestAttempt([v2, hi]), hi);
assert.equal(E.bestAttempt, SC.bestAttempt, 'exam.js has no score arithmetic of its own');
// regex-fallback parse keeps 2026 rationale
const broken = `{"scores":{"cause_effect":3,"evaluate":2,"prescription":3,"desired_performances":2,"biomechanics":3,"equipment":1,"describe":3,"communication":3},"score_rationale":{"equipment":"not addressed","desired_performances":"partial"}, "did_well":["a"] TRAILING GARBAGE`;
const pb = parseAIJson(broken); assert.equal(pb.scores.equipment, 1); assert.equal(pb.score_rationale.equipment, 'not addressed'); assert.equal(pb.score_rationale.desired_performances, 'partial');

// ── 3. blind gate ────────────────────────────────────────────────────────────
const s1 = sess('f', v2);
const sealed = SC.scorecard(s1, { viewer: chris });
assert.equal(sealed.sealed, true); assert.deepEqual(sealed.lines, []); assert.equal(sealed.detail, null); assert.equal(sealed.meets, null);
assert.ok(!JSON.stringify(sealed).includes('rationale') && !/"score":\s*\d/.test(JSON.stringify(sealed)), 'a sealed card carries no AI numbers or text');
const [vaulted] = SC.sealSessions([s1], chris);
assert.equal(vaulted.summary, '', 'the summary never enters mentor state'); assert.equal(SC.sealSessions([s1], mark)[0], s1, 'candidate sessions untouched');
assert.deepEqual(SC.aiSnapshot(vaulted).scores, { cause_effect: 3, evaluate: 4, prescription: 3, desired_performances: 2, biomechanics: 3, equipment: 4 });
const mine = { cause_effect: 2, evaluate: 2, prescription: 3, desired_performances: 2, biomechanics: 3, equipment: 3 };
const item = { userId: 'chris', kind: 'blind_score', form: '2026', blind: true, scores: mine, note: 'single instance', ai_at_submit: SC.aiSnapshot(vaulted), timestamp: '2026-09-19T10:00:00Z', text: SC.formatScoreLine({ who: 'Chris', date: '2026-09-19', scores: mine, blind: true, note: 'single instance' }) };
const revealed = SC.scorecard({ ...SC.unseal(vaulted), mentorFeedback: [item] }, { viewer: chris });
assert.equal(revealed.sealed, false); assert.deepEqual(revealed.lines.map((l) => l.score), [3, 4, 3, 2, 3, 4]);
assert.deepEqual([revealed.delta.exact, revealed.delta.withinOne, revealed.delta.n, revealed.delta.sameResult], [3, 5, 6, true], 'the 9/18 comparison: exact 3/6, within-one 5/6, same result');
assert.equal(revealed.delta.per.find((p) => p.key === 'evaluate').d, 2);
// another mentor is still blind — to the AI and to Chris
const forGates = { ...s1, mentorFeedback: [item, { userId: 'mark', text: 'thanks', timestamp: 'x' }] };
assert.equal(SC.scorecard(forGates, { viewer: gates }).sealed, true); assert.deepEqual(SC.visibleFeedback(forGates, { viewer: gates }).map((f) => f.userId), ['mark']);
assert.equal(SC.visibleFeedback(forGates, { viewer: mark }).length, 2);
// the score line round-trips, and Mark's hand-posted 7n6ry6d line parses and is attributed to Chris, not blind
assert.deepEqual(SC.parseScoreLine(item.text), mine);
const hand = "Chris scorecard 2026-09-17 (2026 form), posted by Mark from Chris's PDF: needs_safety 4, behavior_management 4 | MA: cause_effect 2, evaluate 2, prescription 2 (avg 2) | TU: desired_performances 2, biomechanics 2, equipment 1 (avg 1) | Overall: Does Not Meet Standards";
const ms = SC.mentorScores({ mentorFeedback: [{ userId: 'mark', text: hand, timestamp: 't' }] });
assert.deepEqual(Object.values(ms.chris.scores), [2, 2, 2, 2, 2, 1]); assert.equal(ms.chris.blind, false); assert.equal(ms.chris.sections.tu, 1.67, 'TU average is computed (the hand-posted line says 1)'); assert.equal(ms.chris.postedBy, 'mark');
assert.equal(SC.parseScoreLine('Agree with AI, Mark did not speak to all 3 phases.'), null);
assert.equal(SC.scorecard({ ...sess('g', legacy), mentorFeedback: [{ userId: 'mark', text: hand, timestamp: 't' }] }, { viewer: mark }).delta, null, 'no line-by-line delta between a legacy AI score and a 2026 scorecard');

// ── 4. coaching helpers ──────────────────────────────────────────────────────
const g = CO.parseGap(v2.gap_to_next.cause_effect);
assert.ok(g.instead.startsWith('whole-body rotation caused') && g.say.includes("skier's legs") && g.because.startsWith("the 'how'") && g.quoted, JSON.stringify(g));
assert.equal(CO.parseGap('Keep doing this.').say, null); assert.equal(CO.parseGap(''), null);
const o1 = CO.findOriginal(g, s1); assert.equal(o1.kind, 'quote'); assert.equal(o1.speaker, 'Mark'); assert.equal(o1.section, 'presentation'); assert.ok(o1.text.includes('rapidly pivot'));
const o2 = CO.findOriginal(v2.gap_to_next.prescription, s1); assert.equal(o2.speaker, 'Peer', "the evaluator quoted the peer's restatement — the panel must say so"); 
const o3 = CO.findOriginal(v2.gap_to_next.evaluate, s1); assert.equal(o3.kind, 'description');
const o4 = CO.findOriginal("Instead of 'a more rigid cuff might allow better fore/aft control,' say 'x,' because y.", s1); assert.equal(o4.spoken, false, 'private notes are flagged as never spoken');
const rw = CO.applyRewrite(s1, { section: 'presentation', original: o1.text, passage: 'NEW SENTENCE.' }); assert.ok(rw.replaced && rw.session.sections.presentation.includes('NEW SENTENCE.') && !rw.session.sections.presentation.includes('rapidly pivot')); assert.ok(s1.sections.presentation.includes('rapidly pivot'), 'input not mutated');
assert.ok(CO.applyRewrite(s1, { section: 'prescription_delivery', original: null, passage: 'Try this.' }).session.sections.prescription_delivery.endsWith('\nMark: Try this.'));
// unit checks
const conn = (o) => ({ body_movement: 'rotation', fundamental: 'rotary', ski_performance: 'pivots', outcome: 'turn_shape', outcome_detail: 'flat top', how_stated: true, how_quote: 'because…', quote: 'q', ...o });
const px = { connections: [conn({})] }; CO.mergePassage({}, px, {});           // connectionStats marks .complete
assert.equal(CO.unitCheck('cause_effect', px).complete, true);
const py = { connections: [conn({ outcome: null, how_stated: false })] }; CO.mergePassage({}, py, {});
assert.deepEqual(CO.unitCheck('cause_effect', py).missing.length, 2);
assert.equal(CO.unitCheck('equipment', { equipment: { addressed: true } }).complete, false, 'a recommendation with no stated effect is not a unit (§17, Chris 9/18)');
assert.equal(CO.unitCheck('equipment', { equipment: { addressed: true, linked_to_biomechanics: true } }).complete, true);
assert.equal(CO.unitCheck('evaluate', { comparison_to_intended_outcome: { made: true, intent_referenced_quote: 'you wanted', outcome_dimensions: ['speed'] } }).complete, true);
// merge: the replaced sentence's items go, the passage's arrive, stats recomputed, original untouched
const orig = { connections: [conn({ quote: 'which caused the ski to begin to rapidly pivot to an edge', how_stated: false, how_quote: null }), conn({ quote: 'the ankles had a higher rate of flexion', how_stated: false, how_quote: null })], equipment: { addressed: false }, skills_referenced: ['rotary'] };
const merged = CO.mergePassage(orig, { connections: [conn({ quote: 'new' })], equipment: { addressed: false }, skills_referenced: ['edging'] }, { section: 'presentation', replacedText: 'It was whole-body rotation, which caused the ski to begin to rapidly pivot to an edge.' });
assert.deepEqual(merged.connections.map((c) => c.quote), ['the ankles had a higher rate of flexion', 'new']); assert.equal(merged.connection_stats.complete, 1); assert.equal(orig.connections.length, 2); assert.deepEqual(merged.skills_referenced, ['rotary', 'edging']);
assert.equal(merged.equipment.addressed, false, 'a passage that says nothing about equipment does not change the equipment inventory');
assert.equal(CO.mergePassage(orig, { equipment: { addressed: true, quote: 'stiffer cuff…' } }, { section: 'examiner_qa' }).equipment.prompted, true, 'a rewrite of a Q&A answer stays prompted');
// single-line normalize: same guards as the full scorer
const nl = normalizeLine({ scores: { equipment: 4 }, citations: { equipment: ['c:55e734f5', 'c:deadbeef'] }, justifications: { equipment: { 2: 'a', 3: 'b', 4: 'c' } } }, { line: 'equipment', extraction: { equipment: { addressed: false } }, chunkIndex: { '55e734f5': { author: 'chris', text: 't' } } });
assert.equal(nl.score, 1); assert.deepEqual(nl.citations, ['c:55e734f5']); assert.equal(nl.quality.citations_invalid, 1);
assert.throws(() => normalizeLine({ scores: {} }, { line: 'evaluate', extraction: {}, chunkIndex: {} })); assert.throws(() => normalizeLine({ scores: { describe: 3 } }, { line: 'describe', extraction: {}, chunkIndex: {} }));
// scoreLine end to end with the models and the store mocked: retrieval is queried with the ORIGINAL extraction,
// the evaluator is shown the MERGED one, only one line is asked for, nothing is written.
{
  const { scoreLine } = await import('../lib/score.js');
  const cid = (n) => `${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;
  const mk = (n, o) => ({ id: cid(n), text: `chunk ${n}`, source: 'psia_doc', source_ref: `at-ma-tu-assessment-form-2026.md#MA › ${n}`, type: 'definition', author: 'psia', date: null, metadata: {}, similarity: 0.5, ...o });
  let embedded = '', asked = '', wrote = false;
  const deps = {
    embedQuery: async (t) => { embedded = t; return [0]; },
    store: new Proxy({ getBySourceRefPrefix: async () => Array.from({ length: 7 }, (_, i) => mk(100 + i, {})), searchByEmbedding: async (_e, o) => (o.authors ? [mk(1, { author: 'chris', source: 'chris_comment', source_ref: 'session:zzz', type: 'principle' })] : []) }, { get: (t, k) => t[k] || (() => { wrote = true; }) }),
    extractPassage: async ({ passage, reference }) => { assert.deepEqual(reference.peer_intent, ['speed control']); return { connections: [conn({ quote: passage })], skills_referenced: [] }; },
    completeJson: async ({ user, model }) => { asked = user; assert.match(model, /opus/); return { scores: { cause_effect: 4 }, score_rationale: { cause_effect: 'r' }, justifications: { cause_effect: { 2: 'a', 3: 'b', 4: 'c', 5: 'd' } }, citations: { cause_effect: ['c:00000001'] }, gap_to_next: { cause_effect: 'g' } }; },
  };
  const x0 = { ma_type: 'at_exam', verbatim_key_phrases: ['ORIGINAL-PHRASE'], connections: [conn({ quote: 'rapidly pivot to an edge', how_stated: false, how_quote: null })], intent_verification: { peer_answers: ['speed control'] }, skills_referenced: [] };
  const r = await scoreLine({ session: s1, extraction: x0, line: 'cause_effect', section: 'presentation', passage: 'REWRITTEN-PASSAGE because the legs cannot turn under the body, the ski pivots flat and the top of the turn has no shape.', original: 'which caused the ski to begin to rapidly pivot to an edge' }, { deps });
  assert.ok(embedded.includes('ORIGINAL-PHRASE') && !embedded.includes('REWRITTEN-PASSAGE'), 'retrieval query = the session as scored');
  assert.ok(asked.includes('REWRITTEN-PASSAGE') && !asked.includes('"quote": "rapidly pivot to an edge"'), 'evidence = the session with the passage in place of the original');
  assert.ok(/Score ONE line only: cause_effect/.test(asked) && !/previous score|was scored/i.test(asked), 'one line, scored cold');
  assert.deepEqual([r.line, r.score, r.unit.complete, r.citations, r.meta.practice, wrote], ['cause_effect', 4, true, ['c:00000001'], true, false]);
  await assert.rejects(scoreLine({ session: s1, extraction: x0, line: 'communication', section: 'presentation', passage: 'x' }, { deps }), /line must be one of/);
}
// brief: lowest three by the ranking scores, form order on ties
assert.deepEqual(CO.briefLines(v2, mine, 3).map((l) => l.key), ['cause_effect', 'evaluate', 'prescription']);
assert.deepEqual(CO.briefLines(v2, { cause_effect: 3, evaluate: 4, prescription: 3 }, 2).map((l) => l.key), ['cause_effect', 'prescription']);
// summary fit keeps the extraction ahead of the ladder text
const fat = E.fitSummary({ scores: v2.scores, justifications: { x: 'j'.repeat(30000) }, extraction: { y: 'e'.repeat(20000) }, citation_details: {} });
assert.deepEqual(fat.shed, ['justifications']); assert.ok(fat.extraction);

// ── 5. real Sheet export: every saved shape gives exactly one answer ─────────
let real = '';
const path = process.argv[2];
if (path && existsSync(path)) {
  const j = JSON.parse(readFileSync(path, 'utf8')); const sessions = (j.rows || j.data || j).map(normalizeMaRow).filter(Boolean);
  const tally = { '2026': 0, legacy: 0, unscored: 0, unparsed: 0, warnings: 0, mentor: 0 };
  for (const s of sessions) {
    const c = SC.scorecard(s, { viewer: mark });
    tally[c.status === 'scored' ? c.form : c.status]++; tally.warnings += c.warnings.length; tally.mentor += Object.keys(c.mentors).length;
    if (c.status === 'scored') { assert.ok(c.lines.length === 6 && c.lines.every((l) => l.score === null || (l.score >= 1 && l.score <= 6)), s.id); assert.equal(c.form === 'legacy', c.meets === null && c.sections === null, `${s.id}: only 2026 results carry a verdict`); }
    const m = SC.scorecard(s, { viewer: gates }); assert.ok(m.sealed && m.lines.length === 0, `${s.id}: sealed for a mentor who hasn't scored`);
    if (c.status === 'scored' && c.form === '2026' && c.detail.gap_to_next) for (const l of c.lines) { const gp = CO.parseGap(c.detail.gap_to_next[l.key]); assert.ok(gp?.say && gp.because, `${s.id}/${l.key}: gap parses`); CO.findOriginal(gp, s); }
  }
  real = ` · real export: ${sessions.length} sessions → ${JSON.stringify(tally)}`;
}
console.log(`selftest-history: all checks passed${real}`);
