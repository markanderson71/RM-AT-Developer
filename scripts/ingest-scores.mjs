// Backfill / catch-up for the continuous pipelines (§6.3, §6.4). Same code path as /api/ingest/score and /api/ingest/comment.
//   npm run ingest:scores                      → every mentor scorecard in MASessions → exemplar (+ note chunks); then agreement
//   npm run ingest:scores -- 7uk7lnh           → one session
//   flags: --dry (print the exemplar text, write nothing) · --reextract (fresh Step 1 even if one is stored)
//          --comments (also ingest mentor comments the store has never seen) · --mentor gates
// Idempotent. Safe to re-run after every call with Chris.
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { getMaSessions } from '../lib/sheet.js';
import * as store from '../lib/store.js';
import { ingestScore } from '../lib/ingest/score.js';
import { ingestComments } from '../lib/ingest/comment.js';
import { extractSession, extractionToText } from '../lib/prompts/extract.js';
import { mentorScores } from '../lib/mentorScores.js';
import { agreement } from '../lib/agreement.js';
import { SCORED_CRITERIA, MENTORS } from '../lib/vocab.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DRY = flag('--dry'), only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--mentor').map((x) => x.replace(/^ma_/, ''));
const mentors = opt('--mentor') ? [opt('--mentor').toLowerCase()] : MENTORS;

const sessions = (await getMaSessions()).filter((s) => !only.length || only.includes(s.id));
if (only.length && sessions.length !== only.length) { console.error(`not found: ${only.filter((id) => !sessions.some((s) => s.id === id)).join(', ')}`); process.exit(1); }
mkdirSync('out', { recursive: true });

let n = 0;
for (const s of sessions) {
  const cards = mentorScores(s);
  for (const m of mentors.filter((k) => cards[k])) {
    n++;
    console.log(`\n── ${s.id} · ${s.date} · ${s.activity || s.type} · ${m}: ${SCORED_CRITERIA.map((k) => cards[m].scores[k]).join('/')}${cards[m].blind ? ' · blind' : ' · not blind'}`);
    const r = await ingestScore({ session: s, mentor: m, reextract: flag('--reextract'), dryRun: DRY }, { store, extractSession, extractionToText });
    if (r.text) { writeFileSync(`out/exemplar-${s.id}-${m}.txt`, r.text); console.log(`  would: ${r.would} · ${r.exemplar_tokens} tok · extraction from ${r.extraction_from} · text → out/exemplar-${s.id}-${m}.txt`); }
    else if (r.dryRun) console.log(`  would: ${r.would}`);
    else console.log(`  exemplar ${String(r.exemplar_id).slice(0, 8)} · ${r.unchanged ? 'unchanged' : `inserted (replaced ${r.replaced})`} · ${r.exemplar_tokens} tok · extraction from ${r.extraction_from} · notes ${r.notes} · past_session superseded ${r.past_session_superseded}`);
  }
  if (flag('--comments')) {
    const c = await ingestComments({ session: s, dryRun: DRY }, { store });
    if (c.inserted || c.would_insert) console.log(`  ${s.id} comments: ${DRY ? `would insert ${c.would_insert}` : `inserted ${c.inserted}`} · already seen ${c.comments_skipped}`);
  }
}
if (!n) console.log('no mentor scorecards found on the selected sessions');

// Agreement, from the same data (§9). Always over ALL sessions, not just the ones selected above.
const all = only.length ? await getMaSessions() : sessions;
const pins = Object.fromEntries((await store.listExemplars({ author: 'chris' })).filter((e) => e.metadata?.ai_at_submit?.scores).map((e) => [String(e.metadata.session_id), e.metadata.ai_at_submit]));
const a = agreement(all, { mentor: 'chris', pins });
const line = (t) => `${t.exact}/${t.n} exact (${t.exact_pct ?? '–'}%) · ${t.within_one}/${t.n} within one (${t.within_one_pct ?? '–'}%) · mean Δ ${t.mean_delta ?? '–'}`;
console.log(`\n── agreement with chris (targets: ≥${a.targets.exact_pct}% exact, ≥${a.targets.within_one_pct}% within one)`);
console.log(`  blind     (${a.blind.sessions} sessions): ${line(a.blind.overall)}`);
console.log(`  not blind (${a.not_blind.sessions} sessions): ${line(a.not_blind.overall)}`);
for (const k of SCORED_CRITERIA) { const t = a.blind.per_criterion[k]; if (t.n) console.log(`    ${k.padEnd(21)} ${line(t)}`); }
for (const e of a.excluded) console.log(`  excluded ${e.session_id}: ${e.reason}`);
for (const r of a.sessions.filter((x) => x.unpinned)) console.log(`  note ${r.session_id}: compared with the CURRENT summary (no score pinned yet — ingest pins it)`);
