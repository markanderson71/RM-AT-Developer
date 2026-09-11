// Knowledge store. Architecture §5, §7.3 hard filters.
// Server-side only (service key). Never import from the frontend.
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { embedDocuments, embedQuery } from './embed.js';

export const SOURCES = ['psia_doc', 'chris_zoom', 'chris_comment', 'chris_score', 'mentor_assessment', 'web', 'past_session'];
export const CRITERIA = ['describe', 'cause_effect', 'evaluate', 'prescription', 'biomechanics', 'communication', 'general'];
export const SKILLS = [
  'edging', 'pressure', 'rotary', 'balance_fore_aft', 'balance_lateral', 'ski_to_ski', 'upper_lower_separation',
  'turn_shape', 'turn_phase', 'dirt', 'conditions', 'tactics', 'equipment', 'intent_verification', 'peer_dialog',
  'idp_task', 'physics_sidecut', 'physics_forces', 'physics_camber', 'fitts_posner', 'l3_vs_at',
];
export const TYPES = ['definition', 'principle', 'correction', 'exemplar', 'physics', 'mental_model', 'idp_task'];

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

  const vectors = await embedDocuments(fresh.map((r) => r.text));
  const payload = fresh.map((r, i) => ({ ...r, embedding: vectors[i] }));
  const { error: e2 } = await client().from('chunks').insert(payload);
  if (e2) throw e2;
  return { inserted: fresh.length, skipped: rows.length - fresh.length };
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
