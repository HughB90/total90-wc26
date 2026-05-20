-- ============================================================================
-- WC26 Predictor — Phase 3 schema migration
-- Date: 2026-05-19
-- Branch: feat/predictor-phase-3
-- Spec: projects/wc26-page/PREDICTOR-PLAN.md § "Data Model — Predictor-Specific Tables"
-- ============================================================================
-- NOTES:
--   * `predictor_players` is DEFERRED to Phase 5 (goalscorer feature).
--   * `predictor_picks.goalscorer_id` column is DEFERRED to Phase 5 — TODO below.
--   * Scoring engine (Phase 4) and leaderboard refresh logic live elsewhere.
--   * RLS uses request.jwt.claims->>'profile_id'. We currently don't issue
--     Supabase JWTs (custom cookie auth), so all server writes go through
--     service_role which bypasses RLS. The profile-scoped policies become
--     real protection once we migrate to Supabase Auth (Pass 3 post-tournament).
-- ============================================================================

-- ---- predictor_matches -----------------------------------------------------
create table if not exists predictor_matches (
  id              text primary key,            -- 'match_001' .. 'match_104'
  match_num       int  not null unique,        -- 1..104
  round_code      text not null,               -- 'group_r1' | 'group_r2' | 'group_r3' | 'r32' | 'r16' | 'qf' | 'sf' | 'final'
  group_code      text,                         -- 'A'..'L' for group stage; null for KO
  home_team_code  text not null,                -- may be a placeholder like 'Winner M73' until knockouts resolve
  away_team_code  text not null,
  kickoff_at      timestamptz not null,
  venue           text,
  home_score      int,
  away_score      int,
  goalscorers     jsonb not null default '[]'::jsonb,
  status          text not null default 'scheduled',  -- 'scheduled' | 'live' | 'final' | 'cancelled'
  is_knockout     boolean generated always as (round_code in ('r32','r16','qf','sf','final')) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint predictor_matches_round_code_chk
    check (round_code in ('group_r1','group_r2','group_r3','r32','r16','qf','sf','final')),
  constraint predictor_matches_status_chk
    check (status in ('scheduled','live','final','cancelled'))
);

create index if not exists idx_predictor_matches_round on predictor_matches (round_code);
create index if not exists idx_predictor_matches_kickoff on predictor_matches (kickoff_at);

-- ---- predictor_picks -------------------------------------------------------
-- TODO Phase 5: add `goalscorer_id uuid references predictor_players(id)` column
--               for knockout goalscorer bonus.
create table if not exists predictor_picks (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles(id) on delete cascade,
  match_id        text not null references predictor_matches(id) on delete cascade,
  home_score      int  not null check (home_score between 0 and 15),
  away_score      int  not null check (away_score between 0 and 15),
  if_draw_winner  text,                                -- team_code; required when home_score = away_score (knockout only)
  is_star         boolean not null default false,
  submitted_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (profile_id, match_id)
);

create index if not exists idx_predictor_picks_profile on predictor_picks (profile_id);
create index if not exists idx_predictor_picks_match on predictor_picks (match_id);

-- ---- predictor_winner_picks -----------------------------------------------
create table if not exists predictor_winner_picks (
  profile_id      uuid primary key references profiles(id) on delete cascade,
  team_code       text not null,
  submitted_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---- predictor_scores ------------------------------------------------------
create table if not exists predictor_scores (
  profile_id      uuid not null references profiles(id) on delete cascade,
  match_id        text not null references predictor_matches(id) on delete cascade,
  exact_pts       int  not null default 0,
  result_pts      int  not null default 0,
  scorer_pts      int  not null default 0,
  star_multiplier int  not null default 1,
  total_pts       int  generated always as ((exact_pts + result_pts + scorer_pts) * star_multiplier) stored,
  outcome_color   text generated always as (
    case
      when exact_pts > 0 then 'teal'
      when result_pts > 0 then 'green'
      else 'red'
    end
  ) stored,
  computed_at     timestamptz not null default now(),
  primary key (profile_id, match_id)
);

create index if not exists idx_predictor_scores_match on predictor_scores (match_id);

-- ---- predictor_leaderboard_cache ------------------------------------------
create table if not exists predictor_leaderboard_cache (
  profile_id           uuid primary key references profiles(id) on delete cascade,
  total_pts            int not null default 0,
  exact_score_pts_only int not null default 0,
  r1_pts               int not null default 0,
  r2_pts               int not null default 0,
  r3_pts               int not null default 0,
  r32_pts              int not null default 0,
  r16_pts              int not null default 0,
  qf_pts               int not null default 0,
  sf_pts               int not null default 0,
  final_pts            int not null default 0,
  winner_pick_pts      int not null default 0,
  updated_at           timestamptz not null default now()
);

-- ============================================================================
-- updated_at trigger
-- ============================================================================
create or replace function predictor_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_predictor_matches_touch on predictor_matches;
create trigger trg_predictor_matches_touch
  before update on predictor_matches
  for each row execute function predictor_touch_updated_at();

drop trigger if exists trg_predictor_picks_touch on predictor_picks;
create trigger trg_predictor_picks_touch
  before update on predictor_picks
  for each row execute function predictor_touch_updated_at();

drop trigger if exists trg_predictor_winner_picks_touch on predictor_winner_picks;
create trigger trg_predictor_winner_picks_touch
  before update on predictor_winner_picks
  for each row execute function predictor_touch_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
alter table predictor_matches             enable row level security;
alter table predictor_picks               enable row level security;
alter table predictor_winner_picks        enable row level security;
alter table predictor_scores              enable row level security;
alter table predictor_leaderboard_cache   enable row level security;

-- helper: extract profile_id from JWT claims (null-safe)
create or replace function predictor_current_profile_id()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'profile_id', '')::uuid
$$;

-- ---- predictor_matches: public read, no writes -----------------------------
drop policy if exists predictor_matches_select on predictor_matches;
create policy predictor_matches_select on predictor_matches
  for select using (true);

-- ---- predictor_picks: profile reads/writes its own rows -------------------
drop policy if exists predictor_picks_select_own on predictor_picks;
create policy predictor_picks_select_own on predictor_picks
  for select using (profile_id = predictor_current_profile_id());

drop policy if exists predictor_picks_insert_own on predictor_picks;
create policy predictor_picks_insert_own on predictor_picks
  for insert with check (profile_id = predictor_current_profile_id());

drop policy if exists predictor_picks_update_own on predictor_picks;
create policy predictor_picks_update_own on predictor_picks
  for update using (profile_id = predictor_current_profile_id())
            with check (profile_id = predictor_current_profile_id());

drop policy if exists predictor_picks_delete_own on predictor_picks;
create policy predictor_picks_delete_own on predictor_picks
  for delete using (profile_id = predictor_current_profile_id());

-- ---- predictor_winner_picks: profile reads/writes own ---------------------
drop policy if exists predictor_winner_picks_select_own on predictor_winner_picks;
create policy predictor_winner_picks_select_own on predictor_winner_picks
  for select using (profile_id = predictor_current_profile_id());

drop policy if exists predictor_winner_picks_insert_own on predictor_winner_picks;
create policy predictor_winner_picks_insert_own on predictor_winner_picks
  for insert with check (profile_id = predictor_current_profile_id());

drop policy if exists predictor_winner_picks_update_own on predictor_winner_picks;
create policy predictor_winner_picks_update_own on predictor_winner_picks
  for update using (profile_id = predictor_current_profile_id())
            with check (profile_id = predictor_current_profile_id());

drop policy if exists predictor_winner_picks_delete_own on predictor_winner_picks;
create policy predictor_winner_picks_delete_own on predictor_winner_picks
  for delete using (profile_id = predictor_current_profile_id());

-- ---- predictor_scores: public read, service_role only writes --------------
drop policy if exists predictor_scores_select on predictor_scores;
create policy predictor_scores_select on predictor_scores
  for select using (true);

-- ---- predictor_leaderboard_cache: public read, service_role only writes ---
drop policy if exists predictor_leaderboard_cache_select on predictor_leaderboard_cache;
create policy predictor_leaderboard_cache_select on predictor_leaderboard_cache
  for select using (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================
comment on table  predictor_matches is 'WC26 fixture list (104 matches). Source of truth for kickoff times + final scores.';
comment on table  predictor_picks is 'Per-profile per-match score predictions. One row per (profile, match).';
comment on column predictor_picks.if_draw_winner is 'Knockout draw advancer (UX only — does NOT affect scoring per spec § Scoring).';
comment on table  predictor_winner_picks is 'Pre-tournament winner pick. Locks at 2026-06-11 14:00 CT (R1 kickoff).';
comment on table  predictor_scores is 'Computed per-match score for a profile. Refreshed on match-final (Phase 4 engine).';
comment on table  predictor_leaderboard_cache is 'Denormalized totals per profile. Refreshed on match-final (Phase 4).';
