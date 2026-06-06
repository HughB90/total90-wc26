-- 2026-06-06: Add wc26_participant flag to s3_players
-- Marks players who are on a final WC 2026 squad (sourced from WC T90 Scores sheet).
-- Used by /s3 to filter the voting pool to active WC participants only.

ALTER TABLE public.s3_players
  ADD COLUMN IF NOT EXISTS wc26_participant boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS s3_players_wc26_participant_idx
  ON public.s3_players(wc26_participant);

COMMENT ON COLUMN public.s3_players.wc26_participant IS
  'true = on a final WC 2026 squad (per WC T90 Scores sheet, synced 2026-06-06+). Use to filter voting pool.';
