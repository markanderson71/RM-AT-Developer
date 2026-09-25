-- AT Development Journal — operational data (session 7b). Replaces the Google Sheet tabs Config / Journal / MASessions.
-- Idempotent. Run via `npm run migrate` (uses SUPABASE_DB_URL) or paste into the Supabase SQL editor.
-- One row per former Sheet row; `row` holds the columns as text values, exactly as the Apps Script returned them.

create table if not exists ops_rows (
  sheet       text        not null,               -- 'Config' | 'Journal' | 'MASessions'
  id          text        not null,               -- the row's id column
  row         jsonb       not null default '{}',  -- { column: "string", ... } — never includes id
  seq         bigserial,                          -- insertion order (the Sheet's row order after migration)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (sheet, id)
);

create index if not exists ops_rows_sheet_seq on ops_rows (sheet, seq);

-- Service key only; the browser never talks to Postgres directly (it goes through /api/sheet).
alter table ops_rows enable row level security;
