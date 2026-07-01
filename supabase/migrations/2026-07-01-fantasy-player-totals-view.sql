-- fantasy_player_totals
--
-- Postgres view that aggregates fantasy_player_match_stats into per-player
-- totals for a given competition. Owning source-of-truth for every "total"
-- number the /fantasy page shows.
--
-- Why: prior aggregation ran in the API layer (Node loop over
-- Supabase rows). Two bugs already shipped from that pattern:
--   1. Default 1000-row page limit silently dropped rows past index 1000.
--   2. Any player-metadata drift (pos_type, team) across matches was
--      resolved by "first row wins", which is fragile.
--
-- Rule (Hugh 2026-07-01): "make the database auto calculate the sums".
-- All totals live here. The API becomes a thin projection.

DROP VIEW IF EXISTS fantasy_player_totals CASCADE;

CREATE VIEW fantasy_player_totals AS
WITH latest_meta AS (
  -- Pick the most recent per-player row for name/team/position so we
  -- always show the up-to-date metadata (a player traded positions
  -- between MDs shouldn't stick with MD1's label).
  SELECT DISTINCT ON (competition_id, opta_player_id)
    competition_id,
    opta_player_id,
    name,
    first_name,
    last_name,
    team,
    position,
    pos_type
  FROM fantasy_player_match_stats
  ORDER BY competition_id, opta_player_id, updated_at DESC NULLS LAST
),
agg AS (
  SELECT
    s.competition_id,
    s.opta_player_id,
    COUNT(*)::int                                              AS games_played,
    COALESCE(SUM(s.mins), 0)::int                              AS mins_total,
    ROUND(COALESCE(SUM(s.fantasy_points), 0)::numeric, 2)      AS fantasy_points_total,
    ROUND((COALESCE(SUM(s.fantasy_points), 0) / NULLIF(COUNT(*), 0))::numeric, 2)
                                                               AS fantasy_points_avg,
    ROUND((COALESCE(SUM(s.fantasy_points), 0) * 90
           / NULLIF(SUM(s.mins), 0))::numeric, 2)              AS fantasy_points_per_90,

    -- Attacking
    COALESCE(SUM((s.raw_stats->>'goals')::numeric),               0)::int AS goals,
    COALESCE(SUM((s.raw_stats->>'goalAssist')::numeric),          0)::int AS assists,
    COALESCE(SUM((s.raw_stats->>'ontargetScoringAtt')::numeric),  0)::int AS sot,
    COALESCE(SUM((s.raw_stats->>'totalScoringAtt')::numeric),     0)::int AS sh,
    COALESCE(SUM((s.raw_stats->>'totalAttAssist')::numeric),      0)::int AS kp,
    COALESCE(SUM((s.raw_stats->>'bigChanceCreated')::numeric),    0)::int AS bc,

    -- Defensive
    COALESCE(SUM((s.raw_stats->>'wonTackle')::numeric),           0)::int AS tackles,
    COALESCE(SUM((s.raw_stats->>'interceptionWon')::numeric),     0)::int AS interceptions,
    COALESCE(SUM((s.raw_stats->>'outfielderBlock')::numeric),     0)::int AS blocks,
    COALESCE(SUM((s.raw_stats->>'cleanSheet')::numeric),          0)::int AS clean_sheets,

    -- Discipline
    COALESCE(SUM((s.raw_stats->>'yellowCard')::numeric),          0)::int AS yc,
    COALESCE(SUM((s.raw_stats->>'redCard')::numeric),             0)::int AS rc,
    COALESCE(SUM((s.raw_stats->>'ownGoals')::numeric),            0)::int AS og,
    COALESCE(SUM((s.raw_stats->>'totalOffside')::numeric),        0)::int AS off_,

    -- Passing
    COALESCE(SUM((s.raw_stats->>'totalPass')::numeric),           0)::int AS total_pass,
    COALESCE(SUM((s.raw_stats->>'accuratePass')::numeric),        0)::int AS accurate_pass,
    COALESCE(SUM((s.raw_stats->>'accurateLongBalls')::numeric),   0)::int AS acc_long,
    COALESCE(SUM((s.raw_stats->>'accuratePassAtt')::numeric),     0)::int AS ppa,
    COALESCE(SUM((s.raw_stats->>'finalThirdEntries')::numeric),   0)::int AS ft3,

    -- Playmaker
    COALESCE(SUM((s.raw_stats->>'accurateThroughBalls')::numeric),0)::int AS through_balls,
    COALESCE(SUM((s.raw_stats->>'touchesInOppBox')::numeric),     0)::int AS touches_in_box,
    COALESCE(SUM((s.raw_stats->>'gameWinningGoal')::numeric),     0)::int AS winning_goals,

    -- Possession
    COALESCE(SUM((s.raw_stats->>'ballRecovery')::numeric),        0)::int AS recoveries,
    COALESCE(SUM((s.raw_stats->>'duelWon')::numeric),             0)::int AS duels_won,
    COALESCE(SUM((s.raw_stats->>'wasDispossessed')::numeric),     0)::int AS dispossessed,
    COALESCE(SUM((s.raw_stats->>'possLostAll')::numeric),         0)::int AS poss_lost,

    -- GK
    COALESCE(SUM((s.raw_stats->>'saves')::numeric),               0)::int AS saves,
    COALESCE(SUM((s.raw_stats->>'goodHighClaim')::numeric),       0)::int AS high_claims,
    COALESCE(SUM((s.raw_stats->>'penaltySave')::numeric),         0)::int AS pen_saves
  FROM fantasy_player_match_stats s
  GROUP BY s.competition_id, s.opta_player_id
)
SELECT
  a.competition_id,
  a.opta_player_id,
  m.name,
  m.first_name,
  m.last_name,
  m.team,
  m.position,
  m.pos_type,
  a.games_played,
  a.mins_total,
  a.fantasy_points_total,
  a.fantasy_points_avg,
  a.fantasy_points_per_90,
  a.goals, a.assists, a.sot, a.sh, a.kp, a.bc,
  a.tackles, a.interceptions, a.blocks, a.clean_sheets,
  a.yc, a.rc, a.og, a.off_,
  a.total_pass, a.accurate_pass,
  CASE WHEN a.total_pass > 0
       THEN ROUND((a.accurate_pass::numeric * 100 / a.total_pass), 0)::int
       ELSE 0
  END AS pass_acc,
  a.acc_long, a.ppa, a.ft3,
  a.through_balls, a.touches_in_box, a.winning_goals,
  a.recoveries, a.duels_won, a.dispossessed, a.poss_lost,
  a.saves, a.high_claims, a.pen_saves
FROM agg a
LEFT JOIN latest_meta m
  ON  m.competition_id = a.competition_id
  AND m.opta_player_id = a.opta_player_id;

-- The view inherits RLS from the underlying table. The service_role
-- key used by the API bypasses RLS anyway, so no policy required.

COMMENT ON VIEW fantasy_player_totals IS
  'Per-player fantasy totals aggregated from fantasy_player_match_stats. '
  'Always fresh (regular view, not materialized). Source of truth for '
  'the /fantasy leaderboard. Owning migration: 2026-07-01.';

-- Round-scoped variant. Same shape, extra round_code column so the API
-- can filter by MD without doing its own aggregation.
DROP VIEW IF EXISTS fantasy_player_round_totals CASCADE;

CREATE VIEW fantasy_player_round_totals AS
WITH src AS (
  SELECT s.*, f.round_code
  FROM fantasy_player_match_stats s
  JOIN fantasy_fixtures f ON f.id = s.fixture_id
),
latest_meta AS (
  SELECT DISTINCT ON (competition_id, round_code, opta_player_id)
    competition_id, round_code, opta_player_id,
    name, first_name, last_name, team, position, pos_type
  FROM src
  ORDER BY competition_id, round_code, opta_player_id, updated_at DESC NULLS LAST
),
agg AS (
  SELECT
    s.competition_id, s.round_code, s.opta_player_id,
    COUNT(*)::int                                              AS games_played,
    COALESCE(SUM(s.mins), 0)::int                              AS mins_total,
    ROUND(COALESCE(SUM(s.fantasy_points), 0)::numeric, 2)      AS fantasy_points_total,
    ROUND((COALESCE(SUM(s.fantasy_points), 0) / NULLIF(COUNT(*), 0))::numeric, 2) AS fantasy_points_avg,
    ROUND((COALESCE(SUM(s.fantasy_points), 0) * 90 / NULLIF(SUM(s.mins), 0))::numeric, 2) AS fantasy_points_per_90,
    COALESCE(SUM((s.raw_stats->>'goals')::numeric),               0)::int AS goals,
    COALESCE(SUM((s.raw_stats->>'goalAssist')::numeric),          0)::int AS assists,
    COALESCE(SUM((s.raw_stats->>'ontargetScoringAtt')::numeric),  0)::int AS sot,
    COALESCE(SUM((s.raw_stats->>'totalScoringAtt')::numeric),     0)::int AS sh,
    COALESCE(SUM((s.raw_stats->>'totalAttAssist')::numeric),      0)::int AS kp,
    COALESCE(SUM((s.raw_stats->>'bigChanceCreated')::numeric),    0)::int AS bc,
    COALESCE(SUM((s.raw_stats->>'wonTackle')::numeric),           0)::int AS tackles,
    COALESCE(SUM((s.raw_stats->>'interceptionWon')::numeric),     0)::int AS interceptions,
    COALESCE(SUM((s.raw_stats->>'outfielderBlock')::numeric),     0)::int AS blocks,
    COALESCE(SUM((s.raw_stats->>'cleanSheet')::numeric),          0)::int AS clean_sheets,
    COALESCE(SUM((s.raw_stats->>'yellowCard')::numeric),          0)::int AS yc,
    COALESCE(SUM((s.raw_stats->>'redCard')::numeric),             0)::int AS rc,
    COALESCE(SUM((s.raw_stats->>'ownGoals')::numeric),            0)::int AS og,
    COALESCE(SUM((s.raw_stats->>'totalOffside')::numeric),        0)::int AS off_,
    COALESCE(SUM((s.raw_stats->>'totalPass')::numeric),           0)::int AS total_pass,
    COALESCE(SUM((s.raw_stats->>'accuratePass')::numeric),        0)::int AS accurate_pass,
    COALESCE(SUM((s.raw_stats->>'accurateLongBalls')::numeric),   0)::int AS acc_long,
    COALESCE(SUM((s.raw_stats->>'accuratePassAtt')::numeric),     0)::int AS ppa,
    COALESCE(SUM((s.raw_stats->>'finalThirdEntries')::numeric),   0)::int AS ft3,
    COALESCE(SUM((s.raw_stats->>'accurateThroughBalls')::numeric),0)::int AS through_balls,
    COALESCE(SUM((s.raw_stats->>'touchesInOppBox')::numeric),     0)::int AS touches_in_box,
    COALESCE(SUM((s.raw_stats->>'gameWinningGoal')::numeric),     0)::int AS winning_goals,
    COALESCE(SUM((s.raw_stats->>'ballRecovery')::numeric),        0)::int AS recoveries,
    COALESCE(SUM((s.raw_stats->>'duelWon')::numeric),             0)::int AS duels_won,
    COALESCE(SUM((s.raw_stats->>'wasDispossessed')::numeric),     0)::int AS dispossessed,
    COALESCE(SUM((s.raw_stats->>'possLostAll')::numeric),         0)::int AS poss_lost,
    COALESCE(SUM((s.raw_stats->>'saves')::numeric),               0)::int AS saves,
    COALESCE(SUM((s.raw_stats->>'goodHighClaim')::numeric),       0)::int AS high_claims,
    COALESCE(SUM((s.raw_stats->>'penaltySave')::numeric),         0)::int AS pen_saves
  FROM src s
  GROUP BY s.competition_id, s.round_code, s.opta_player_id
)
SELECT
  a.competition_id, a.round_code, a.opta_player_id,
  m.name, m.first_name, m.last_name, m.team, m.position, m.pos_type,
  a.games_played, a.mins_total, a.fantasy_points_total, a.fantasy_points_avg, a.fantasy_points_per_90,
  a.goals, a.assists, a.sot, a.sh, a.kp, a.bc,
  a.tackles, a.interceptions, a.blocks, a.clean_sheets,
  a.yc, a.rc, a.og, a.off_,
  a.total_pass, a.accurate_pass,
  CASE WHEN a.total_pass > 0 THEN ROUND((a.accurate_pass::numeric * 100 / a.total_pass), 0)::int ELSE 0 END AS pass_acc,
  a.acc_long, a.ppa, a.ft3,
  a.through_balls, a.touches_in_box, a.winning_goals,
  a.recoveries, a.duels_won, a.dispossessed, a.poss_lost,
  a.saves, a.high_claims, a.pen_saves
FROM agg a
LEFT JOIN latest_meta m
  ON  m.competition_id = a.competition_id
  AND m.round_code     = a.round_code
  AND m.opta_player_id = a.opta_player_id;

COMMENT ON VIEW fantasy_player_round_totals IS
  'Same as fantasy_player_totals but keyed additionally by round_code, '
  'so the API can serve per-MD leaderboards without doing its own aggregation.';
