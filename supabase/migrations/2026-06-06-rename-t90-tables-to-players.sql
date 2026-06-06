-- 2026-06-06: Rename t90_players → players, t90_player_intelligence → player_intelligence
--
-- Context: schema-split migration (2026-06-06-schema-split-players-intel.sql) first attempted
-- bare names `players` / `player_intelligence` but collided with LeagueReg's existing
-- public.players (youth roster). We renamed the new tables to `t90_*` prefixed names.
--
-- LeagueReg has since renamed `players` → `youth_players` (separate migration in the
-- leaguereg repo), freeing the `public.players` name slot. This migration consolidates
-- the schema-split tables under the clean names.
--
-- Coordination guard: the apply script (scripts/apply-t90-to-players-rename.js) checks
-- that `public.players` is empty (or absent) before running. If LeagueReg hasn't applied
-- its rename yet, this ALTER will fail with "relation already exists" and the script
-- aborts.
-- ============================================================

-- 1. Rename tables
ALTER TABLE public.t90_players              RENAME TO players;
ALTER TABLE public.t90_player_intelligence  RENAME TO player_intelligence;

-- 2. Rename indexes whose name starts with t90_
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename IN ('players','player_intelligence')
       AND indexname LIKE 't90_%'
  LOOP
    EXECUTE format('ALTER INDEX public.%I RENAME TO %I',
                   r.indexname,
                   replace(r.indexname, 't90_', ''));
  END LOOP;
END $$;

-- 3. Rename constraints whose name starts with t90_
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname, conrelid::regclass::text AS tbl
      FROM pg_constraint
     WHERE conrelid::regclass::text IN (
             'public.players',
             'public.player_intelligence',
             'public.wc26_matches'
           )
       AND conname LIKE 't90_%'
  LOOP
    EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
                   r.tbl, r.conname, replace(r.conname, 't90_', ''));
  END LOOP;
END $$;

-- 4. Refresh table/column comments to drop "t90_" wording
COMMENT ON TABLE  public.players IS 'Universal Total90 player roster. Split from s3_players 2026-06-06, renamed 2026-06-06.';
COMMENT ON TABLE  public.player_intelligence IS 'Total90 brain layer: T90 scores, FIFA overlays, S3 vote counters. Split from s3_players 2026-06-06, renamed 2026-06-06.';

-- 5. Sanity counts
SELECT 'players: ' || COUNT(*)::text FROM players;
SELECT 'player_intelligence: ' || COUNT(*)::text FROM player_intelligence;
SELECT 'wc26_matches: ' || COUNT(*)::text FROM wc26_matches;
