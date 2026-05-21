-- ============================================================================
-- WC26 Predictor — Wave C amendment: Anytime Goalscorer pick (Rounds 5–8)
-- Date: 2026-05-21
-- Branch: feat/predictor-wave-c
-- Spec:   projects/wc26-page/PREDICTOR-WAVE-C-AMEND-GOALSCORER.md
-- ----------------------------------------------------------------------------
-- For each knockout-only match (r16, qf, sf, final), the picker chooses ONE
-- player they expect to score "anytime" (open play / ET; NOT PK shootout).
-- We extend the existing predictor_picks row instead of introducing a new
-- table — single source of truth per (profile_id, match_id).
--
-- s3_players.id is uuid (verified live), so the FK type is uuid.
-- s3_players.nationality is the full country name (matches team_code).
-- ============================================================================

alter table predictor_picks
  add column if not exists goalscorer_player_id uuid references s3_players(id) on delete set null,
  add column if not exists goalscorer_team_code text;

comment on column predictor_picks.goalscorer_player_id is
  'Anytime Goalscorer pick (R5–R8). Player from s3_players. +2 pts if they score in normal time or ET (NOT shootout). Nullable.';
comment on column predictor_picks.goalscorer_team_code is
  'Country/team_code of the goalscorer pick. Must equal predictor_matches.home_team_code OR away_team_code for the row''s match. Nullable.';

create index if not exists idx_predictor_picks_goalscorer_player
  on predictor_picks (goalscorer_player_id)
  where goalscorer_player_id is not null;
