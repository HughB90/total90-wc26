-- 2026-06-06: Schema split — t90_players / t90_player_intelligence / wc26_matches
--
-- Splits the monolithic s3_players table into 3 cleaner concerns:
--   t90_players              — universal roster (identity, demographics, photo)
--   t90_player_intelligence  — Total90 brain (T90, FIFA, voting counters)
--   wc26_matches             — per-match stats (populated by cron during/after WC)
--
-- NOTE: `players` (no prefix) is reserved for the LeagueReg youth player roster
-- and MUST NOT be touched. We use t90_* prefix for Total90 brand tables.
--
-- s3_players is NOT dropped. Left intact (deprecated, audit-only) for 30 days.
-- s3_value is NOT dropped. Kept as deprecated for safety.
-- s3_votes is NOT dropped. Adds opta_id column for future denormalization.
--
-- API routes will be rewritten to read from the new tables and keep
-- returning the same JSON shape the frontend expects.

BEGIN;

-- ============================================================
-- 1. t90_players
-- ============================================================
CREATE TABLE IF NOT EXISTS public.t90_players (
  opta_id            text PRIMARY KEY,
  full_name          text NOT NULL,
  short_name         text,
  first_name         text,
  last_name          text,
  nationality        text,
  position           text,
  pos_short          text,
  club               text,
  dob                date,
  age                int,
  wc_age             int,
  height_cm          int,
  weight_kg          int,
  photo_url          text,
  wc26_group         text,
  wc26_participant   boolean NOT NULL DEFAULT false,
  wc26_active        boolean NOT NULL DEFAULT true,
  legacy_player_uuid uuid,         -- the original s3_players.id for vote-flow back-compat
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS t90_players_nationality_idx      ON public.t90_players(nationality);
CREATE INDEX IF NOT EXISTS t90_players_pos_short_idx        ON public.t90_players(pos_short);
CREATE INDEX IF NOT EXISTS t90_players_wc26_group_idx       ON public.t90_players(wc26_group);
CREATE INDEX IF NOT EXISTS t90_players_wc26_active_idx      ON public.t90_players(wc26_active);
CREATE INDEX IF NOT EXISTS t90_players_wc26_participant_idx ON public.t90_players(wc26_participant);
CREATE INDEX IF NOT EXISTS t90_players_legacy_uuid_idx      ON public.t90_players(legacy_player_uuid);

COMMENT ON TABLE  public.t90_players IS 'Universal Total90 player roster. Split from s3_players 2026-06-06.';
COMMENT ON COLUMN public.t90_players.wc26_active IS 'false = deprecated legacy-numeric-opta duplicate. Exclude from voting pool.';
COMMENT ON COLUMN public.t90_players.legacy_player_uuid IS 'Original s3_players.id (for back-compat with s3_votes UUID FKs).';

-- ============================================================
-- 2. t90_player_intelligence
-- ============================================================
CREATE TABLE IF NOT EXISTS public.t90_player_intelligence (
  opta_id            text PRIMARY KEY REFERENCES public.t90_players(opta_id) ON DELETE CASCADE,
  t90_score          numeric,
  cat_score          numeric,
  tenk_score         int,
  tenk_dynasty       int,
  starting_xi        int CHECK (starting_xi IS NULL OR starting_xi IN (1,2,3)),
  fifa_overall       int,
  fifa_potential     int,
  fifa_match_status  text,
  sign_count         int NOT NULL DEFAULT 0,
  sell_count         int NOT NULL DEFAULT 0,
  sack_count         int NOT NULL DEFAULT 0,
  vote_count         int NOT NULL DEFAULT 0,
  t90_rank           int,
  t90_updated_at     timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS t90_player_intel_t90_score_idx ON public.t90_player_intelligence(t90_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS t90_player_intel_t90_rank_idx  ON public.t90_player_intelligence(t90_rank);

COMMENT ON TABLE public.t90_player_intelligence IS 'Total90 brain layer: T90 scores, FIFA overlays, S3 vote counters. Split from s3_players 2026-06-06.';

-- ============================================================
-- 3. wc26_matches
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wc26_matches (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opta_id              text NOT NULL REFERENCES public.t90_players(opta_id) ON DELETE CASCADE,
  round                text NOT NULL CHECK (round IN ('group_md1','group_md2','group_md3','r32','r16','qf','sf','3rd','final')),
  fixture_id           text,
  opponent_nation      text,
  team_score           int,
  opponent_score       int,
  result               text CHECK (result IN ('W','D','L')),
  minutes              int NOT NULL DEFAULT 0,
  goals                int NOT NULL DEFAULT 0,
  assists              int NOT NULL DEFAULT 0,
  second_assists       int NOT NULL DEFAULT 0,
  shots                int NOT NULL DEFAULT 0,
  shots_on_target      int NOT NULL DEFAULT 0,
  key_passes           int NOT NULL DEFAULT 0,
  big_chances_created  int NOT NULL DEFAULT 0,
  tackles              int NOT NULL DEFAULT 0,
  interceptions        int NOT NULL DEFAULT 0,
  blocks               int NOT NULL DEFAULT 0,
  clearances           int NOT NULL DEFAULT 0,
  saves                int NOT NULL DEFAULT 0,
  clean_sheet          boolean NOT NULL DEFAULT false,
  yellow_cards         int NOT NULL DEFAULT 0,
  red_cards            int NOT NULL DEFAULT 0,
  own_goals            int NOT NULL DEFAULT 0,
  penalty_won          int NOT NULL DEFAULT 0,
  penalty_conceded     int NOT NULL DEFAULT 0,
  xg                   numeric NOT NULL DEFAULT 0,
  xa                   numeric NOT NULL DEFAULT 0,
  raw_stats            jsonb,
  fantasy_points       numeric,
  scoring_version      text NOT NULL DEFAULT 'v1.4',
  played_at            timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opta_id, round)
);

CREATE INDEX IF NOT EXISTS wc26_matches_opta_id_idx  ON public.wc26_matches(opta_id);
CREATE INDEX IF NOT EXISTS wc26_matches_round_idx    ON public.wc26_matches(round);
CREATE INDEX IF NOT EXISTS wc26_matches_played_at_idx ON public.wc26_matches(played_at DESC);

COMMENT ON TABLE public.wc26_matches IS 'Per-match stats for WC 2026. Populated by cron from Opta during the tournament. Used to compute fantasy_points (v1.4 scoring).';

-- ============================================================
-- 4. s3_votes: denormalize opta_id (cheap, future-proofs voting)
-- ============================================================
ALTER TABLE public.s3_votes
  ADD COLUMN IF NOT EXISTS sign_opta_id text,
  ADD COLUMN IF NOT EXISTS sell_opta_id text,
  ADD COLUMN IF NOT EXISTS sack_opta_id text;

CREATE INDEX IF NOT EXISTS s3_votes_sign_opta_idx ON public.s3_votes(sign_opta_id);
CREATE INDEX IF NOT EXISTS s3_votes_sell_opta_idx ON public.s3_votes(sell_opta_id);
CREATE INDEX IF NOT EXISTS s3_votes_sack_opta_idx ON public.s3_votes(sack_opta_id);

COMMENT ON COLUMN public.s3_votes.sign_opta_id IS 'Denormalized canonical opta_id (added 2026-06-06 with schema split). Future vote writes populate this; legacy rows back-fill from sign_player_id → s3_players.opta_id.';

-- ============================================================
-- 5. Deprecate s3_value (not dropped — flag only)
-- ============================================================
COMMENT ON COLUMN public.s3_players.s3_value IS 'DEPRECATED 2026-06-06: T90 score (player_intelligence.t90_score) is the sole valuation. Plan to drop after 2026-07-06.';

COMMIT;
