// Offline checks for the AT Exam tab's state model. No network.  npm run test:exam [path/to/score-result.json]
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const mem = new Map();
globalThis.window = { localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } };
const E = await import('../src/lib/exam.js');
const { parseSummary, hasFullScores, parseAIJson } = await import('../lib/parseSummary.js');

const fixture = process.argv[2] && existsSync(process.argv[2]) ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : null;
const rag = fixture || { scores: { cause_effect: 3, evaluate: 1, prescription: 3, desired_performances: 1, biomechanics: 2, equipment: 1, describe: 3, communication: 3 }, section_averages: { ma: 2.33, tu: 1.33 }, meets_standards: false, score_rationale: { cause_effect: 'r' }, citations: { cause_effect: ['c:00000001'] }, citation_details: { 'c:00000001': { author: 'chris', date: '2026-09-17', text: 'x'.repeat(900) } }, did_well: ['a'], opportunity: ['b'], key_learning: 'k', extraction: { connections: [] }, meta: { scorer: 'v2-rag-2', context: { chunks: { a: 1 }, tokens: {} } }, debug: { assembled_context: 'y'.repeat(80000) } };
const legacy = { scores: { describe: 4, cause_effect: 4, evaluate: 4, prescription: 4, biomechanics: 4, communication: 4 }, scorer: 'legacy', did_well: [], opportunity: [], key_learning: 'old' };

const exam = { ...E.freshExam(), phase: 'scored', who: 'Solid L3 candidate', activity: 'Dynamic parallel', conditions: 'variable', observations: 'obs', rootCause: 'rc',
  dialogMessages: [{ role: 'user', content: 'What were you working on?' }, { role: 'assistant', content: 'Steering.' }],
  prescriptionDialog: [{ role: 'user', content: 'Try this.' }], presentation: 'pres', debriefMessages: [{ role: 'assistant', content: 'How?' }, { role: 'user', content: 'Because.' }],
  attempts: [{ ...legacy, attemptNum: 1 }, { ...rag, scorer: 'v2-rag-2', attemptNum: 2 }], attemptNumber: 3 };

// labels
assert.equal(E.PHASE_LABEL.present, 'Examiner – Present'); assert.equal(E.PHASES.length, 7);
// scoring payload: sections, no summary, nothing from private state leaks beyond what buildSession already saves
const ss = E.scoringSession(exam); assert.ok(ss.sections.presentation === 'pres' && !('summary' in ss) && ss.type === 'at_exam');
// best attempt: legacy attempt has no TU scores beyond biomechanics → ranked on section averages, not a six-line sum
assert.deepEqual(E.sectionAverages(legacy), { ma: 4, tu: 4 }); assert.ok(E.isLegacyAttempt(legacy) && !E.isLegacyAttempt(exam.attempts[1]));
assert.equal(E.bestAttempt(exam.attempts), exam.attempts[1], 'a high legacy fallback never beats a new-scorer attempt');
// saved summary
const session = E.buildSession(exam, { parseAIJson });
assert.ok(session.summary.length < 50000, `summary ${session.summary.length} chars exceeds the Sheet cell limit`);
const sum = parseSummary(session.summary);
assert.ok(hasFullScores(sum), 'old app hasFullScores accepts the saved summary');
assert.ok(!('debug' in sum) && sum.allAttempts.length === 2 && sum.allAttempts[1].section_averages);
assert.equal(sum.meta?.context?.chunks, undefined, 'retrieval manifest not stored in the Sheet');
for (const d of Object.values(sum.citation_details || {})) assert.ok((d.text || '').length <= 401);
assert.deepEqual(Object.keys(session.sections), ['private_notes', 'root_cause', 'peer_dialog', 'prescription_delivery', 'presentation', 'examiner_qa']);

// persistence: in-progress restores; scored+unsaved restores; scored+saved starts fresh
E.persistExam({ ...exam, phase: 'present' }); assert.equal(E.loadExam().phase, 'present');
E.persistExam(exam); assert.equal(E.loadExam().phase, 'scored', 'scored but unsaved must survive a reload');
assert.equal(E.hasUnsavedWork(exam), true);
const saved = { ...exam, savedSessionId: session.id, savedHash: E.examHash(exam) };
assert.equal(E.hasUnsavedWork(saved), false, 'New exam needs no confirm once saved');
E.persistExam(saved); assert.equal(E.loadExam().phase, 'setup', 'a saved, scored exam is not restored'); assert.equal(mem.has(E.STORAGE_KEY), false);
assert.equal(E.hasUnsavedWork({ ...saved, attempts: [...saved.attempts, legacy] }), true, 'a revision after saving is unsaved work');
console.log(`selftest-exam: all checks passed (summary ${session.summary.length} chars${fixture ? ', real fixture' : ''})`);
