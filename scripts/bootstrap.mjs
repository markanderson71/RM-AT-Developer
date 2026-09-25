// Bootstrap the knowledge store (architecture §13 session 1).
//
//   node scripts/bootstrap.mjs [--dry-run] [--only psia|mentor|comments|sessions] [--session <id>] [--force]
//
// Sources → chunks:
//   /reference/*.md                     → psia_doc           (§6.1; reference text is file-based, not Sheet — see §16)
//   Config._MENTOR_ASSESSMENTS          → mentor_assessment  (one per mentor, supersedes prior)
//   MASessions.mentorFeedback[]         → chris_comment      (one per comment, author from userId)
//   MASessions (scored)                 → past_session       (Step 1 extraction; AI scores in metadata)
//
// Idempotent: insertChunks skips (source, source_ref, text_hash) duplicates. Re-run freely.
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { insertChunks, counts, client, supersedeWhere, hashText } from '../lib/store.js';
import { chunkReferenceDir, keywordTags, mergeTags } from '../lib/ingest/psia.js';
import { CRITERIA, SKILLS } from '../lib/store.js';
import { getConfig, getMaSessions } from '../lib/sheet.js';
import { extractSession, extractionToText, normalizeMaType } from '../lib/prompts/extract.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DRY = flag('--dry-run');
const ONLY = opt('--only');
const SESSION = opt('--session');
const FORCE = flag('--force');
const here = dirname(fileURLToPath(import.meta.url));
const REF_DIR = join(here, '..', 'reference');
const log = (m) => console.log(m);
const run = (name) => !ONLY || ONLY === name;

function safeJson(v, fb) { if (v == null || v === '') return fb; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return fb; } }
const MENTORS = new Set(['chris', 'gates', 'mike']);

// ─── 1. PSIA reference documents ───
async function ingestPsia() {
  log('\n[psia_doc] chunking /reference');
  // Sonnet boundaries vary slightly between runs, so re-chunking an already-ingested file would create
  // near-duplicates under new hashes. Skip files that already have live chunks unless --force.
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(REF_DIR).filter((f) => f.endsWith('.md'));
  const todo = [];
  for (const f of files) {
    const { count } = await client().from('chunks').select('id', { count: 'exact', head: true }).eq('source', 'psia_doc').like('source_ref', `${f}#%`).is('superseded_by', null);
    if (count && !FORCE) log(`  ${f}: ${count} live chunks already in store, skip (use --force to re-chunk)`);
    else todo.push(f);
  }
  if (!todo.length) return;
  const chunks = await chunkReferenceDir(REF_DIR, log, todo);
  log(`  → ${chunks.length} chunks`);
  const r = await insertChunks(chunks, { dryRun: DRY });
  log(`  inserted ${r.inserted} · skipped ${r.skipped}${DRY ? ` · would insert ${r.wouldInsert}` : ''}`);
}

// ─── 2. Mentor Development Assessments (§6.5) ───
async function ingestMentorAssessments(config) {
  log('\n[mentor_assessment] Config._MENTOR_ASSESSMENTS');
  const all = safeJson(config._MENTOR_ASSESSMENTS, {});
  const chunks = [];
  for (const [mentor, a] of Object.entries(all)) {
    if (!a || typeof a !== 'object') continue;
    const text = [
      `Development Assessment by ${mentor} (${a.lastUpdated || 'undated'})`,
      a.whatsWorking ? `WHAT'S WORKING: ${a.whatsWorking}` : null,
      a.consistentGaps ? `CONSISTENT GAPS: ${a.consistentGaps}` : null,
      a.progress ? `PROGRESS: ${a.progress}` : null,
      a.challenge ? `WHERE TO CHALLENGE OR PUSH: ${a.challenge}` : null,   // fourth field, session 8
    ].filter(Boolean).join('\n\n');
    const kw = keywordTags(text);
    chunks.push({
      text, source: 'mentor_assessment', source_ref: `mentor_assessment:${mentor}`,
      criteria: mergeTags(['general'], kw.criteria, CRITERIA), skills: kw.skills,
      type: 'principle', author: MENTORS.has(mentor) ? mentor : mentor, date: a.lastUpdated || null, approved: true,
      metadata: { mentor, lastUpdated: a.lastUpdated || null },
    });
  }
  log(`  → ${chunks.length} chunks`);
  const r = await insertChunks(chunks, { dryRun: DRY });
  log(`  inserted ${r.inserted} · skipped ${r.skipped}`);
  if (!DRY && r.inserted) {
    // Supersede older assessments from the same mentor (§5.6): newest live row wins.
    for (const c of chunks) {
      const { data } = await client().from('chunks').select('id, created_at').eq('source', 'mentor_assessment').eq('source_ref', c.source_ref).is('superseded_by', null).order('created_at', { ascending: false });
      if (data && data.length > 1) for (const old of data.slice(1)) await supersedeWhere({ id: old.id }, data[0].id);
    }
  }
}

// ─── 3. Chris (and other mentor) comments on MA sessions (§6.3) ───
async function ingestComments(sessions) {
  log('\n[chris_comment] MASessions.mentorFeedback');
  const chunks = [];
  for (const s of sessions) {
    for (const fb of s.mentorFeedback || []) {
      const author = String(fb.userId || fb.author || '').toLowerCase();
      if (!MENTORS.has(author) || !fb.text?.trim()) continue;
      const header = `Comment by ${author} on MA session ${s.id} (${s.date}; ${normalizeMaType(s.type)}; peer: ${s.who || '?'}; task: ${s.activity || '?'})`;
      const text = `${header}\n\n${fb.text.trim()}`;
      const kw = keywordTags(fb.text);
      const aiScores = s.parsedSummary?.scores || null;
      chunks.push({
        text, source: 'chris_comment', source_ref: `session:${s.id}`,
        criteria: mergeTags([], kw.criteria, CRITERIA), skills: kw.skills,
        type: /disagree|agree with ai|not\b.*\bneed/i.test(fb.text) ? 'correction' : 'principle',
        author, date: (fb.timestamp || s.date || '').slice(0, 10) || null, approved: true,
        metadata: { session_id: s.id, timestamp: fb.timestamp || null, ai_scores_at_comment: aiScores },
      });
    }
  }
  log(`  → ${chunks.length} chunks`);
  const r = await insertChunks(chunks, { dryRun: DRY });
  log(`  inserted ${r.inserted} · skipped ${r.skipped}`);
}

// ─── 4. Past scored sessions → Step 1 extraction → past_session (§6.7) ───
// Embedded text is the extraction only. Scores, type, peer, etc. live in metadata — putting them in the
// text compressed all sessions into one similarity band (session 1 retrieval check).
const EXCLUDE_SESSIONS = (process.env.EXCLUDE_SESSIONS || '').split(',').map((x) => x.trim()).filter(Boolean);

function sessionChunk(s, x) {
  const text = extractionToText(x);
  return {
    text, source: 'past_session', source_ref: `session:${s.id}`,
    criteria: ['general'], skills: mergeTags(x.skills_referenced || [], keywordTags(text).skills, SKILLS),
    type: 'exemplar', author: 'mark', date: s.date || null, approved: true,
    metadata: {
      session_id: s.id, ma_type: x.ma_type, who: s.who, activity: s.activity, conditions: s.conditions,
      ai_scores: s.parsedSummary?.scores || null, ai_rationale: s.parsedSummary?.score_rationale || null,
      extraction: x, extraction_hash: hashText(JSON.stringify(x)),
      has_chris_comment: (s.mentorFeedback || []).some((f) => String(f.userId).toLowerCase() === 'chris'),
    },
  };
}

async function ingestPastSessions(sessions) {
  log('\n[past_session] scored MASessions → Step 1 extraction');
  const targets = sessions.filter((s) => s.scored && (s.transcript?.length > 200 || Object.keys(s.sections || {}).length) && !EXCLUDE_SESSIONS.includes(s.id));
  log(`  ${targets.length} scored sessions with transcripts${EXCLUDE_SESSIONS.length ? ` (excluding ${EXCLUDE_SESSIONS.join(', ')})` : ''}`);
  for (const s of targets) {
    const ref = `session:${s.id}`;
    const { data: existing } = await client().from('chunks').select('id, metadata').eq('source', 'past_session').eq('source_ref', ref).is('superseded_by', null).limit(1);
    if (existing?.length && !FORCE) { log(`  ${s.id}: already ingested, skip`); continue; }
    if (DRY) { log(`  ${s.id}: would ${existing?.length ? 're-embed from stored extraction' : 'extract'}`); continue; }
    // --force re-embeds from the stored extraction; no new Sonnet call unless none is stored.
    let x = existing?.[0]?.metadata?.extraction;
    if (!x) { log(`  ${s.id} (${s.date}, ${normalizeMaType(s.type)}): extracting…`); x = await extractSession(s); }
    else log(`  ${s.id}: re-embedding from stored extraction`);
    const r = await insertChunks([sessionChunk(s, x)]);
    if (r.inserted && existing?.length) {
      const { data: fresh } = await client().from('chunks').select('id').eq('source', 'past_session').eq('source_ref', ref).is('superseded_by', null).order('created_at', { ascending: false }).limit(1);
      if (fresh?.[0]) await supersedeWhere({ id: existing[0].id }, fresh[0].id);
    }
    log(`  ${s.id}: inserted ${r.inserted} · skipped ${r.skipped}`);
  }
  // Supersede excluded sessions that are already live (e.g. seed data).
  for (const id of EXCLUDE_SESSIONS) {
    const { data } = await client().from('chunks').select('id').eq('source', 'past_session').eq('source_ref', `session:${id}`).is('superseded_by', null);
    for (const row of data || []) { if (!DRY) await client().from('chunks').update({ superseded_by: row.id }).eq('id', row.id); log(`  ${id}: excluded, superseded`); }
  }
}

// ─── main ───
(async () => {
  log(`bootstrap ${DRY ? '(DRY RUN) ' : ''}${ONLY ? `only=${ONLY} ` : ''}`);
  if (run('psia')) await ingestPsia();
  if (run('mentor') || run('comments') || run('sessions')) {
    log('\nreading Sheet…');
    const config = await getConfig();
    let sessions = await getMaSessions(config);
    if (SESSION) sessions = sessions.filter((s) => s.id === SESSION.replace(/^ma_/, ''));
    log(`  ${Object.keys(config).length} config rows · ${sessions.length} MA sessions (${sessions.filter((s) => s.scored).length} scored)`);
    if (run('mentor')) await ingestMentorAssessments(config);
    if (run('comments')) await ingestComments(sessions);
    if (run('sessions')) await ingestPastSessions(sessions);
  }
  if (!DRY) { log('\nstore counts:'); console.table(await counts()); }
})().catch((e) => { console.error('\nbootstrap failed:', e.message); if (process.env.DEBUG) console.error(e); process.exit(1); });
