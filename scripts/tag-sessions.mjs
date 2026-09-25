// Stamp metadata.session_id on an already-ingested Zoom call by time range — the `--sessions` step that was skipped at ingest.
// Self-exclusion (§7.3.5) reads this field; without it a call reviewing a session leaks the mentor's spoken critique into
// that session's own rescore. Provenance only: text, tags, embedding, approval untouched.
//   node scripts/tag-sessions.mjs zoom:2026-09-24 --sessions "00:00:00-00:25:10=sjm4bip,00:33:20-00:44:00=sjm4bip" [--dry] [--force] [--source chris_zoom]
import 'dotenv/config';
import * as store from '../lib/store.js';
import { normalizeSessions, sessionAt } from '../lib/ingest/zoom.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const KNOWN = ['--sessions', '--dry', '--force', '--source'];
const unknown = args.filter((x) => x.startsWith('--') && !KNOWN.includes(x));
if (unknown.length) { console.error(`unknown flag: ${unknown.join(' ')}`); process.exit(1); }
const sourceRef = args.find((a, i) => !a.startsWith('--') && !['--sessions', '--source'].includes(args[i - 1]));
const spec = opt('--sessions');
if (!sourceRef || !spec) { console.error('usage: node scripts/tag-sessions.mjs <source_ref> --sessions "HH:MM:SS-HH:MM:SS=<id>,..." [--dry] [--force]'); process.exit(1); }

const sessions = normalizeSessions(spec.split(',').map((part) => {
  const m = part.trim().match(/^([\d:]+)-([\d:]+)=(\S+)$/);
  if (!m) throw new Error(`bad range: ${part}`);
  return { from: m[1], to: m[2], id: m[3] };
}));

const source = opt('--source') || 'chris_zoom';
const chunks = (await store.liveBySourceRef(source, sourceRef)).sort((a, b) => (a.metadata?.sec ?? 0) - (b.metadata?.sec ?? 0));
if (!chunks.length) { console.error(`no live ${source} chunks under ${sourceRef}`); process.exit(1); }
console.log(`${sourceRef}: ${chunks.length} live ${source} chunks · ranges ${sessions.map((s) => `${s.range}→${s.id}`).join(' ')}${flag('--dry') ? ' · DRY' : ''}\n`);

const updates = [];
for (const c of chunks) {
  const sec = c.metadata?.sec;
  const ses = sec == null ? null : sessionAt(sec, sessions);
  const cur = c.metadata?.session_id || null;
  const mark = ses ? (cur === ses.id ? '=' : cur ? '!' : '+') : (cur ? '?' : ' ');
  console.log(`${mark} ${c.metadata?.timestamp || '??:??:??'} ${String(c.type).padEnd(12)} ${ses ? ses.id : '—'.padEnd(7)}${cur && cur !== ses?.id ? ` (has ${cur})` : ''} | ${c.text.slice(0, 90).replace(/\s+/g, ' ')}`);
  if (ses && cur !== ses.id) updates.push({ id: c.id, sessionId: ses.id });
}
console.log(`\n${updates.length} to stamp · ${chunks.length - updates.length} unchanged/untagged`);
if (flag('--dry') || !updates.length) process.exit(0);

const res = await store.stampSessionId(updates, { force: flag('--force') });
const by = {}; for (const r of res) (by[r.status] ??= []).push(r);
for (const [k, v] of Object.entries(by)) console.log(`${k}: ${v.length}`);
if (by.conflict?.length) { console.error('conflicts left alone (use --force to overwrite):'); for (const r of by.conflict) console.error(`  ${r.id} has ${r.session_id}, wanted ${r.wanted}`); process.exit(2); }
