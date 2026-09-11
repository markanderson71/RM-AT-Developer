// Debug retrieval endpoint (architecture §10, §14). POST { query, limit?, sources?, authors?, types?, skills?, criteria?, includeUnapproved? }
// Returns ranked chunks with similarity. Used for retrieval eval and sanity checks; the scorer uses lib/assembler.js (session 4).
import { search } from '../../lib/store.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { query, limit = 10, sources, authors, types, skills, criteria, includeUnapproved = false } = body;
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'query (string) required' });

  try {
    const rows = await search(query, { limit: Math.min(Number(limit) || 10, 50), sources, authors, types, skills, criteria, includeUnapproved });
    return res.status(200).json({
      query,
      count: rows.length,
      results: rows.map((r) => ({
        id: r.id, short_id: r.id.slice(0, 8), similarity: Number(r.similarity.toFixed(4)),
        source: r.source, author: r.author, type: r.type, source_ref: r.source_ref, date: r.date,
        criteria: r.criteria, skills: r.skills, approved: r.approved,
        text: r.text.length > 600 ? `${r.text.slice(0, 600)}…` : r.text,
        metadata: r.metadata,
      })),
    });
  } catch (err) {
    console.error('chunks/search error:', err);
    return res.status(500).json({ error: err.message });
  }
}
