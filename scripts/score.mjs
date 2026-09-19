// Score sessions from the CLI through the same path as /api/score.
//   npm run score -- bzfutxv q5omsst 7n6ry6d          → prints a table, writes out/score-<id>.json
//   npm run score -- 7n6ry6d --compare "2,2,2,2,2,1"  → within-one check vs a scorecard (form order: CE,Ev,Rx,DP,Bio,Eq)
//   npm run score -- 7uk7lnh --compare chris          → same, against Chris's scorecard on the session as read from the Sheet
//   flags: --debug (write assembled context too) · --include-self (leakage A/B only)
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { getMaSessions } from '../lib/sheet.js';
import { scoreSession } from '../lib/score.js';
import { SCORED_CRITERIA } from '../lib/vocab.js';
import { mentorScores } from '../lib/mentorScores.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const compareArg = opt('--compare');
const fixed = compareArg && /\d/.test(compareArg) ? compareArg.split(',').map(Number) : null;
const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--compare').map((x) => x.replace(/^ma_/, ''));
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
  const r = await scoreSession(s, { debug: flag('--debug'), includeSelf: flag('--include-self'), onStep: (m) => console.log(`  … ${m}`) });
  writeFileSync(`out/score-${id}.json`, JSON.stringify(r, null, 2));
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
