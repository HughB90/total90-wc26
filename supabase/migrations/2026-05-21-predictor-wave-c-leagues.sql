-- ============================================================================
-- WC26 Predictor — Wave C: Predictor leagues
-- Date: 2026-05-21
-- Branch: feat/predictor-wave-c
-- Spec:   projects/wc26-page/PREDICTOR-WAVE-C-SPEC.md § 3
-- ----------------------------------------------------------------------------
-- New tables for the score-predictor's own league system. These are SEPARATE
-- from the bracket leagues (`wc26_leagues` / `wc26_league_members`) because
-- the membership semantics, leaderboards, and (eventually) entry-fee rails
-- diverge — score-predictor is per-match scoring, bracket is one-shot.
--
-- Schema mirrors the bracket league pattern (creator + invite code + member
-- list) so a future "merge into single league surface" refactor is easy.
--
-- RLS: service-role does all writes (mirrors every other WC26 table). Anon
-- SELECT is open so the public leaderboard / league preview pages work.
-- ============================================================================

-- ---- wc26_predictor_leagues ------------------------------------------------
create table if not exists wc26_predictor_leagues (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  invite_code   text not null unique,
  created_by    uuid not null references profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_wc26_predictor_leagues_created_by
  on wc26_predictor_leagues (created_by);

-- ---- wc26_predictor_league_members ----------------------------------------
create table if not exists wc26_predictor_league_members (
  league_id   uuid not null references wc26_predictor_leagues(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  is_admin    boolean not null default false,
  joined_at   timestamptz not null default now(),
  primary key (league_id, profile_id)
);

create index if not exists idx_wc26_predictor_league_members_profile
  on wc26_predictor_league_members (profile_id);

-- ---- RLS -------------------------------------------------------------------
alter table wc26_predictor_leagues enable row level security;
alter table wc26_predictor_league_members enable row level security;

-- wc26_predictor_leagues
drop policy if exists "wc26_predictor_leagues_service_role_all" on wc26_predictor_leagues;
create policy "wc26_predictor_leagues_service_role_all"
  on wc26_predictor_leagues for all
  using (auth.role() = 'service_role');

drop policy if exists "wc26_predictor_leagues_anon_select" on wc26_predictor_leagues;
create policy "wc26_predictor_leagues_anon_select"
  on wc26_predictor_leagues for select
  using (true);

-- wc26_predictor_league_members
drop policy if exists "wc26_predictor_league_members_service_role_all" on wc26_predictor_league_members;
create policy "wc26_predictor_league_members_service_role_all"
  on wc26_predictor_league_members for all
  using (auth.role() = 'service_role');

drop policy if exists "wc26_predictor_league_members_anon_select" on wc26_predictor_league_members;
create policy "wc26_predictor_league_members_anon_select"
  on wc26_predictor_league_members for select
  using (true);
