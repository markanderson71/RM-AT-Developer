// Session 4 one-time store migration. Idempotent. `--dry-run` prints without writing.
//   1. Retag the 2026 form chunks with the new criteria tags (desired_performances, equipment).
//      Re-ingest can't do it: insert is idempotent on text_hash and the text hasn't changed.
//   2. Split Chris's 2026-09-17 comment on session 7n6ry6d into single-point chunks so it retrieves per
//      criterion instead of as one 3.3K block. Text is pulled live from the Sheet and kept VERBATIM —
//      paragraphs are grouped, never reworded (same standard as §6.2: his words, no generalizing).
//      The original whole-comment chunk is marked superseded_by the first split chunk.
import 'dotenv/config';
import { client, insertChunks } from '../lib/store.js';
import { getMaSessions } from '../lib/sheet.js';
import { normalizeMaType } from '../lib/prompts/extract.js';

const DRY = process.argv.includes('--dry-run');
const db = client();
const log = console.log;

// ── 1. retag ──
const RETAG = {
  'at-ma-tu-assessment-form-2026.md#Technical Understanding › Equipment': ['equipment'],
  'at-ma-tu-assessment-form-2026.md#Technical Understanding › Understanding of Desired Performances': ['desired_performances', 'describe', 'evaluate'],
};
for (const [ref, criteria] of Object.entries(RETAG)) {
  const { data, error } = await db.from('chunks').select('id, criteria').eq('source_ref', ref).is('superseded_by', null);
  if (error) throw error;
  if (!data?.length) { log(`retag: NOT FOUND ${ref}`); continue; }
  for (const row of data) {
    log(`retag: ${row.id.slice(0, 8)} ${JSON.stringify(row.criteria)} → ${JSON.stringify(criteria)}`);
    if (!DRY) { const { error: e } = await db.from('chunks').update({ criteria }).eq('id', row.id); if (e) throw e; }
  }
}

// ── 2. split Chris 9/17 ──
const SESSION = '7n6ry6d';
const STAMP = '2026-09-17T13:16:41.509Z';
// [paragraph indexes, title, criteria, skills, expected opening words of the first paragraph (guard)]
const PARTS = [
  [[0], 'Naming fundamentals is not connecting them', ['cause_effect'], ['rotary', 'ski_to_ski', 'edging', 'turn_shape'], 'Lacks connection'],
  [[1], 'X → Y → Z frame relative to the desired outcome', ['cause_effect', 'evaluate', 'desired_performances'], ['conditions', 'tactics', 'turn_phase'], 'Connection is lacking'],
  [[2], 'State and describe the task', ['evaluate', 'desired_performances'], ['idp_task'], 'What is the task'],
  [[3, 8], 'Peer piece = coaching cue "plus", a few sentences', ['prescription', 'communication'], ['peer_dialog'], 'The peer comparison'],
  [[4], 'Equipment × biomechanics/physics × desired performance (worked example)', ['equipment', 'biomechanics', 'desired_performances', 'cause_effect'], ['equipment', 'rotary', 'edging', 'balance_lateral', 'turn_shape', 'physics_forces'], 'There is no speaking'],
  [[5, 6], 'Body → ski performance → turn impact; answer the "how"', ['cause_effect', 'biomechanics'], ['upper_lower_separation', 'edging', 'ski_to_ski', 'rotary'], 'There is limited body'],
  [[7], 'Prescription for change: the chain from skier input to outcome on the observed task', ['prescription', 'cause_effect'], ['idp_task', 'turn_shape'], 'When offering a prescription'],
];

const s = (await getMaSessions()).find((x) => x.id === SESSION);
const fb = (s?.mentorFeedback || []).find((f) => String(f.userId).toLowerCase() === 'chris' && f.timestamp === STAMP);
if (!fb) { console.error(`Chris's ${STAMP} comment on ${SESSION} not found in the Sheet`); process.exit(1); }
const paras = fb.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
if (paras.length !== 9) { console.error(`expected 9 paragraphs, found ${paras.length} — the comment was edited; update PARTS before running`); process.exit(1); }

const header = (title) => `Chris on MA session ${s.id} (${s.date}; ${normalizeMaType(s.type)}; task: ${s.activity || '?'}) — ${title}`;
const chunks = [];
for (const [idx, title, criteria, skills, opens] of PARTS) {
  if (!paras[idx[0]].startsWith(opens)) { console.error(`paragraph ${idx[0]} no longer starts with "${opens}" — aborting`); process.exit(1); }
  chunks.push({
    text: `${header(title)}\n\n${idx.map((i) => paras[i]).join('\n\n')}`,
    source: 'chris_comment', source_ref: `session:${s.id}`, criteria, skills, type: 'principle',
    author: 'chris', date: STAMP.slice(0, 10), approved: true,
    metadata: { session_id: s.id, timestamp: STAMP, title, split_from_comment: true, paragraphs: idx },
  });
}
for (const c of chunks) log(`split: ${c.metadata.title}  [${c.criteria.join(', ')}]  ${c.text.length} chars`);
const r = await insertChunks(chunks, { dryRun: DRY });
log(`split: inserted ${r.inserted} · skipped ${r.skipped}${DRY ? ` · would insert ${r.wouldInsert}` : ''}`);

if (!DRY) {
  const { data: live } = await db.from('chunks').select('id, metadata, created_at').eq('source', 'chris_comment').eq('source_ref', `session:${s.id}`).is('superseded_by', null).order('created_at', { ascending: true });
  const first = live.find((x) => x.metadata?.split_from_comment);
  const whole = live.filter((x) => !x.metadata?.split_from_comment && x.metadata?.timestamp === STAMP);
  for (const w of whole) { await db.from('chunks').update({ superseded_by: first.id }).eq('id', w.id); log(`superseded whole-comment chunk ${w.id.slice(0, 8)} → ${first.id.slice(0, 8)}`); }
}
log('done');
