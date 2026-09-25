// Side-by-side report of scoring runs against Chris's blind scorecards — the calibration session's instrument.
//   node scripts/ab-report.mjs --labels base,gate [7uk7lnh sjm4bip a5v6zxm]
// Reads out/score-<id>.json for label "base" and out/score-<id>.<label>.json otherwise (as written by score.mjs --label).
// Prints, per label: every line's AI / Chris / Δ, exact and within-one totals, signed mean Δ, over/under counts, and
// what each run retrieved (Chris chunks by call, exemplars shown/cited, any self-chunk that leaked).
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { getMaSessions } from '../lib/sheet.js';
import { mentorScores } from '../lib/mentorScores.js';
import { SCORED_CRITERIA } from '../lib/vocab.js';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const labels = (opt('--labels') || 'base').split(',').map((s) => s.trim()).filter(Boolean);
const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--labels').map((x) => x.replace(/^ma_/, ''));
if (!ids.length) ids.push('7uk7lnh', 'sjm4bip', 'a5v6zxm');
const SHORT = { cause_effect: 'CE', evaluate: 'Ev', prescription: 'Rx', desired_performances: 'DP', biomechanics: 'Bio', equipment: 'Eq' };

const sessions = await getMaSessions();
const cards = {};
for (const id of ids) {
  const s = sessions.find((x) => x.id === id);
  const card = s && mentorScores(s).chris;
  if (!card) { console.error(`${id}: no Chris scorecard`); process.exit(1); }
  cards[id] = { scores: card.scores, blind: card.blind };
}

const file = (id, label) => (label === 'base' ? `out/score-${id}.json` : `out/score-${id}.${label}.json`);
const totals = {};
for (const label of labels) {
  console.log(`\n═══ ${label} ═══`);
  const t = { n: 0, exact: 0, w1: 0, over: 0, under: 0, sum: 0, per: Object.fromEntries(SCORED_CRITERIA.map((k) => [k, { n: 0, exact: 0, w1: 0, sum: 0 }])) };
  for (const id of ids) {
    const f = file(id, label);
    if (!existsSync(f)) { console.log(`  ${id}: ${f} missing`); continue; }
    const r = JSON.parse(readFileSync(f, 'utf8'));
    if (!r.scores) { console.log(`  ${id}: ${f} holds no score (extraction only)`); continue; }
    const c = cards[id].scores;
    const cells = SCORED_CRITERIA.map((k) => {
      const ai = r.scores[k], ch = c[k];
      if (ai == null || ch == null) return `${SHORT[k]} ${ai ?? '–'}/${ch ?? '–'}   `;
      const d = ai - ch; t.n++; t.sum += d; t.per[k].n++; t.per[k].sum += d;
      if (d === 0) { t.exact++; t.per[k].exact++; } if (Math.abs(d) <= 1) { t.w1++; t.per[k].w1++; } if (d > 0) t.over++; if (d < 0) t.under++;
      return `${SHORT[k]} ${ai}/${ch} ${d === 0 ? ' ·' : d > 0 ? `+${d}` : d}`;
    });
    const m = r.meta?.context || {};
    const byCall = {};
    for (const ch of Object.values(m.chunks || {})) if (ch.slot === 'chris') byCall[ch.source_ref?.startsWith('zoom:') ? ch.source_ref : ch.source] = (byCall[ch.source_ref?.startsWith('zoom:') ? ch.source_ref : ch.source] || 0) + 1;
    const leaked = Object.values(m.chunks || {}).filter((ch) => ch.source_ref === `session:${id}` || ch.session_id === id).length;   // either provenance field — §7.3.5 covers both
    const exCited = Object.entries(r.citation_details || {}).filter(([, d]) => d.type === 'exemplar').length;
    console.log(`  ${id.padEnd(8)} ${cells.join('  ')}   ${r.meta?.scorer || '?'}${cards[id].blind ? '' : ' (card not blind)'}`);
    console.log(`           chris ${m.counts?.chris ?? '?'} [${Object.entries(byCall).map(([k, v]) => `${k.replace('zoom:', '')}:${v}`).join(' ')}] · exemplars ${(m.exemplar_sessions || []).join(',') || 'none'} cited ${exCited}${leaked ? ` · SELF-LEAK ${leaked}` : ''}${r.quality?.guards_applied?.length ? ` · guards ${r.quality.guards_applied.join(' | ')}` : ''}`);
  }
  if (t.n) {
    console.log(`  ── ${t.n} lines · exact ${t.exact} (${Math.round(100 * t.exact / t.n)}%) · within-one ${t.w1} (${Math.round(100 * t.w1 / t.n)}%) · AI over ${t.over} · under ${t.under} · mean Δ ${(t.sum / t.n).toFixed(2)}`);
    console.log(`     per line: ${SCORED_CRITERIA.map((k) => `${SHORT[k]} ${t.per[k].exact}/${t.per[k].n} exact, Δ ${(t.per[k].sum / (t.per[k].n || 1)).toFixed(2)}`).join(' · ')}`);
  }
  totals[label] = t;
}
if (labels.length > 1) {
  console.log('\n═══ summary ═══');
  for (const l of labels) { const t = totals[l]; if (t.n) console.log(`  ${l.padEnd(10)} exact ${String(t.exact).padStart(2)}/${t.n}  within-one ${String(t.w1).padStart(2)}/${t.n}  mean Δ ${(t.sum / t.n).toFixed(2)}  over ${t.over} under ${t.under}`); }
  console.log('  targets   exact ≥60% · within-one ≥85% (§1)');
}
