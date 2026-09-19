// Single source of vocabulary for the knowledge store, Step 1 Extract, and Step 2 Evaluate.
// Architecture §5.3–§5.5, §17 ("extract.js and evaluate.js vocabulary alignment"). No imports, safe everywhere.

/** Scored lines on the 2026 AT MA/TU Assessment Form (§5.3, decided 2026-09-17). Order = form order. */
export const SCORED = {
  ma: ['cause_effect', 'evaluate', 'prescription'],
  tu: ['desired_performances', 'biomechanics', 'equipment'],
};
export const SCORED_CRITERIA = [...SCORED.ma, ...SCORED.tu];

/** Pre-2026 scored lines. Still emitted by the evaluator as diagnostics; still valid chunk tags. */
export const LEGACY_CRITERIA = ['describe', 'communication'];

/** Every valid `criteria` tag on a chunk. */
export const CRITERIA = [...SCORED_CRITERIA, ...LEGACY_CRITERIA, 'general'];

export const CRITERION_LABEL = {
  cause_effect: 'Cause and Effect',
  evaluate: 'Evaluate',
  prescription: 'Prescription',
  desired_performances: 'Understanding of Desired Performances',
  biomechanics: 'Understanding of Biomechanics/Physics',
  equipment: 'Equipment',
  describe: 'Describe (diagnostic, not a 2026 exam line)',
  communication: 'Communication (diagnostic, not a 2026 exam line)',
};

export const SKILLS = [
  'edging', 'pressure', 'rotary', 'balance_fore_aft', 'balance_lateral', 'ski_to_ski', 'upper_lower_separation',
  'turn_shape', 'turn_phase', 'dirt', 'conditions', 'tactics', 'equipment', 'intent_verification', 'peer_dialog',
  'idp_task', 'physics_sidecut', 'physics_forces', 'physics_camber', 'fitts_posner', 'l3_vs_at',
];

export const PHASES = ['initiation', 'shaping', 'finish', 'transition', 'unspecified'];

/** Outcome dimensions named on the 2026 form (Evaluate + Prescription lines) and in Chris's X→Y→Z frame. */
export const OUTCOMES = ['speed', 'turn_shape', 'turn_size', 'line', 'ski_snow_interaction'];

export const MA_TYPES = ['at_exam', 'written', 'scenario', 'reverse', 'compare', 'video'];

export const SOURCES = ['psia_doc', 'chris_zoom', 'chris_comment', 'chris_score', 'mentor_assessment', 'web', 'past_session'];
export const TYPES = ['definition', 'principle', 'correction', 'exemplar', 'physics', 'mental_model', 'idp_task'];

/** Who may post a scorecard (§9). Chris is ground truth; Gates and Mike use the same form, `author` differs (§17). */
export const MENTORS = ['chris', 'gates', 'mike'];

/** Pass rule: MA section average ≥ 4 AND TU section average ≥ 4. */
export const PASS = 4;
