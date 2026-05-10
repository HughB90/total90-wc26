// Pure scoring functions for the WC2026 bracket challenge.
// Zero DB / network calls. Safe to import from server routes, tests, or future
// client-side breakdown views.
//
// Scoring rules (mirrors /bracket Rules tab):
//   Group stage:   2 pts exact position, 1 pt qualified-wrong-position (top 3)
//   3rd place:     1 pt per group letter the user checked whose 3rd-place team
//                  actually qualified as one of the 8 best 3rd-placers
//   Knockouts:     Fibonacci — R32=2, R16=3, QF=5, SF=8, 3rd-place playoff=8, Final=13
//
// All functions must handle missing/undefined results gracefully — they return
// 0 points and 'pending' classifications. They MUST NEVER throw.

import { WC_GROUPS } from './groups'

// ─── Types ────────────────────────────────────────────────────────────────────

export type GroupPicks = Record<string, string[]>     // group letter → [1st, 2nd, 3rd] (4th auto)
export type ThirdPicks = string[]                      // group letters chosen (max 8)
export type KnockoutPicks = Record<string, string>     // matchId → team name

export type BracketResults = {
  group_results?: GroupPicks       // admin truth — same shape as user picks per group
  third_results?: string[]         // team NAMES that qualified as best-3rd (8 teams)
  knockout_results?: KnockoutPicks // matchId → actual winner team name
}

export type GroupTeamPoint = {
  team: string
  userRank: number | null         // 1, 2, 3 (or null for auto-4th)
  actualRank: number | null       // 1, 2, 3, 4 (or null if no results)
  pts: number
  classification: 'exact' | 'qualified' | 'wrong' | 'pending'
}

export type ScoreBreakdown = {
  total: number
  group: {
    perGroup: Record<string, { teamPoints: GroupTeamPoint[]; subtotal: number }>
    subtotal: number
  }
  third: {
    perGroup: Record<string, { userPicked: boolean; qualified: boolean | null; pts: 0 | 1 }>
    subtotal: number
  }
  knockout: {
    perMatch: Record<string, {
      userPick: string | null
      actual: string | null
      pts: number
      round: 'R32' | 'R16' | 'QF' | 'SF' | '3RD' | 'F'
    }>
    subtotal: number
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KNOCKOUT_POINTS: Record<'R32' | 'R16' | 'QF' | 'SF' | '3RD' | 'F', number> = {
  R32: 2,
  R16: 3,
  QF: 5,
  SF: 8,
  '3RD': 8,
  F: 13,
}

export function classifyMatchId(matchId: string): 'R32' | 'R16' | 'QF' | 'SF' | '3RD' | 'F' | null {
  if (matchId === 'FINAL') return 'F'
  if (matchId === 'THIRD') return '3RD'
  if (matchId.startsWith('SF_')) return 'SF'
  if (matchId.startsWith('QF_')) return 'QF'
  if (matchId.startsWith('R16_')) return 'R16'
  // R32 matches are M1..M16 (single 'M' followed by digits)
  if (/^M\d+$/.test(matchId)) return 'R32'
  return null
}

function emptyBreakdown(): ScoreBreakdown {
  return {
    total: 0,
    group: { perGroup: {}, subtotal: 0 },
    third: { perGroup: {}, subtotal: 0 },
    knockout: { perMatch: {}, subtotal: 0 },
  }
}

// ─── Group stage ──────────────────────────────────────────────────────────────

export function computeGroupScore(
  picks: GroupPicks,
  results: GroupPicks | undefined,
): ScoreBreakdown['group'] {
  const perGroup: ScoreBreakdown['group']['perGroup'] = {}
  let subtotal = 0

  const safePicks = picks ?? {}

  for (const group of Object.keys(safePicks)) {
    const ranked = (safePicks[group] ?? []).filter(t => typeof t === 'string' && t.length > 0)
    const teams = WC_GROUPS[group] ?? []
    const auto4th = teams.find(t => !ranked.includes(t)) ?? null
    const groupResults = results?.[group]
    const top3 = groupResults ? groupResults.slice(0, 3) : null

    const teamPoints: GroupTeamPoint[] = []
    let groupSubtotal = 0

    // Score the user's ranked picks (1st, 2nd, 3rd — score only what they ranked)
    for (let i = 0; i < ranked.length && i < 3; i++) {
      const team = ranked[i]
      const userRank = i + 1
      let actualRank: number | null = null
      let pts = 0
      let classification: GroupTeamPoint['classification'] = 'pending'

      if (groupResults) {
        const idx = groupResults.indexOf(team)
        actualRank = idx >= 0 ? idx + 1 : null
        if (top3 && top3[i] === team) {
          pts = 2
          classification = 'exact'
        } else if (top3 && top3.includes(team)) {
          pts = 1
          classification = 'qualified'
        } else {
          pts = 0
          classification = 'wrong'
        }
      }

      teamPoints.push({ team, userRank, actualRank, pts, classification })
      groupSubtotal += pts
    }

    // Auto-4th (the team the user didn't rank — always 0 pts, classification depends on results)
    if (auto4th) {
      let actualRank: number | null = null
      let classification: GroupTeamPoint['classification'] = 'pending'
      if (groupResults) {
        const idx = groupResults.indexOf(auto4th)
        actualRank = idx >= 0 ? idx + 1 : null
        classification = 'wrong' // never earns points; if it actually qualified the user missed it
      }
      teamPoints.push({ team: auto4th, userRank: null, actualRank, pts: 0, classification })
    }

    perGroup[group] = { teamPoints, subtotal: groupSubtotal }
    subtotal += groupSubtotal
  }

  return { perGroup, subtotal }
}

// ─── 3rd place ────────────────────────────────────────────────────────────────

export function computeThirdScore(
  third: ThirdPicks,
  groupPicks: GroupPicks,
  thirdResults: string[] | undefined,
): ScoreBreakdown['third'] {
  const perGroup: ScoreBreakdown['third']['perGroup'] = {}
  let subtotal = 0

  const checked = Array.isArray(third) ? third.slice(0, 8) : []
  const checkedSet = new Set(checked)
  const allGroups = Object.keys(WC_GROUPS)
  const safeGroupPicks = groupPicks ?? {}

  for (const group of allGroups) {
    const userPicked = checkedSet.has(group)
    if (!userPicked) {
      perGroup[group] = { userPicked: false, qualified: null, pts: 0 }
      continue
    }

    // Mirror the bracket page's auto4th logic for 3rd-place derivation.
    // (See ThirdPlaceTab around line 357-368 in src/app/bracket/page.tsx.)
    const ranked = (safeGroupPicks[group] ?? []).filter(t => typeof t === 'string' && t.length > 0)
    const teams = WC_GROUPS[group] ?? []
    const auto4th = teams.find((t: string) => !ranked.includes(t)) ?? null
    const thirdTeam = ranked[2] ?? (ranked.length === 3 ? auto4th : null)

    if (!thirdResults) {
      perGroup[group] = { userPicked: true, qualified: null, pts: 0 }
      continue
    }

    if (thirdTeam && thirdResults.includes(thirdTeam)) {
      perGroup[group] = { userPicked: true, qualified: true, pts: 1 }
      subtotal += 1
    } else {
      perGroup[group] = { userPicked: true, qualified: false, pts: 0 }
    }
  }

  return { perGroup, subtotal }
}

// ─── Knockouts ────────────────────────────────────────────────────────────────

export function computeKnockoutScore(
  picks: KnockoutPicks,
  results: KnockoutPicks | undefined,
): ScoreBreakdown['knockout'] {
  const perMatch: ScoreBreakdown['knockout']['perMatch'] = {}
  let subtotal = 0

  const safePicks = picks ?? {}
  const safeResults = results ?? {}

  for (const matchId of Object.keys(safePicks)) {
    const round = classifyMatchId(matchId)
    if (!round) continue // unknown match id — skip

    const userPick = typeof safePicks[matchId] === 'string' && safePicks[matchId].length > 0
      ? safePicks[matchId]
      : null
    const actual = typeof safeResults[matchId] === 'string' && safeResults[matchId].length > 0
      ? safeResults[matchId]
      : null

    let pts = 0
    if (userPick && actual && userPick === actual) {
      pts = KNOCKOUT_POINTS[round]
    }

    perMatch[matchId] = { userPick, actual, pts, round }
    subtotal += pts
  }

  return { perMatch, subtotal }
}

// ─── Full score ───────────────────────────────────────────────────────────────

export function computeFullScore(
  entries: { phase: string; picks: unknown }[] | null | undefined,
  results: BracketResults | null | undefined,
): ScoreBreakdown {
  const out = emptyBreakdown()
  const safeResults = results ?? {}
  const safeEntries = entries ?? []

  let groupPicks: GroupPicks = {}
  let thirdPicks: ThirdPicks = []
  let knockoutPicks: KnockoutPicks = {}

  for (const entry of safeEntries) {
    if (!entry || typeof entry.phase !== 'string') continue
    if (entry.phase === 'group' && entry.picks && typeof entry.picks === 'object') {
      groupPicks = entry.picks as GroupPicks
    } else if (entry.phase === 'third' && Array.isArray(entry.picks)) {
      thirdPicks = entry.picks as ThirdPicks
    } else if (entry.phase === 'knockout' && entry.picks && typeof entry.picks === 'object') {
      knockoutPicks = entry.picks as KnockoutPicks
    }
  }

  out.group = computeGroupScore(groupPicks, safeResults.group_results)
  out.third = computeThirdScore(thirdPicks, groupPicks, safeResults.third_results)
  out.knockout = computeKnockoutScore(knockoutPicks, safeResults.knockout_results)
  out.total = out.group.subtotal + out.third.subtotal + out.knockout.subtotal

  return out
}
