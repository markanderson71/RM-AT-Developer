// §6.4 / §9 — a mentor's scorecard on a session → knowledge.
//   one `exemplar` chunk   : what Mark said on each form line (from the Step 1 extraction) + the mentor's score for that line
//   `chris_score` note chunks: his note, one point per chunk, tagged to the lines it speaks to
// and, for Chris, the session's `past_session` chunk is superseded (§6.7: his score is truth, the AI's is not).
//
// What an exemplar is for: the evaluator reads "evidence that looks like THIS got a 2 from Chris" next to the session
// it is scoring. So the text is organised by form line, evidence first, his number last, and it carries NO AI score,
// rationale, or rewrite — an exemplar that showed AI numbers would teach the scorer its own bias back.
//
// Retrieval: the chunk is embedded on extractionToText(extraction) — the same function that builds the query (§7.2) —
// not on the rendered text. Like is compared with like, and his numbers don't pull every exemplar into one band.
//
// Self-exclusion (§7.3.5) needs nothing new: source_ref is `session:<id>`.
import { SCORED, SCORED_CRITERIA, MENTORS, SKILLS } from '../vocab.js';
import { mentorScores } from '../mentorScores.js';
import { has } from '../extractStats.js';
import { keywordTags } from './psia.js';
import { splitPoints } from './comment.js';

export const EXEMPLAR_TOKENS = 1_800;          // three fit the 6K exemplar slot (§7.1) with headers
export const MIN_EXTRACT_VERSION = 3;          // v1/v2 extractions lack connections[].complete / equipment — re-extract
const estTokens = (s) => Math.ceil(String(s || '').length / 3.8);
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const bad = (status, message) => Object.assign(new Error(message), { status });
const SHORT = { cause_effect: 'Cause & Effect', evaluate: 'Evaluate', prescription: 'Prescription', desired_performances: 'Desired Performances', biomechanics: 'Bio/Physics', equipment: 'Equipment' };

// ── evidence per form line, from the extraction's own fields (no judgment added) ──────────────────
const state3 = (c) => (c?.state ? c.state : null);
function evidenceLines(x, line, { quote = 170, maxItems = 8 } = {}) {
  const L = [];
  if (line === 'cause_effect') {
    const st = x.connection_stats;
    if (st) L.push(`${st.total} causal claims · ${st.complete} complete (movement/fundamental → ski performance → outcome, with the how) · ${st.with_ski_performance} reach ski performance · ${st.with_outcome} reach an outcome · ${st.with_how} state the how · ${st.total - st.unprompted} only under probing`);
    for (const c of (x.connections || []).slice(0, maxItems)) {
      const chain = [c.body_movement, c.fundamental, c.linked_fundamental, c.body_consequence, c.ski_performance, c.outcome ? (c.outcome_detail || c.outcome) : null].filter(has).map((t) => clip(t, 70)).join(' → ');
      const miss = [!has(c.ski_performance) && 'no ski performance', !has(c.outcome) && 'no outcome', c.how_stated !== true && 'no how'].filter(Boolean);
      L.push(`- [${c.complete ? 'complete' : `partial: ${miss.join(', ')}`}${c.prompted ? ' · prompted' : ''}] ${chain || clip(c.quote, quote)}`);
    }
    if ((x.connections || []).length > maxItems) L.push(`- … ${(x.connections.length - maxItems)} more, similar`);
    if (!(x.connections || []).length) L.push('- none');
  } else if (line === 'evaluate') {
    const c = x.comparison_to_intended_outcome || {};
    L.push(`task described: ${x.task?.described ? `yes — "${clip(x.task.quote, quote)}"` : 'no'}${x.task?.named ? ` (task named: ${clip(x.task.named, 60)})` : ''}`);
    if (c.vs_intent || c.vs_ideal) {
      for (const [k, label] of [['vs_intent', "performance vs the skier's intent"], ['vs_ideal', "vs the task's ideal"]]) {
        const v = c[k] || {}; L.push(`${label}: ${state3(v) || 'absent'}${has(v.quote) ? ` — "${clip(v.quote, quote)}"` : ''}`);
      }
    } else L.push(`comparison to intended outcome: ${c.made ? `made — "${clip(c.quote || c.intent_referenced_quote, quote)}"` : 'not made'}`);
    if ((c.outcome_dimensions || []).length) L.push(`outcome dimensions used: ${c.outcome_dimensions.join(', ')}`);
    if (x.intent_verification?.asked) L.push(`asked the peer's intent: yes — peer said "${clip((x.intent_verification.peer_answers || []).join(' / '), 120)}"`);
  } else if (line === 'prescription') {
    const p = x.prescription || {}, ch = p.chain || {};
    L.push(`task prescribed: ${clip(p.task, 120) || '—'}`);
    L.push(`chain — input: ${clip(ch.skier_input, 80) || 'not stated'} · fundamental: ${clip(ch.fundamental_changed, 60) || 'not stated'} · other fundamentals: ${clip(ch.other_fundamentals_affected, 60) || 'not stated'} · ski performance: ${clip(ch.ski_performance_change, 80) || 'not stated'} · outcome: ${clip(ch.outcome_change, 80) || 'not stated'} · tied to the task skied: ${ch.tied_to_observed_task ? 'yes' : 'no'}`);
    if (has(p.delivery_to_peer)) L.push(`to the peer: "${clip(p.delivery_to_peer, quote + 60)}"`);
    const d = x.delivery_stats; if (d?.peer_prescription_words) L.push(`peer delivery length: ${d.peer_prescription_words} words, ${d.peer_prescription_sentences} sentences`);
  } else if (line === 'desired_performances') {
    const d = x.desired_performance || {};
    L.push(`ideal performance of the task stated: ${d.stated ? `yes — "${clip(d.quote, quote + 60)}"` : 'no'}`);
    L.push(`fundamentals described working together: ${(d.fundamentals_blended || []).join(', ') || 'none'}`);
  } else if (line === 'biomechanics') {
    const ps = x.physics_concepts || [];
    for (const p of ps.slice(0, maxItems)) L.push(`- ${clip(p.concept, 70)} (${p.explicit_or_implied}; applied to ${p.applied_to || '?'}${p.prompted ? '; prompted' : ''}) — "${clip(p.quote, quote - 40)}"`);
    if (!ps.length) L.push('- no physics or biomechanics principle recorded');
    const hows = (x.connections || []).filter((c) => c.how_stated === true).length; if (hows) L.push(`mechanisms stated inside causal claims: ${hows}`);
  } else if (line === 'equipment') {
    const e = x.equipment || {};
    if (!e.addressed) L.push('not addressed');
    else {
      L.push(`addressed${e.prompted ? ' (only under probing)' : ''} — "${clip(e.quote, quote + 60)}"`);
      if (e.states_effect_on_observed_performance != null) L.push(`states the effect on THIS skier's observed performance: ${e.states_effect_on_observed_performance ? 'yes' : 'no — a recommendation / predicted benefit only'}`);
      L.push(`linked to biomechanics: ${e.linked_to_biomechanics ? 'yes' : 'no'} · to the desired performance: ${e.linked_to_desired_performance ? 'yes' : 'no'} · to snow/terrain: ${e.linked_to_environment ? 'yes' : 'no'}`);
    }
  }
  return L;
}

/**
 * The exemplar text. Pure. Shrinks (shorter quotes, fewer items) until it fits `capTokens`; never truncates mid-line.
 * @param card  one entry of mentorScores(session)
 */
export function renderExemplar({ session, extraction: x, card, date, capTokens = EXEMPLAR_TOKENS }) {
  const who = card.who[0].toUpperCase() + card.who.slice(1);
  const head = [
    `EXEMPLAR — ${who} scored this session himself on the 2026 AT MA/TU form${card.blind ? ' (blind: before seeing any AI score)' : ''}.`,
    `${date || session.date || '?'} · ${x.ma_type || '?'} · task: ${clip(session.activity || x.task?.named, 80) || '?'} · conditions: ${clip(session.conditions, 60) || '?'}`,
    `${who}'s result: MA ${card.sections.ma} · TU ${card.sections.tu} · ${card.meets ? 'Meets Standards' : 'Does Not Meet Standards'}`,
  ];
  const build = (o) => {
    const parts = [...head];
    if (card.note) parts.push(`${who}'s note: ${clip(card.note, o.note)}`);
    for (const [sec, label] of [['ma', 'MOVEMENT ANALYSIS'], ['tu', 'TECHNICAL UNDERSTANDING']]) {
      parts.push(`\n${label}`);
      for (const k of SCORED[sec]) parts.push(`${SHORT[k]} — ${who.toUpperCase()}: ${card.scores[k]}\n  what Mark said:\n${evidenceLines(x, k, o).map((l) => `  ${l}`).join('\n')}`);
    }
    return parts.join('\n');
  };
  for (const o of [{ quote: 170, maxItems: 8, note: 900 }, { quote: 120, maxItems: 6, note: 600 }, { quote: 80, maxItems: 4, note: 400 }, { quote: 50, maxItems: 3, note: 250 }]) {
    const t = build(o); if (estTokens(t) <= capTokens) return t;
  }
  return build({ quote: 40, maxItems: 2, note: 150 });
}

/** His note → single-point chunks (same splitter as comments). Each says which lines it speaks to and what he gave them. */
export function noteChunks({ session, card, date, maType }) {
  if (!has(card.note)) return [];
  const who = card.who[0].toUpperCase() + card.who.slice(1);
  return splitPoints(card.note).map((point, i) => {
    const kw = keywordTags(point);
    const lines = kw.criteria.filter((k) => SCORED_CRITERIA.includes(k));
    const gave = lines.length ? ` He scored ${lines.map((k) => `${SHORT[k]} ${card.scores[k]}`).join(', ')}.` : '';
    return {
      text: `${who}'s note with his${card.blind ? ' blind' : ''} scorecard on MA session ${session.id} (${date || session.date}; ${maType}; task: ${session.activity || '?'}).${gave}\n\n${point}`,
      source: 'chris_score', source_ref: `session:${session.id}`, criteria: kw.criteria, skills: kw.skills, type: 'principle',
      author: card.who, date, approved: true,
      metadata: { session_id: session.id, kind: 'score_note', part: i, blind: card.blind, scores: card.scores, title: `Note with scorecard — ${lines.map((k) => SHORT[k]).join(', ') || 'general'}` },
    };
  });
}

const cardKey = (card) => JSON.stringify([SCORED_CRITERIA.map((k) => card.scores[k]), card.note || '', !!card.blind]);
const cardDate = (card, session) => {
  const posted = (session.mentorFeedback || []).find((f) => f.timestamp === card.timestamp);
  return String(posted?.text || '').match(/scorecard\s+(\d{4}-\d{2}-\d{2})/i)?.[1] || String(card.timestamp || '').slice(0, 10) || session.date || null;
};
/** The AI score the mentor was blind to. From his submission when the form stored it; else the summary as it stands at first ingest. */
function aiPin(card, session) {
  if (card.aiAtSubmit?.scores) return { ...card.aiAtSubmit, pinned_from: 'submit' };
  const p = session.parsedSummary;
  if (!p?.scores || p.scores.equipment == null || p.scorer === 'legacy' || p.meta?.scorer === 'legacy') return null;   // old-scorer numbers are never compared with the 2026 form
  return { form: '2026', scores: Object.fromEntries(SCORED_CRITERIA.map((k) => [k, p.scores[k]])), scorer: p.meta?.scorer || null, scored_at: p.meta?.scored_at || null, pinned_from: 'summary_at_ingest' };
}

/**
 * Ingest one mentor's scorecard on one session. Idempotent: same scorecard + same extraction → nothing written.
 * A changed scorecard (hand-posted lines can be corrected; a blind submission is final in the UI) replaces the old exemplar.
 * @param deps { store, extractSession, extractionToText, hashText } — injectable for offline tests
 */
export async function ingestScore({ session, mentor = 'chris', extraction = null, reextract = false, dryRun = false }, deps) {
  const { store, extractSession, extractionToText } = deps;
  mentor = String(mentor).toLowerCase();
  if (!MENTORS.includes(mentor)) throw bad(400, `mentor must be one of ${MENTORS.join(', ')}`);
  const card = mentorScores(session)[mentor];
  if (!card) throw bad(422, `no ${mentor} scorecard on session ${session.id}`);
  if (SCORED_CRITERIA.some((k) => card.scores[k] == null)) throw bad(422, `${mentor}'s scorecard on ${session.id} is missing a line — an exemplar needs all six`);
  const ref = `session:${session.id}`;
  const date = cardDate(card, session);

  const live = await store.liveBySourceRef('chris_score', ref, { author: mentor });
  const oldEx = live.filter((c) => c.type === 'exemplar');
  const oldNotes = live.filter((c) => c.metadata?.kind === 'score_note');

  // Extraction: given → the live exemplar's (keeps re-runs stable) → the saved summary's → a fresh Step 1.
  const usable = (x) => x && typeof x === 'object' && (x.extract_version || 0) >= MIN_EXTRACT_VERSION;
  let x = null, from = null;
  if (usable(extraction)) { x = extraction; from = 'given'; }
  else if (!reextract && usable(oldEx[0]?.metadata?.extraction)) { x = oldEx[0].metadata.extraction; from = 'exemplar'; }
  else if (!reextract && usable(session.parsedSummary?.extraction)) { x = session.parsedSummary.extraction; from = 'summary'; }
  else {
    if (!session.transcript && !Object.keys(session.sections || {}).length) throw bad(422, `session ${session.id} has no transcript to extract`);
    if (dryRun) return { session_id: session.id, mentor, dryRun: true, would: 'extract (Sonnet) then insert', card };
    x = await extractSession(session); from = 'extracted';
  }

  const text = renderExemplar({ session, extraction: x, card, date });
  const key = cardKey(card);
  const same = oldEx.find((c) => c.metadata?.card_key === key && c.text === text);
  const exemplar = {
    text, embed_text: extractionToText(x),
    source: 'chris_score', source_ref: ref, criteria: [...SCORED_CRITERIA], skills: (x.skills_referenced || []).filter((s) => SKILLS.includes(s)),
    type: 'exemplar', author: mentor, date, approved: true,
    metadata: {
      session_id: session.id, kind: 'exemplar', title: `${mentor}'s scorecard — ${session.activity || x.task?.named || x.ma_type}`,
      ma_type: x.ma_type, who: session.who || null, activity: session.activity || null, conditions: session.conditions || null,
      blind: card.blind, scores: card.scores, sections: card.sections, meets: card.meets, note: card.note || '', posted_by: card.postedBy || null, scored_at: card.timestamp || null,
      // Pinned once. A re-ingest after a rescore must not move the number he was blind to (§15 "carries ai_at_submit").
      ai_at_submit: oldEx[0]?.metadata?.ai_at_submit || aiPin(card, session),
      card_key: key, extraction: x, extract_version: x.extract_version || null, extraction_from: from,
    },
  };
  const notes = noteChunks({ session, card, date, maType: x.ma_type });
  const report = { session_id: session.id, mentor, blind: card.blind, scores: card.scores, extraction_from: from, exemplar_tokens: estTokens(text), notes: notes.length };
  if (dryRun) return { ...report, dryRun: true, would: same ? 'nothing (unchanged)' : oldEx.length ? 'replace exemplar' : 'insert exemplar', text };

  let exemplarId = same?.id || null, inserted = 0;
  if (!same) {
    const r = await store.insertChunks([exemplar]);
    inserted += r.inserted;
    exemplarId = r.ids?.[0] || (await store.liveBySourceRef('chris_score', ref, { author: mentor })).filter((c) => c.type === 'exemplar' && c.metadata?.card_key === key).pop()?.id;
    if (!exemplarId) throw new Error('exemplar insert returned no id');
    for (const o of oldEx) if (o.id !== exemplarId) await store.supersede(o.id, exemplarId);
  }
  if (notes.length) inserted += (await store.insertChunks(notes)).inserted;
  const keep = new Set(notes.map((n) => n.text.trim()));
  let retired = 0;
  for (const o of oldNotes) if (!keep.has(o.text.trim())) { await store.supersede(o.id, exemplarId); retired++; }

  // §6.7 — once Chris has scored it, his exemplar supersedes the AI-scored past_session chunk. Other mentors' scorecards don't.
  let past = 0;
  if (mentor === 'chris') for (const p of await store.liveBySourceRef('past_session', ref)) { await store.supersede(p.id, exemplarId); past++; }

  return { ...report, exemplar_id: exemplarId, inserted, unchanged: !!same, replaced: same ? 0 : oldEx.length, notes_retired: retired, past_session_superseded: past };
}
