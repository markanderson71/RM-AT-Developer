# AT Development Journal — Scoring System Architecture

**Status:** Building — sessions 1–4 done (37 Chris statements from the 9/18 call pending his approval); next is 5
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

**Scored criteria (2026 AT MA/TU Assessment Form, confirmed by Chris 2026-09-17):**
MA section — `cause_effect` · `evaluate` · `prescription` · TU section — `desired_performances` · `biomechanics` · `equipment`.
Pass rule: MA section average ≥ 4 **and** TU section average ≥ 4.

**Tag-only (not scored, still useful for retrieval):** `describe` · `communication` · `general`.
Describe and Communication were scored lines on the pre-2026 form; the current form folds them into Cause and Effect / Prescription. Chunks keep the tags so the store can still retrieve on them.

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

Implementation notes (session 2): pending chunks are stored **without an embedding**; the embedding is written in the same update that sets `approved = true`, and `match_chunks` requires a non-null embedding — an unapproved chunk is unretrievable twice over. Speaker labels are a prior only: the extractor attributes by content, and any chunk whose cited turns are not labelled as the mentor carries `metadata.attribution.check` for the approver. Every chunk carries a verbatim `quote`; chunks whose quote is not in the transcript, or whose cleaned text drifts from the cited turns, are rejected in code before they reach Chris. Text the mentor reads aloud (Mark's notes, the form, app output) is not his statement. Remarks about the app / AI peer / AI scores are returned as `tool_feedback` and **not stored** — they are bug reports, and a stored "the AI scores high" would go stale and bias every later score. Approved chunks are immutable (supersede, don't edit); only the author approves or edits; re-ingesting a call replaces its pending chunks and never touches approved ones. Extraction is not repeatable even at temperature 0 (one run found the 10:16 gear correction, the next dropped it), so each window is read **twice and the passes unioned**; a dry run is a preview, never a record of what will be stored — verify against `/api/chunks/pending`. Score items are checked in code: every form line named must be audible in the cited turns (the extractor once produced a "Describe 2" Chris never gave). `sessions: [{from,to,id}]` stamps `metadata.session_id` so §7.3.5 self-exclusion covers spoken feedback too; `exclude: [{from,to}]` drops off-topic stretches deterministically.

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
| Reasoning template | ~3K | Static. See §8.2. (2K → 3K in session 4 for unit definitions; total unchanged, PSIA absorbs it.) |

If Chris chunks under-fill, PSIA reference takes the slack **up to a 12K cap** (session 4: with 9 Chris chunks and no exemplars, uncapped slack would hand PSIA ~20K of marginal matches). If over budget, trim PSIA reference first, exemplars second, never Chris chunks or definitions.

Definitions are *fetched* by `source_ref` prefix (`at-ma-tu-assessment-form-2026.md#`), not searched. Exemplar slot takes **Chris-scored exemplars only** (`source = chris_score`); `past_session` chunks carry old-scorer numbers and are never shown to the evaluator as examples.

### 7.2 Query

The **Step 1 extraction** is embedded as the retrieval query, not the raw transcript. Extraction is normalized (skills named, physics concepts explicit, phases located) so it retrieves on substance. Raw transcripts retrieve on conversational noise.

### 7.3 Ranking policy

1. Hard filters: `approved = true`, `superseded_by is null`, skills overlap with extraction (for psia_doc; Chris chunks skip skill filter — his general principles should surface).
2. Cosine similarity rank within each slot.
3. Chris slot filled before PSIA slot. This is the architectural guarantee that Chris is ground truth.
4. Recency tiebreak within Chris slot.
5. **Self-exclusion:** chunks whose `source_ref` is `session:<id>` of the session being scored are dropped. Chris's comment on a session must not inform that session's AI score, or agreement (§9) measures retrieval instead of judgment. `includeSelf` exists for A/B debugging only.

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

Floor rules (added session 4 — the rules above all guard against scoring low; Chris's first scorecard showed the old scorer 1–2 points **high** on every line). If the case for 3 fails, the template requires a case for 2 and for 1.
- Naming is not connecting: fundamentals mentioned without a stated link to ski performance and an outcome are not cause-and-effect evidence.
- A line not addressed scores 1. `equipment.addressed = false` ⇒ Equipment 1 (also enforced in code, logged in `quality.guards_applied`).
- "Beginning to appear" is a 2, not a 3. Accurate-but-generic is L3 work. Volume is not depth.
- Score against the essential elements each form definition names, not general competence.

Chris's own content (X→Y→Z frame, peer piece as coaching cue "plus", the equipment trio, the prescription chain) is **not** in the template. It lives in the store as seven single-point chunks and arrives by retrieval, cited.

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

`justifications` carries `"2"` and `"1"` keys when the case for 3 fails. Also additive (session 4): `section_averages`, `meets_standards`, `citation_details` (author/date/text per cited chunk, for §12.2), `chris_conflicts`, `quality{citations_invalid, criteria_without_citation, guards_applied}`, `extraction`, `meta{scorer, models, ms, context manifest}`.

`scores`, `score_rationale`, `did_well`, `opportunity`, `key_learning` — existing fields, unchanged shape. `justifications`, `citations`, `gap_to_next`, `time_note` — new. Existing `parseSummary` keeps working.

**Criteria in `scores` (decided 2026-09-17):** the six from the 2026 form — `cause_effect, evaluate, prescription, desired_performances, biomechanics, equipment` — plus `section_averages: { ma, tu }` and `meets_standards: boolean`. The legacy keys `describe` and `communication` remain in `scores` for history and for `parseSummary`'s `hasFullScores` check (the evaluator still emits them, as diagnostic tags rather than exam lines; UI decides whether to show them). Additive: nothing removed.

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
/api/score.js               NEW — one-shot extract → assemble → evaluate (CLI/scripts)
/api/score/extract.js       NEW — Step 1 only; the app calls this, then evaluate (each call well under the 300s limit)
/api/score/evaluate.js      NEW — assemble + Step 2, takes the extraction
/lib/http.js                NEW — shared handler helpers; returns §8.3
/api/ingest/psia.js         NEW — accepts doc text + section type, chunks, embeds, inserts
/api/ingest/zoom.js         NEW — accepts transcript (+ speakerMap; without one returns a speaker report only), runs extraction, inserts pending chunks
/lib/ingest/zoom.js         NEW — parse → windows → Opus → quote/drift guards → pending; shared by the endpoint and the CLI
/api/ingest/comment.js      NEW — called on new MA comment, inserts chris_comment chunk
/api/ingest/score.js        NEW — called on blind-score submit, inserts chris_score + exemplar
/api/chunks/pending.js      NEW — list pending chunks for approval view
/api/chunks/approve.js      NEW — approve / edit / delete / supersede
/api/chunks/search.js       NEW — debug endpoint: query → retrieved chunks (retrieval eval)
/lib/store.js               NEW — Supabase client, chunk CRUD, similarity search
/lib/embed.js               NEW — embedding client, single model, single dimension
/lib/vocab.js               NEW — criteria, skills, phases, outcomes; one source for store, extract, evaluate
/lib/score.js               NEW — extract → assemble → evaluate → normalize; shared by /api/score and the CLI
/lib/assembler.js           NEW — §7
/lib/prompts/extract.js     NEW — §8.1 template
/lib/prompts/evaluate.js    NEW — §8.2 template
/lib/prompts/zoom.js        NEW — §6.2 extraction template
/scripts/bootstrap.mjs      NEW — one-time: pull Sheet data via /api/sheet, ingest all sources (§13 session 1)
/scripts/zoom.mjs           NEW — CLI for the /api/ingest/zoom path; `--dry`, `--replace`, `--pending`
/scripts/score.mjs          NEW — CLI for the /api/score path; `--compare` checks within-one against a scorecard
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
| **4** | Backend | `/lib/prompts/extract.js`, `/lib/prompts/evaluate.js`, `/lib/assembler.js`, `/api/score.js` | Rescoring the Ben (`bzfutxv`) and Chuck (`q5omsst`) sessions produces cited, per-criterion output in the §8.3 shape on the six 2026 criteria; **rescoring `7n6ry6d` with self-exclusion on lands within-one of Chris's 2026-09-17 scorecard (2/2/2 · 2/2/1) on all six lines.** (Amended 2026-09-17: Mark's hand assessments dropped — Chris's scorecard is the only real ground truth.) |
| **5** | Frontend | **MA History tab** — session list, transcript with speaker colors, scores, rationale with citations (§12.2), comment thread, **blind scoring form** (§12.1) on the six 2026 lines, Rescore → `/api/score/extract` + `/evaluate`, delete. **Coaching (added 2026-09-19):** (a) Coaching panel at the top of each session — the six `gap_to_next` rewrites, Mark's original sentence beside each, cited Chris chunk underneath, labelled as AI suggestions; hidden from Chris until he has submitted his blind score, same rule as the AI score; (b) "Try that line again" — Mark rewrites one passage, that line alone is re-extracted and re-evaluated, result shows whether the unit is now complete; (c) pre-exam brief on the AT Exam setup screen — three lines from the last session's top gaps. | Chris scores one session blind in the new app; AI score reveals after; delta shows. Mark opens a past session, reads the coaching panel, reworks one line, and sees that line re-scored in under a minute. |
| **6** | Backend | `/api/ingest/score.js` (blind scores → `chris_score` + `exemplar`), `/api/ingest/comment.js`, agreement calculation, exemplar retrieval wired into assembler | Chris's three blind scores are retrievable as exemplars; a rescore cites one |
| **7** | Frontend | **Journal tab** — six entry types, adaptive prompts, connection tags, theme tags, mentor depth assessment (change/deselect), comments, Challenge Me | Mark creates one entry of each type; Chris assesses depth; notification email fires |
| **8** | Frontend | **Progress tab** — mentor assessments, AI analysis, **recurring coaching gaps across sessions** (added 2026-09-19), **Agreement panel** (§12.4), **Zoom approval view** (§12.3) | Chris approves chunks from session 2's transcript; agreement panel shows session 6 data. **Chris switches to the new app after this session.** |
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
| Scored criteria = Chris's 2026 form (six: cause_effect, evaluate, prescription, desired_performances, biomechanics, equipment); describe & communication become tag-only; report MA/TU section averages | The examiner's form is ground truth. Chris confirmed 2026-09-17 that the revised six-criterion form is the current standard. Scoring lines the exam doesn't score trains the wrong thing; not scoring Equipment and Desired Performances hides a third of the exam. Decided 2026-09-17. |
| Evaluate ladder runs both directions; floor rules in the template | The original rules only guarded against scoring low. Chris's first scorecard (7n6ry6d) was 1–2 below the old scorer on every line. Decided 2026-09-17. |
| A session never retrieves its own chunks | Otherwise Chris's comment on a session leaks into its rescore and agreement rate stops meaning agreement. |
| Exemplar slot = Chris-scored only; `past_session` never shown as examples | Old-scorer numbers are known-biased; examples teach level. |
| `general` Chris chunks ride in the Chris slot | They already skip the skill filter, and the slot under-fills for the foreseeable future. Revisit only if Zoom volume crowds it. |
| Backend/frontend sessions alternate | Each session is one kind of work; review is easier; the scoring loop is live by session 6 without waiting for all tabs. |

## 16. Session log

*(append one line per build session: date · session # · built · decided · deferred)*

- **2026-09-19 · Session 2 (backend)** · Built: `lib/prompts/zoom.js` (`zoom-1`: mentor-only, one point per item, no generalizing, read-aloud ≠ asserted, modeled deliveries kept whole as `exemplar`, `hedged` + note, ASR fixes listed per chunk, verbatim `quote`, `tool_feedback` side channel); `lib/ingest/zoom.js` (Plaud/Zoom parser, speaker report, ~12K-char core windows with context-only padding run as parallel Opus calls, quote-in-transcript ≥60% and text-overlap ≥40% guards, dedupe, §17 `watch` marks, 409 on re-ingest unless `replacePending`); `store.js` += `insertPending` (no embedding), `listPending`, `liveStatements`, `supersessionCandidates`, `canSupersede`, `editPending`, `approveChunk` (edit → embed → approve in one update → supersede), `deletePending`, `countBySourceRef`, `deletePendingBySourceRef`; `api/ingest/zoom.js`, `api/chunks/pending.js` (GET/POST, trimmed shape, candidates per chunk), `api/chunks/approve.js` (approve / edit / delete, bulk ids); `scripts/zoom.mjs`, `scripts/selftest-zoom.mjs` (offline, passing; also run against the real 9/18 transcript: 240 turns → 3 windows of ~4.5K tok); `vercel.json` `api/ingest/*.js` 300s; `lib/http.js` `preflight` takes allowed methods. · Decided: embedding at approval, not at insert; speaker map is a prior and chunks under a non-mentor label are flagged for Chris rather than dropped (the 9/18 labels flip mid-turn: Chris appears under all three); tool feedback is not stored; approved chunks immutable; delete is a hard delete of pending only. 9/18 map from reading the transcript: Speaker 1 = chris, Speaker 2 = mark, Speaker 3 = unknown (mixed). · Deferred: see §17. · After the first live runs — `zoom-2` (standalone rule, coverage rule with ski vocabulary for ASR repair, tool feedback exclusive, progress/gear remarks excluded, fixed scores format); session-range tagging (`metadata.session_id`); two-pass union; score-line guard; `exclude` ranges. · **Done-when met 2026-09-19:** 9/18 Plaud transcript (240 turns, 1:06) ingested through the deployed endpoint — speaker map 1 = chris, 2 = mark, 3 = chris (Mark), `ma_7uk7lnh` tagged for 00:00–24:30 and 33:30–35:30 (the large-radius notes at 25:41 are a separate doc, not an MA History row — untagged), 51:24→end excluded (ski choice, per Mark). Two passes 36 + 34 → **37 pending** under `zoom:2026-09-18` (13 correction · 10 principle · 7 exemplar · 4 physics · 3 mental_model; 2 hedged, 3 check-speaker, 28 with supersession candidates), all listed by `/api/chunks/pending` with context, tags and verbatim quote; one item rejected by the score guard ("Describe 2"); stored scores chunk reads CE 2 · Ev 2 · Rx 3, matching the log. Default search returns 0 `chris_zoom`; `includeUnapproved` also 0 (no embedding). 190 s wall-clock.
- **2026-09-19 · Decision** · Coaching is a first-class feature. Mark: the per-line rewrites were "one addition I like that I didn't plan for." Session 5 scope extended (coaching panel, try-that-line-again, pre-exam brief); recurring gaps added to session 8. Rewrites are AI suggestions and are hidden from Chris until his blind score is in.
- **2026-09-19 · Calibration data (no build)** · First truly blind comparison. `ma_7uk7lnh` (Fall Line Bumps, scored by `v2-rag-2` before Chris saw anything): AI 3/4/3 · 2/3/4 vs Chris 2/2/3 · 2/3/3 (given verbally on the 9/18 call; Bio and Equip relayed by Mark). Exact 3/6, within-one 5/6; both agree Does Not Meet. Miss: **Evaluate +2**. Running total incl. 7n6ry6d (not blind — the scorer was calibrated on it): exact 5/12 (42%), within-one 11/12 (92%) against targets of 60% / 85%. · Finding: both over-scores (Evaluate 4, Equipment 4) have `evidence_count` "complete: 1 · partial: 0" and a rationale that uses "single instance / concentrated in one moment" only to deny a 5. The template's scale says 2 = "a single complete one among partials" and 4 = "complete instances are the norm"; one complete instance with no partials falls in the gap and the evaluator resolved it upward. See §17. · Equipment dispute (Mark: I did say how it affects performance; Chris: it was a recommendation): the unprompted statement was a recommendation plus the predicted benefit of the change; the *effect* statement was in private notes (never spoken) and in a prompted Q&A answer that stops at a body state. Chris's 3 stands as ground truth and is consistent with the form wording ("identifies effects of equipment on skier's performance"). · The 9/18 Plaud transcript is session 2's input; speaker labels in it are unreliable (Speaker 1 is mostly Chris, not Mark; a spurious Speaker 3; one stray Plaud AI message) — attribution must be by content with Mark's confirmation.
- **2026-09-18 · Session 3 (frontend) — finish** · Session 3's code (Vite shell, login, tab nav, `tabs/ATExam.jsx` 7 phases, mic/speaker, localStorage persistence, hash-diff save, peer/examiner prompts rewritten around Mark's "examiner asks what I already said" complaint) landed in commit `ee5cff6` without a log line. Finished here. Mark's complaints: the tab opened on his last, already-saved exam with no visible way to start another; "Present" should read "Examiner – Present". · Built: always-visible **＋ New exam** button (confirms only when there is unsaved work) and a real "Start a new exam" button on the score screen; `loadExam` no longer restores an exam that is scored **and** saved (in-progress and scored-but-unsaved still restore); phase labels "Examiner – Present" / "Examiner – Q&A". **Scorer swap:** `/api/score` split into `/api/score/extract` + `/api/score/evaluate` (`lib/http.js` shared; one-shot `/api/score` kept for the CLI); tab calls the two in sequence with a step line; on failure falls back to the old `SCORER_SYSTEM` and says so on screen (`scorer: "legacy"`, never passes as a 2026 score, never wins best-attempt over a new-scorer attempt). **Score panel on the 2026 form:** MA / TU groups, section averages, Meets / Does Not Meet, Describe + Communication as diagnostics, per-line rationale + evidence count + gap-to-next + "Based on: Chris, 2026-09-17 — …" (hover for text; full §12.2 UI is session 5). Best attempt ranks on MA avg + TU avg. **Prompts on the 2026 form:** `AT_STANDARD` rewritten to the six lines; examiner treats never-addressed Equipment / Desired Performance as genuine gaps, asks for the *how* on asserted links and for chains that stop at a body state; peer loses the thread on an over-long prescription instead of summarizing it neatly. **Saved summary** = full score result minus `debug` and the retrieval manifest, cited text cut to 400 chars, shedding guard at 45K (real 7n6ry6d result: 33.8K); `allAttempts` gains `section_averages`, `scorer`. `scripts/selftest-exam.mjs` (offline; persistence rules, summary size, old-app `hasFullScores` round trip). · After Mark's first look: **Sheet loading** — `src/api.js` now retries the transient Apps Script failures (HTML/404, "Unknown action") on reads *and* writes (4 tries, backoff); a transient failure on `update` previously fell through to `create` and could duplicate a row; real answers ("Row not found") are not retried. `sheetHealth` distinguishes empty from failed; the tab no longer blocks on the Sheet load (history only feeds the examiner's probes); failure banner has a Retry button. **＋ New exam** shows only once there is work in the exam (`hasContent`), not on a blank form or the score screen (which has its own button). · Decided: revisions stay at 3. · **Done-when met 2026-09-18:** Mark ran a full AT Exam in the new app (`ma_7uk7lnh`, Fall Line Bumps); row in `MASessions` has all six sections and a 34.5K summary scored by `v2-rag-2` through the split endpoints — six 2026 lines (3/4/3 · 2/3/4), MA 3.33 · TU 3.0, Does Not Meet, 22 valid citations, no ladder skips, no guards, no legacy fallback. First session scored blind-ready: Chris has not seen these numbers.
- **2026-09-17 · Session 4 (backend)** · Built: `lib/vocab.js`; `lib/prompts/extract.js` v2 (`connections[]` with per-link nulls and a never-repair-his-reasoning rule, `task`, `desired_performance`, `equipment.addressed`, `prescription.chain`, `comparison_to_intended_outcome`, code-computed `delivery_stats`; `extractionToText` substance-first); `lib/assembler.js` (§7 slots, PSIA 12K cap, self-exclusion, manifest); `lib/prompts/evaluate.js` (six 2026 lines, case-for-5/4/3 then 2/1, low- and high-guards, legacy diagnostics, 1.9K tok); `lib/score.js` (normalization: code-computed section averages/meets_standards, citation validation + `citation_details`, equipment guard); `api/score.js` (`sessionId` or inline `session`, read-only, `maxDuration` 300); `scripts/score.mjs`; `scripts/session4-migrate.mjs` (retag 2 form chunks; Chris's 9/17 comment split verbatim into 7 single-point chunks, whole-comment chunk superseded); `scripts/selftest-score.mjs` (offline, passing). `store.js` CRITERIA now includes `desired_performances`, `equipment` (were being silently dropped). · Decided: see four new §15 rows; done-when amended in §13. · Deferred: see §17. · **Live run 1 (v2-rag-1): FAIL.** 7n6ry6d scored 4/4/4 · 4/3/1 vs Chris 2/2/2 · 2/2/1 (four lines +2; Equipment and the overall result matched). Ben 4/4/4 · 4/4/1, Chuck 3/4/4 · 4/3/1. Diagnosis from `out/score-7n6ry6d.json`: both steps generous. Extract marked "X was caused by Y" as `how_stated`, put body consequences in the outcome slot, took the predicted benefit of the fix as the task's desired performance, and called a description of the observed turn a comparison to intent. Evaluate wrote "3: No case needed — the 4 case holds" on every line (started at 4, confirmed it), called a connection with null ski performance and outcome "complete", and related Mark's observation to the peer's intent itself. · **Fix (extract v3 / evaluate v2-rag-2):** each generous field now defined by what it is not; no stitching across sections; `cause_effect_chain` rendered in code from `connections[]`; code-computed `connection_stats` and `connections[].complete`; evaluator gets a defined unit of evidence per line, a scale that counts complete units, a bottom-up ladder with every rung written (`quality.ladder_skipped` flags violations), and an explicit AT bar (L3-grade analysis is the starting point, not a 3/4 — sourced from Chris's scorecard, overridden by exemplars when they exist). Template slot 2K → 3K. `lib/sheet.js` retries 4 → 6. · Also: Anthropic client timeout 240s / 1 retry (SDK default 10 min × 2 retries hung a run for 30 min) and per-step progress lines in the CLI. · **Live run 2 (extract v3 / v2-rag-2): PASS.** 7n6ry6d 3/1/3 · 1/2/1 vs Chris 2/2/2 · 2/2/1 — max |Δ| 1, two exact (Biomechanics, Equipment), result matches (Does Not Meet). Ben 3/3/2 · 2/3/1, Chuck 2/2/3 · 3/2/1; Ben above Chuck on Cause/Effect and Biomechanics in line with evidence counts (ski-perf/outcome links 5/4 of 8 vs 1/2 of 6), so the AT bar did not flatten real differences. No ladder skips, no invalid citations, no guards fired. Done-when met. · Caveat: calibrated against one scorecard; within-one 6/6, exact 2/6 on n=1 says nothing yet about the §1 targets.
- **2026-09-17 · Decision** · Chris confirmed the 2026 six-criterion form is the current standard. §5.3, §8.3, §15 updated; follow-through listed in §17. Template-version form chunks (`at-ma-tu-assessment-form.md`, 12) to be superseded by the 2026 version (`at-ma-tu-assessment-form-2026.md`).
- **2026-09-17 · Session 1 addendum 2 — first real Chris input** · Chris scored session `ma_7n6ry6d` on the official form and commented in the tracker himself; comment ingested as `chris_comment` (`author: chris`, store now 3). His scores posted by Mark as a structured comment line for session 6 to parse. · Finding: the form Chris used is a **2026 revision with six MA/TU criteria** — MA: Cause and Effect, Evaluate, Prescription; TU: Understanding of Desired Performances, Understanding of Biomechanics/Physics, Equipment. Describe and Communication are no longer scored lines; revised learning outcomes. Ingested as `reference/at-ma-tu-assessment-form-2026.md` (9 chunks, deterministic). The 11-criterion template version remains live until Chris confirms which form is current; then supersede the other. · His comments define AT-level MA in his words (X→Y→Z frame tied to the task; peer piece = "coaching cue plus", a few sentences; equipment–biomechanics–desired-performance trio; "the how in depth"). Session 4's evaluate prompt should be built around them. · Fixes: `lib/sheet.js` now retries transient Apps Script "Unknown action" failures.
- **2026-09-11 · Session 1 addendum** · Official AT MA/TU Assessment Form obtained and ingested as `reference/at-ma-tu-assessment-form.md` — 12 `psia_doc` chunks (scale + section rule, one per criterion with section Learning Outcome), parsed deterministically, no model call. The 12 summarized scorecard chunks from `psia.md` marked `superseded_by` the form's scale chunk via new `scripts/supersede.mjs`. · Incident: first ingest used the generic Sonnet prose chunker with a guidance hint listing criterion names; Sonnet produced 36 chunks, most manufactured from the hint, including an invented 1–4 rating scale. All 36 hard-deleted (`scripts/cleanup-form.mjs`), old chunks restored, re-ingested cleanly. · Fixes: (a) `groundedness()` guard in `lib/ingest/psia.js` — every Sonnet-produced chunk is rejected unless ≥60% of its sentences appear in the source text; (b) chunker prompt now states guidance is never source; (c) small regular documents get deterministic parsers, not the model. · Note: the summarized scorecard already listed all eleven criteria — the six-criteria scorer was an original app design choice, not a reference gap. Decision on expanding the taxonomy logged in §17.
- **2026-09-10 · Session 1 (backend)** · Built: `supabase/schema.sql` (§5.1 + `match_chunks` RPC with §7.3 hard filters, `text_hash` unique index for idempotent ingest), `scripts/migrate.mjs`, `lib/embed.js` (Voyage `voyage-3`, 1024-d, locked), `lib/store.js`, `lib/llm.js`, `lib/parseSummary.js` (harvested from old JSX), `lib/sheet.js` (harvested column guards incl. `b`-for-`id` header), `lib/prompts/extract.js` (§8.1), `lib/ingest/psia.js` (§6.1 chunker), `scripts/bootstrap.mjs`, `scripts/search.mjs`, `api/chunks/search.js`; `reference/` with five source files. · Decided: (a) reference material is ingested from `/reference/*.md` checked into the repo, not from `Config._REFERENCE_MATERIALS` — that Sheet row is empty and the ~47K of PSIA text was a hardcoded default in the JSX; (b) `extract.js` built in session 1 (spec said session 4) because `past_session` ingestion needs it; session 4 refines; (c) original PDFs replace the summarized IDP section (excluded from `psia.md`; full IDP = 44 task chunks, one per activity); (d) Performance Guide L1–3 criteria ingested with `l3_vs_at` on L3 chunks as the baseline AT is compared against; (e) `private_notes`/`root_cause` exam sections fed to Step 1 as observation-only, never as communication. · Deferred: AT MA/TU Assessment Form (see §17); done-when verified 2026-09-11: store 157/1/2/6 (psia_doc/mentor_assessment/chris_comment/past_session; `ma-sample-2/3` seed sessions superseded via `EXCLUDE_SESSIONS`); retrieval checks pass; `POST /api/chunks/search` live on the new production site. · Environment: new repo `markanderson71/RM-AT-Developer`, new Vercel project `rm-at-developer` (https://rm-at-developer.vercel.app); old site left untouched, same Sheet. `past_session` embedded text is the extraction only — scores were moved out of the text after the first retrieval check showed they compressed all sessions into one similarity band.

## 17. Deferred / open

- **Taxonomy change follow-through** (decision in §15, 2026-09-17): ~~session 4 evaluate template and `justifications`/`gap_to_next` keyed on the six~~ (done); session 5 MA History shows the six + section averages + Meets/Does Not Meet; session 6 Chris's scoring form is the 2026 form layout (incl. Needs/Safety, Behavior Management as optional); Sheet `summary` JSON gets `section_averages` and `meets_standards`. ~~`EXTRACT_SYSTEM` in `lib/prompts/extract.js` should add explicit inventory items~~ (done, extract v2): `equipment: { addressed: bool, quote, linked_to_biomechanics: bool, linked_to_desired_performance: bool }` and `desired_performance: { stated: bool, quote, fundamentals_blended: [...] }` — Chris's 9/17 Equipment score of 1 meant "not addressed at all"; the evaluator must see absence explicitly, not infer it. Chris's trio (equipment × biomechanics × desired performance, with a worked causal example) is the target shape for that line. Re-tag existing chunks: nothing required — tags are additive; `equipment` skill tag already exists.
- **MASessions header cell A1 reads `b` instead of `id`** in the live Sheet export. `lib/sheet.js` guards for it; fix the header in the Sheet when convenient.
- **`/api/chunks/search` returns full `metadata`** including the stored extraction and AI rationale — fine for debug, but session 8's review UI should request a trimmed shape.
- **ivfflat index built on an empty table** (`lists = 50`). If recall looks off after bootstrap, `reindex index chunks_embedding_idx`.
- Fine-tuning: revisit with 50+ blind scores if agreement plateaus below target.
- Retiring in-prompt reference material from the old `buildScorerPrompt`: after session 3 proves retrieval; keep old path as fallback until then.
- Progress tab trend analysis redesign to use exemplars and agreement data.
- Gates and Mike as blind scorers: same form, `author` tag differs; inter-rater data between mentors is a bonus.
- **Coaching from `gap_to_next`** — promoted to scope 2026-09-19: panel, try-again, and pre-exam brief are in §13 row 5; recurring gaps in row 8. Open design point for session 5: "try that line again" needs a single-line evaluate path (`/api/score/evaluate` with a `lines: [key]` filter and a shortened ladder) — a new code path, to be specced in that session's plan. Route rewrites to Chris: his reactions are correction chunks (§6.1).
- **Single-instance gap in the evaluate scale (two scorecards now).** One complete instance and nothing else scored 4 twice on `ma_7uk7lnh` (Evaluate: Chris 2; Equipment: Chris 3). Proposed wording: one complete instance = 3 at most ("appears, but not with consistency"); 4 requires the element to recur or be threaded through the analysis; for Equipment and Desired Performances, a recommendation or the predicted benefit of a change is not an instance — the instance is the stated effect on *this skier's observed* performance. Apply together with exemplar ingestion in session 6 so the change is tested against both Chris scorecards at once, not tuned line by line.
- **Evaluate is unstable, not biased** (still open; Chris's definition now extracted — see the Evaluate comparison item above): −1 on 7n6ry6d, +2 on 7uk7lnh, both driven by the single boolean `comparison_to_intended_outcome.made`. Chris's verbal reasoning on the 9/18 call (session 2 will extract it) should define what he counts as the comparison — likely the task's ideal, not only the peer's stated intent.
- **Sparring peer said "pivot" as an intent and Chris objected on the call** — a bug report on `PEER_SYSTEM` (the peer's vocabulary should be what a certified instructor would actually say). Pick up with session 2's extraction of that passage.
- **Binary extraction flags are too sharp at the bottom.** On 7n6ry6d, `comparison_to_intended_outcome.made = false` and `desired_performance.stated = false` drove Evaluate and Desired Performances to 1 where Chris gave 2 ("beginning to appear"). Within-one, but the direction is informative: Chris gives partial credit where the clerk's boolean says absent. Candidate fix: a three-state field (absent / partial / made) with the partial evidence quoted. Do not tune until a second Chris scorecard confirms the pattern.
- **`connections[].complete` never fired** (0 on all three sessions; `how_stated` true on 1 of 21 connections). The evaluator discriminated on the partial counts, so scores were sane, but the flag carries no information yet. Revisit where Chris's line for "the how" sits once he has scored a session he considers to have one.
- **7n6ry6d and Ben both scored Cause/Effect 3** despite Ben's clearly stronger evidence. Coarse at the 2/3 boundary; exemplars should resolve it.
- **Session 6:** Chris's 7n6ry6d scorecard (posted by Mark as a structured comment line) is exemplar #1 — `result.extraction` from `/api/score` is the text half. `/api/ingest/comment.js` should split long mentor comments by paragraph the way `session4-migrate.mjs` did by hand. After a score is saved, write/refresh the `past_session` chunk (§6.7 "continuous") — `/api/score` is read-only by design.
- **Session 5:** `parseAIJson` strategy 2 (regex fallback) rebuilds `score_rationale` for the legacy six keys only; extend to the 2026 keys when the tab is built. Sheet `summary` should store the full `/api/score` result minus `debug`.
- **Existing `past_session` chunks are extraction v1.** Not used by the evaluator, so no re-bootstrap required; re-extract when session 6 builds exemplars so they carry `connections[]` and `equipment`.
- **Chris–Chris conflict detection** (§5.6 last rule) is done by the evaluator, which sees dates and reports `chris_conflicts`; the assembler can't detect contradiction without a model call. If conflicts start appearing, add a review list to session 8's approval view.
- **Chris slot minimum of 5** (§7.1) is met only when the scored session isn't 7n6ry6d (7 split chunks + 2 comments + assessment). `meta.context.chris_under_min` reports it. Zoom chunks fix this.

- **Evaluate comparison — Chris's definition is now in the store (pending):** 49:35 "provide a comparison of how they were relative to their desired outcomes, and then how does that desired outcome or their intent match to the ideal" and 42:23 "quality and accuracy… go to the component parts… compare that relative to an ideal… always in relationships between fundamentals, phase to phase." Two comparisons, not one: performance vs the peer's intent, **and** intent vs the task's ideal. Session 6: replace the boolean `comparison_to_intended_outcome.made` with `{ vs_intent, vs_ideal }` (three-state each) and test against both scorecards.
- **`PEER_SYSTEM` bug confirmed by Chris (44:09):** the AI peer's answers are not what candidates would say ("pivot" as an intent; long tidy answers). Chris, 45:00: a real peer gives enough but not so much that it sinks them — "you might be more brief"; it is on the candidate to ask one targeted question. Fix with the Sparring tab's next touch (session 11 at the latest). Also from `tool_feedback`: the summary Chris saw lacked the peer-delivery text ("I only got one sentence") — check what MA History shows a mentor in session 5.
- **Zoom ingest ran 190 s of a 300 s limit** (6 parallel Opus calls for a 66-min call). A 90-min call may not fit: make `passes` sequential-with-budget, or split ingest into a per-window endpoint driven by the CLI.
- **For Chris at approval (session 8):** bracketed restorations in this batch are guesses — "integrated [terrain]", "two-level [AT-level]", the names at 15:07 (Balut / Brylie / Tom Galley) — and a few items are reworded more than "lightly" (00:00:40, 00:01:19). The pending shape returns `quote` so the UI can show what was actually heard next to the cleaned text; show it.
- **Mutating endpoints have no real auth.** `/api/chunks/approve` trusts a client-asserted `actor`; `/api/ingest/zoom` spends Opus calls for anyone who POSTs. Same trust model as the rest of the app, but `approve` is the first endpoint that writes ground truth. Before session 8 puts a UI on it: a per-user secret or signed login token checked server-side.
- **Supersession candidates are tag-ranked, not semantic** — pending chunks have no embedding by design. If Chris finds the candidates unhelpful in session 8, embed the pending text as a *query* at list time (never stored) and rank the pool by similarity.
- **Deleted pending chunks leave no trace.** What Chris deletes is the best signal for tuning `zoom-1`; if the delete rate is high after two or three calls, log `{text, reason}` to a side table before deleting.
- **Zoom extraction quality is unmeasured.** After Chris's first approval pass (session 8, or by CLI before): approve / edit / delete rates per type, and what he says is missing. Tune the prompt on that, not on our reading of the output.
- **Chris's ski-choice advice on the 9/18 call (57:37–58:56) is excluded by rule** (advice about Mark's own skiing, not MA/TU assessment). It is a worked equipment × performance argument; if Chris wants it in, the rule gets an exception.

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
