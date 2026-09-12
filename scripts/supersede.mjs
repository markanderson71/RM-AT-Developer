// Mark live chunks matching a source_ref prefix as superseded by a named replacement chunk.
//   node scripts/supersede.mjs --old "psia.md#AT MA/TECHNICAL UNDERSTANDING SCORECARD" --new "at-ma-tu-assessment-form.md#" [--dry-run]
// --new is a source_ref prefix; the newest live chunk under it becomes the superseded_by target.
import 'dotenv/config';
import { client } from '../lib/store.js';
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes('--dry-run');
const oldPrefix = opt('--old'), newPrefix = opt('--new');
if (!oldPrefix || !newPrefix) { console.error('need --old <prefix> --new <prefix>'); process.exit(1); }
const db = client();
const { data: target } = await db.from('chunks').select('id, source_ref').like('source_ref', `${newPrefix}%`).is('superseded_by', null).order('created_at', { ascending: false }).limit(1);
if (!target?.length) { console.error(`no live chunk under ${newPrefix} — ingest it first`); process.exit(1); }
const { data: olds } = await db.from('chunks').select('id, source_ref').like('source_ref', `${oldPrefix}%`).is('superseded_by', null);
console.log(`${olds?.length || 0} chunks under "${oldPrefix}" → superseded_by ${target[0].id.slice(0, 8)} (${target[0].source_ref})`);
for (const o of olds || []) console.log('  ', o.source_ref);
if (DRY || !olds?.length) process.exit(0);
const { error } = await db.from('chunks').update({ superseded_by: target[0].id }).in('id', olds.map((o) => o.id));
if (error) { console.error(error.message); process.exit(1); }
console.log('done');
