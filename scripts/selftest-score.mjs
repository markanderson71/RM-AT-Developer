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
  searchByEmbedding: async (_e, o) => { calls.push(o); assert.notEqual(o.includeUnapproved, true); if (o.sources?.includes('chris_score') && o.types?.length === 1) return []; if (o.authors) return chris; return [...psia, defs[3]]; },
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
assert.ok(!calls.find((c) => c.sources?.includes('mentor_assessment')).types.includes('exemplar'), 'exemplars are excluded from the Chris slot in the query');
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

// ── session 6: extract v4 facts, speaker guard, exemplar bookkeeping ──
const { comparisonFacts } = await import('../lib/extractStats.js');
const { speakerGuard, EXTRACT_VERSION, EXTRACT_SCHEMA } = await import('../lib/prompts/extract.js');
assert.equal(EXTRACT_VERSION, 4); assert.ok(EXTRACT_SCHEMA.includes('vs_ideal') && EXTRACT_SCHEMA.includes('states_effect_on_observed_performance'));
const cf = comparisonFacts({ vs_intent: { state: 'made', reference_quote: 'you wanted a guided ski', quote: 'you wanted guided; the top was pivoted' }, vs_ideal: { state: 'made', quote: 'should be rounder' }, outcome_dimensions: ['turn_shape'] });
assert.equal(cf.vs_intent.state, 'made'); assert.equal(cf.vs_ideal.state, 'partial', '"made" without the ideal quoted is partial'); assert.equal(cf.made, true); assert.equal(cf.both_made, false);
assert.equal(cf.intent_referenced_quote, 'you wanted a guided ski', 'v3 fields still written');
assert.equal(comparisonFacts({ made: true, intent_referenced_quote: 'r', quote: 'q' }).vs_intent.state, 'made', 'a stored v3 comparison is lifted');
assert.equal(comparisonFacts(null).made, false); assert.equal(comparisonFacts({ vs_ideal: { state: 'bogus' } }).vs_ideal.state, 'absent');
const sess = { sections: { prescription_delivery: 'Mark: Keep your zipper facing the fall line and steer both feet from the top of the turn.\nPeer: So focus on initiating with a guided ski from the top of the turn.' } };
const gx = { prescription: { delivery_to_peer: 'Focus on initiating with a guided ski from the top of the turn', peer_restated: null } };
assert.equal(speakerGuard(gx, sess).length, 1); assert.equal(gx.prescription.delivery_to_peer, null); assert.ok(gx.prescription.peer_restated.startsWith('Focus on'), "the peer's words go back where they belong");
const gy = { prescription: { delivery_to_peer: 'Keep your zipper facing the fall line and steer both feet from the top of the turn.' } };
assert.equal(speakerGuard(gy, sess).length, 0, "Mark's own words are left alone");
const idx = { ...a.chunkIndex, '0000aaaa': { id: '0000aaaa-x', slot: 'exemplars', source: 'chris_score', author: 'chris', date: '2026-09-18', type: 'exemplar', source_ref: 'session:7uk7lnh', title: 't', text: 'EXEMPLAR …' } };
const ne = normalizeResult({ ...raw, citations: { ...raw.citations, evaluate: ['c:0000aaaa'] }, exemplar_anchor: { evaluate: 'c:0000aaaa Evaluate: Chris 2 — equal' } }, { extraction: x, chunkIndex: idx });
assert.deepEqual(ne.quality.exemplars_in_context, ['c:0000aaaa']); assert.deepEqual(ne.quality.exemplars_cited, ['c:0000aaaa']); assert.equal(ne.quality.exemplar_lines_anchored, 1);
assert.equal(ne.citation_details['c:0000aaaa'].type, 'exemplar');
assert.deepEqual(n.quality.exemplars_cited, [], 'no exemplars in context → none cited, no error');
console.log('selftest-score: all checks passed');
