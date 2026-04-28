-- Run this in Supabase SQL Editor

-- Bracket config: controls lock state for each phase
CREATE TABLE IF NOT EXISTS bracket_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed initial config
INSERT INTO bracket_config (key, value) VALUES
  ('group_stage_locked', 'false'),
  ('knockout_locked', 'true'),
  ('group_results', '{}'),   -- admin enters: { "A": ["Spain","Morocco","France","Belgium"], "B": [...], ... }
  ('third_results', '[]')    -- admin enters: ["Spain","Morocco",...] — the 8 qualifying 3rd-place teams
ON CONFLICT (key) DO NOTHING;

-- Make it publicly readable (bracket users need to read config)
ALTER TABLE bracket_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bracket_config readable by all" ON bracket_config FOR SELECT USING (true);
CREATE POLICY "bracket_config writable by service role" ON bracket_config FOR ALL USING (auth.role() = 'service_role');

-- bracket_users table: add first_name column if not already done
ALTER TABLE bracket_users ADD COLUMN IF NOT EXISTS first_name TEXT;

-- league_registrations: add missing columns if not already done  
ALTER TABLE league_registrations 
  ADD COLUMN IF NOT EXISTS registration_type TEXT NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS ringer_available_matchdays INTEGER[] DEFAULT '{}';
