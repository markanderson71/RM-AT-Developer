// §9 — agreement between the AI scorer and a mentor's scorecards. "Agreement rate is the system's truth."
// Pure (no store, no Sheet, no SDK): the endpoint and the CLI feed it sessions; session 8's panel only draws the result.
//
// Rules, in the order they bite:
//   1. The AI number compared is the one the mentor was BLIND TO: his submission's `ai_at_submit`; else the score pinned
//      in the store when his scorecard was first ingested (`pins`); else — flagged `unpinned` — the summary as it stands.
//      A rescore never moves a past comparison (§15).
//   2. 2026 form only. An old-scorer result is never compared with a 2026 scorecard (§15 "one scorecard"); such a
//      session is listed under `excluded` with the reason, not silently dropped.
//   3. Blind and not-blind scorecards are reported separately. The headline (and the §1 targets) is BLIND only:
//      a card given after seeing the AI number, or one the scorer was calibrated on (7n6ry6d), is not agreement.
//   4. Missing is missing: a line without both numbers is not counted, in either the numerator or the denominator.
import { SCORED_CRITERIA } from './vocab.js';
import { mentorScores, cleanScore, formMath } from './mentorScores.js';

export const TARGETS = { exact_pct: 60, within_one_pct: 85 };      // §1
const pct = (a, n) => (n ? Math.round((a / n) * 1000) / 10 : null);
const round2 = (n) => Math.round(n * 100) / 100;

const is2026 = (scores, tag) => !!scores && scores.equipment != null && tag !== 'legacy';
function aiFor(session, card, pins) {
  const a = card.aiAtSubmit;
  if (a?.scores) return a.form === 'legacy' || !is2026(a.scores, a.scorer) ? { excluded: 'the AI score at submit was an old-scorer result' } : { scores: a.scores, scorer: a.scorer || null, source: 'submit' };
  const p = pins?.[session.id];
  if (p?.scores) return { scores: p.scores, scorer: p.scorer || null, source: 'pinned_at_ingest' };
  const s = session.parsedSummary;
  if (is2026(s?.scores, s?.scorer || s?.meta?.scorer)) return { scores: s.scores, scorer: s.meta?.scorer || null, source: 'current_summary', unpinned: true };
  return { excluded: s?.scores ? 'the saved AI score is an old-scorer result' : 'no AI score on the session' };
}

function tally(rows) {
  const per = Object.fromEntries(SCORED_CRITERIA.map((k) => [k, { n: 0, exact: 0, within_one: 0, over: 0, under: 0, sum: 0 }]));
  for (const r of rows) for (const k of SCORED_CRITERIA) {
    const d = r.per[k].d; if (d == null) continue;
    const t = per[k]; t.n++; t.sum += d; if (d === 0) t.exact++; if (Math.abs(d) <= 1) t.within_one++; if (d > 0) t.over++; if (d < 0) t.under++;
  }
  const fin = (t) => ({ n: t.n, exact: t.exact, within_one: t.within_one, exact_pct: pct(t.exact, t.n), within_one_pct: pct(t.within_one, t.n), ai_over: t.over, ai_under: t.under, mean_delta: t.n ? round2(t.sum / t.n) : null });
  const all = Object.values(per).reduce((a, t) => ({ n: a.n + t.n, exact: a.exact + t.exact, within_one: a.within_one + t.within_one, over: a.over + t.over, under: a.under + t.under, sum: a.sum + t.sum }), { n: 0, exact: 0, within_one: 0, over: 0, under: 0, sum: 0 });
  const res = rows.filter((r) => r.same_result != null);
  return {
    sessions: rows.length, overall: fin(all), per_criterion: Object.fromEntries(SCORED_CRITERIA.map((k) => [k, fin(per[k])])),
    same_result: { n: res.length, agree: res.filter((r) => r.same_result).length },
    meets_targets: all.n ? pct(all.exact, all.n) >= TARGETS.exact_pct && pct(all.within_one, all.n) >= TARGETS.within_one_pct : null,
  };
}

/**
 * @param sessions  lib/sheet.js getMaSessions() shape (needs mentorFeedback + parsedSummary)
 * @param opts.mentor  whose scorecards (default chris — ground truth)
 * @param opts.pins    { [sessionId]: { scores, scorer } } — AI score pinned at first ingest (store exemplar metadata)
 * @param opts.window  trend window, in blind scorecards (§12.4: 20)
 */
export function agreement(sessions, { mentor = 'chris', pins = {}, window = 20 } = {}) {
  const rows = [], excluded = [];
  for (const s of sessions || []) {
    const card = mentorScores(s)[mentor];
    if (!card) continue;
    const ai = aiFor(s, card, pins);
    if (ai.excluded) { excluded.push({ session_id: s.id, date: s.date || null, reason: ai.excluded }); continue; }
    const per = Object.fromEntries(SCORED_CRITERIA.map((k) => { const a = cleanScore(ai.scores[k]), m = card.scores[k]; return [k, { ai: a, mentor: m, d: a != null && m != null ? a - m : null }]; }));
    const ds = Object.values(per).map((p) => p.d).filter((d) => d != null);
    const aiMeets = formMath(ai.scores).meets;
    rows.push({
      session_id: s.id, date: s.date || null, scored_at: card.timestamp || null, blind: !!card.blind, ai_source: ai.source, ai_scorer: ai.scorer, unpinned: !!ai.unpinned,
      per, n: ds.length, exact: ds.filter((d) => d === 0).length, within_one: ds.filter((d) => Math.abs(d) <= 1).length,
      same_result: aiMeets != null && card.meets != null ? aiMeets === card.meets : null,
    });
  }
  // oldest → newest by when he scored it; id breaks ties (harvested rule: never an unstable sort on the Sheet's rows)
  rows.sort((a, b) => String(a.scored_at || a.date || '').localeCompare(String(b.scored_at || b.date || '')) || String(a.session_id).localeCompare(String(b.session_id)));
  const blind = rows.filter((r) => r.blind);
  const recent = blind.slice(-window);
  return {
    mentor, targets: TARGETS, window,
    blind: tally(blind), recent: tally(recent), not_blind: tally(rows.filter((r) => !r.blind)), all: tally(rows),
    trend: recent.map((r) => ({ session_id: r.session_id, date: r.date, n: r.n, exact_pct: pct(r.exact, r.n), within_one_pct: pct(r.within_one, r.n), same_result: r.same_result, scorer: r.ai_scorer })),
    by_scorer: Object.fromEntries([...new Set(blind.map((r) => r.ai_scorer || 'unknown'))].map((v) => [v, tally(blind.filter((r) => (r.ai_scorer || 'unknown') === v)).overall])),
    sessions: rows, excluded,
  };
}
