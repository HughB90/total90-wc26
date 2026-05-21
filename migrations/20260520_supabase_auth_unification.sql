-- 2026-05-20 — Unify auth: profiles.account_id now references auth.users(id)
-- instead of the bespoke `accounts` table. The `accounts` table is renamed to
-- `accounts_deprecated_2026_05_20` for a 14-day rollback window.
--
-- Order is important:
--   1. Drop the existing FK profiles.account_id -> accounts.id
--   2. Backfill (done in scripts/migrate-accounts-to-supabase-auth.mjs)
--      for the few rows whose new auth.users.id differs from the old accounts.id
--   3. Add a new FK profiles.account_id -> auth.users(id) ON DELETE CASCADE
--   4. Rename the legacy `accounts` table
--
-- Run steps 1, 3, 4 here. Step 2 is in the JS migration script (it has to walk
-- the admin API).

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: drop the legacy FK so we can move profile.account_id to auth.users
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_account_id_fkey;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: re-add the FK against auth.users
-- (only run after the JS migration backfills profile.account_id for the 2
--  accounts whose IDs differed from auth.users)
ALTER TABLE profiles
  ADD CONSTRAINT profiles_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: rename the legacy accounts table
-- Keep it around for ~14 days as a rollback safety net. After that, drop it:
--   DROP TABLE accounts_deprecated_2026_05_20;
ALTER TABLE accounts RENAME TO accounts_deprecated_2026_05_20;
