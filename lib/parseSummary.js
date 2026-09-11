// Harvested from ATDevelopmentJournal.jsx (parseAIJson + parseSummary) with all retry strategies.
// Pure functions, no React. The new frontend imports this same file (§10 /src/lib/parseSummary.js
// can re-export it) so scorer output parsing has exactly one implementation.

export const CRITERIA_KEYS = ['describe', 'cause_effect', 'evaluate', 'prescription', 'biomechanics', 'communication'];

function numberizeScores(scores) {
  if (!scores || typeof scores !== 'object') return scores;
  for (const k of Object.keys(scores)) scores[k] = Number(scores[k]) || 0;
  return scores;
}

/** Parse a raw model response that should contain a scorer JSON. Never throws. */
export function parseAIJson(resp) {
  if (!resp) return { raw: '', scores: null };
  if (typeof resp !== 'string') resp = JSON.stringify(resp);

  // Strategy 1: strip fences, take outermost braces, parse.
  try {
    const clean = resp.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
    if (s !== -1 && e > s) {
      const parsed = JSON.parse(clean.slice(s, e + 1));
      if (parsed.scores) { numberizeScores(parsed.scores); return parsed; }
    }
  } catch { /* fall through */ }

  // Strategy 2: regex the scores object out and rebuild the rest field by field.
  try {
    const m = resp.match(/"scores"\s*:\s*\{([^}]+)\}/);
    if (m) {
      const scoresObj = JSON.parse(`{${m[0]}}`);
      numberizeScores(scoresObj.scores);
      const extractArray = (key) => {
        const a = resp.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]+)\\]`));
        if (!a) return null;
        try { return JSON.parse(`[${a[1]}]`); } catch { return a[1].split(',').map((x) => x.replace(/"/g, '').trim()).filter(Boolean); }
      };
      const extractStr = (key) => resp.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`))?.[1] ?? null;
      const rationale = {};
      const rm = resp.match(/"score_rationale"\s*:\s*\{([\s\S]*?)\}\s*[,}]/);
      if (rm) for (const k of CRITERIA_KEYS) { const v = rm[1].match(new RegExp(`"${k}"\\s*:\\s*"([^"]*)"`)); if (v) rationale[k] = v[1]; }
      return {
        scores: scoresObj.scores,
        score_rationale: Object.keys(rationale).length ? rationale : undefined,
        did_well: extractArray('did_well') || extractArray('strengths'),
        opportunity: extractArray('opportunity') || extractArray('gaps'),
        key_learning: extractStr('key_learning'),
        raw: resp,
      };
    }
  } catch { /* fall through */ }

  return { raw: resp, scores: null };
}

/** Parse the `summary` field as stored in the Sheet: may be JSON, double-stringified JSON, or {raw}. */
export function parseSummary(summary) {
  if (!summary) return null;
  try {
    let text = summary;
    if (typeof text === 'string' && text.startsWith('"')) { try { text = JSON.parse(text); } catch { /* keep */ } }
    const obj = typeof text === 'string' ? JSON.parse(text) : text;
    if (obj?.scores) { numberizeScores(obj.scores); return obj; }
    if (obj?.raw) { const re = parseAIJson(obj.raw); if (re?.scores) return { ...obj, ...re }; }
    const fb = parseAIJson(typeof summary === 'string' ? summary : JSON.stringify(summary));
    if (fb?.scores) return fb;
    return obj;
  } catch {
    return typeof summary === 'string' ? parseAIJson(summary) : null;
  }
}

/** True if a parsed summary has all six criteria scored 1–6. */
export function hasFullScores(parsed) {
  const s = parsed?.scores;
  return !!s && CRITERIA_KEYS.every((k) => Number.isFinite(s[k]) && s[k] >= 1 && s[k] <= 6);
}
