// Session 7b — copy the Google Sheet's operational tabs into Postgres and prove the copy is exact.
//
//   npm run migrate:sheet -- --dry          read the Sheet, report what would be written, write nothing
//   npm run migrate:sheet                   copy Config / Journal / MASessions, then re-read from Postgres and diff
//   npm run migrate:sheet -- --verify       diff only (run after the cut-over, or any time)
//   npm run migrate:sheet -- --from out     read the Sheet from exported JSON files (out/Config.json, …) instead of HTTP
//
// Rerunnable: writes are upserts keyed on (sheet, id). A duplicate id inside one tab stops the run — the Sheet allowed
// two rows with one id, Postgres does not, and picking one silently is how data gets lost.
// Reads the Sheet through APP_BASE_URL/api/sheet (before the cut-over that is still the Apps Script) or APPS_SCRIPT_URL.
import 'dotenv/config';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAll } from '../lib/sheet.js';
import { getAll as storeGetAll, supabaseAdapter, splitPayload, SHEETS } from '../lib/ops.js';

const args = process.argv.slice(2);
const flags = new Set(['--dry', '--verify', '--from']);
const unknown = args.filter((a) => a.startsWith('--') && !flags.has(a));
if (unknown.length) { console.error(`unknown flag ${unknown.join(' ')}`); process.exit(2); }
const dry = args.includes('--dry'), verifyOnly = args.includes('--verify');
const fromDir = args.includes('--from') ? args[args.indexOf('--from') + 1] : null;
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set'); process.exit(1); }
const sourceUrl = fromDir ? `files in ${fromDir}/` : (process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/api/sheet` : process.env.APPS_SCRIPT_URL || '(none)');
const CUT_ID = 80;

async function readSheet(sheet) {
  if (fromDir) {
    const p = join(fromDir, `${sheet}.json`);
    if (!existsSync(p)) throw new Error(`${p} not found (export the tab's getAll response there)`);
    const j = JSON.parse(readFileSync(p, 'utf8'));
    return Array.isArray(j) ? j : j.rows || j.data || [];
  }
  return getAll(sheet, { via: 'http' });
}

/** Sheet row → { id, row } as the store holds it; blank rows dropped; `b` (mislabeled id header) folded into id. */
function normalize(sheet, rows) {
  const out = [], dupes = [], skipped = [];
  const seen = new Map();
  for (const r of rows) {
    const { id, cols } = splitPayload(r);
    if (!id) { if (Object.values(cols).some((v) => v !== '')) skipped.push(cols); continue; }
    if (seen.has(id)) dupes.push(id);
    seen.set(id, (seen.get(id) || 0) + 1);
    out.push({ id, row: cols });
  }
  return { items: out, dupes: [...new Set(dupes)], skipped };
}

function diffRows(sheet, sheetItems, storeRows) {
  const byId = new Map(storeRows.map((r) => [r.id, r]));
  const problems = [];
  for (const { id, row } of sheetItems) {
    const s = byId.get(id);
    if (!s) { problems.push(`${sheet}/${id}: missing in Postgres`); continue; }
    for (const [k, v] of Object.entries(row)) {
      const sv = s[k] ?? '';
      if (sv !== v) problems.push(`${sheet}/${id}.${k}: Sheet ${v.length} chars ≠ Postgres ${sv.length} chars${v.length < CUT_ID && sv.length < CUT_ID ? ` (${JSON.stringify(v)} vs ${JSON.stringify(sv)})` : ''}`);
    }
  }
  const sheetIds = new Set(sheetItems.map((x) => x.id));
  for (const r of storeRows) if (!sheetIds.has(r.id)) problems.push(`${sheet}/${r.id}: in Postgres but not in the Sheet (written after the copy?)`);
  return problems;
}

console.log(`Source: ${sourceUrl}\nTarget: ${process.env.SUPABASE_URL}\nMode:   ${dry ? 'DRY RUN (no writes)' : verifyOnly ? 'VERIFY (no writes)' : 'COPY + VERIFY'}\n`);
let failed = false;
const report = {};
for (const sheet of SHEETS) {
  const t0 = Date.now();
  const rows = await readSheet(sheet);
  const { items, dupes, skipped } = normalize(sheet, rows);
  const chars = items.reduce((n, x) => n + Object.values(x.row).join('').length, 0);
  console.log(`${sheet}: ${rows.length} rows read in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${items.length} with an id (${(chars / 1024).toFixed(0)} KB)${skipped.length ? `, ${skipped.length} id-less non-blank row(s) SKIPPED` : ''}`);
  if (skipped.length) for (const s of skipped) console.log(`   skipped: ${JSON.stringify(s).slice(0, 120)}`);
  if (dupes.length) { console.error(`   DUPLICATE ids in the Sheet: ${dupes.join(', ')} — fix the Sheet (delete or re-id the extra row) and rerun`); failed = true; continue; }
  const keys = new Set(); for (const x of items) for (const k of Object.keys(x.row)) keys.add(k);
  console.log(`   columns: ${[...keys].join(', ')}`);
  if (sheet === 'MASessions') {
    const ids = items.map((x) => x.id); console.log(`   ids: ${ids.join(' ')}`);
  }
  if (dry) { report[sheet] = { read: items.length }; continue; }
  if (!verifyOnly) {
    const t1 = Date.now();
    for (let i = 0; i < items.length; i += 20) await supabaseAdapter.upsertMany(sheet, items.slice(i, i + 20));
    console.log(`   written ${items.length} rows in ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  }
  const t2 = Date.now();
  const { rows: back } = await storeGetAll(sheet);
  console.log(`   read back ${back.length} rows from Postgres in ${((Date.now() - t2) / 1000).toFixed(1)} s`);
  const problems = diffRows(sheet, items, back);
  report[sheet] = { read: items.length, store: back.length, problems: problems.length };
  if (problems.length) { failed = true; console.error(`   DIFF (${problems.length}):`); for (const p of problems.slice(0, 40)) console.error(`     ${p}`); if (problems.length > 40) console.error(`     … ${problems.length - 40} more`); }
  else console.log(`   diff: none — every row and column matches`);
}
console.log('');
if (dry) { console.log('Dry run complete. Nothing written.'); process.exit(0); }
mkdirSync('out', { recursive: true });
writeFileSync('out/migrate-sheet-report.json', JSON.stringify({ at: new Date().toISOString(), mode: verifyOnly ? 'verify' : 'copy', report }, null, 2));
if (failed) { console.error('RESULT: FAILED — see above. Nothing is lost: the Sheet is untouched and the run can be repeated.'); process.exit(1); }
console.log(`RESULT: OK — ${Object.entries(report).map(([s, r]) => `${s} ${r.store}`).join(' · ')}. Report in out/migrate-sheet-report.json`);
