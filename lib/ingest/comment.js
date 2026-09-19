// §6.3 — a mentor's comment in an MA History thread → `chris_comment` chunks (author = whoever wrote it).
// Long comments are split into single points so each retrieves on its own line of the form instead of as one block —
// what scripts/session4-migrate.mjs did by hand for Chris's 9/17 comment, now in code. His words are kept VERBATIM:
// paragraphs are grouped, never reworded, never summarised (same standard as §6.2). No model call: tags are keyword tags.
//
// Not ingested here: scorecards (either shape — lib/ingest/score.js owns them), Mark's own comments, empty text.
import { MENTORS, CRITERIA } from '../vocab.js';
import { isScoreItem } from '../mentorScores.js';
import { keywordTags, mergeTags } from './psia.js';
import { normalizeMaType } from '../prompts/extract.js';

const WHOLE_UNDER = 600;      // a short comment is one point
const MIN_POINT = 120;        // a paragraph shorter than this rides with its neighbour ("Agreed." / "One more thing:")
const bad = (status, message) => Object.assign(new Error(message), { status });

/** Verbatim single-point split. Pure. Blank lines are the boundaries he chose; fall back to line breaks only for a long unbroken block. */
export function splitPoints(text) {
  const t = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!t) return [];
  if (t.length <= WHOLE_UNDER) return [t];
  let paras = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length === 1) paras = t.split(/\n/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const p of paras) {
    const prev = out[out.length - 1];
    // a lead-in ("The peer comparison:") goes forward with what it introduces; a short tail goes back
    if (prev != null && (prev.length < MIN_POINT || /[:–—-]\s*$/.test(prev))) out[out.length - 1] = `${prev}\n\n${p}`;
    else if (prev != null && p.length < MIN_POINT && !/[:–—-]\s*$/.test(p)) out[out.length - 1] = `${prev}\n\n${p}`;
    else out.push(p);
  }
  return out;
}

/** Thread item → chunks. Pure. */
export function commentChunks({ session, item, aiScores = null }) {
  const author = String(item?.userId || item?.author || '').toLowerCase();
  if (!MENTORS.includes(author) || !String(item?.text || '').trim() || isScoreItem(item)) return [];
  const maType = normalizeMaType(session.type || session.context);
  const header = `Comment by ${author} on MA session ${session.id} (${session.date}; ${maType}; peer: ${session.who || '?'}; task: ${session.activity || '?'})`;
  const points = splitPoints(item.text);
  return points.map((point, i) => {
    const kw = keywordTags(point);
    return {
      text: `${header}\n\n${point}`,
      source: 'chris_comment', source_ref: `session:${session.id}`,
      criteria: mergeTags([], kw.criteria, CRITERIA), skills: kw.skills,
      type: /disagree|agree with ai|not\b.*\bneed/i.test(point) ? 'correction' : 'principle',
      author, date: String(item.timestamp || session.date || '').slice(0, 10) || null, approved: true,
      metadata: { session_id: session.id, timestamp: item.timestamp || null, part: i, parts: points.length, split_from_comment: points.length > 1, ai_scores_at_comment: aiScores },
    };
  });
}

/**
 * Ingest one comment, or (no `item`) every mentor comment on the session that the store has never seen.
 * "Seen" = any chunk, live or superseded, with this session's source_ref and the comment's timestamp — so comments
 * bootstrap already stored whole, and the 9/17 comment that was split by hand, are not ingested twice.
 */
export async function ingestComments({ session, item = null, dryRun = false }, { store }) {
  if (item && !MENTORS.includes(String(item.userId || '').toLowerCase())) throw bad(422, 'only mentor comments are ingested');
  const items = item ? [item] : (session.mentorFeedback || []);
  const ref = `session:${session.id}`;
  const seen = await store.commentTimestamps(ref);
  const aiScores = session.parsedSummary?.scores || null;
  const chunks = [];
  let skipped = 0;
  for (const it of items) {
    const cs = commentChunks({ session, item: it, aiScores });
    if (!cs.length) continue;
    if (it.timestamp && seen.has(it.timestamp)) { skipped++; continue; }
    chunks.push(...cs);
  }
  if (dryRun || !chunks.length) return { session_id: session.id, comments_skipped: skipped, would_insert: chunks.length, inserted: 0, titles: chunks.map((c) => c.text.split('\n\n')[1].slice(0, 70)) };
  const r = await store.insertChunks(chunks);
  return { session_id: session.id, comments_skipped: skipped, inserted: r.inserted, duplicates: r.skipped };
}
