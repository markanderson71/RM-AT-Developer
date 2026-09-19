// Call transcript → pending chris_zoom chunks, through the same path as /api/ingest/zoom.
//   npm run zoom -- call.txt --date 2026-09-18                       → speaker report only (no model call)
//   npm run zoom -- call.txt --date 2026-09-18 --map "Speaker 1=chris,Speaker 2=mark,Speaker 3=unknown" --dry
//   npm run zoom -- call.txt --date 2026-09-18 --map "…"             → inserts pending   (--replace re-extracts; approved untouched)
//   npm run zoom -- --pending [zoom:2026-09-18]                      → list what is waiting for approval
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ingestZoom } from '../lib/ingest/zoom.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const OPTS = ['--date', '--map', '--title', '--mentor', '--pending', '--sessions'];   // --sessions '[{"from":"00:00:00","to":"00:24:30","id":"ma_7uk7lnh","label":"Fall Line Bumps"}]'
const file = args.find((a, i) => !a.startsWith('--') && !OPTS.includes(args[i - 1]));

const line = (c, m = c.metadata || c) => `  ${m.timestamp}  ${c.type.padEnd(12)} ${[...c.criteria, ...c.skills.map((s) => `#${s}`)].join(' ')}${m.hedged ? '  [HEDGED]' : ''}${(m.attribution?.check ?? c.attribution_check) ? '  [CHECK SPEAKER]' : ''}${(m.watch || []).length ? `  [§17 ${m.watch.join(',')}]` : ''}\n    ${c.text}\n    ctx: ${m.context}\n`;

if (flag('--pending')) {
  const { listPending } = await import('../lib/store.js');
  const ref = opt('--pending'); const rows = await listPending({ source: 'chris_zoom', sourceRef: ref && !ref.startsWith('--') ? ref : null });
  console.log(`${rows.length} pending\n`); rows.forEach((r) => console.log(line(r)));
  process.exit(0);
}
if (!file || !opt('--date')) { console.error('usage: npm run zoom -- <transcript.txt> --date YYYY-MM-DD [--map "Speaker 1=chris,Speaker 2=mark"] [--title "…"] [--dry] [--replace]'); process.exit(1); }

const speakerMap = opt('--map') ? Object.fromEntries(opt('--map').split(',').map((p) => p.split('=').map((x) => x.trim()))) : null;
const r = await ingestZoom({ transcript: readFileSync(file, 'utf8'), date: opt('--date'), title: opt('--title'), mentor: opt('--mentor') || 'chris', speakerMap, sessions: opt('--sessions') ? JSON.parse(opt('--sessions')) : [], dryRun: flag('--dry'), replacePending: flag('--replace'), onStep: (m) => console.log(`  … ${m}`) });

if (r.needs) {
  console.log(`${r.turns} turns · ${r.chars} chars · ${r.duration}\n`);
  for (const [k, v] of Object.entries(r.speakers)) { console.log(`${k} — ${v.turns} turns, ${v.chars} chars → guess: ${r.guess[k]}`); v.samples.forEach((s) => console.log(`    ${s}`)); console.log(); }
  console.log(`Confirm and re-run with:  --map "${Object.entries(r.guess).map(([k, v]) => `${k}=${v.replace('?', '')}`).join(',')}"`);
  process.exit(0);
}
mkdirSync('out', { recursive: true });
writeFileSync(`out/zoom-${r.date}.json`, JSON.stringify(r, null, 2));
if (r.chunks) r.chunks.forEach((c) => console.log(line(c)));
console.log(`\n${r.source_ref}: extracted ${r.extracted} · duplicates ${r.duplicates} · rejected ${r.rejected.length} · ${r.dryRun ? `would insert ${r.would_insert}` : `inserted ${r.inserted} pending (skipped ${r.skipped})`} · ${Math.round(r.ms / 1000)}s`);
console.log(`flags: hedged ${r.flagged.hedged} · check-speaker ${r.flagged.attribution_check} · §17 watch ${r.flagged.watch}`);
r.rejected.filter((x) => !x.boundary).forEach((x) => console.log(`  REJECTED [${x.why}] ${x.timestamp || ''} ${x.text}`));
console.log(`  (${r.rejected.filter((x) => x.boundary).length} window-boundary items left to the neighbouring window)`);
if (r.tool_feedback.length) { console.log('\nTool feedback (not stored — for the builder):'); r.tool_feedback.forEach((f) => console.log(`  ${f.timestamp || ''} ${f.text}`)); }
console.log(`\nwrote out/zoom-${r.date}.json`);
