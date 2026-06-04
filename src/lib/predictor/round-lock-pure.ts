/**
 * Pure helpers for predictor round-lock logic. Kept in its own module
 * (no DB, no `next/headers`) so unit tests can import without bootstrapping
 * the Supabase client.
 */

/**
 * Evaluate whether a given lock-at timestamp (ms) is in the past.
 * `null` is treated as "unknown / not locked" so callers fail-open.
 */
export function evaluateLock(
  lockAtMs: number | null,
  nowMs: number = Date.now()
): boolean {
  if (lockAtMs == null) return false
  return nowMs >= lockAtMs
}
