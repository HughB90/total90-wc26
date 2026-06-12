-- Fantasy Stats Tables for Multi-Tournament Support
-- WC2026, Euro2024, WC2022, etc.

-- Competitions table (tournaments we track fantasy stats for)
CREATE TABLE IF NOT EXISTS fantasy_competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- 'WC2026', 'EURO2024', 'WC2022'
  name TEXT NOT NULL,
  opta_tmcl TEXT NOT NULL, -- Opta tournament calendar UUID
  season TEXT, -- '2026', '2024', '2022'
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fixtures (matches that have been played)
CREATE TABLE IF NOT EXISTS fantasy_fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES fantasy_competitions(id) ON DELETE CASCADE,
  opta_fixture_id TEXT NOT NULL,
  date DATE NOT NULL,
  round_code TEXT NOT NULL, -- 'WC2026-MD1', 'WC2026-R16', etc.
  round_name TEXT, -- 'Matchday 1', 'Round of 16'
  stage TEXT, -- 'Group', 'Knockout'
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INT,
  away_score INT,
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'live', 'played'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competition_id, opta_fixture_id)
);

-- Player match stats (one row per player per match)
CREATE TABLE IF NOT EXISTS fantasy_player_match_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES fantasy_competitions(id) ON DELETE CASCADE,
  fixture_id UUID REFERENCES fantasy_fixtures(id) ON DELETE CASCADE,
  opta_player_id TEXT NOT NULL,
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  position TEXT, -- Original Opta position string
  pos_type TEXT NOT NULL, -- 'GKP', 'DEF', 'MID', 'FOR'
  mins INT NOT NULL DEFAULT 0,
  fantasy_points DECIMAL(10,2) NOT NULL DEFAULT 0,
  breakdown JSONB, -- v1.4 breakdown by endpoint (e.g. { "goals": 7, "assist": 5 })
  raw_stats JSONB, -- Raw Opta stats map
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fixture_id, opta_player_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_fantasy_fixtures_competition ON fantasy_fixtures(competition_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_fixtures_round ON fantasy_fixtures(competition_id, round_code);
CREATE INDEX IF NOT EXISTS idx_fantasy_player_stats_competition ON fantasy_player_match_stats(competition_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_player_stats_opta_id ON fantasy_player_match_stats(opta_player_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_player_stats_points ON fantasy_player_match_stats(fantasy_points DESC);
CREATE INDEX IF NOT EXISTS idx_fantasy_player_stats_fixture ON fantasy_player_match_stats(fixture_id);

-- RLS policies (public read for now, server-only write via service role)
ALTER TABLE fantasy_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_player_match_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fantasy_competitions_public_read" ON fantasy_competitions FOR SELECT USING (true);
CREATE POLICY "fantasy_fixtures_public_read" ON fantasy_fixtures FOR SELECT USING (true);
CREATE POLICY "fantasy_player_match_stats_public_read" ON fantasy_player_match_stats FOR SELECT USING (true);

-- Seed competitions
INSERT INTO fantasy_competitions (code, name, opta_tmcl, season, active)
VALUES
  ('WC2026', 'FIFA World Cup 2026', '873cbl9cd9butm4air0mugxzo', '2026', true),
  ('EURO2024', 'UEFA Euro 2024', 'EURO2024_TMCL_PLACEHOLDER', '2024', false),
  ('WC2022', 'FIFA World Cup 2022', 'WC2022_TMCL_PLACEHOLDER', '2022', false)
ON CONFLICT (code) DO NOTHING;
