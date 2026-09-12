// One-time cleanup of the fabricated assessment-form ingest (2026-09-11).
// 1. Un-supersede the 12 psia.md scorecard chunks that pointed at a fabricated chunk.
// 2. Hard-delete every chunk under at-ma-tu-assessment-form.md (invented text — not history).
// Then: npm run bootstrap -- --only psia   and   node scripts/supersede.mjs --old "psia.md#AT MA/TECHNICAL UNDERSTANDING SCORECARD" --new "at-ma-tu-assessment-form.md#"
import 'dotenv/config';
import { client } from '../lib/store.js';
const db = client();
const { data: bad } = await db.from('chunks').select('id').like('source_ref', 'at-ma-tu-assessment-form.md#%');
const ids = (bad || []).map((x) => x.id);
console.log(`${ids.length} chunks to delete under at-ma-tu-assessment-form.md`);
if (ids.length) {
  const { data: restored, error: e1 } = await db.from('chunks').update({ superseded_by: null }).in('superseded_by', ids).select('id');
  if (e1) throw e1;
  console.log(`restored ${restored?.length || 0} chunks that were superseded by fabricated ones`);
  const { error: e2 } = await db.from('chunks').delete().in('id', ids);
  if (e2) throw e2;
  console.log('deleted');
}
const { count } = await db.from('chunks').select('id', { count: 'exact', head: true }).eq('source', 'psia_doc').is('superseded_by', null);
console.log(`live psia_doc chunks now: ${count}  (expect 169 = 157 + 12 restored)`);
