/**
 * Predictor round-lock helpers.
 *
 * Source of truth: the first `kickoff_at` in `predictor_matches` for a given
 * `round_code`. Once we are past that timestamp the round is locked.
 *
 * For profile name locking we only care about `group_r1` — once Round 1 has
 * started, `first_name` and `last_name` become read-only across the whole
 * account (owner + kids). `manager_name` stays editable forever.
 *
 * The lookup is cached per request module instance (Next.js spins fresh JS
 * per request on the server in practice, but we still memoize so a single
 * request that hits this from multiple handlers doesn't re-query each time).
 */

import { createAdminSupabase } from '../supabase-server'
import { evaluateLock } from './round-lock-pure'

export { evaluateLock } from './round-lock-pure'

const CACHE_TTL_MS = 30_000 // 30s — round-1 kickoff doesn't move often

let cached: { value: number | null; expiresAt: number } | null = null

/**
 * Returns the first kickoff_at for `round_code='group_r1'` as a unix ms
 * timestamp, or `null` if the schedule isn't populated yet (treat unknown
 * as "not yet locked").
 */
export async function getRound1LockAt(): Promise<number | null> {
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.value

  try {
    const admin = createAdminSupabase()
    const { data, error } = await admin
      .from('predictor_matches')
      .select('kickoff_at')
      .eq('round_code', 'group_r1')
      .order('kickoff_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) {
      // Don't poison the cache on failure — try again on the next call.
      return null
    }

    const lockAt = data?.kickoff_at ? new Date(data.kickoff_at).getTime() : null
    cached = { value: lockAt, expiresAt: now + CACHE_TTL_MS }
    return lockAt
  } catch {
    return null
  }
}

/**
 * True once the first group_r1 kickoff has passed. If the schedule isn't
 * populated yet we fail-open (not locked) — the predictor pick routes already
 * use the same fail-open pattern.
 */
export async function isProfileNameLocked(): Promise<boolean> {
  const lockAt = await getRound1LockAt()
  return evaluateLock(lockAt)
}

/** Test-only: drop the cache. */
export function __resetRoundLockCacheForTests() {
  cached = null
}
