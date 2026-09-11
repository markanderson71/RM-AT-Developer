# Session 1 — runbook

Copy these into the repo root (merge `package.json` deps; `vercel.json` replaces yours):

```
supabase/schema.sql          lib/embed.js          lib/prompts/extract.js     scripts/migrate.mjs
api/chunks/search.js         lib/store.js          lib/ingest/psia.js         scripts/bootstrap.mjs
reference/*.md (5 files)     lib/llm.js            lib/sheet.js               scripts/search.mjs
.env.example                 lib/parseSummary.js   vercel.json                package.json
```

## 1. Env

Local `.env` needs, in addition to what you already have:

```
SUPABASE_DB_URL=postgresql://postgres:<password>@db.rzgxzfrilbjrtcdimzjr.supabase.co:5432/postgres
APP_BASE_URL=https://at-dev-tracker.vercel.app
```

Vercel needs `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `EMBEDDING_API_KEY` (already set per you). It does **not** need `SUPABASE_DB_URL`.

## 2. Run

```
npm install
npm run migrate            # creates extension, table, indexes, match_chunks RPC. Idempotent.
npm run bootstrap:dry      # chunks everything, reports counts, inserts nothing. ~17 Sonnet calls, 0 embeddings.
npm run bootstrap          # for real. Adds Voyage embedding + ~7 Sonnet extraction calls for scored sessions.
```

Expected store counts after bootstrap (approximate):

| source | approved |
|---|---|
| psia_doc | ~110–160 (44 IDP tasks + Sonnet-chunked criteria, fundamentals, L3-vs-AT pairs, physics, program guide) |
| mentor_assessment | 1 (Chris) |
| chris_comment | 2 (Ben `bzfutxv`, Chuck `q5omsst`) |
| past_session | 7–8 (scored sessions with transcripts; `oxh5auq` has no transcript and is skipped) |

Re-running is safe — duplicates are skipped by `(source, source_ref, text_hash)`.

## 3. Done-when checks

```
npm run search -- "edging early in the turn, tipping the inside leg, sidecut engagement on firm snow"
npm run search -- "Ben basic parallel inside leg intensity at the finish, hooked turn shape, tails break away" --author chris
npm run search -- "Ben basic parallel inside leg intensity at the finish" --source past_session
```

Pass = query 1 returns `psia_doc` chunks about edging/sidecut/White Pass or Railroad Tracks near the top; query 2 returns Chris's comment on `session:bzfutxv`; query 3 returns the `bzfutxv` past-session extraction.

After `vercel deploy`, the same via HTTP:

```
curl -s -X POST https://at-dev-tracker.vercel.app/api/chunks/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"edging early in the turn, sidecut engagement on firm snow","limit":5}' | jq '.results[] | {similarity,source,author,source_ref}'
```

## 4. If something fails

- `migration failed: ... vector` → pgvector not enabled on the project; enable it under Database → Extensions, rerun.
- `voyage 401` → `EMBEDDING_API_KEY` isn't a Voyage key.
- `sheet returned non-JSON` → `APP_BASE_URL` wrong or Apps Script redirect; try `APPS_SCRIPT_URL` directly (unset `APP_BASE_URL`).
- Chunker returns very few `psia_doc` chunks for a section → set `DEBUG=1` and rerun `--only psia`; the Sonnet response is logged on parse failure.

Paste me the store counts table and the three search outputs.
