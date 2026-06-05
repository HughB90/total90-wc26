/**
 * Opta Power Ratings — WC2026 Group Stage
 *
 * Source: Opta Analyst chart, captured 2026-06-05 (image from Hugh).
 * Used to compute "Group Strength" as the average rating of the OTHER 3
 * teams in a given team's group (i.e. opponent strength, not including self).
 *
 * Lower group_strength = easier group. Higher = group of death.
 *
 * Locked: 2026-06-05. If Opta publishes a refresh, replace this whole file
 * and rerun the deriveGroupStrength() helper.
 */

export type OptaRating = {
  nation: string;       // canonical name matching s3_players.nationality
  rating: number;       // 0-100 Opta Power Rating
  group: string;        // A..L
};

export const OPTA_POWER_RATINGS: OptaRating[] = [
  // Group A
  { nation: 'Mexico',              rating: 81.0, group: 'A' },
  { nation: 'Korea Republic',      rating: 76.4, group: 'A' },
  { nation: 'Czechia',             rating: 73.0, group: 'A' },
  { nation: 'South Africa',        rating: 66.1, group: 'A' },
  // Group B
  { nation: 'Switzerland',         rating: 83.8, group: 'B' },
  { nation: 'Canada',              rating: 74.7, group: 'B' },
  { nation: 'Bosnia-Herzegovina',  rating: 62.9, group: 'B' },
  { nation: 'Qatar',               rating: 62.0, group: 'B' },
  // Group C
  { nation: 'Brazil',              rating: 92.2, group: 'C' },
  { nation: 'Morocco',             rating: 85.3, group: 'C' },
  { nation: 'Scotland',            rating: 73.0, group: 'C' },
  { nation: 'Haiti',               rating: 57.1, group: 'C' },
  // Group D
  { nation: 'Türkiye',             rating: 81.8, group: 'D' },
  { nation: 'Paraguay',            rating: 78.2, group: 'D' },
  { nation: 'Australia',           rating: 78.1, group: 'D' },
  { nation: 'United States',       rating: 75.3, group: 'D' },
  // Group E
  { nation: 'Germany',             rating: 89.6, group: 'E' },
  { nation: 'Ecuador',             rating: 85.1, group: 'E' },
  { nation: 'Côte d\'Ivoire',      rating: 72.6, group: 'E' },
  { nation: 'Curaçao',             rating: 49.5, group: 'E' },
  // Group F
  { nation: 'Netherlands',         rating: 89.6, group: 'F' },
  { nation: 'Japan',               rating: 84.3, group: 'F' },
  { nation: 'Sweden',              rating: 71.3, group: 'F' },
  { nation: 'Tunisia',             rating: 70.6, group: 'F' },
  // Group G
  { nation: 'Belgium',             rating: 86.5, group: 'G' },
  { nation: 'IR Iran',             rating: 79.0, group: 'G' },
  { nation: 'Egypt',               rating: 72.2, group: 'G' },
  { nation: 'New Zealand',         rating: 63.6, group: 'G' },
  // Group H
  { nation: 'Spain',               rating: 100.0, group: 'H' },
  { nation: 'Uruguay',             rating: 84.8, group: 'H' },
  { nation: 'Saudi Arabia',        rating: 64.0, group: 'H' },
  { nation: 'Cabo Verde',          rating: 64.0, group: 'H' },
  // Group I
  { nation: 'France',              rating: 98.6, group: 'I' },
  { nation: 'Senegal',             rating: 81.7, group: 'I' },
  { nation: 'Norway',              rating: 80.1, group: 'I' },
  { nation: 'Iraq',                rating: 66.9, group: 'I' },
  // Group J
  { nation: 'Argentina',           rating: 98.5, group: 'J' },
  { nation: 'Austria',             rating: 78.6, group: 'J' },
  { nation: 'Algeria',             rating: 75.4, group: 'J' },
  { nation: 'Jordan',              rating: 69.5, group: 'J' },
  // Group K
  { nation: 'Colombia',            rating: 90.7, group: 'K' },
  { nation: 'Portugal',            rating: 89.4, group: 'K' },
  { nation: 'Uzbekistan',          rating: 73.1, group: 'K' },
  { nation: 'Congo DR',            rating: 70.8, group: 'K' },
  // Group L
  { nation: 'England',             rating: 93.1, group: 'L' },
  { nation: 'Croatia',             rating: 84.9, group: 'L' },
  { nation: 'Panama',              rating: 71.4, group: 'L' },
  { nation: 'Ghana',               rating: 62.9, group: 'L' },
];

export const OPTA_BY_NATION: Record<string, OptaRating> = Object.fromEntries(
  OPTA_POWER_RATINGS.map(r => [r.nation, r])
);

/**
 * Group Strength = average Opta rating of the OTHER 3 teams in your group.
 * (i.e. how strong are your opponents, NOT including yourself)
 *
 * Brazil example: Brazil 92.2, Morocco 85.3, Scotland 73.0, Haiti 57.1
 *   → Brazil's group_strength = (85.3 + 73.0 + 57.1) / 3 = 71.8
 */
export function groupStrengthFor(nation: string): number | null {
  const me = OPTA_BY_NATION[nation];
  if (!me) return null;
  const others = OPTA_POWER_RATINGS.filter(r => r.group === me.group && r.nation !== nation);
  if (others.length === 0) return null;
  return Math.round((others.reduce((a, b) => a + b.rating, 0) / others.length) * 10) / 10;
}

export function nationGroup(nation: string): string | null {
  return OPTA_BY_NATION[nation]?.group ?? null;
}

export function nationOptaRating(nation: string): number | null {
  return OPTA_BY_NATION[nation]?.rating ?? null;
}
