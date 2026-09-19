// Deterministic facts about an extraction. Pure — imported by Step 1 (server) and by lib/coaching.js (server + browser).
export const has = (v) => v != null && String(v).trim() !== '' && String(v).trim().toLowerCase() !== 'null';

/**
 * Deterministic facts about connections[]. A connection is COMPLETE when it carries Chris's whole unit:
 * a body movement or fundamental → ski performance → outcome, with the mechanism stated.
 * Also enforces the clerk's own rules in code (outcome_detail without outcome is dropped; how needs a how_quote).
 */
export function connectionStats(x) {
  const cs = x.connections || [];
  for (const c of cs) {
    if (!has(c.outcome)) { c.outcome = null; c.outcome_detail = null; }
    if (c.how_stated && !has(c.how_quote)) c.how_stated = false;
    c.complete = (has(c.body_movement) || has(c.fundamental)) && has(c.ski_performance) && has(c.outcome) && c.how_stated === true;
  }
  const un = cs.filter((c) => !c.prompted);
  return {
    total: cs.length, unprompted: un.length,
    complete: cs.filter((c) => c.complete).length, complete_unprompted: un.filter((c) => c.complete).length,
    with_ski_performance: cs.filter((c) => has(c.ski_performance)).length,
    with_outcome: cs.filter((c) => has(c.outcome)).length,
    with_how: cs.filter((c) => c.how_stated === true).length,
    fundamental_to_fundamental: cs.filter((c) => has(c.fundamental) && has(c.linked_fundamental)).length,
  };
}

/** cause_effect_chain rendered from connections[] — never authored by the model. */
export function renderChains(x) {
  return (x.connections || []).map((c) => [c.body_movement, c.fundamental, c.linked_fundamental, c.body_consequence, c.ski_performance, c.outcome ? (c.outcome_detail || c.outcome) : null].filter(has).join(' → ')).filter((t) => t.includes('→'));
}


/**
 * comparison_to_intended_outcome, normalized (extract v4). Two comparisons, three states each; the rules the clerk is
 * given are enforced here too: "made" needs the reference quoted (else it is partial, or absent with no quote at all).
 * Writes the v3 fields (`made`, `quote`, `intent_referenced_quote`) from the two, so older readers keep working.
 * A v3 object ({ made, quote, intent_referenced_quote }) is lifted: made → vs_intent made; vs_ideal unknown → absent.
 */
export function comparisonFacts(c) {
  c = c && typeof c === 'object' ? { ...c } : {};
  const one = (v) => {
    v = v && typeof v === 'object' ? { ...v } : {};
    let state = ['absent', 'partial', 'made'].includes(v.state) ? v.state : 'absent';
    if (state === 'made' && !has(v.reference_quote)) state = has(v.quote) ? 'partial' : 'absent';
    if (state === 'partial' && !has(v.quote) && !has(v.reference_quote)) state = 'absent';
    return { state, reference_quote: has(v.reference_quote) ? v.reference_quote : null, quote: has(v.quote) ? v.quote : null, prompted: v.prompted === true };
  };
  if (!c.vs_intent && !c.vs_ideal && 'made' in c) c.vs_intent = { state: c.made && has(c.intent_referenced_quote) ? 'made' : 'absent', reference_quote: c.intent_referenced_quote, quote: c.quote };
  const vi = one(c.vs_intent), vd = one(c.vs_ideal);
  const lead = vi.state === 'made' ? vi : vd.state === 'made' ? vd : vi.state === 'partial' ? vi : vd;
  return {
    vs_intent: vi, vs_ideal: vd, outcome_dimensions: Array.isArray(c.outcome_dimensions) ? c.outcome_dimensions : [],
    made: vi.state === 'made' || vd.state === 'made', both_made: vi.state === 'made' && vd.state === 'made',
    quote: lead.quote, intent_referenced_quote: lead.reference_quote,
  };
}
