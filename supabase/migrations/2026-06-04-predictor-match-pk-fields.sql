-- ============================================================================
-- WC26 Predictor — predictor_matches: PK shootout fields
-- Date: 2026-06-04
-- Branch: feat/predictor-score-match-endpoint
-- Spec:  docs/PREDICTOR-SCORING-RULES.md (knockout / PK shootout rules)
-- ----------------------------------------------------------------------------
-- The scoring engine's MatchActual contract requires two fields the prod
-- schema didn't yet have:
--   - went_to_pks         (bool, not null, default false)
--   - pk_winner_team_code (text, nullable; only meaningful when went_to_pks)
--
-- `home_score` / `away_score` on predictor_matches continue to be the
-- 90+ET scoreline (per spec). PK shootout result is captured here as a
-- single winner identifier — we don't need shootout score detail for any
-- scoring rule.
--
-- Idempotent: safe to re-run.
-- ============================================================================

alter table predictor_matches
  add column if not exists went_to_pks         bool not null default false,
  add column if not exists pk_winner_team_code text;

comment on column predictor_matches.went_to_pks is
  'True when the match was decided in a penalty shootout. Knockouts only. '
  'When false, the 90+ET scoreline alone determines the winner.';

comment on column predictor_matches.pk_winner_team_code is
  'team_code of the side that won the shootout. Null unless went_to_pks=true.';
