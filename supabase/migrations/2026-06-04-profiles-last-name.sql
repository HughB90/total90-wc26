-- ============================================================================
-- WC26 Predictor — profiles.last_name column
-- Date:   2026-06-04
-- Branch: feat/profile-lastname-lock-delete
-- Spec:   Add optional last_name to profiles. Required on new profile creation
--         at the application layer (don't nag existing rows). First/last name
--         become editable only until the Round 1 group-stage lock — after that
--         only manager_name remains editable.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_name text NULL;

COMMENT ON COLUMN public.profiles.last_name IS
  'Optional last name. Application requires this on new profile creation but
   pre-existing rows are left blank (no backfill prompt). Editable up to the
   Round 1 (group_r1) first kickoff; locked thereafter alongside first_name.';
