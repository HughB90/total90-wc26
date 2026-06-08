-- 2026-06-08 — bracket_entries: same untangling as wc26_league_members.
--
-- Erin Mouledoux + Daniel both got "Error — Retry" trying to save Bracket
-- picks. Cause: bracket_entries.user_id still FK'd to legacy bracket_users
-- and was NOT NULL, so the picks/route fallback (write user_id = profile.id
-- for new auth users) silently FK-failed.
--
-- Fix mirrors the league_members migration:
--  - Drop FK bracket_entries.user_id -> bracket_users.
--  - user_id becomes nullable (new auth-stack users only set profile_id).
--  - Ensure FK profile_id -> profiles(id) exists (it does in prod — keep idempotent).

BEGIN;

ALTER TABLE public.bracket_entries
  DROP CONSTRAINT IF EXISTS bracket_entries_user_id_fkey;

ALTER TABLE public.bracket_entries
  ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.bracket_entries'::regclass
      AND conname  = 'bracket_entries_profile_id_fkey'
  ) THEN
    ALTER TABLE public.bracket_entries
      ADD CONSTRAINT bracket_entries_profile_id_fkey
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END$$;

COMMIT;
