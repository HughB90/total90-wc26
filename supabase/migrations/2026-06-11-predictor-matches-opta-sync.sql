-- ============================================================================
-- 2026-06-11: predictor_matches Opta-sync columns
--
-- Adds the minimal extra columns needed to feed live Opta data into the
-- existing predictor_matches table. This table is the canonical fixtures
-- source for the bracket, predictor, /scores page, etc. See
-- docs/ADR-001-fixtures-canonical.md.
--
-- All ALTERs are IF NOT EXISTS / idempotent. Safe to re-run.
-- ============================================================================

-- Opta fixture id (populated on first successful match-up by the cron).
alter table predictor_matches add column if not exists opta_fixture_id text;

-- Last time the row was touched by the Opta sync.
alter table predictor_matches add column if not exists last_synced_at timestamptz;

-- Live game period: '1H' | 'HT' | '2H' | 'ET' | 'PEN' | 'FT' | 'POSTPONED' | null
alter table predictor_matches add column if not exists period text;

-- In-play minute (0..120+). Null when not live.
alter table predictor_matches add column if not exists minute int;

-- Index for fast cron lookups by Opta id (and uniqueness — one Opta fixture
-- maps to exactly one of our rows).
create unique index if not exists idx_predictor_matches_opta
  on predictor_matches (opta_fixture_id)
  where opta_fixture_id is not null;
