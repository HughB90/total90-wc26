/**
 * Display helpers for predictor profile names.
 *
 * Leaderboards render the team name as the primary line and the player's
 * real name underneath as a muted subline. With last_name now collected at
 * profile-create (PR #6, 2026-06-04), prefer "First Last" when both are
 * present; fall back to "First" alone for legacy profiles that pre-date the
 * last_name column.
 *
 * Returns null when there's nothing useful to show, OR when the resulting
 * full name is identical to the team name (no point repeating it).
 */
export function profileFullName(
  first_name: string | null | undefined,
  last_name: string | null | undefined,
  manager_name?: string | null | undefined
): string | null {
  const first = (first_name ?? '').trim()
  const last = (last_name ?? '').trim()

  let full: string
  if (first && last) full = `${first} ${last}`
  else if (first) full = first
  else if (last) full = last
  else return null

  if (manager_name && full === manager_name.trim()) return null
  return full
}
