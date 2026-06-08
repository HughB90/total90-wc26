-- 2026-06-08 — Bracket leagues: untangle from legacy bracket_users, key to profiles.
--
-- Pass 2+5 multi-profile auth moved real users to `public.profiles`, but
-- `wc26_leagues.creator_id` and `wc26_league_members.user_id` still FK'd to
-- the pre-launch `bracket_users` table. Any post-launch user creating or
-- joining a bracket league hit FK errors. Erin Mouledoux reported this on
-- 2026-06-08.
--
-- Strategy:
--  - Drop the bracket_users FKs.
--  - Add a real surrogate PK `id uuid` on wc26_league_members, replacing the
--    legacy (league_id, user_id) PK so user_id can become nullable.
--  - Make user_id nullable (legacy rows keep their bracket_users.id, new rows
--    leave it NULL and use profile_id).
--  - Add FK profile_id → profiles(id) ON DELETE CASCADE (idempotent).
--  - Unique indexes: (league_id, profile_id) WHERE profile_id IS NOT NULL,
--                    (league_id, user_id)   WHERE profile_id IS NULL AND user_id IS NOT NULL.

BEGIN;

-- 1. Drop legacy bracket_users FKs.
ALTER TABLE public.wc26_leagues
  DROP CONSTRAINT IF EXISTS bracket_leagues_creator_id_fkey;

ALTER TABLE public.wc26_league_members
  DROP CONSTRAINT IF EXISTS bracket_league_members_user_id_fkey;

-- 2. Replace composite PK with surrogate uuid id.
ALTER TABLE public.wc26_league_members
  DROP CONSTRAINT IF EXISTS bracket_league_members_pkey;

ALTER TABLE public.wc26_league_members
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.wc26_league_members
  ADD CONSTRAINT wc26_league_members_pkey PRIMARY KEY (id);

-- 3. user_id becomes nullable.
ALTER TABLE public.wc26_league_members
  ALTER COLUMN user_id DROP NOT NULL;

-- 4. FK profile_id → profiles(id). Idempotent: only add if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.wc26_league_members'::regclass
      AND conname  = 'wc26_league_members_profile_id_fkey'
  ) THEN
    ALTER TABLE public.wc26_league_members
      ADD CONSTRAINT wc26_league_members_profile_id_fkey
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END$$;

-- 5. Partial unique indexes.
CREATE UNIQUE INDEX IF NOT EXISTS wc26_league_members_league_profile_uidx
  ON public.wc26_league_members (league_id, profile_id)
  WHERE profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wc26_league_members_league_user_legacy_uidx
  ON public.wc26_league_members (league_id, user_id)
  WHERE profile_id IS NULL AND user_id IS NOT NULL;

COMMIT;
