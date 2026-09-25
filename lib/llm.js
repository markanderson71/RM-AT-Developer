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
  // Calls are STREAMED (see complete()), so `timeout` only bounds the wait for the response to START; a fast failure
  // (429/529/connection reset) still gets one retry. The old setting — 240 s on a non-streamed call, plus a retry —
  // could not fit in a 300 s function: on 2026-09-21 Opus needed ~250 s for one evaluation, the SDK cut it off at 240,
  // started again, and Vercel answered 504.
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90_000, maxRetries: 1 });
  return _client;
}

/**
 * Longest a single model call may run. The functions that call this have 300 s; leave room for retrieval and the reply.
 * Off Vercel there is no such ceiling: the CLIs set LLM_BUDGET_MS (e.g. 900000) so a slow Opus evening is waited out,
 * not failed — the 275 s cut-off exists for the serverless function, not for the model. Never set it in the Vercel env.
 */
export const CALL_BUDGET_MS = Number(process.env.LLM_BUDGET_MS) > 0 ? Number(process.env.LLM_BUDGET_MS) : 275_000;

export async function complete({ model, system, user, maxTokens = 4000, temperature = 0, budgetMs = CALL_BUDGET_MS, _client: injected }) {
  const stream = (injected || client()).messages.stream({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: user }],
  });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; stream.abort(); }, budgetMs);
  try {
    const res = await stream.finalMessage();
    if (res.stop_reason === 'max_tokens') console.warn(`complete(): ${model} stopped at max_tokens=${maxTokens}`);
    return res.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  } catch (err) {
    // A clean, explainable failure inside the function's limit — never Vercel's bare 504.
    if (timedOut) throw Object.assign(new Error(`the model (${model}) had not finished after ${Math.round(budgetMs / 1000)} s — it is running slowly right now; try again in a few minutes`), { status: 504 });
    throw err;
  } finally { clearTimeout(timer); }
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
