// Score sessions from the CLI through the same path as /api/score.
//   npm run score -- bzfutxv q5omsst 7n6ry6d          → prints a table, writes out/score-<id>.json
//   npm run score -- 7n6ry6d --compare "2,2,2,2,2,1"  → within-one check vs a scorecard (form order: CE,Ev,Rx,DP,Bio,Eq)
//   npm run score -- 7uk7lnh --compare chris          → same, against Chris's scorecard on the session as read from the Sheet
//   npm run score -- 7uk7lnh --compare chris --reuse  → Step 2 only, on the extraction saved in out/score-<id>.json. Use this to A/B a
//                                                        template change: extraction is not repeatable, so a fresh one confounds the comparison.
//   npm run score -- 7uk7lnh --compare chris --reuse --label gate  → same, but writes out/score-<id>.gate.json and never touches the base
//                                                        file, so a baseline and any number of A/B variants sit side by side (scripts/ab-report.mjs).
//   --reuse without out/score-<id>.json falls back to the extraction stored with Chris's exemplar for the session — the
//   evidence his scorecard was ingested against. The fallback is written to out/score-<id>.json so later runs are on the same file.
//   flags: --debug (write assembled context too) · --include-self (leakage A/B only)
import 'dotenv/config';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { getMaSessions } from '../lib/sheet.js';
import { scoreSession } from '../lib/score.js';
import { SCORED_CRITERIA } from '../lib/vocab.js';
import { mentorScores } from '../lib/mentorScores.js';
import { evidenceGuards } from '../lib/prompts/extract.js';
import { comparisonFacts } from '../lib/extractStats.js';
import * as store from '../lib/store.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const compareArg = opt('--compare');
const fixed = compareArg && /\d/.test(compareArg) ? compareArg.split(',').map(Number) : null;
const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--compare' && args[i - 1] !== '--label').map((x) => x.replace(/^ma_/, ''));
const KNOWN = ['--compare', '--debug', '--include-self', '--reuse', '--label'];
const label = opt('--label');
if (label && !/^[\w-]+$/.test(label)) { console.error('--label: letters, digits, _ or - only'); process.exit(1); }
const unknown = args.filter((x) => x.startsWith('--') && !KNOWN.includes(x));
if (unknown.length) { console.error(`unknown flag: ${unknown.join(' ')} (known: ${KNOWN.join(' ')})`); process.exit(1); }
if (!ids.length) { console.error('usage: npm run score -- <sessionId> [...] [--compare "2,2,2,2,2,1"] [--debug] [--include-self]'); process.exit(1); }

mkdirSync('out', { recursive: true });
const sessions = await getMaSessions();
let fail = false;
for (const id of ids) {
  const s = sessions.find((x) => x.id === id);
  if (!s) { console.error(`${id}: not found`); fail = true; continue; }
  const card = compareArg && !fixed ? mentorScores(s)[compareArg.toLowerCase()] : null;
  if (compareArg && !fixed && !card) { console.error(`${id}: no ${compareArg} scorecard on this session`); fail = true; continue; }
  const compare = fixed || (card ? SCORED_CRITERIA.map((k) => card.scores[k]) : null);
  console.log(`\n── ${id} · ${s.date} · ${s.type} · ${s.who} · ${s.activity}`);
  let reused = null;
  if (flag('--reuse')) {
    let from = `out/score-${id}.json`;
    reused = existsSync(from) ? JSON.parse(readFileSync(from, 'utf8')).extraction : null;
    if (!reused) {
      const ex = (await store.liveBySourceRef('chris_score', `session:${id}`, { author: 'chris' })).find((c) => c.type === 'exemplar' && c.metadata?.extraction?.extract_version);
      if (ex) { reused = ex.metadata.extraction; from = `Chris's exemplar ${ex.id.slice(0, 8)}`; writeFileSync(`out/score-${id}.json`, JSON.stringify({ extraction: reused, note: 'extraction copied from the exemplar for --reuse; no score in this file' }, null, 2)); }
    }
    if (!reused) { console.error(`${id}: --reuse needs out/score-${id}.json from an earlier run, or a Chris exemplar with a stored extraction`); fail = true; continue; }
    console.log(`  reusing extraction (v${reused.extract_version}) from ${from} — Step 1 skipped`);
    // The code guards are part of Step 1; run the current ones over the saved inventory so a guard change is testable on fixed evidence too.
    reused.extraction_guards = [...new Set([...(reused.extraction_guards || []), ...evidenceGuards(reused, s)])];
    reused.comparison_to_intended_outcome = comparisonFacts(reused.comparison_to_intended_outcome);
  }
  const r = await scoreSession(s, { extraction: reused || undefined, debug: flag('--debug'), includeSelf: flag('--include-self'), onStep: (m) => console.log(`  … ${m}`) });
  const outFile = label ? `out/score-${id}.${label}.json` : `out/score-${id}.json`;
  writeFileSync(outFile, JSON.stringify(r, null, 2));
  if (label) console.log(`  → ${outFile}`);
  const old = s.parsedSummary?.scores || {};
  for (const [i, k] of SCORED_CRITERIA.entries()) {
    const c = compare ? `  chris ${compare[i]}  Δ${r.scores[k] - compare[i] >= 0 ? '+' : ''}${r.scores[k] - compare[i]}` : '';
    console.log(`  ${k.padEnd(21)} ${r.scores[k]}   old ${old[k] ?? '–'}${c}   ${r.citations[k].join(' ')}`);
  }
  console.log(`  MA ${r.section_averages.ma} · TU ${r.section_averages.tu} · ${r.meets_standards ? 'Meets' : 'Does Not Meet'} Standards`);
  const m = r.meta.context;
  const exCited = Object.entries(r.citation_details).filter(([, d]) => d.type === 'exemplar').map(([c]) => c);
  console.log(`  context ${m.tokens.total} tok · chris ${m.counts.chris} · exemplars ${m.counts.exemplars}${m.exemplar_sessions?.length ? ` (${m.exemplar_sessions.join(', ')})` : ''} · exemplar cited: ${exCited.length ? exCited.join(' ') : 'NO'} · psia ${m.counts.psia} · ${Math.round(r.meta.ms.total / 1000)}s`);
  const cmp = r.extraction.comparison_to_intended_outcome; if (cmp?.vs_intent) console.log(`  evaluate evidence: vs intent ${cmp.vs_intent.state} · vs ideal ${cmp.vs_ideal.state} · equipment effect on observed: ${r.extraction.equipment?.addressed ? !!r.extraction.equipment.states_effect_on_observed_performance : 'n/a'}`);
  if (r.quality.extraction_guards?.length) console.log(`  extraction guards: ${r.quality.extraction_guards.join(' | ')}`);
  const cs = r.extraction.connection_stats; if (cs) console.log(`  connections ${cs.total} · complete ${cs.complete} · ski-perf ${cs.with_ski_performance} · outcome ${cs.with_outcome} · how ${cs.with_how}`);
  if (r.quality.ladder_skipped?.length) console.log(`  LADDER SKIPPED on: ${r.quality.ladder_skipped.join(', ')}`);
  if (r.quality.guards_applied.length) console.log(`  guards: ${r.quality.guards_applied.join(' | ')}`);
  if (r.quality.citations_invalid || r.quality.criteria_without_citation.length) console.log(`  citation issues: invalid=${r.quality.citations_invalid} uncited=${r.quality.criteria_without_citation.join(',') || '–'}`);
  if (compare) {
    const exact = SCORED_CRITERIA.filter((k, i) => r.scores[k] === compare[i]).length;
    console.log(`  exact ${exact}/6 · within one ${SCORED_CRITERIA.filter((k, i) => Math.abs(r.scores[k] - compare[i]) <= 1).length}/6`);
    const worst = Math.max(...SCORED_CRITERIA.map((k, i) => Math.abs(r.scores[k] - compare[i])));
    console.log(`  within-one of scorecard: ${worst <= 1 ? 'PASS' : 'FAIL'} (max |Δ| = ${worst})`);
    if (worst > 1) fail = true;
  }
}
process.exit(fail ? 1 : 0);
