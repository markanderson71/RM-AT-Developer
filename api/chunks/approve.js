// §6.2 / §5.6 — POST { action, actor, id | ids[], edit?, replaces? }
//   approve  { id, actor, edit?: { text?, criteria?, skills?, type?, hedged?: false }, replaces?: [chunkId] }  → embeds, approves, supersedes
//   approve  { ids: [...], actor }                                                                           → bulk, no edit/replaces
//   edit     { id, actor, edit }                                                                             → stays pending
//   delete   { id | ids, actor }                                                                             → pending only
// Only the author approves or edits his statements. The candidate may delete obvious junk but never approve or reword.
// `actor` is asserted by the client; since session 8 the request must also carry MENTOR_TOKEN (lib/http.js requireToken).
import { preflight, readBody, fail, requireToken } from '../../lib/http.js';
import { approveChunk, editPending, deletePending, getChunk } from '../../lib/store.js';

const ACTORS = ['chris', 'gates', 'mike', 'mark'];

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (requireToken(req, res)) return;   // session 8 — see lib/http.js
  try {
    const b = readBody(req);
    const actor = String(b.actor || '').toLowerCase();
    if (!ACTORS.includes(actor)) return res.status(400).json({ error: `actor must be one of ${ACTORS.join(', ')}` });
    const ids = b.ids?.length ? b.ids : b.id ? [b.id] : [];
    if (!ids.length) return res.status(400).json({ error: 'id or ids required' });
    if (ids.length > 1 && (b.edit || b.replaces?.length)) return res.status(400).json({ error: 'edit / replaces apply to a single id' });

    const one = async (id) => {
      if (b.action === 'approve') { const r = await approveChunk(id, { actor, edit: b.edit, replaces: b.replaces }); return { id, approved: true, superseded: r.superseded, text: r.chunk.text }; }
      const c = await getChunk(id);
      if (!c) throw Object.assign(new Error(`chunk ${id} not found`), { status: 404 });
      if (b.action === 'edit') {
        if (actor !== c.author) throw Object.assign(new Error(`only ${c.author} edits ${c.author}'s statements`), { status: 403 });
        const r = await editPending(id, b.edit || {}, { actor }); return { id, edited: true, text: r.text, criteria: r.criteria, skills: r.skills, type: r.type };
      }
      if (b.action === 'delete') {
        if (actor !== c.author && actor !== 'mark') throw Object.assign(new Error('not allowed'), { status: 403 });
        await deletePending(id); return { id, deleted: true };
      }
      throw Object.assign(new Error('action must be approve | edit | delete'), { status: 400 });
    };

    if (ids.length === 1) return res.status(200).json(await one(ids[0]));
    const results = [];
    for (const id of ids) { try { results.push(await one(id)); } catch (e) { results.push({ id, error: e.message }); } }
    return res.status(200).json({ count: results.length, failed: results.filter((r) => r.error).length, results });
  } catch (err) { return fail(res, err, 'chunks/approve'); }
}
