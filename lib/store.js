// Knowledge store. Architecture §5, §7.3 hard filters.
// Server-side only (service key). Never import from the frontend.
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { embedDocuments, embedQuery } from './embed.js';
import { SOURCES, CRITERIA, SKILLS, TYPES } from './vocab.js';

export { SOURCES, CRITERIA, SKILLS, TYPES } from './vocab.js';

// §5.2 approved defaults. Only chris_zoom waits for approval.
const APPROVED_DEFAULT = { chris_zoom: false };

let _client;
export function client() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set');
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export function hashText(text) {
  return createHash('sha256').update(text.trim()).digest('hex').slice(0, 32);
}

/** Validate + normalize a chunk before insert. Throws on schema violations. */
export function normalizeChunk(c) {
  if (!c.text || !c.text.trim()) throw new Error('chunk.text empty');
  if (!SOURCES.includes(c.source)) throw new Error(`bad source ${c.source}`);
  if (!TYPES.includes(c.type)) throw new Error(`bad type ${c.type}`);
  const criteria = (c.criteria || []).filter((x) => CRITERIA.includes(x));
  const skills = (c.skills || []).filter((x) => SKILLS.includes(x));
  return {
    text: c.text.trim(),
    source: c.source,
    source_ref: c.source_ref ?? null,
    criteria: criteria.length ? criteria : ['general'],
    skills,
    type: c.type,
    author: c.author ?? null,
    date: c.date ?? null,
    approved: c.approved ?? APPROVED_DEFAULT[c.source] ?? true,
    metadata: c.metadata ?? {},
    text_hash: hashText(c.text),
    // Not a column. When set, this is what gets embedded instead of `text` (exemplars: the stored text carries Chris's
    // numbers for the evaluator to read, but retrieval must match on the session's substance — session 1 showed that
    // scores in embedded text compress every session into one similarity band). Stripped before insert.
    ...(c.embed_text ? { embed_text: String(c.embed_text) } : {}),
  };
}

/**
 * Insert chunks, embedding them first. Idempotent on (source, source_ref, text_hash):
 * existing rows are skipped, so bootstrap can re-run.
 * Returns { inserted, skipped }.
 */
export async function insertChunks(chunks, { dryRun = false } = {}) {
  const rows = chunks.map(normalizeChunk);
  if (!rows.length) return { inserted: 0, skipped: 0 };

  // Find existing hashes for these source_refs in one query.
  const refs = [...new Set(rows.map((r) => r.source_ref))].filter(Boolean);
  const { data: existing, error: e1 } = await client()
    .from('chunks').select('source, source_ref, text_hash')
    .eq('source', rows[0].source).in('source_ref', refs.length ? refs : ['__none__']);
  if (e1) throw e1;
  const have = new Set((existing || []).map((x) => `${x.source}|${x.source_ref}|${x.text_hash}`));
  const fresh = rows.filter((r) => !have.has(`${r.source}|${r.source_ref}|${r.text_hash}`));
  if (dryRun || !fresh.length) return { inserted: 0, skipped: rows.length - fresh.length, wouldInsert: fresh.length };

  const vectors = await embedDocuments(fresh.map((r) => r.embed_text || r.text));
  const payload = fresh.map(({ embed_text, ...r }, i) => ({ ...r, embedding: vectors[i] }));
  const { data: made, error: e2 } = await client().from('chunks').insert(payload).select('id, text_hash');
  if (e2) throw e2;
  return { inserted: fresh.length, skipped: rows.length - fresh.length, ids: (made || []).map((m) => m.id), rows: made || [] };
}

/**
 * Similarity search. §7.3 hard filters are applied server-side in match_chunks.
 * opts: { limit, sources, authors, types, skills, criteria, includeUnapproved }
 * includeUnapproved is for the debug endpoint only. The assembler never sets it.
 */
export async function search(queryText, opts = {}) {
  const embedding = await embedQuery(queryText);
  return searchByEmbedding(embedding, opts);
}

export async function searchByEmbedding(embedding, opts = {}) {
  const { data, error } = await client().rpc('match_chunks', {
    query_embedding: embedding,
    match_count: opts.limit ?? 20,
    filter_sources: opts.sources ?? null,
    filter_authors: opts.authors ?? null,
    filter_types: opts.types ?? null,
    filter_skills: opts.skills ?? null,
    filter_criteria: opts.criteria ?? null,
    include_unapproved: opts.includeUnapproved ?? false,
  });
  if (error) throw error;
  return data;
}

/**
 * Live, approved chunks under a source_ref prefix, in insertion order. No embedding involved.
 * Used by the assembler for the always-on definitions slot (§7.1): those are fetched, not searched.
 */
export async function getBySourceRefPrefix(prefix, { source = null } = {}) {
  let q = client().from('chunks')
    .select('id, text, source, source_ref, criteria, skills, type, author, date, approved, metadata')
    .like('source_ref', `${prefix}%`).eq('approved', true).is('superseded_by', null)
    .order('created_at', { ascending: true });
  if (source) q = q.eq('source', source);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Mark old chunk as superseded by new one (§5.6). */
export async function supersede(oldId, newId) {
  const { error } = await client().from('chunks').update({ superseded_by: newId }).eq('id', oldId);
  if (error) throw error;
}

/** Supersede every live chunk matching a filter (used when a Development Assessment is re-saved). */
export async function supersedeWhere(filter, newId) {
  let q = client().from('chunks').update({ superseded_by: newId }).is('superseded_by', null).neq('id', newId);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { error } = await q;
  if (error) throw error;
}

export async function counts() {
  const { data, error } = await client().from('chunks').select('source, approved').is('superseded_by', null);
  if (error) throw error;
  const out = {};
  for (const r of data) {
    out[r.source] ??= { approved: 0, pending: 0 };
    out[r.source][r.approved ? 'approved' : 'pending']++;
  }
  return out;
}

/** Live (not superseded) chunks of one source under one source_ref. Used by the continuous pipelines (§6.3, §6.4, §6.7). */
export async function liveBySourceRef(source, sourceRef, { author = null } = {}) {
  let q = client().from('chunks').select('id, text, text_hash, source, source_ref, criteria, skills, type, author, date, approved, metadata, created_at')
    .eq('source', source).eq('source_ref', sourceRef).is('superseded_by', null).order('created_at', { ascending: true });
  if (author) q = q.eq('author', author);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Timestamps of every thread comment already in the store for a session — live OR superseded (a hand-split comment's whole-text chunk is superseded, and must still count as seen). */
export async function commentTimestamps(sourceRef) {
  const { data, error } = await client().from('chunks').select('metadata').eq('source', 'chris_comment').eq('source_ref', sourceRef);
  if (error) throw error;
  return new Set((data || []).map((r) => r.metadata?.timestamp).filter(Boolean));
}

/** Live Chris-scored (or any mentor's) exemplars, metadata only — agreement (§9) reads the AI score pinned at ingest from here. */
export async function listExemplars({ author = null } = {}) {
  let q = client().from('chunks').select('id, source_ref, author, date, metadata').eq('source', 'chris_score').eq('type', 'exemplar').is('superseded_by', null);
  if (author) q = q.eq('author', author);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ── Pending chunks + approval (§5.6, §6.2) — session 2 ───────────────────────────────────────────
const COLS = 'id, text, source, source_ref, criteria, skills, type, author, date, approved, superseded_by, metadata, created_at';
const bad = (status, message) => Object.assign(new Error(message), { status });

/**
 * Insert chunks that wait for approval. approved is forced false and NO embedding is written:
 * match_chunks requires `embedding is not null`, so a pending chunk is unretrievable twice over.
 */
export async function insertPending(chunks) {
  const rows = chunks.map((c) => ({ ...normalizeChunk(c), approved: false }));
  if (!rows.length) return { inserted: 0, skipped: 0 };
  const refs = [...new Set(rows.map((r) => r.source_ref))];
  const { data: existing, error: e1 } = await client().from('chunks').select('source, source_ref, text_hash').in('source_ref', refs);
  if (e1) throw e1;
  const key = (r) => `${r.source}|${r.source_ref}|${r.text_hash}`;
  const have = new Set((existing || []).map(key));
  const fresh = rows.filter((r) => !have.has(key(r)) && have.add(key(r)));
  if (fresh.length) { const { error } = await client().from('chunks').insert(fresh); if (error) throw error; }
  return { inserted: fresh.length, skipped: rows.length - fresh.length };
}

export async function countBySourceRef(source, sourceRef) {
  const { data, error } = await client().from('chunks').select('approved').eq('source', source).eq('source_ref', sourceRef);
  if (error) throw error;
  return { pending: data.filter((r) => !r.approved).length, approved: data.filter((r) => r.approved).length };
}

/** Re-extraction: drop the unapproved chunks of one call. Approved chunks are never touched. */
export async function deletePendingBySourceRef(source, sourceRef) {
  const { data, error } = await client().from('chunks').delete().eq('source', source).eq('source_ref', sourceRef).eq('approved', false).select('id');
  if (error) throw error;
  return data.length;
}

export async function listPending({ source = null, sourceRef = null, author = null, limit = 300 } = {}) {
  let q = client().from('chunks').select(COLS).eq('approved', false).is('superseded_by', null).limit(limit);
  if (source) q = q.eq('source', source);
  if (sourceRef) q = q.eq('source_ref', sourceRef);
  if (author) q = q.eq('author', author);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).sort((a, b) => String(a.source_ref).localeCompare(String(b.source_ref)) || (a.metadata?.sec ?? 0) - (b.metadata?.sec ?? 0));
}

export async function getChunk(id) {
  const { data, error } = await client().from('chunks').select(COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** A mentor's own live, approved statements — the pool "Replaces earlier →" draws from. Not PSIA, not scores, not assessments. */
export async function liveStatements(author) {
  const { data, error } = await client().from('chunks').select(COLS)
    .eq('author', author).eq('approved', true).is('superseded_by', null).in('source', ['chris_zoom', 'chris_comment']);
  if (error) throw error;
  return data || [];
}

/**
 * §5.6 candidates: same author, older, overlapping on a real tag (criteria other than `general`, or skills).
 * A `correction` never supersedes a `principle` — it refines — so principles are not offered to corrections.
 * Pure: pass the pool from liveStatements().
 */
export function supersessionCandidates(chunk, pool, { limit = 5 } = {}) {
  const crit = new Set((chunk.criteria || []).filter((c) => c !== 'general'));
  const skills = new Set(chunk.skills || []);
  return pool
    .filter((p) => p.id !== chunk.id && p.author === chunk.author && canSupersede(chunk, p))
    .filter((p) => !chunk.date || !p.date || p.date < chunk.date || (p.date === chunk.date && p.source_ref !== chunk.source_ref))
    .map((p) => ({ ...p, overlap: { criteria: p.criteria.filter((c) => crit.has(c)), skills: p.skills.filter((s) => skills.has(s)) } }))
    .filter((p) => p.overlap.criteria.length + p.overlap.skills.length > 0)
    .sort((a, b) => (b.overlap.criteria.length * 2 + b.overlap.skills.length) - (a.overlap.criteria.length * 2 + a.overlap.skills.length) || String(b.date).localeCompare(String(a.date)))
    .slice(0, limit);
}
export const canSupersede = (newer, older) => !(newer.type === 'correction' && older.type === 'principle');

function applyEdit(chunk, edit = {}) {
  const next = { ...chunk, metadata: { ...(chunk.metadata || {}) } };
  if (edit.text != null && edit.text.trim() !== chunk.text) {
    if (!edit.text.trim()) throw bad(400, 'edit.text empty');
    next.metadata.original_text ??= chunk.text;          // what the extractor produced, kept once
    next.text = edit.text.trim();
  }
  if (edit.criteria) next.criteria = edit.criteria;
  if (edit.skills) next.skills = edit.skills;
  if (edit.type) next.type = edit.type;
  if (edit.hedged === false) { next.metadata.hedged = false; }
  const n = normalizeChunk(next);                         // validates tags/type, recomputes text_hash
  return { text: n.text, criteria: n.criteria, skills: n.skills, type: n.type, text_hash: n.text_hash, metadata: next.metadata };
}

/** Edit a pending chunk without approving it. Approved chunks are immutable: supersede them instead. */
export async function editPending(id, edit, { actor }) {
  const c = await getChunk(id);
  if (!c) throw bad(404, `chunk ${id} not found`);
  if (c.approved) throw bad(409, 'chunk is approved; approved chunks are replaced (superseded), not edited');
  const patch = applyEdit(c, edit);
  patch.metadata.edited_by = actor; patch.metadata.edited_at = new Date().toISOString();
  const { data, error } = await client().from('chunks').update(patch).eq('id', id).eq('approved', false).select(COLS).single();
  if (error) throw error;
  return data;
}

/**
 * Approve: (optional edit) → embed → one update that sets embedding + approved together → supersede `replaces`.
 * Embedding first, so a Voyage failure leaves the chunk pending and untouched.
 */
export async function approveChunk(id, { actor, edit = null, replaces = [] } = {}, deps = {}) {
  const c = await getChunk(id);
  if (!c) throw bad(404, `chunk ${id} not found`);
  if (c.approved) throw bad(409, 'already approved');
  if (c.author && actor !== c.author) throw bad(403, `only ${c.author} approves ${c.author}'s statements`);
  const patch = applyEdit(c, edit || {});
  const olds = [];
  for (const oid of [...new Set(replaces || [])]) {
    const o = await getChunk(oid);
    if (!o) throw bad(404, `replaces: ${oid} not found`);
    if (o.id === id || !o.approved || o.superseded_by) throw bad(409, `replaces: ${oid} is not a live approved chunk`);
    if (o.author !== c.author) throw bad(409, `replaces: ${oid} is by ${o.author}; a statement only replaces the same author's`);
    if (!canSupersede({ type: patch.type }, o)) throw bad(409, 'a correction never supersedes a principle — it refines it; approve without "replaces" (§5.6)');
    olds.push(o.id);
  }
  const [embedding] = await (deps.embedDocuments || embedDocuments)([patch.text]);
  patch.metadata.approved_by = actor; patch.metadata.approved_at = new Date().toISOString();
  if (olds.length) patch.metadata.replaces = olds;
  const { data, error } = await client().from('chunks').update({ ...patch, embedding, approved: true }).eq('id', id).eq('approved', false).select(COLS).single();
  if (error) throw error;
  for (const oid of olds) await supersede(oid, id);
  return { chunk: data, superseded: olds };
}

/** Delete a pending chunk. Approved chunks are never deleted here. */
export async function deletePending(id) {
  const { data, error } = await client().from('chunks').delete().eq('id', id).eq('approved', false).select('id');
  if (error) throw error;
  if (!data.length) throw bad(409, 'not found, or already approved (approved chunks are superseded, not deleted)');
  return true;
}

// ── Provenance stamp (session 7c) ─────────────────────────────────────────────────────────────────
/**
 * Set metadata.session_id on live chunks — what `sessions[]` at Zoom ingest would have written (§7.3.5).
 * Provenance only: text, tags, embedding and approval are untouched, so this is not an edit of an approved
 * chunk. Refuses to overwrite a DIFFERENT existing id unless `force`. Returns per-chunk outcomes.
 */
export async function stampSessionId(updates, { force = false } = {}) {
  const out = [];
  for (const { id, sessionId, label = null } of updates) {
    const c = await getChunk(id);
    if (!c) { out.push({ id, status: 'missing' }); continue; }
    const cur = c.metadata?.session_id || null;
    if (cur === sessionId) { out.push({ id, status: 'unchanged', session_id: cur }); continue; }
    if (cur && !force) { out.push({ id, status: 'conflict', session_id: cur, wanted: sessionId }); continue; }
    const metadata = { ...(c.metadata || {}), session_id: sessionId, session_stamped_at: new Date().toISOString() };
    if (label) metadata.session_label = label;
    if (cur) metadata.session_id_previous = cur;
    const { error } = await client().from('chunks').update({ metadata }).eq('id', id);
    if (error) throw error;
    out.push({ id, status: cur ? 'replaced' : 'stamped', session_id: sessionId, previous: cur });
  }
  return out;
}
