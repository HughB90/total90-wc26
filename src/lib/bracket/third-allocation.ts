// FIFA World Cup 2026 — Best 3rd-Place Bracket Allocation Table.
// Source: Annex C of the FIFA 2026 tournament regulations, published on
// Wikipedia Template:2026_FIFA_World_Cup_third-place_table (495 combinations).
// Each key is the sorted comma-joined letters of the 8 groups whose 3rd-placed
// teams advanced. The value is an 8-element array of group letters, one per
// "winner-vs-3rd" slot, in the FIFA bracket order:
//   slot[0] → Match 79 (1A vs 3?)
//   slot[1] → Match 85 (1B vs 3?)
//   slot[2] → Match 81 (1D vs 3?)
//   slot[3] → Match 74 (1E vs 3?)
//   slot[4] → Match 82 (1G vs 3?)
//   slot[5] → Match 77 (1I vs 3?)
//   slot[6] → Match 87 (1K vs 3?)
//   slot[7] → Match 80 (1L vs 3?)
// (FIFA's official slot order is 1A / 1B / 1D / 1E / 1G / 1I / 1K / 1L.)

import allocation from './third-allocation.json'

export const THIRD_ALLOCATION = allocation as unknown as Record<string, [string, string, string, string, string, string, string, string]>

/**
 * Given the 8 groups whose 3rd-place team advanced (any order), returns the
 * 8 group letters whose 3rd-placed team fills each "winner-vs-3rd" slot in
 * FIFA bracket order: [1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L].
 *
 * @returns the 8 letters, or null if the input is invalid.
 */
export function lookupThirdAllocation(groups: string[]): [string, string, string, string, string, string, string, string] | null {
  if (!Array.isArray(groups) || groups.length !== 8) return null
  const key = [...groups].sort().join(',')
  return THIRD_ALLOCATION[key] ?? null
}
