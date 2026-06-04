-- ============================================================================
-- WC26 Predictor — Scoring v2 (canonical rules, bundled-pick model)
-- Date: 2026-06-03
-- Branch: feat/predictor-scoring-engine-v2
-- Spec:  docs/PREDICTOR-SCORING-RULES.md
-- ----------------------------------------------------------------------------
-- Hugh clarified 2026-06-03: in knockouts, a predicted draw scoreline IS the
-- prediction that the match goes to PKs, bundled with which team wins on PKs
-- (via pk_advance_team_id). There is NO separate +3 advancer_pk_pts bonus.
-- The PK side is folded into the existing exact/result point types.
--
-- Changes vs the original phase-3 schema:
--   1. predictor_picks: add `pk_advance_team_id` (canonical replacement for
--      legacy `if_draw_winner`; both coexist for now).
--   2. profiles: add `display_name` and `team_name` (schema only, no UI yet).
--
-- predictor_scores generated columns from 2026-05-19-predictor-phase-3.sql
-- remain authoritative and are NOT modified by this migration.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---- 1. predictor_picks: add pk_advance_team_id ---------------------------
alter table predictor_picks
  add column if not exists pk_advance_team_id text;

comment on column predictor_picks.pk_advance_team_id is
  'Team code the user expects to advance on penalties when their predicted '
  'scoreline is a draw (R4–R8 knockouts only). Bundled with the draw '
  'scoreline as a single "this match goes to PKs and X wins the shootout" '
  'prediction. Canonical going forward; legacy `if_draw_winner` retained '
  'for back-compat.';

-- ---- 2. profiles: add display_name + team_name (schema only) -------------
alter table profiles
  add column if not exists display_name text,
  add column if not exists team_name    text;

comment on column profiles.display_name is
  'Optional display name shown on leaderboards. Falls back to handle/email '
  'when null. UI wiring deferred.';
comment on column profiles.team_name is
  'Optional manager team name (e.g. "Hugh''s XI"). Cosmetic only. UI '
  'wiring deferred.';
