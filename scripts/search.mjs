// Local retrieval check: node scripts/search.mjs "query text" [--source psia_doc] [--author chris] [-n 10]
import 'dotenv/config';
import { search } from '../lib/store.js';
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const query = args.find((a, i) => !a.startsWith('-') && (i === 0 || !args[i - 1].startsWith('-')));
if (!query) { console.error('usage: node scripts/search.mjs "query" [--source s] [--author a] [-n 10]'); process.exit(1); }
const rows = await search(query, { limit: Number(opt('-n')) || 10, sources: opt('--source') ? [opt('--source')] : null, authors: opt('--author') ? [opt('--author')] : null });
for (const r of rows) console.log(`${r.similarity.toFixed(3)}  ${r.source.padEnd(17)} ${(r.author || '-').padEnd(6)} ${r.type.padEnd(12)} ${r.source_ref}\n       ${r.text.replace(/\s+/g, ' ').slice(0, 160)}\n`);
