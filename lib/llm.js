// Anthropic Messages wrapper for server-side use. Model assignments per architecture §11.
import Anthropic from '@anthropic-ai/sdk';

export const MODELS = {
  sonnet: 'claude-sonnet-4-6',   // Step 1 Extract, PSIA chunk boundaries
  opus: 'claude-opus-4-6',       // Step 2 Evaluate, Zoom extraction (sessions 2, 4)
};

let _client;
function client() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  // SDK defaults are a 10-minute timeout × 2 retries: one stalled connection can hang a run for 30 minutes.
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 240_000, maxRetries: 1 });
  return _client;
}

export async function complete({ model, system, user, maxTokens = 4000, temperature = 0 }) {
  const res = await client().messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return res.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

/** Pull the first JSON object/array out of a model response. Tolerates ```json fences and preamble. */
export function extractJson(text) {
  if (!text) throw new Error('empty model response');
  const clean = text.replace(/```json|```/g, '').trim();
  const starts = [clean.indexOf('{'), clean.indexOf('[')].filter((i) => i >= 0);
  if (!starts.length) throw new Error('no JSON in response');
  const s = Math.min(...starts);
  const closer = clean[s] === '{' ? '}' : ']';
  const e = clean.lastIndexOf(closer);
  return JSON.parse(clean.slice(s, e + 1));
}

/** complete() + extractJson() with one retry that feeds the parse error back. */
export async function completeJson(opts) {
  const first = await complete(opts);
  try { return extractJson(first); } catch (err) {
    const retry = await complete({
      ...opts,
      user: `${opts.user}\n\nYour previous response could not be parsed as JSON (${err.message}). Return ONLY valid JSON, no prose, no code fences.`,
    });
    return extractJson(retry);
  }
}
