-- Migration: Add admin override flags to s3_players
-- Created: 2026-06-07
-- Purpose: Enable inline editing in /s3/admin with override tracking

ALTER TABLE s3_players 
  ADD COLUMN IF NOT EXISTS admin_override_cat boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_override_t90 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_override_xi boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_overridden_at timestamptz;

-- Add comments for clarity
COMMENT ON COLUMN s3_players.admin_override_cat IS 'True when cat_score was manually overridden via admin UI';
COMMENT ON COLUMN s3_players.admin_override_t90 IS 'True when t90_score was manually overridden via admin UI';
COMMENT ON COLUMN s3_players.admin_override_xi IS 'True when starting_xi was manually overridden via admin UI';
COMMENT ON COLUMN s3_players.admin_overridden_at IS 'Timestamp of most recent admin override';

-- Create index for faster queries on overridden rows
CREATE INDEX IF NOT EXISTS idx_s3_players_overrides 
  ON s3_players(admin_overridden_at) 
  WHERE admin_overridden_at IS NOT NULL;
