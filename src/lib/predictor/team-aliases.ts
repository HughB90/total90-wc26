/**
 * Team-code alias map.
 *
 * `predictor_matches.home_team_code` / `away_team_code` stores a
 * shorthand for some countries (e.g. "USA") that doesn't match the
 * canonical name used in `s3_players.nationality` and
 * `fantasy_player_match_stats.team` (e.g. "United States").
 *
 * `resolveTeamAliases(code)` returns the FULL set of names that could
 * refer to that country. Callers should use `.in('nationality', names)`
 * (or `.in('team', names)`) so a single query matches either casing/spelling.
 *
 * Also handles a few known name variants that get returned by Opta with
 * different accent/case treatments over time.
 */
const ALIASES: Record<string, string[]> = {
  // Predictor-side shorthand → canonical + fallback variants
  USA: ['United States', 'USA', 'United States of America'],
  'United States': ['United States', 'USA', 'United States of America'],

  "Côte d'Ivoire": ["Côte d'Ivoire", "Cote d'Ivoire", 'Ivory Coast'],
  'Ivory Coast': ["Côte d'Ivoire", "Cote d'Ivoire", 'Ivory Coast'],
  "Cote d'Ivoire": ["Côte d'Ivoire", "Cote d'Ivoire", 'Ivory Coast'],

  'Korea Republic': ['South Korea', 'Korea Republic', 'Korea', 'Republic of Korea'],
  'South Korea': ['South Korea', 'Korea Republic', 'Korea', 'Republic of Korea'],

  'IR Iran': ['Iran', 'IR Iran'],
  Iran: ['Iran', 'IR Iran'],

  'Türkiye': ['Türkiye', 'Turkey'],
  Turkey: ['Türkiye', 'Turkey'],

  'Bosnia and Herzegovina': ['Bosnia & Herzegovina', 'Bosnia and Herzegovina', 'Bosnia-Herzegovina'],
  'Bosnia & Herzegovina': ['Bosnia & Herzegovina', 'Bosnia and Herzegovina', 'Bosnia-Herzegovina'],

  'DR Congo': ['DR Congo', 'Congo DR'],
  'Congo DR': ['DR Congo', 'Congo DR'],

  'Cape Verde': ['Cape Verde', 'Cabo Verde'],
  'Cabo Verde': ['Cape Verde', 'Cabo Verde'],

  'Curaçao': ['Curaçao', 'Curacao'],
  Curacao: ['Curaçao', 'Curacao'],
}

/**
 * Return every canonical name that could refer to `teamCode`.
 * For unknown codes, returns just [teamCode] (identity).
 */
export function resolveTeamAliases(teamCode: string): string[] {
  const trimmed = teamCode.trim()
  return ALIASES[trimmed] ?? [trimmed]
}
