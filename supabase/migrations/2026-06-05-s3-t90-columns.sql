-- 2026-06-05: Add T90 / Cat / 10k / FIFA columns to s3_players
-- Drives the top-250 sync from WC T90 Scores (Google Sheets) to s3_players.
-- Reversible: drop each column to roll back.

alter table public.s3_players
  add column if not exists cat_score        numeric(5,1),
  add column if not exists t90_score        numeric(5,1),
  add column if not exists tenk_score       integer,
  add column if not exists tenk_dynasty     integer,
  add column if not exists starting_xi      smallint,             -- 1=starter, 2=rotation, 3=depth
  add column if not exists fifa_overall     smallint,
  add column if not exists fifa_potential   smallint,
  add column if not exists fifa_match_status text,                -- matched | default | no_fifa | not_found_anywhere
  add column if not exists wc_age           smallint,
  add column if not exists pos_short        text,                 -- GK | DEF | MID | FWD
  add column if not exists t90_rank         integer,              -- 1..N within current sync batch
  add column if not exists t90_updated_at   timestamptz;

-- Indexes for typical admin/leaderboard queries
create index if not exists idx_s3_players_t90_score    on public.s3_players (t90_score desc nulls last);
create index if not exists idx_s3_players_tenk_score   on public.s3_players (tenk_score desc nulls last);
create index if not exists idx_s3_players_starting_xi  on public.s3_players (starting_xi) where starting_xi is not null;

comment on column public.s3_players.cat_score       is 'Position-weighted FIFA category score 0-100 (build-wc-t90-from-raw.js v1.2)';
comment on column public.s3_players.t90_score       is 'T90 score = blended * depth * tier (build-wc-t90-from-raw.js v1.2)';
comment on column public.s3_players.tenk_score      is '10k score capped 500-10000 (redraft)';
comment on column public.s3_players.tenk_dynasty    is '10k Dynasty score, age/pot weighted';
comment on column public.s3_players.starting_xi    is '1=starter, 2=rotation, 3=depth (LIVING WC rosters col F)';
comment on column public.s3_players.fifa_match_status is 'matched | default | no_fifa | not_found_anywhere';
comment on column public.s3_players.t90_rank        is 'Rank by T90 score in current sync batch (1..N)';
comment on column public.s3_players.t90_updated_at  is 'Timestamp of last T90 sync from WC T90 Scores sheet';
