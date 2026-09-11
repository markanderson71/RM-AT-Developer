// Embedding client. Architecture §11: one model, chosen at build, NEVER switched.
// Model: Voyage voyage-3 · 1024 dimensions · matches vector(1024) in supabase/schema.sql.
// Switching models means re-embedding the entire store. Don't.

export const EMBEDDING_MODEL = 'voyage-3';
export const EMBEDDING_DIM = 1024;

const ENDPOINT = 'https://api.voyageai.com/v1/embeddings';
const BATCH = 32;            // Voyage limit is 128 inputs / 120K tokens per request; 32 keeps a batch under ~10K tokens.
const MAX_RETRIES = 6;

function apiKey() {
  const k = process.env.EMBEDDING_API_KEY;
  if (!k) throw new Error('EMBEDDING_API_KEY not set');
  return k;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(inputs, inputType, attempt = 0) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs, input_type: inputType }),
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= MAX_RETRIES) throw new Error(`voyage ${res.status} after ${MAX_RETRIES} retries: ${(await res.text()).slice(0, 300)}`);
    const wait = Math.min(60_000, 5_000 * 2 ** attempt);   // 5s, 10s, 20s, 40s, 60s, 60s
    console.log(`  voyage ${res.status}; retrying in ${wait / 1000}s (${attempt + 1}/${MAX_RETRIES})`);
    await sleep(wait);
    return call(inputs, inputType, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`voyage ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const out = json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  for (const v of out) {
    if (v.length !== EMBEDDING_DIM) throw new Error(`embedding dim ${v.length} != ${EMBEDDING_DIM}`);
  }
  return out;
}

/** Embed chunk texts for storage. Returns number[][] aligned with input. */
export async function embedDocuments(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    out.push(...(await call(texts.slice(i, i + BATCH), 'document')));
  }
  return out;
}

/** Embed a retrieval query (the Step 1 extraction, or a debug string). Returns number[]. */
export async function embedQuery(text) {
  const [v] = await call([text], 'query');
  return v;
}
