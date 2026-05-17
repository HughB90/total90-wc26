-- Pass 5: Multi-profile per account model
-- Additive migration — DO NOT drop bracket_users (kept for reference/rollback)
-- Created: 2026-05-17
-- Feature flag: MULTI_PROFILE_ENABLED

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ACCOUNTS TABLE (parent/owner entity)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: service_role full access, anon can lookup by email (needed for Tier 1 signin)
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_service_role_all" 
  ON accounts FOR ALL 
  USING (auth.role() = 'service_role');

CREATE POLICY "accounts_anon_select" 
  ON accounts FOR SELECT 
  USING (true);

-- Index on email for fast lookup
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. PROFILES TABLE (player/bracket entity)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  first_name      TEXT NOT NULL,
  pin_hash        TEXT NOT NULL,              -- SHA-256 of 4-digit PIN
  manager_name    TEXT NOT NULL,              -- "Jim's Juggernauts" — shown on leaderboard
  display_name    TEXT,                       -- Optional friendly name; falls back to first_name
  is_owner        BOOLEAN NOT NULL DEFAULT false,  -- First profile = parent's own
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ                 -- Soft-delete only
);

-- Collision rule: within an account, (first_name, pin_hash) must be unique
-- This prevents duplicate profiles in the same account
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unique_name_pin 
  ON profiles(account_id, first_name, pin_hash) 
  WHERE deleted_at IS NULL;

-- RLS: service_role full access, anon can select (needed for leaderboards/login lookups)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_service_role_all" 
  ON profiles FOR ALL 
  USING (auth.role() = 'service_role');

CREATE POLICY "profiles_anon_select" 
  ON profiles FOR SELECT 
  USING (deleted_at IS NULL);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_account_id ON profiles(account_id);
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON profiles(deleted_at) WHERE deleted_at IS NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ADD profile_id TO EXISTING TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- bracket_entries: link entries to profiles (nullable for backward compat)
ALTER TABLE bracket_entries 
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bracket_entries_profile_id ON bracket_entries(profile_id);

-- Check if predictor tables exist and add profile_id
-- predictor_picks (from PREDICTOR-PLAN.md spec)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'predictor_picks') THEN
    ALTER TABLE predictor_picks 
      ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_predictor_picks_profile_id ON predictor_picks(profile_id);
  END IF;
END $$;

-- predictor_winner_picks (from PREDICTOR-PLAN.md spec)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'predictor_winner_picks') THEN
    -- This table uses profile_id as PK, so just ensure FK constraint exists
    ALTER TABLE predictor_winner_picks 
      DROP CONSTRAINT IF EXISTS predictor_winner_picks_profile_id_fkey;
    ALTER TABLE predictor_winner_picks 
      ADD CONSTRAINT predictor_winner_picks_profile_id_fkey 
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- predictor_scores (from PREDICTOR-PLAN.md spec)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'predictor_scores') THEN
    ALTER TABLE predictor_scores 
      DROP CONSTRAINT IF EXISTS predictor_scores_profile_id_fkey;
    ALTER TABLE predictor_scores 
      ADD CONSTRAINT predictor_scores_profile_id_fkey 
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- predictor_leaderboard_cache (from PREDICTOR-PLAN.md spec)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'predictor_leaderboard_cache') THEN
    ALTER TABLE predictor_leaderboard_cache 
      DROP CONSTRAINT IF EXISTS predictor_leaderboard_cache_profile_id_fkey;
    ALTER TABLE predictor_leaderboard_cache 
      ADD CONSTRAINT predictor_leaderboard_cache_profile_id_fkey 
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. LEAGUE TABLES MIGRATION (generalize to wc26_*)
-- ═══════════════════════════════════════════════════════════════════════════

-- Rename bracket_leagues → wc26_leagues (only if not already renamed)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bracket_leagues') THEN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'wc26_leagues') THEN
      ALTER TABLE bracket_leagues RENAME TO wc26_leagues;
    END IF;
  END IF;
END $$;

-- Add new columns to wc26_leagues
ALTER TABLE wc26_leagues 
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS prize_notes TEXT,
  ADD COLUMN IF NOT EXISTS code_changes_used INTEGER DEFAULT 0;

-- Rename bracket_league_members → wc26_league_members (only if not already renamed)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bracket_league_members') THEN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'wc26_league_members') THEN
      ALTER TABLE bracket_league_members RENAME TO wc26_league_members;
    END IF;
  END IF;
END $$;

-- Add profile_id to wc26_league_members (nullable for now, migration script will backfill)
ALTER TABLE wc26_league_members 
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_wc26_league_members_profile_id ON wc26_league_members(profile_id);

-- League code history table (for code changes)
CREATE TABLE IF NOT EXISTS wc26_league_code_history (
  id              BIGSERIAL PRIMARY KEY,
  league_id       UUID NOT NULL REFERENCES wc26_leagues(id) ON DELETE CASCADE,
  old_code        TEXT NOT NULL,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wc26_league_code_history_league_id ON wc26_league_code_history(league_id);
CREATE INDEX IF NOT EXISTS idx_wc26_league_code_history_old_code ON wc26_league_code_history(old_code, expires_at);

-- RLS for league tables
ALTER TABLE wc26_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE wc26_league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE wc26_league_code_history ENABLE ROW LEVEL SECURITY;

-- wc26_leagues policies
DROP POLICY IF EXISTS "wc26_leagues_service_role_all" ON wc26_leagues;
CREATE POLICY "wc26_leagues_service_role_all" 
  ON wc26_leagues FOR ALL 
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "wc26_leagues_anon_select" ON wc26_leagues;
CREATE POLICY "wc26_leagues_anon_select" 
  ON wc26_leagues FOR SELECT 
  USING (true);

-- wc26_league_members policies
DROP POLICY IF EXISTS "wc26_league_members_service_role_all" ON wc26_league_members;
CREATE POLICY "wc26_league_members_service_role_all" 
  ON wc26_league_members FOR ALL 
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "wc26_league_members_anon_select" ON wc26_league_members;
CREATE POLICY "wc26_league_members_anon_select" 
  ON wc26_league_members FOR SELECT 
  USING (true);

-- wc26_league_code_history policies
DROP POLICY IF EXISTS "wc26_league_code_history_service_role_all" ON wc26_league_code_history;
CREATE POLICY "wc26_league_code_history_service_role_all" 
  ON wc26_league_code_history FOR ALL 
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "wc26_league_code_history_anon_select" ON wc26_league_code_history;
CREATE POLICY "wc26_league_code_history_anon_select" 
  ON wc26_league_code_history FOR SELECT 
  USING (true);


-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════
-- Next step: Run scripts/migrate-bracket-users-to-accounts.ts manually when ready
-- to migrate existing bracket_users → accounts + profiles
