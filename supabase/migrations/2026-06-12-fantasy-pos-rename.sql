-- Rename pos_type abbreviations: GK -> GKP, FWD -> FOR
-- Per Hugh 2026-06-12: standardize on GKP / DEF / MID / FOR across the fantasy stack.
-- DEF and MID are unchanged.

UPDATE fantasy_player_match_stats SET pos_type = 'GKP' WHERE pos_type = 'GK';
UPDATE fantasy_player_match_stats SET pos_type = 'FOR' WHERE pos_type = 'FWD';

-- Optional: enforce via CHECK constraint going forward
ALTER TABLE fantasy_player_match_stats
  DROP CONSTRAINT IF EXISTS fantasy_player_match_stats_pos_type_check;

ALTER TABLE fantasy_player_match_stats
  ADD CONSTRAINT fantasy_player_match_stats_pos_type_check
  CHECK (pos_type IN ('GKP', 'DEF', 'MID', 'FOR'));
