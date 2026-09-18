// Offline checks for the assembler and result normalization. No network, no keys.  npm run test:score
import assert from 'node:assert/strict';
import { assemble, BUDGET, estTokens } from '../lib/assembler.js';
import { normalizeResult } from '../lib/score.js';
import { extractionToText } from '../lib/prompts/extract.js';
import { parseSummary, hasFullScores } from '../lib/parseSummary.js';
import { EVALUATE_SYSTEM } from '../lib/prompts/evaluate.js';

const id = (n) => `${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;
const mk = (n, o) => ({ id: id(n), text: o.text || `chunk ${n} `.repeat(40), source: 'psia_doc', source_ref: `x#${n}`, criteria: ['general'], skills: [], type: 'principle', author: 'psia', date: null, approved: true, metadata: {}, similarity: 0.5 - n / 1000, ...o });
const defs = Array.from({ length: 9 }, (_, i) => mk(100 + i, { type: 'definition', source_ref: `at-ma-tu-assessment-form-2026.md#${i < 2 ? 'Instructor Decisions & Behavior › ' : 'MA › '}${i}` }));
const chris = [
  mk(1, { author: 'chris', source: 'chris_comment', source_ref: 'session:abc', date: '2026-09-17' }),
  mk(2, { author: 'chris', source: 'chris_comment', source_ref: 'session:SELF', date: '2026-09-17', metadata: { session_id: 'SELF' } }),
  mk(3, { author: 'chris', source: 'mentor_assessment', source_ref: 'mentor_assessment:chris', date: '2026-04-25' }),
];
const psia = Array.from({ length: 40 }, (_, i) => mk(200 + i, { text: 'p '.repeat(3000) }));   // ~1.6K tok each → must be capped
const calls = [];
const store = {
  getBySourceRefPrefix: async () => defs,
  searchByEmbedding: async (_e, o) => { calls.push(o); assert.notEqual(o.includeUnapproved, true); if (o.authors) return chris; if (o.types) return []; return [...psia, defs[3]]; },
};
const x = { ma_type: 'at_exam', skills_referenced: ['edging', 'bogus'], observations: [], verbatim_key_phrases: ['tails break away'], equipment: { addressed: false } };

const a = await assemble(x, { sessionId: 'ma_SELF', deps: { embedQuery: async () => [0], store } });
assert.equal(a.manifest.counts.definitions, 7, 'Instructor Decisions lines excluded from definitions');
assert.equal(a.manifest.counts.chris, 2, 'self chunk excluded');
assert.ok(!a.context.includes('[c:00000002]'), 'self chunk not in context');
assert.ok(a.manifest.tokens.psia <= BUDGET.psia_max, 'psia capped');
assert.ok(a.manifest.tokens.total <= BUDGET.total, 'within total budget');
assert.ok(a.manifest.counts.psia > 0 && a.manifest.counts.psia < 40);
assert.ok(!Object.values(a.manifest.chunks).some((c) => c.slot === 'psia' && c.source_ref.startsWith('at-ma-tu')), 'definitions not duplicated in psia slot');
assert.deepEqual(calls.find((c) => c.sources?.includes('psia_doc')).skills, ['edging'], 'skill filter uses valid tags only');
assert.equal(calls.find((c) => c.authors)?.skills, undefined, 'Chris slot skips the skill filter');
assert.ok(calls.findIndex((c) => c.authors) < calls.findIndex((c) => c.sources?.includes('psia_doc')), 'Chris slot filled before PSIA');
assert.ok(a.context.indexOf('CHRIS') < a.context.indexOf('PSIA REFERENCE'));
const b = await assemble(x, { sessionId: 'SELF', includeSelf: true, deps: { embedQuery: async () => [0], store } });
assert.equal(b.manifest.counts.chris, 3);
assert.ok(extractionToText(x).startsWith('Key phrases'), 'substance first'); assert.ok(extractionToText(x).endsWith('MA type: at_exam'), 'tags last');
assert.ok(estTokens(EVALUATE_SYSTEM) <= BUDGET.template, 'template within its slot');

const raw = {
  scores: { cause_effect: '3', evaluate: 2, prescription: 9, desired_performances: 2, biomechanics: 2, equipment: 3, describe: 3, communication: 3 },
  score_rationale: { cause_effect: 'r' }, citations: { cause_effect: ['c:00000001', '[c:deadbeef]', 'c:00000001'], equipment: [] },
  did_well: ['a'], opportunity: ['b'], key_learning: 'k',
};
const n = normalizeResult(raw, { extraction: x, chunkIndex: a.chunkIndex });
assert.equal(n.scores.cause_effect, 3); assert.equal(n.scores.prescription, 6, 'clamped');
assert.equal(n.scores.equipment, 1, 'equipment guard'); assert.equal(n.quality.guards_applied.length, 1);
assert.deepEqual(n.citations.cause_effect, ['c:00000001']); assert.equal(n.quality.citations_invalid, 1);
assert.ok(n.citation_details['c:00000001'].author === 'chris');
assert.deepEqual(n.section_averages, { ma: 3.67, tu: 1.67 }); assert.equal(n.meets_standards, false);
assert.throws(() => normalizeResult({ scores: { cause_effect: 3 } }, { extraction: x, chunkIndex: {} }), /no score for/);
// §8.3 backward compatibility: the old parser and its full-scores check accept the new summary as stored in the Sheet.
assert.deepEqual(n.quality.ladder_skipped.length, 6, 'missing ladder rungs are flagged');
const stored = parseSummary(JSON.stringify(JSON.stringify(n)));
assert.ok(hasFullScores(stored), 'legacy hasFullScores passes'); assert.equal(stored.key_learning, 'k');
console.log('selftest-score: all checks passed');
