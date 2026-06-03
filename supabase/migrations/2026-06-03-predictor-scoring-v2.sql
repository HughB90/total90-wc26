-- ============================================================================
-- WC26 Predictor — Scoring v2 (canonical rules)
-- Date: 2026-06-03
-- Branch: feat/predictor-scoring-engine-v2
-- Spec:  docs/PREDICTOR-SCORING-RULES.md
-- ----------------------------------------------------------------------------
-- Changes:
--   1. predictor_picks: add `pk_advance_team_id` (canonical replacement for
--      legacy `if_draw_winner`; both coexist for now).
--   2. predictor_scores: add `advancer_pk_pts`; rebuild `total_pts` and
--      `outcome_color` generated columns to include it.
--   3. profiles: add `display_name` and `team_name` (schema only, no UI yet).
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---- 1. predictor_picks: add pk_advance_team_id ---------------------------
alter table predictor_picks
  add column if not exists pk_advance_team_id text;

comment on column predictor_picks.pk_advance_team_id is
  'Team code the user expects to advance on penalties when their predicted '
  'scoreline is a draw (R4–R8 knockouts only). Required for +3 PK-advance '
  'bonus. Canonical going forward; legacy `if_draw_winner` retained for '
  'back-compat.';

-- ---- 2. predictor_scores: add advancer_pk_pts, rebuild generated cols ----
-- Drop generated columns first (cannot ALTER generated expression in place).
alter table predictor_scores drop column if exists total_pts;
alter table predictor_scores drop column if exists outcome_color;

alter table predictor_scores
  add column if not exists advancer_pk_pts int not null default 0;

comment on column predictor_scores.advancer_pk_pts is
  '+3 if predicted draw + match went to PKs + pk_advance_team_id matched '
  'actual PK winner. R4–R8 only. Else 0.';

-- Rebuild generated total_pts (now includes advancer_pk_pts).
alter table predictor_scores
  add column total_pts int
    generated always as
      ((exact_pts + result_pts + scorer_pts + advancer_pk_pts) * star_multiplier)
    stored;

-- Rebuild generated outcome_color.
-- teal  : exact_pts > 0
-- green : any other positive component (result, advancer_pk, scorer)
-- red   : all components zero (i.e. pick exists, scored nothing)
alter table predictor_scores
  add column outcome_color text
    generated always as (
      case
        when exact_pts > 0 then 'teal'
        when (result_pts > 0 or advancer_pk_pts > 0 or scorer_pts > 0) then 'green'
        else 'red'
      end
    ) stored;

-- ---- 3. profiles: add display_name + team_name (schema only) -------------
alter table profiles
  add column if not exists display_name text,
  add column if not exists team_name    text;

comment on column profiles.display_name is
  'Optional display name shown on leaderboards. Falls back to handle/email '
  'when null. UI wiring deferred.';
comment on column profiles.team_name is
  'Optional manager team name (e.g. "Hugh''s XI"). Cosmetic only. UI '
  'wiring deferred.';
