-- 2026-06-25 — Add full first/last name to fantasy player match stats so the
-- /fantasy search can find players by their full first name (e.g. typing
-- "Luis" finds "L. Díaz"). Opta's `matchName` (abbreviated, e.g. "L. Díaz")
-- stays in `name` as the display string; `first_name` / `last_name` come
-- from Opta `firstName` / `lastName` on the squads feed.

ALTER TABLE fantasy_player_match_stats
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

CREATE INDEX IF NOT EXISTS idx_fantasy_player_match_stats_first_name
  ON fantasy_player_match_stats (first_name);

CREATE INDEX IF NOT EXISTS idx_fantasy_player_match_stats_last_name
  ON fantasy_player_match_stats (last_name);
