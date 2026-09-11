# AT Development Journal — Scoring System Architecture

**Status:** Design complete, build not started
**Owner:** Mark Anderson
**Ground truth:** Chris (AT Assessor)
**Purpose of this doc:** Every build session reads this first. It holds every decision and its reason so nothing gets re-derived or re-argued.

---

## 1. Goal

An AI scorer for PSIA Alpine Trainer Movement Analysis sessions accurate enough that Chris and Mark trust it without validating every score. Measured as per-criterion agreement rate between AI scores and Chris's blind scores. Target: ≥85% within-one, ≥60% exact, sustained across a season.

Secondary: stop rebuilding. Adding knowledge (docs, Chris's reasoning, scored examples) must never require touching a prompt or hitting a context limit.

## 2. What exists today (kept)

- **React app** `ATDevelopmentJournal.jsx` (~5,000 lines, single file). 12 tabs. Users: mark (candidate), chris/gates/mike (mentors).
- **Vercel serverless:** `/api/claude` → Anthropic API; `/api/sheet` → Google Apps Script → Google Sheet.
- **Google Sheet, 3 tabs:** Journal, Config, MASessions. Per-row storage for sessions, checkpoints, videos, clinics. Config holds `_THEMES`, `_COACH_NOTES`, `_MENTOR_ASSESSMENTS`, `_REFERENCE_MATERIALS`, `_MENTOR_PROFILES`.
- **Six criteria** scored 1–6 (Fitts & Posner; 4 = pass): Describe, Cause/Effect, Evaluate, Prescription, Bio/Physics, Communication.
- **MA session types:** AT Exam (two-audience: peer + examiner, structured sections), Written MA, Scenario, Reverse MA, Compare & Contrast, Video Analysis. Non-exam types are single-audience (examiner only).
- **Reference material** ~45K chars from PSIA-RM Assessment Guide 25-26 and Alpine Trainer Program Guide, plus a hand-built Physics/Biomechanics section (~8.5K).
- **Chris's inputs:** Development Assessment (Progress tab — ground truth), per-session comments (MA History thread), Coaching Notes (Themes tab — steers the sparring AI), Checkpoints (periodic review).
- **Scorer output shape** the UI already parses: `scores.{describe,cause_effect,evaluate,prescription,biomechanics,communication}`, `score_rationale.{...}`, `did_well[]`, `opportunity[]`, `key_learning`. **Preserve this shape.** Add fields; don't remove.

The Google Sheet stays as operational data. Chris can read it, it works, and the UI depends on it.

## 3. Why the revamp

The scorer carries all knowledge inside one prompt (~25K chars) and is asked to do everything at once: be a biomechanics expert, apply Fitts & Posner nuance, apply Chris's calibration, score six criteria, write rationale, avoid four named errors, check top-down, verify with Bloom's, handle six MA types. Every instruction competes for attention. Accuracy issues (systematic anchoring at 3 when the rationale describes 4-level work) have been patched with more instruction text, which is lossy and drifts.

Root cause: knowledge lives in the prompt, and the model scores while reading rather than after seeing the whole picture. Chris's corrections — the actual training signal — are being spent as prompt edits instead of stored as examples.

Zoom call transcripts from Chris (~50–60K chars each, ~20/season) make the in-prompt approach impossible regardless.

## 4. Architecture

```
OPERATIONAL DATA          Google Sheet (unchanged)
                          sessions · journal · config · profiles
                                    │
KNOWLEDGE STORE           Supabase Postgres + pgvector
                          uniform chunks: text · source · tags · embedding
                                    │
INGESTION                 one pipeline per source → same chunk schema
                          PSIA docs · Zoom transcripts · Chris comments ·
                          Chris blind scores · curated web · assessments
                                    │
CONTEXT ASSEMBLER         Vercel function, fixed token budget,
                          reserved slots, Chris-privileged ranking
                                    │
REASONING                 Step 1 Extract (Sonnet) → Step 2 Evaluate (Opus)
                          per-criterion, justification-per-level, cited
                                    │
FEEDBACK LOOP             Chris scores blind → stored as exemplar chunk
                          agreement rate tracked per criterion
```

Named pattern: **RAG-grounded LLM-as-a-judge with expert-in-the-loop calibration.** Hybrid search (tags + vectors), query transformation (extraction as query), citation, supersession, active-learning feedback.

## 5. Knowledge store

### 5.1 Chunk schema

```sql
create table chunks (
  id            uuid primary key default gen_random_uuid(),
  text          text not null,
  source        text not null,      -- see 5.2
  source_ref    text,               -- doc section / zoom date / session id
  criteria      text[] not null default '{}',   -- see 5.3
  skills        text[] not null default '{}',   -- see 5.4
  type          text not null,      -- see 5.5
  author        text,               -- 'chris' | 'gates' | 'mike' | 'psia' | 'mark' | null
  date          date,
  approved      boolean not null default false,
  superseded_by uuid references chunks(id),
  metadata      jsonb default '{}',
  embedding     vector(1024),       -- dimension set by embedding model, see 11
  created_at    timestamptz default now()
);
create index on chunks using ivfflat (embedding vector_cosine_ops);
create index on chunks (source, approved) where superseded_by is null;
```

### 5.2 Sources

| source | What | approved default |
|---|---|---|
| `psia_doc` | Assessment Guide, AT Program Guide, curated physics | true |
| `chris_zoom` | Extracted calibration statements from call transcripts | **false** — Chris approves |
| `chris_comment` | Per-session feedback from MA History thread | true |
| `chris_score` | Blind score + note + linked session transcript | true |
| `mentor_assessment` | Development Assessment snapshots | true |
| `web` | Curated research Mark chooses to ingest, with URL | true |
| `past_session` | Scored session extractions, as retrieval exemplars | true |

Gates and Mike use the same sources with `author` set accordingly. Chris is privileged in ranking (see 7.3); others are treated as reference.

### 5.3 Criteria tags

`describe` · `cause_effect` · `evaluate` · `prescription` · `biomechanics` · `communication` · `general`

### 5.4 Skill tags

`edging` · `pressure` · `rotary` · `balance_fore_aft` · `balance_lateral` · `ski_to_ski` · `upper_lower_separation` · `turn_shape` · `turn_phase` · `dirt` · `conditions` · `tactics` · `equipment` · `intent_verification` · `peer_dialog` · `idp_task` · `physics_sidecut` · `physics_forces` · `physics_camber` · `fitts_posner` · `l3_vs_at`

Tag generously at ingest. Tags are a pre-filter, not the ranking.

### 5.5 Types

`definition` (what a criterion or concept is) · `principle` (how Chris thinks about scoring) · `correction` (Chris disagreeing with a score, with reason) · `exemplar` (a scored session + score + reason) · `physics` (mechanism explanation) · `mental_model` (pendulum, three-joint, etc.) · `idp_task` (task description with ski/body performance)

### 5.6 Supersession

Chris's views evolve. A chunk marked `superseded_by` is excluded from retrieval. Rules:

- Approval view for Zoom chunks asks: "Does this replace an earlier statement?" and shows candidates (same criteria/skills, same author, older). Chris links or skips.
- Saving a new Development Assessment supersedes the prior `mentor_assessment` chunk automatically.
- A `correction` never supersedes a `principle` — it refines. Both retrievable.
- When two approved, non-superseded Chris chunks conflict at retrieval time, the assembler keeps the more recent and logs the pair for Chris to resolve.

## 6. Ingestion pipelines

All pipelines emit chunks in the 5.1 schema, embed, and insert. Nothing else differs downstream.

### 6.1 PSIA documents (one-time, then on update)

Chunk by natural unit, not by token count:
- Scorecards → one chunk per criterion per level (tag criteria + `definition`)
- L3 vs AT comparison → **paired rows kept together**; never split L3 from its AT counterpart (tag `l3_vs_at` + the relevant criterion)
- Fundamentals & Skills Concept → one chunk per fundamental, one per blend explanation
- IDP tasks → one chunk per task including ski performance and body performance (tag `idp_task` + skills)
- Physics section → one chunk per concept, with 1–2 sentence overlap where a concept depends on the previous one
- Assessment flow, professionalism, program overview → **do not ingest for scoring.** Keep in the Resources tab for reading, not in the store.

Exclude clinic scorecards, module LEs, L3 teaching/skiing scorecards from the store.

Model: Sonnet for chunk-boundary decisions; embedding model per §11.

### 6.2 Zoom transcripts (per call)

Input: transcript text. Output: pending chunks for Chris's approval.

Extraction prompt (Opus) pulls discrete calibration statements. For each:
- `text`: the statement, lightly cleaned, in Chris's words
- `criteria`, `skills`: tagged
- `type`: principle / correction / mental_model / physics / exemplar
- `metadata.context`: 1–2 sentences of surrounding conversation so Chris can judge whether it was a firm view or thinking-out-loud
- `metadata.timestamp`: position in transcript

Extraction rules:
- Pull only statements Chris makes about scoring, what he listens for, why something is a level, mental models, corrections of Mark. Not Mark's statements. Not logistics.
- Do not merge two statements into one chunk. Do not generalize beyond what was said.
- Flag statements phrased as hypotheticals or questions — Chris decides.
- Target: 20–60 chunks per hour-long call.

Approval view (new, mentor-only, in Checkpoints or its own tab): pending chunks listed with context, buttons Approve / Edit / Delete / "Replaces earlier →". Approved chunks embed and enter the store. Nothing unapproved is ever retrieved.

### 6.3 Chris comments (continuous)

Every new comment in an MA History thread becomes a `chris_comment` chunk, criteria inferred from text, linked by `source_ref` to the session. Approved by default — he wrote it deliberately.

### 6.4 Chris blind scores (continuous — the feedback loop)

See §9. Each submission creates one `chris_score` chunk per criterion where a note exists, plus one `exemplar` chunk containing: session extraction (§8.1) + Chris's six scores + his note. Exemplars are what make the scorer sound like Chris.

### 6.5 Development Assessment (on save)

Snapshot as `mentor_assessment` chunk; supersede prior.

### 6.6 Curated web (manual)

Mark pastes text + URL. Chunk by paragraph, tag, `source_ref` = URL. Not live search — live search is non-repeatable and would make the same session score differently on different days.

### 6.7 Past sessions (batch, then continuous)

Every scored session's Step 1 extraction becomes a `past_session` chunk with the AI scores in metadata. Once Chris has blind-scored it, the `exemplar` (6.4) supersedes it for retrieval — Chris's score is truth, AI's is not.

## 7. Context assembler

Vercel function. Input: task type + session extraction. Output: assembled prompt.

### 7.1 Budget

Total ~30K tokens for the evaluate step. Fixed. Never grows.

| Slot | Reserved | Fill rule |
|---|---|---|
| Criterion definitions | ~2K | Always. All six criteria, all levels. From `psia_doc` + `definition`. |
| Chris chunks | up to ~8K | Top-k by similarity to session extraction, `author = chris`, approved, not superseded. Minimum 5, maximum ~25. |
| Exemplars | ~6K | 2–3 `exemplar` chunks most similar to this session. Prefer same MA type. |
| PSIA reference | remaining (~8–10K) | Top-k `psia_doc` chunks by similarity, filtered by skills present in extraction. |
| Session extraction | ~4K | The Step 1 output. Always. |
| Reasoning template | ~2K | Static. See §8.2. |

If Chris chunks under-fill, PSIA reference takes the slack. If over budget, trim PSIA reference first, exemplars second, never Chris chunks or definitions.

### 7.2 Query

The **Step 1 extraction** is embedded as the retrieval query, not the raw transcript. Extraction is normalized (skills named, physics concepts explicit, phases located) so it retrieves on substance. Raw transcripts retrieve on conversational noise.

### 7.3 Ranking policy

1. Hard filters: `approved = true`, `superseded_by is null`, skills overlap with extraction (for psia_doc; Chris chunks skip skill filter — his general principles should surface).
2. Cosine similarity rank within each slot.
3. Chris slot filled before PSIA slot. This is the architectural guarantee that Chris is ground truth.
4. Recency tiebreak within Chris slot.

### 7.4 Citation

Every retrieved chunk carries its `id` into the prompt as `[c:<short-id>]`. The evaluate step must cite which chunks informed each criterion's score. See §8.3.

## 8. Reasoning — two steps

### 8.1 Step 1 — Extract (Sonnet)

Input: session transcript (structured sections if present), MA type, context (who/activity/conditions).
Output: JSON inventory. **No scoring, no judgment.**

```json
{
  "ma_type": "at_exam | written | scenario | reverse | compare | video",
  "observations": [{ "phase": "...", "ski_performance": "...", "body_performance": "...", "dirt": "..." }],
  "skills_referenced": ["edging", ...],
  "physics_concepts": [{ "concept": "...", "explicit_or_implied": "...", "quote": "..." }],
  "cause_effect_chain": ["A → B → C ..."],
  "primary_fundamental_named": "... | null",
  "intent_verification": { "asked": true, "questions": ["..."], "peer_answers": ["..."] },
  "conditions_considered": "... | null",
  "prescription": { "task": "...", "rationale_to_examiner": "...", "delivery_to_peer": "...", "peer_restated": "quote | null" },
  "examiner_probes": [{ "question": "...", "mark_answer": "...", "deepened": true }],
  "unprompted_vs_prompted": { "unprompted": ["..."], "prompted_creation": ["..."], "prompted_refinement": ["..."] },
  "verbatim_key_phrases": ["..."]
}
```

Why a separate step: when the model reads and scores simultaneously it pattern-matches criteria as it reads and lands on "didn't check every box." Inventorying everything demonstrated *before* judging forces whole-picture evaluation. This enforces "evidence descriptors, not checklists" by structure rather than instruction.

### 8.2 Step 2 — Evaluate (Opus)

Input: assembled context (§7) — extraction, definitions, Chris chunks, exemplars, PSIA reference, template.

Per criterion, the template requires **justification-per-level before the score**:

```
For each criterion:
  "Case for 5": what an examiner would say to defend a 5 for THIS work
  "Case for 4": ... 
  "Case for 3": ...
  Then: which case holds, and why the others don't.
  Cite chunks: [c:...] for the Chris statements / definitions / exemplars that informed this.
```

Building the case at each level for the specific session — rather than checking criteria and assigning a number — is the reasoning structure that prevents anchoring. It comes from Mark's justification-engine spec; kept per-criterion so Chris validates at the level he gives feedback.

Standing calibration rules carried into the template (from the current scorer; prune as exemplars accumulate — see §13):
- Criteria are evidence descriptors, not checklists. Depth of work determines level, not whether every term appears.
- Opportunities describe where to focus next; they never lower the current score.
- Prompted refinement (Mark showed it, examiner deepened it) is additive. Prompted creation (examiner had to surface it) caps at 4.
- Locate gaps on the scale: a 4→5 gap does not make a 3.
- Fitts & Posner as Chris thinks: does it appear? is it consistent? 4 = appears regularly.
- Implied physics through accurate mechanism description counts as demonstrated.
- Communication is type-aware: two audiences for AT Exam; examiner-only for all other types — never penalize missing peer delivery where none exists.
- Concise, precise, expert-to-expert delivery is higher than verbose coverage. Phase-by-phase is one way to be clear, not a requirement.
- Metacognition need not be stated; the behavior is the evidence.
- Cognitive-level check: Apply ≈ 3, Analyze ≈ 4, Evaluate/Create ≈ 5. If the cognitive level contradicts the score, the cognitive level wins.

### 8.3 Output (backward compatible)

```json
{
  "scores": { "describe": 4, "cause_effect": 4, ... },
  "score_rationale": { "describe": "...", ... },
  "justifications": { "describe": { "5": "...", "4": "...", "3": "..." }, ... },
  "citations": { "describe": ["c:a1b2", "c:c3d4"], ... },
  "did_well": ["..."],
  "opportunity": ["..."],
  "key_learning": "...",
  "gap_to_next": { "describe": "Instead of X, say Y because Z", ... },
  "time_note": "..."
}
```

`scores`, `score_rationale`, `did_well`, `opportunity`, `key_learning` — existing fields, unchanged shape. `justifications`, `citations`, `gap_to_next`, `time_note` — new. Existing `parseSummary` keeps working.

## 9. Feedback loop — Chris scores blind

**The AI score is hidden until Chris submits.** He currently sees the AI number first and reacts — that's anchoring, and it means "no objection" can't be distinguished from "agrees."

Blind form (MA History, mentor view, replaces the "AI analysis" reveal): transcript visible; six 1–6 tap rows; one optional note field; Submit. On submit: AI score revealed alongside, per-criterion delta shown, both stored.

Stored as: `chris_score` chunks (per criterion with a note) + one `exemplar` chunk (§6.4). Progress tab gains an **Agreement** panel: per-criterion exact-match %, within-one %, trend over last 20 sessions.

Agreement rate is the system's truth. It decides when to prune calibration rules (§13), when to escalate the evaluate model (§11), and whether fine-tuning is ever warranted (§13).

Chris still has the free-text comment thread for coaching feedback to Mark. The blind form is for scores.

## 10. Module layout

New code is new files. **The old JSX is read only to harvest bug fixes when rebuilding a tab.** Never extend it.

```
/src/                       NEW frontend, one component per tab
  App.jsx                   shell, login, tab nav
  api.js                    fetch wrappers for /api/*
  components/               Card, SectionLabel, MicButton, SpeakButton, etc.
  tabs/
    Sparring.jsx            + ATExam.jsx, WrittenMA.jsx as sub-components
    MAHistory.jsx           + BlindScoreForm.jsx, Rationale.jsx
    Journal.jsx
    Progress.jsx            + AgreementPanel.jsx, ChunkApproval.jsx
    Themes.jsx  Checkpoints.jsx  Videos.jsx  Growth.jsx
    Timeline.jsx  Clinics.jsx  Resources.jsx  Profile.jsx
  lib/
    parseSummary.js         harvested from old app, with all retry logic
    prompts.js              sparring/coach system prompts (moved from JSX)

/api/claude.js              existing — sparring/chat calls, unchanged
/api/sheet.js               existing — unchanged
/api/score.js               NEW — orchestrates extract → assemble → evaluate; returns §8.3
/api/ingest/psia.js         NEW — accepts doc text + section type, chunks, embeds, inserts
/api/ingest/zoom.js         NEW — accepts transcript, runs extraction, inserts pending chunks
/api/ingest/comment.js      NEW — called on new MA comment, inserts chris_comment chunk
/api/ingest/score.js        NEW — called on blind-score submit, inserts chris_score + exemplar
/api/chunks/pending.js      NEW — list pending chunks for approval view
/api/chunks/approve.js      NEW — approve / edit / delete / supersede
/api/chunks/search.js       NEW — debug endpoint: query → retrieved chunks (retrieval eval)
/lib/store.js               NEW — Supabase client, chunk CRUD, similarity search
/lib/embed.js               NEW — embedding client, single model, single dimension
/lib/assembler.js           NEW — §7
/lib/prompts/extract.js     NEW — §8.1 template
/lib/prompts/evaluate.js    NEW — §8.2 template
/lib/prompts/zoom.js        NEW — §6.2 extraction template
/scripts/bootstrap.mjs      NEW — one-time: pull Sheet data via /api/sheet, ingest all sources (§13 session 1)
/scripts/retrieval-eval.mjs NEW — §14
```

Environment: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `EMBEDDING_API_KEY`, existing `ANTHROPIC_API_KEY`, `APPS_SCRIPT_URL`.

## 11. Model assignments

| Task | Model | Reason |
|---|---|---|
| Design, architecture, build, fresh-context review | Fable 5.1 | Judgment-heavy, low volume |
| Step 2 Evaluate | Opus | Nuanced expert judgment; volume is a few/week so cost is negligible. Escalate to Fable if agreement rate stalls below target after exemplars accumulate. |
| Zoom extraction | Opus | Judgment about what counts as a calibration statement |
| Step 1 Extract | Sonnet | Well-defined inventory task |
| PSIA chunk boundaries | Sonnet | Mechanical with light judgment |
| Embeddings | One model, chosen at build, **never switched** (switching means re-embedding the entire store). Voyage `voyage-3` or OpenAI `text-embedding-3-small`. Set `vector(N)` in §5.1 to match. |

Opus reviewing Fable's work is not part of the plan — the less capable model checking the more capable one's architecture doesn't help. Review is Fable in a fresh session against this doc.

## 12. Frontend — new app, same interface, same data

The 5,000-line `ATDevelopmentJournal.jsx` is not extended. A new Vite + React app is built one tab at a time, one component per tab, same visual design, hitting the same `/api/*` endpoints and the same Google Sheet. Both apps work against live data; nothing is migrated. Chris stays on the old URL until the new app has every tab he uses (after session 8), then the old app is retired.

Before each tab is rebuilt, Mark lists what bothers him about the current one. Those get fixed. The builder reads the old tab's code once to harvest bug fixes (parseSummary retries, column-mapping guards, sort tiebreakers, localStorage persistence, per-row storage, hash-diff saves), not to copy structure.

New UI that didn't exist before, built into the new tabs where they belong:

1. **Blind scoring form** — MA History, mentor view. Six 1–6 tap rows + note + Submit; AI score revealed after. Candidate view unchanged.
2. **Citations in rationale** — per criterion, cited Chris statements rendered inline ("Chris, Sep 3: '…'"). PSIA/definition citations collapsed by default.
3. **Zoom chunk approval view** — Progress tab, mentor-only. Pending list with context; Approve / Edit / Delete / Replaces-earlier.
4. **Agreement panel** — Progress tab. Per-criterion exact %, within-one %, 20-session trend.
5. **Rescore** → `/api/score`.

Known constraint: localStorage doesn't cross origins. In-progress exam state on the old URL won't appear on the new one.

## 13. Build order

One project, one sequence. Backend and frontend alternate so each session is one kind of work.

| Session | Type | Builds | Done when |
|---|---|---|---|
| **1** | Backend | Supabase project, §5.1 schema, `/lib/store.js`, `/lib/embed.js` (embedding model chosen and locked), `/scripts/bootstrap.mjs` — pulls from the Sheet via existing `/api/sheet` and ingests: `_REFERENCE_MATERIALS` → `psia_doc` (§6.1), `_MENTOR_ASSESSMENTS` → `mentor_assessment`, `mentorFeedback` + `mentorComments` → `chris_comment`, scored MASessions → `past_session` (runs Step 1 extraction on each); `/api/chunks/search.js` | Search returns sensible PSIA chunks for a test query about edging; a Chris comment and a past session appear for a query about the Ben MA. No manual export from the Sheet. |
| **2** | Backend | `/lib/prompts/zoom.js`, `/api/ingest/zoom.js`, `/api/chunks/pending.js`, `/api/chunks/approve.js` | First real transcript in → pending chunks listed via endpoint with context and tags |
| **3** | Frontend | New Vite + React app shell, login, tab nav, shared styles; **Sparring / AT Exam tab** with all 7 phases, speech (mic + speaker), localStorage persistence, save-to-MA-History | Mark runs a full AT Exam in the new app; session appears in the Sheet |
| **4** | Backend | `/lib/prompts/extract.js`, `/lib/prompts/evaluate.js`, `/lib/assembler.js`, `/api/score.js` | Rescoring the Ben and Chuck sessions produces cited, per-criterion output in the §8.3 shape; scores are within-one of Mark's hand assessment |
| **5** | Frontend | **MA History tab** — session list, transcript with speaker colors, scores, rationale with citations (§12.2), comment thread, **blind scoring form** (§12.1), Rescore → `/api/score`, delete | Chris scores one session blind in the new app; AI score reveals after; delta shows |
| **6** | Backend | `/api/ingest/score.js` (blind scores → `chris_score` + `exemplar`), `/api/ingest/comment.js`, agreement calculation, exemplar retrieval wired into assembler | Chris's three blind scores are retrievable as exemplars; a rescore cites one |
| **7** | Frontend | **Journal tab** — six entry types, adaptive prompts, connection tags, theme tags, mentor depth assessment (change/deselect), comments, Challenge Me | Mark creates one entry of each type; Chris assesses depth; notification email fires |
| **8** | Frontend | **Progress tab** — mentor assessments, AI analysis, **Agreement panel** (§12.4), **Zoom approval view** (§12.3) | Chris approves chunks from session 2's transcript; agreement panel shows session 6 data. **Chris switches to the new app after this session.** |
| **9** | Frontend | **Themes** (add/edit/delete/depth), **Checkpoints** (pre-populate, coaching notes sync), **Videos** | Feature parity with old app for all three |
| **10** | Frontend | **Growth**, **Timeline**, **Clinics**, **Resources**, **Profile** | Feature parity; old app retired |
| **11** | Feature | **Examiner Sparring** mode (strict examiner character, one probe at a time, 3–4 exchanges, "OK, thank you" ending) + **dual-examiner Debrief** | Mark runs a sparring session and receives the debrief; saved to MA History |
| **12** | Review | Fresh-session review of all code against this doc; retrieval eval (§14); prune §8.2 calibration rules that exemplars now cover; retire old `buildScorerPrompt` fallback | Review notes appended to §16 |

Sessions 1–2 capture Chris's reasoning before any scoring changes. Session 4 is where accuracy moves. Session 5 closes the feedback loop. Session 8 is when Chris moves over.

Each session ends by appending a dated line to §16: built / decided / deferred.

**Parallel, starting now:** Chris records calls; transcripts accumulate for session 2.

## 14. Retrieval evaluation

Scoring accuracy says whether the whole system works. It doesn't say *why* it fails. Separate check:

- Hand-label ten sessions: for each, the 5–10 chunks Chris would want the scorer to see.
- `/scripts/retrieval-eval.mjs` runs assembly for each, reports recall@k against the labels.
- Run after any change to embedding, tagging, or ranking policy.

When agreement drops, retrieval eval tells you whether the assembler pulled the wrong chunks or the model misused the right ones.

## 15. Decisions log

Recorded so they aren't re-argued.

| Decision | Reason |
|---|---|
| Keep Google Sheet as operational store | Works; Chris reads it; UI depends on it. Only the knowledge layer moves. |
| Supabase pgvector for knowledge | Sheet has no vector search and we've already hit cell limits. Postgres, free tier, Vercel-friendly. |
| No vector store before Zoom transcripts | Everything fit in context. Transcripts (~1M chars/season) break that. |
| Two-step scoring | Enforces evidence-before-judgment architecturally; instruction alone didn't stop 3-anchoring. |
| Per-criterion output, not one holistic score | Chris validates at the criterion level; that's the calibration data. |
| Justification-per-level inside each criterion | Building the case for each level prevents anchoring at 3 and looking up. |
| Chris's chunks privileged in ranking | He is ground truth. Encoded as architecture, not instruction. |
| Blind scoring | Seeing the AI score first anchors. "No objection" ≠ "agrees." |
| Extraction as retrieval query | Normalized; retrieves on substance not conversational noise. |
| Fixed budget, never grows | New data competes for budget instead of breaking context. |
| No live web search in scoring | Non-repeatable; same session would score differently by day. Curate and ingest instead. |
| Zoom chunks require Chris approval | Extraction over-generalizes and misattributes; Chris is the only one who knows what he meant. |
| Opus for evaluate, not Fable | Cost at low volume is negligible either way; start with Opus, escalate on evidence. |
| Fable builds, Fable reviews (fresh session) | Value of review is context reset, not model swap. Opus reviewing Fable is inverted. |
| No fine-tuning now | Zero labeled data. Revisit at 50+ blind scores (§13 session 6 onward). |
| Preserve existing output shape | `parseSummary` and the UI depend on it. Add fields, never remove. |
| New code in new files | The 5,000-line JSX is where tokens go. Don't extend it. |
| New frontend, same interface, same data, tab by tab | Monolith is unmaintainable; shared Sheet means no migration and each tab is live on deploy. Chris switches after session 8. |
| Backend/frontend sessions alternate | Each session is one kind of work; review is easier; the scoring loop is live by session 6 without waiting for all tabs. |

## 16. Session log

*(append one line per build session: date · session # · built · decided · deferred)*

- **2026-09-10 · Session 1 (backend)** · Built: `supabase/schema.sql` (§5.1 + `match_chunks` RPC with §7.3 hard filters, `text_hash` unique index for idempotent ingest), `scripts/migrate.mjs`, `lib/embed.js` (Voyage `voyage-3`, 1024-d, locked), `lib/store.js`, `lib/llm.js`, `lib/parseSummary.js` (harvested from old JSX), `lib/sheet.js` (harvested column guards incl. `b`-for-`id` header), `lib/prompts/extract.js` (§8.1), `lib/ingest/psia.js` (§6.1 chunker), `scripts/bootstrap.mjs`, `scripts/search.mjs`, `api/chunks/search.js`; `reference/` with five source files. · Decided: (a) reference material is ingested from `/reference/*.md` checked into the repo, not from `Config._REFERENCE_MATERIALS` — that Sheet row is empty and the ~47K of PSIA text was a hardcoded default in the JSX; (b) `extract.js` built in session 1 (spec said session 4) because `past_session` ingestion needs it; session 4 refines; (c) original PDFs replace the summarized IDP section (excluded from `psia.md`; full IDP = 44 task chunks, one per activity); (d) Performance Guide L1–3 criteria ingested with `l3_vs_at` on L3 chunks as the baseline AT is compared against; (e) `private_notes`/`root_cause` exam sections fed to Step 1 as observation-only, never as communication. · Deferred: AT MA/TU Assessment Form (see §17); session's done-when verified by Mark running migrate → bootstrap → search (sandbox lacked network/keys).

## 17. Deferred / open

- **AT MA/TU Assessment Form not ingested.** The Assessment Guide export in project knowledge is a text dump; the six-criterion form was an image and is absent. Criterion `definition` chunks currently come from the summarized "AT MA/TECHNICAL UNDERSTANDING SCORECARD" section of `psia.md`. When Mark (or Chris) supplies the form: add `reference/at-ma-assessment-form.md`, run `bootstrap --only psia`, mark the old scorecard chunks `superseded_by` the new ones. Session 4's assembler should treat the definitions slot as provisional until then.
- **MASessions header cell A1 reads `b` instead of `id`** in the live Sheet export. `lib/sheet.js` guards for it; fix the header in the Sheet when convenient.
- **`extract.js` and `evaluate.js` vocabulary alignment** — session 4 must reuse the skill tags and phase names from `extract.js` verbatim in the evaluate template.
- **ivfflat index built on an empty table** (`lists = 50`). If recall looks off after bootstrap, `reindex index chunks_embedding_idx`.
- Fine-tuning: revisit with 50+ blind scores if agreement plateaus below target.
- Retiring in-prompt reference material from the old `buildScorerPrompt`: after session 3 proves retrieval; keep old path as fallback until then.
- Progress tab trend analysis redesign to use exemplars and agreement data.
- Gates and Mike as blind scorers: same form, `author` tag differs; inter-rater data between mentors is a bonus.
- Whether `general` criterion chunks from Chris (principles that apply to all criteria) need their own slot in the assembler or ride in the Chris slot. Decide in session 3.

## Appendix A — Glossary for the builder

- **MA** — Movement Analysis. Observe a skier, describe, diagnose cause, prescribe a change, explain why.
- **AT** — Alpine Trainer. PSIA certification above Level 3. AT candidates train instructors, not public.
- **Fitts & Posner scale** (as used in PSIA-RM): 1 not observed · 2 beginning to appear · 3 appears inconsistently · 4 appears regularly (pass) · 5 frequently, above required · 6 continuously, superior.
- **Fundamentals** — pressure, edging, rotary, plus balance/fore-aft. Skills Concept is their blend.
- **DIRT** — duration, intensity, rate, timing of a movement.
- **IDP** — Instructor Development Pathway tasks (e.g., White Pass turn, outside-ski turn, railroad tracks). Each has defined ski and body performance.
- **Two-audience** — in the AT MA Exam, the candidate delivers to a peer (what/how, their language) and separately to the examiner (technical why). Explaining physics to the peer is coaching, not MA.
- **Prompted vs unprompted** — whether the candidate showed a concept in the presentation or only after examiner probing. Refinement under probing is additive; creation under probing caps at 4.
- **Sidecut → reverse camber → groove → steering** — the physics chain Chris keeps pushing Mark to complete unprompted.
