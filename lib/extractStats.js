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

