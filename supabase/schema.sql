-- AT Development Journal — knowledge store (architecture §5.1)
-- Idempotent. Run via `node scripts/migrate.mjs` or paste into the Supabase SQL editor.
-- Embedding model: Voyage voyage-3, 1024 dimensions. LOCKED (§11). Never change vector(1024).

create extension if not exists vector;

create table if not exists chunks (
  id            uuid primary key default gen_random_uuid(),
  text          text not null,
  source        text not null,      -- §5.2
  source_ref    text,               -- doc section / zoom date / session id
  criteria      text[] not null default '{}',   -- §5.3
  skills        text[] not null default '{}',   -- §5.4
  type          text not null,      -- §5.5
  author        text,               -- 'chris' | 'gates' | 'mike' | 'psia' | 'mark' | null
  date          date,
  approved      boolean not null default false,
  superseded_by uuid references chunks(id),
  metadata      jsonb default '{}',
  embedding     vector(1024),
  created_at    timestamptz default now()
);

-- Idempotent ingestion: same source_ref + same text hash = same chunk. Bootstrap can re-run safely.
alter table chunks add column if not exists text_hash text;
create unique index if not exists chunks_source_ref_hash on chunks (source, source_ref, text_hash);

-- ivfflat needs rows to build sensible lists; fine to create empty, re-index after bootstrap if recall is poor.
create index if not exists chunks_embedding_idx on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 50);
create index if not exists chunks_source_approved_idx on chunks (source, approved) where superseded_by is null;
create index if not exists chunks_skills_idx on chunks using gin (skills);
create index if not exists chunks_criteria_idx on chunks using gin (criteria);

-- Similarity search with the hard filters from §7.3.
-- Retrieval-facing: approved = true and superseded_by is null are ALWAYS applied unless
-- include_unapproved is set (debug endpoint only; the assembler never sets it).
create or replace function match_chunks(
  query_embedding    vector(1024),
  match_count        int      default 20,
  filter_sources     text[]   default null,
  filter_authors     text[]   default null,
  filter_types       text[]   default null,
  filter_skills      text[]   default null,   -- overlap (&&); null = no skill filter
  filter_criteria    text[]   default null,   -- overlap (&&)
  include_unapproved boolean  default false
)
returns table (
  id uuid, text text, source text, source_ref text, criteria text[], skills text[],
  type text, author text, date date, approved boolean, metadata jsonb, similarity float
)
language sql stable as $$
  select c.id, c.text, c.source, c.source_ref, c.criteria, c.skills, c.type, c.author,
         c.date, c.approved, c.metadata,
         1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where c.superseded_by is null
    and (include_unapproved or c.approved = true)
    and (filter_sources  is null or c.source = any(filter_sources))
    and (filter_authors  is null or c.author = any(filter_authors))
    and (filter_types    is null or c.type   = any(filter_types))
    and (filter_skills   is null or c.skills   && filter_skills)
    and (filter_criteria is null or c.criteria && filter_criteria)
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
