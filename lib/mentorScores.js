// Mentor scorecards — the ONE reader, shared by the browser (src/lib/scorecard.js re-exports everything here) and the
// API (ingest/score, agreement). Pure: no React, no SDK, no node built-ins. Moved out of src/lib/scorecard.js in
// session 6 so the server reads a scorecard exactly the way the screen does.
//
// Two shapes count as a scorecard in a session's mentorFeedback thread:
//   - the blind form's structured item: { userId, kind: "blind_score", scores, note, blind, ai_at_submit, timestamp, text }
//   - a hand-posted line in the same text format ("Chris scorecard 2026-09-17 (2026 form): MA: cause_effect 2, …"),
//     attributed to the mentor it names, even when Mark posted it on his behalf.
import { SCORED, SCORED_CRITERIA, PASS, MENTORS } from './vocab.js';

/** A score is an integer 1–6 or it is null. 0, "", NaN, "4.5abc" → null. */
export const cleanScore = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 1 && n <= 6 ? Math.round(n) : null; };
const round2 = (n) => Math.round(n * 100) / 100;

/** Section averages + pass for a { line: score } map on the 2026 form. Null wherever a line is missing. */
export function formMath(scores) {
  const avg = (keys) => { const xs = keys.map((k) => cleanScore(scores?.[k])); return xs.every((x) => x != null) ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null; };
  const ma = avg(SCORED.ma), tu = avg(SCORED.tu);
  return { sections: { ma, tu }, meets: ma != null && tu != null ? ma >= PASS && tu >= PASS : null };
}

const KEY_RE = new RegExp(`\\b(${[...SCORED_CRITERIA, 'needs_safety', 'behavior_management'].join('|')})\\s*[:=]?\\s*([1-6])\\b`, 'gi');

/** The one text format for a mentor scorecard in the comment thread — what Mark posted by hand for 7n6ry6d, and what the blind form writes. */
export function formatScoreLine({ who, date, scores, blind, note }) {
  const f = (keys) => keys.map((k) => `${k} ${scores[k]}`).join(', ');
  const m = formMath(scores);
  return `${who} scorecard ${date} (2026 form${blind ? ', scored blind' : ''}): MA: ${f(SCORED.ma)} (avg ${m.sections.ma}) | TU: ${f(SCORED.tu)} (avg ${m.sections.tu}) | Overall: ${m.meets ? 'Meets Standards' : 'Does Not Meet Standards'}${note ? ` | Note: ${note}` : ''}`;
}
export function parseScoreLine(text) {
  if (!/scorecard/i.test(text || '')) return null;
  const scores = {}; let m; KEY_RE.lastIndex = 0;
  while ((m = KEY_RE.exec(text))) scores[m[1].toLowerCase()] = Number(m[2]);
  return SCORED_CRITERIA.every((k) => scores[k] != null) ? scores : null;
}
/** A hand-posted line may carry a note after "| Note:". */
const noteOf = (text) => String(text || '').match(/\|\s*Note:\s*([\s\S]+)$/i)?.[1]?.trim() || '';

/** True for any thread item that IS a scorecard (either shape). Comment ingestion skips these; the score path owns them. */
export const isScoreItem = (f) => !!f && ((f.kind === 'blind_score' && !!f.scores) || !!parseScoreLine(f.text));

/** Every mentor scorecard on a session, newest per mentor. Structured items (blind form) and hand-posted lines both count. */
export function mentorScores(session) {
  const out = {};
  for (const f of session?.mentorFeedback || []) {
    let who = String(f.userId || '').toLowerCase(), scores = null, blind = false, note = f.note || '';
    if (f.kind === 'blind_score' && f.scores) { scores = f.scores; blind = f.blind !== false; }
    else {
      scores = parseScoreLine(f.text);
      blind = !!scores && /scored blind/i.test(f.text);              // a verbal scorecard posted on his behalf can still be a blind one (7uk7lnh, 9/18 call)
      const named = scores && String(f.text).match(/^\s*(\w+)\s+scorecard/i)?.[1]?.toLowerCase();
      if (named && MENTORS.includes(named)) who = named;             // "Chris scorecard … posted by Mark" belongs to Chris
      if (scores && !note) note = noteOf(f.text);
    }
    if (!scores || !MENTORS.includes(who)) continue;
    const clean = Object.fromEntries(SCORED_CRITERIA.map((k) => [k, cleanScore(scores[k])]));
    out[who] = { who, scores: clean, ...formMath(clean), blind, note, timestamp: f.timestamp || null, postedBy: f.userId, aiAtSubmit: f.ai_at_submit || null };
  }
  return out;
}
