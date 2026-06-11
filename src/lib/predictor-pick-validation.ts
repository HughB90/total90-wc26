/**
 * Pure validation helpers for predictor pick saves.
 *
 * Pulled out of the route handlers so we can unit-test the cap + per-match
 * lock logic without spinning up a Supabase client. The route still owns
 * I/O (Supabase reads/writes) — these helpers receive already-fetched data.
 *
 * The persisted-set cap is the fix for the Jeff McMenis 17-pick bug
 * (2026-06-11): the old route only validated the incoming batch length
 * against the cap, not (existing ∪ incoming).
 */

export const GROUP_ROUNDS = new Set(['group_r1', 'group_r2', 'group_r3'])
export const GROUP_ROUND_CAP = 16

export interface MatchLockRow {
  id: string
  round_code: string
  kickoff_at: string // ISO timestamp
  /**
   * Optional. If present and not 'scheduled', the match is treated as locked
   * regardless of kickoff_at — covers the case where Opta marks a match
   * live or final before the wall-clock kickoff (or after, when we don't
   * trust the clock anymore).
   */
  status?: string | null
}

export interface ExistingPickRow {
  match_id: string
  is_star: boolean
}

export interface IncomingPick {
  match_id: string
  is_star?: boolean
}

export interface PersistedSetCapResult {
  ok: boolean
  current: number       // distinct existing match_ids in this round
  projected: number     // post-save distinct match_ids in this round
  newAdditions: string[] // match_ids in incoming that aren't yet in DB
}

/**
 * Compute whether saving `incoming` picks would exceed the per-round cap,
 * given the user's `existing` picks in the same round.
 *
 * - Edits (incoming match_id that already exists in DB) do NOT increase the
 *   count.
 * - Only new match_ids count toward the cap.
 * - Cap currently only applies to group rounds (R1/R2/R3 — 16 of 24).
 *   Knockout rounds have a fixed `expected` count enforced separately.
 */
export function checkPersistedSetCap(
  roundCode: string,
  existing: ExistingPickRow[],
  incoming: IncomingPick[],
  cap: number = GROUP_ROUND_CAP
): PersistedSetCapResult {
  const existingIds = new Set(existing.map((p) => p.match_id))
  const newAdditions = incoming
    .map((p) => p.match_id)
    .filter((id) => !existingIds.has(id))
  const current = existingIds.size
  const projected = current + newAdditions.length

  // Only enforce the cap on group rounds. Knockout rounds use a different
  // count check (must equal expected) handled elsewhere.
  if (!GROUP_ROUNDS.has(roundCode)) {
    return { ok: true, current, projected, newAdditions }
  }

  return {
    ok: projected <= cap,
    current,
    projected,
    newAdditions,
  }
}

export interface LockSplit {
  unlocked: IncomingPick[]
  lockedDetails: Array<{ match_id: string; kickoff_at: string | null }>
  unknown: string[]  // incoming match_ids that don't appear in `matches`
}

/**
 * Split incoming picks into (unlocked, locked) by per-match kickoff_at.
 * A match is locked when kickoff_at <= now.
 *
 * Unknown match_ids (not present in the supplied matches array) are
 * returned separately so the caller can reject the whole batch.
 */
export function splitByMatchLock<T extends IncomingPick>(
  incoming: T[],
  matches: MatchLockRow[],
  nowMs: number = Date.now()
): { unlocked: T[]; lockedDetails: Array<{ match_id: string; kickoff_at: string | null }>; unknown: string[] } {
  const matchById = new Map(matches.map((m) => [m.id, m]))
  const unlocked: T[] = []
  const lockedDetails: Array<{ match_id: string; kickoff_at: string | null }> = []
  const unknown: string[] = []
  for (const p of incoming) {
    const m = matchById.get(p.match_id)
    if (!m) {
      unknown.push(p.match_id)
      continue
    }
    const koMs = new Date(m.kickoff_at).getTime()
    const statusLocks = !!m.status && m.status !== 'scheduled'
    if (Number.isNaN(koMs) || koMs <= nowMs || statusLocks) {
      lockedDetails.push({ match_id: p.match_id, kickoff_at: m.kickoff_at })
    } else {
      unlocked.push(p)
    }
  }
  return { unlocked, lockedDetails, unknown }
}

/**
 * Enforce the star pick rule:
 *
 * - The user has at most 1 star across all their picks in this round.
 * - If they currently have a star on a locked match, that star is FROZEN —
 *   they cannot move it (would silently cost them their star).
 * - If their starred match is unlocked (or they have no star yet), they
 *   may set a new star on any unlocked match in this submission.
 *
 * Returns ok=false with a reason when the incoming batch would violate
 * the rule.
 */
export interface StarRuleArgs {
  existing: ExistingPickRow[]
  incoming: IncomingPick[]
  matches: MatchLockRow[]
  nowMs?: number
}

export interface StarRuleResult {
  ok: boolean
  reason?: 'star_locked' | 'cannot_star_locked_match'
  details?: Record<string, unknown>
}

export function checkStarRule(args: StarRuleArgs): StarRuleResult {
  const nowMs = args.nowMs ?? Date.now()
  const matchById = new Map(args.matches.map((m) => [m.id, m]))
  const isLocked = (id: string) => {
    const m = matchById.get(id)
    if (!m) return false
    if (m.status && m.status !== 'scheduled') return true
    return new Date(m.kickoff_at).getTime() <= nowMs
  }

  const existingStar = args.existing.find((p) => p.is_star)
  const incomingStar = args.incoming.find((p) => p.is_star)

  // If the user is starring a locked match, reject — you can't grant a star
  // to a match that's already started.
  if (incomingStar && isLocked(incomingStar.match_id)) {
    // Allow the case where the existing locked star is the same match
    // (idempotent re-save).
    if (existingStar && existingStar.match_id === incomingStar.match_id) {
      // ok — same star, locked, idempotent
    } else {
      return {
        ok: false,
        reason: 'cannot_star_locked_match',
        details: { match_id: incomingStar.match_id },
      }
    }
  }

  // If existing star is on a locked match, the user CANNOT move it.
  // Detect: existing locked star + incoming includes a DIFFERENT starred
  // match, or incoming would clear the star from the locked match.
  if (existingStar && isLocked(existingStar.match_id)) {
    if (incomingStar && incomingStar.match_id !== existingStar.match_id) {
      return {
        ok: false,
        reason: 'star_locked',
        details: {
          locked_star_match_id: existingStar.match_id,
          attempted_star_match_id: incomingStar.match_id,
        },
      }
    }
    // Also block clearing: if the existing locked star match is in the
    // incoming batch with is_star=false, that would also move/lose the star.
    const incomingForExistingStar = args.incoming.find(
      (p) => p.match_id === existingStar.match_id
    )
    if (incomingForExistingStar && incomingForExistingStar.is_star === false) {
      return {
        ok: false,
        reason: 'star_locked',
        details: {
          locked_star_match_id: existingStar.match_id,
          note: 'cannot clear star from locked match',
        },
      }
    }
  }

  return { ok: true }
}
