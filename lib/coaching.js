// Coaching helpers (§13 row 5, added 2026-09-19). Pure functions, no I/O, no React — imported by the API
// (single-line rescoring) and by the frontend (coaching panel, pre-exam brief). One implementation.
//
// Everything here works on the evaluator's gap_to_next ("Instead of X, say Y, because Z"), the Step 1 extraction,
// and the session's sections. Nothing here scores.
import { SCORED_CRITERIA } from './vocab.js';
import { connectionStats, renderChains, comparisonFacts } from './extractStats.js';

const Q = `'"‘’“”`;
const stripQuotes = (s) => String(s || '').trim().replace(new RegExp(`^[${Q}]+|[${Q}.,;]+$`, 'g'), '').trim();
const startsQuoted = (s) => new RegExp(`^[${Q}]`).test(String(s || '').trim());

/** "Instead of X, say Y, because Z" → parts. Tolerates quotes that contain apostrophes and the words say/because. */
export function parseGap(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const head = raw.match(/^instead of\s+/i);
  if (!head) return { raw, instead: null, say: null, because: null, quoted: false };
  const body = raw.slice(head[0].length);
  // " say " is taken at the first occurrence followed by a quote if there is one, else the first occurrence at all.
  const sayQ = body.search(new RegExp(`,?\\s+say\\s+[${Q}]`, 'i'));
  const sayAt = sayQ >= 0 ? sayQ : body.search(/,?\s+say\s+/i);
  if (sayAt < 0) return { raw, instead: stripQuotes(body), say: null, because: null, quoted: startsQuoted(body) };
  const insteadPart = body.slice(0, sayAt);
  const rest = body.slice(sayAt).replace(/^,?\s+say\s+/i, '');
  // "because" is taken at the LAST occurrence that follows a closing quote, else the last occurrence.
  let becAt = -1; const reQ = new RegExp(`[${Q}],?\\s+because\\s+`, 'gi'); let m;
  while ((m = reQ.exec(rest))) becAt = m.index + 1;
  if (becAt < 0) { const re = /,?\s+because\s+/gi; while ((m = re.exec(rest))) becAt = m.index; }
  const say = becAt >= 0 ? rest.slice(0, becAt) : rest;
  const because = becAt >= 0 ? rest.slice(becAt).replace(/^,?\s*because\s+/i, '') : null;
  return { raw, instead: stripQuotes(insteadPart), say: stripQuotes(say), because: because ? because.trim().replace(/\.$/, '') : null, quoted: startsQuoted(insteadPart) };
}

// ── finding what Mark actually said ──────────────────────────────────────────
const STOP = new Set('a an the of to in on at and or but that this it is was were be been as with for from by not no so than then had has have he she they his her their you your i my me we our its which who what when where how'.split(' '));
const toks = (s) => (String(s || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => !STOP.has(w));
/** Mark types and dictates fast ("symetrical", "consitant"); the evaluator quotes him with the spelling fixed. Near-equal words count. */
const near = (a, b) => {
  if (a === b) return true;
  if (a.length < 6 || b.length < 6 || Math.abs(a.length - b.length) > 2) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[b.length] <= 2;
};
const sentencesOf = (t) => (String(t || '').match(/[^.!?\n]+[.!?]*/g) || []).map((s) => s.trim()).filter((s) => s.length > 12);

const SECTION_LABEL = {
  private_notes: 'private notes — never spoken', root_cause: 'private notes — never spoken', peer_dialog: 'peer dialog',
  prescription_delivery: 'prescription to peer', presentation: 'presentation to examiner', written_analysis: 'written analysis',
  examiner_qa: 'examiner Q&A — prompted', transcript: 'transcript',
};
export const sectionLabel = (k) => SECTION_LABEL[k] || k;
export const SPOKEN_SECTIONS = ['peer_dialog', 'prescription_delivery', 'presentation', 'written_analysis', 'examiner_qa'];

/** Every sentence in the session with who said it and where. Dialog sections are "Speaker: text" lines. */
export function utterances(session) {
  const out = [];
  const push = (section, speaker, text) => { const ss = sentencesOf(text); ss.forEach((s, i) => { out.push({ section, speaker, text: s }); if (ss[i + 1]) out.push({ section, speaker, text: `${s} ${ss[i + 1]}`, pair: true }); }); };
  const dialog = (section, text) => {
    let speaker = 'Mark', buf = [];
    const flush = () => { if (buf.length) push(section, speaker, buf.join(' ')); buf = []; };
    for (const line of String(text || '').split('\n')) {
      const m = line.match(/^\s*(Mark(?:\s*\([^)]*\))?|Peer|Examiner|AI|[A-Z][a-z]+(?:\s*\(peer\))?)\s*:\s*(.*)$/);
      if (m) { flush(); speaker = /^Mark/.test(m[1]) ? 'Mark' : m[1]; buf.push(m[2]); } else buf.push(line);
    }
    flush();
  };
  const s = session?.sections || {};
  if (Object.keys(s).some((k) => s[k])) {
    for (const k of ['private_notes', 'root_cause']) if (s[k]) push(k, 'Mark', s[k]);
    for (const k of ['peer_dialog', 'prescription_delivery', 'examiner_qa']) if (s[k]) dialog(k, s[k]);
    for (const k of ['presentation', 'written_analysis']) if (s[k]) push(k, 'Mark', s[k]);
  } else if (session?.transcript) dialog('transcript', session.transcript);
  return out;
}

/**
 * Who said this quote, and was it said out loud? Sentence by sentence (a clerk's quote often spans several), each
 * matched to its closest utterance; a tie goes to Mark-spoken, so a line that is in his notes AND his presentation
 * counts as spoken. → { mark_spoken, notes, other, unknown } as shares of the quote's words, + `by` = the largest.
 */
export function whoSaid(text, session) {
  const us = utterances(session).filter((u) => !u.pair);
  const share = { mark_spoken: 0, notes: 0, other: 0, unknown: 0 };
  let total = 0;
  const parts = sentencesOf(text); if (!parts.length && toks(text).length) parts.push(String(text));
  for (const part of parts) {
    const want = toks(part); if (!want.length) continue;
    let top = null;
    for (const u of us) {
      const have = new Set(toks(u.text)); const list = [...have];
      const hit = want.filter((w) => have.has(w) || list.some((h) => near(w, h))).length / want.length;
      const cls = ['private_notes', 'root_cause'].includes(u.section) ? 'notes' : u.speaker === 'Mark' ? 'mark_spoken' : 'other';
      const score = hit + (cls === 'mark_spoken' ? 0.001 : 0);
      if (!top || score > top.score) top = { score, hit, cls, speaker: u.speaker };
    }
    total += want.length;
    share[top && top.hit >= 0.7 ? top.cls : 'unknown'] += want.length;
  }
  for (const k of Object.keys(share)) share[k] = total ? Number((share[k] / total).toFixed(2)) : 0;
  const by = Object.entries(share).sort((x, y) => y[1] - x[1])[0][0];
  return { ...share, by };
}

/**
 * Locate the "Instead of X" half of a gap in what was actually said. The evaluator never saw the transcript (§8.2) —
 * it quotes the extraction — so X can be Mark's words, a paraphrase, the PEER's words, or something from private notes.
 * Each of those is a different coaching message, so say which.
 * → { kind: 'quote'|'description'|'none', text, section, speaker, spoken, match }
 */
export function findOriginal(gap, session, fallbackQuotes = []) {
  const g = typeof gap === 'string' ? parseGap(gap) : gap;
  const us = utterances(session);
  const best = (needle) => {
    const want = toks(needle); if (want.length < 3) return null;
    let top = null;
    for (const u of us) {
      const have = new Set(toks(u.text)); const haveList = [...have];
      const hit = want.filter((w) => have.has(w) || haveList.some((h) => near(w, h))).length / want.length;
      const score = hit - (u.pair ? 0.03 : 0) - Math.max(0, have.size - want.length * 2.5) * 0.004;   // prefer the tightest span
      if (!top || score > top.score) top = { ...u, score, hit };
    }
    return top;
  };
  const shape = (u, kind) => ({ kind, text: u.text, section: u.section, speaker: u.speaker, spoken: !['private_notes', 'root_cause'].includes(u.section), match: Number(u.hit.toFixed(2)) });
  if (g?.instead) {
    const hit = best(g.instead);
    if (hit && hit.hit >= (g.quoted ? 0.6 : 0.75)) return shape(hit, 'quote');
  }
  // "describing only outcomes ('symmetrical turn shape, …')" — the evaluator described the move but quoted him inside it.
  for (const inner of String(g?.instead || '').match(new RegExp(`[${Q}]([^${Q}]{20,})[${Q}]`, 'g')) || []) { const hit = best(inner); if (hit && hit.hit >= 0.7) return shape(hit, 'quote'); }
  for (const q of fallbackQuotes.filter(Boolean)) { const hit = best(q); if (hit && hit.hit >= 0.7) return shape(hit, 'quote'); }
  if (g?.instead) return { kind: 'description', text: g.instead, section: null, speaker: null, spoken: null, match: 0 };
  return { kind: 'none', text: null, section: null, speaker: null, spoken: null, match: 0 };
}

/** Quotes the extraction holds for a line — used when the gap's X can't be found in the transcript. */
export function lineQuotes(line, x) {
  if (!x) return [];
  switch (line) {
    case 'cause_effect': return (x.connections || []).filter((c) => !c.prompted).map((c) => c.quote);
    case 'evaluate': { const c = x.comparison_to_intended_outcome || {}; return [c.vs_intent?.quote, c.vs_ideal?.quote, c.quote, c.vs_intent?.reference_quote, c.vs_ideal?.reference_quote, c.intent_referenced_quote]; }
    case 'prescription': return [x.prescription?.delivery_to_peer];
    case 'desired_performances': return [x.desired_performance?.quote, x.task?.quote];
    case 'biomechanics': return [...(x.physics_concepts || []).map((p) => p.quote), ...(x.connections || []).map((c) => c.how_quote)];
    case 'equipment': return [x.equipment?.quote];
    default: return [];
  }
}

/** Which section a rewrite for this line belongs in when there is no original sentence to replace. */
export const defaultSection = (line, session) => {
  const s = session?.sections || {};
  if (!Object.keys(s).some((k) => s[k])) return 'transcript';
  if (line === 'prescription' && s.prescription_delivery != null) return 'prescription_delivery';
  return s.presentation != null ? 'presentation' : s.written_analysis != null ? 'written_analysis' : 'presentation';
};

/** Put the rewrite into the session text: replace the original sentence if it is there, else append to the section. */
export function applyRewrite(session, { section, original, passage }) {
  const p = String(passage || '').trim();
  const hasSections = Object.keys(session?.sections || {}).some((k) => session.sections[k]);
  const key = hasSections ? section : 'transcript';
  const before = hasSections ? String(session.sections[key] || '') : String(session?.transcript || '');
  const dialog = ['peer_dialog', 'prescription_delivery', 'examiner_qa', 'transcript'].includes(key) && /^\s*(Mark|Peer|Examiner)\b[^:\n]*:/m.test(before);
  let after, replaced = false;
  if (original && before.includes(original)) { after = before.replace(original, p); replaced = true; }
  else after = before ? `${before}${dialog ? '\nMark: ' : '\n\n'}${p}` : (dialog ? `Mark: ${p}` : p);
  return hasSections
    ? { session: { ...session, sections: { ...session.sections, [key]: after } }, replaced }
    : { session: { ...session, transcript: after }, replaced };
}

// ── is the unit complete? (deterministic, from the passage's own extraction) ─
const has = (v) => v != null && String(v).trim() !== '' && String(v).trim().toLowerCase() !== 'null';

/**
 * The evaluator's UNIT for each line (lib/prompts/evaluate.js), checked in code against the rewritten passage alone.
 * → { complete, missing[] } — `missing` names the links Mark still hasn't said, in plain words.
 */
export function unitCheck(line, x) {
  const miss = [];
  const need = (ok, what) => { if (!ok) miss.push(what); };
  if (line === 'cause_effect') {
    const cs = x.connections || [];
    if (!cs.length) return { complete: false, missing: ['no causal claim found in the passage'] };
    if (cs.some((c) => c.complete)) return { complete: true, missing: [] };
    const c = cs.slice().sort((a, b) => ['body_movement', 'fundamental', 'ski_performance', 'outcome'].filter((k) => has(b[k])).length - ['body_movement', 'fundamental', 'ski_performance', 'outcome'].filter((k) => has(a[k])).length)[0];
    need(has(c.body_movement) || has(c.fundamental), 'the body movement or fundamental');
    need(has(c.ski_performance), 'what the SKI does on the snow');
    need(has(c.outcome), 'the outcome (speed, turn shape, turn size, line, ski–snow interaction)');
    need(c.how_stated === true, 'the how — the mechanism, not just "X caused Y"');
  } else if (line === 'evaluate') {
    // Two comparisons (extract v4): performance vs the skier's intent, and intent/performance vs the task's ideal.
    // Formats with no peer have no stated intent to compare against — only the ideal is asked of them.
    const c = comparisonFacts(x.comparison_to_intended_outcome);
    if (!x.ma_type || x.ma_type === 'at_exam') need(c.vs_intent.state === 'made', c.vs_intent.state === 'partial' ? "how the performance matched or missed the skier's intent, in the same claim" : "the observed performance set against the skier's own stated intent");
    need(c.vs_ideal.state === 'made', c.vs_ideal.state === 'partial' ? 'what the task actually requires — say the ideal, then set the intent or the performance against it' : "the skier's intent or performance set against what this task requires when skied well");
    need((c.outcome_dimensions || []).length > 0, 'an outcome dimension (speed, turn shape, turn size, line)');
  } else if (line === 'prescription') {
    const ch = x.prescription?.chain || {};
    need(has(ch.skier_input), 'the input asked of the skier');
    need(has(ch.fundamental_changed), 'the fundamental it changes');
    need(has(ch.ski_performance_change), 'the resulting ski performance');
    need(has(ch.outcome_change), 'the resulting outcome');
    need(ch.tied_to_observed_task === true, 'the tie back to the task just skied');
  } else if (line === 'desired_performances') {
    const d = x.desired_performance || {};
    need(d.stated === true, 'what this task looks like skied well (not the benefit of your fix)');
    need((d.fundamentals_blended || []).length >= 2, 'two or more fundamentals in blended relationship');
  } else if (line === 'biomechanics') {
    const ps = (x.physics_concepts || []);
    need(ps.length > 0 || (x.connections || []).some((c) => c.how_stated), 'a physics or biomechanics principle');
    need(ps.some((p) => p.applied_to !== 'general_mechanics') || (x.connections || []).some((c) => c.how_stated), 'applied to what THIS skier did');
  } else if (line === 'equipment') {
    const e = x.equipment || {};
    need(e.addressed === true, "a statement of how equipment affects this skier's performance");
    if (e.addressed === true && e.states_effect_on_observed_performance === false) need(false, 'the effect on what this skier DID — a recommendation or its predicted benefit is not yet an effect');
    need(e.linked_to_biomechanics || e.linked_to_desired_performance || e.linked_to_environment, 'the link to biomechanics, the desired performance, or the snow/terrain');
  }
  return { complete: miss.length === 0, missing: miss };
}

// ── merging a rewritten passage into the session's extraction ────────────────
const overlaps = (quote, replaced) => {
  if (!has(quote) || !has(replaced)) return false;
  const q = toks(quote), r = new Set(toks(replaced));
  return q.length > 0 && q.filter((w) => r.has(w)).length / q.length >= 0.7;
};

/**
 * Original extraction + the passage's extraction → the extraction of "the session as if he had said this instead".
 * Items quoted from the replaced sentence are removed; the passage's items are added. Booleans are taken from the
 * passage when it is positive, or when the original's evidence was the sentence that was replaced.
 */
export function mergePassage(original, patch, { section, replacedText = null } = {}) {
  const x = JSON.parse(JSON.stringify(original || {}));
  const prompted = section === 'examiner_qa';
  const gone = (q) => overlaps(q, replacedText);

  x.connections = [...(x.connections || []).filter((c) => !gone(c.quote)), ...(patch.connections || []).map((c) => ({ ...c, section, prompted, rewritten: true }))];
  x.physics_concepts = [...(x.physics_concepts || []).filter((p) => !gone(p.quote)), ...(patch.physics_concepts || []).map((p) => ({ ...p, prompted, rewritten: true }))];
  x.observations = [...(x.observations || []), ...(patch.observations || [])];
  x.skills_referenced = [...new Set([...(x.skills_referenced || []), ...(patch.skills_referenced || [])])];

  const take = (key, positive, quoteOf) => {
    const p = patch[key], o = x[key];
    if (p && positive(p)) x[key] = { ...p, prompted: prompted || undefined, rewritten: true };
    else if (o && gone(quoteOf(o))) x[key] = { ...(p || {}), rewritten: true };
  };
  take('task', (t) => t.described === true, (t) => t.quote);
  take('desired_performance', (d) => d.stated === true, (d) => d.quote);
  take('equipment', (e) => e.addressed === true, (e) => e.quote);
  // Two comparisons, merged one by one: a rewrite that adds the ideal must not erase a comparison to intent made elsewhere.
  {
    const rank = { absent: 0, partial: 1, made: 2 };
    const o = comparisonFacts(x.comparison_to_intended_outcome), p = comparisonFacts(patch.comparison_to_intended_outcome);
    const pick = (k) => (rank[p[k].state] > 0 && rank[p[k].state] >= rank[o[k].state] ? { ...p[k], prompted, rewritten: true } : gone(o[k].quote) ? p[k] : o[k]);
    x.comparison_to_intended_outcome = comparisonFacts({ vs_intent: pick('vs_intent'), vs_ideal: pick('vs_ideal'), outcome_dimensions: [...new Set([...o.outcome_dimensions, ...p.outcome_dimensions])] });
  }

  if (section === 'prescription_delivery' || Object.values(patch.prescription?.chain || {}).some((v) => has(v) && v !== false)) {
    const oc = x.prescription?.chain || {}, pc = patch.prescription?.chain || {};
    const chain = {};
    for (const k of new Set([...Object.keys(oc), ...Object.keys(pc)])) chain[k] = k === 'tied_to_observed_task' ? !!(pc[k] || (oc[k] && !gone(x.prescription?.delivery_to_peer))) : (has(pc[k]) ? pc[k] : oc[k] ?? null);
    x.prescription = { ...(x.prescription || {}), ...(has(patch.prescription?.delivery_to_peer) ? { delivery_to_peer: patch.prescription.delivery_to_peer } : {}), ...(has(patch.prescription?.task) && !has(x.prescription?.task) ? { task: patch.prescription.task } : {}), chain };
  }

  x.connection_stats = connectionStats(x);
  x.cause_effect_chain = renderChains(x);
  x.rewritten = { section, replaced: !!replacedText };
  return x;
}

// ── pre-exam brief ───────────────────────────────────────────────────────────
/**
 * Three things to carry into the next exam: the lowest lines of the last 2026-form session and the move for each.
 * `rank` = { line: score } to order by — the mentor's scores where he has given them, else the AI's.
 */
export function briefLines(detail, rank, n = 3) {
  const gaps = detail?.gap_to_next || {};
  return SCORED_CRITERIA
    .map((k, i) => ({ key: k, i, score: Number.isFinite(rank?.[k]) ? rank[k] : null, gap: parseGap(gaps[k]) }))
    .filter((l) => l.gap && l.score != null)
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .slice(0, n)
    .map(({ key, score, gap }) => ({ key, score, gap }));
}
