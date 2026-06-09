import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Global + league leaderboard.
 *
 * Global mode (no leagueCode):
 *   Returns EVERY signed-up profile + every legacy bracket_users row, with
 *   summed bracket_entries.score (0 if they haven't picked yet). Hugh wants
 *   the world to see everyone competing, not just folks who already saved
 *   picks. Sorted by score DESC then created_at ASC (earlier signup wins
 *   ties — pre-tournament that's the only fair anchor).
 *
 *   Pagination: ?page=N&pageSize=10 (1-indexed). Defaults to page 1, size 10.
 *   The full participant list is small (hundreds, not millions), so we
 *   compute the global ranking server-side every request and slice the page.
 *
 *   Caller's row: pass ?meId=<profile.id | bracket_users.id>. Response
 *   includes { me: { rank, score, total, managerName, firstName } } so the
 *   UI can pin the caller's standing above the paginated list.
 *
 * League mode (leagueCode set):
 *   Returns every member of the league (incl. ones who haven't picked yet),
 *   ranked by score. No pagination — leagues are small.
 */

type ProfileRow = {
  id: string
  manager_name: string | null
  first_name: string | null
  display_name: string | null
  created_at: string
  deleted_at: string | null
}

type LegacyUserRow = {
  id: string
  display_name: string | null
  first_name: string | null
  created_at: string
}

type AggregatedRow = {
  // Stable id we use to anchor the caller's row. Either profile.id or
  // bracket_users.id (legacy). Both `userId` (legacy field on response) and
  // `profileId` are populated when known so the client's `r.userId === me ||
  // r.profileId === me` match keeps working.
  userId: string
  profileId: string | null
  managerName: string
  firstName: string | null
  displayName: string
  score: number
  // Sort tiebreak: earlier signup ranks higher when scores tie.
  createdAt: string
}

type RankedRow = AggregatedRow & { rank: number }

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const leagueCode = searchParams.get('leagueCode')
    const meId = searchParams.get('meId') || searchParams.get('userId') || null
    const pageRaw = parseInt(searchParams.get('page') || '1', 10)
    const pageSizeRaw = parseInt(searchParams.get('pageSize') || '10', 10)
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
    const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 && pageSizeRaw <= 50 ? pageSizeRaw : 10

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    if (leagueCode) {
      return await leagueLeaderboard(supabase, leagueCode, meId)
    }

    return await globalLeaderboard(supabase, page, pageSize, meId)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─── Global ───────────────────────────────────────────────────────────────────

async function globalLeaderboard(
  supabase: SupabaseClient,
  page: number,
  pageSize: number,
  meId: string | null,
) {
  // 1. Every active profile.
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, manager_name, first_name, display_name, created_at, deleted_at')
    .is('deleted_at', null)

  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 })

  // 2. Every legacy bracket_users row (pre Pass 2+5 users).
  const { data: legacyUsers, error: legacyErr } = await (supabase
    .from('bracket_users')
    .select('id, display_name, first_name, created_at') as any)

  if (legacyErr) return NextResponse.json({ error: legacyErr.message }, { status: 500 })

  // 3. All bracket_entries scores (small dataset — hundreds of rows max).
  const { data: entries, error: entryErr } = await supabase
    .from('bracket_entries')
    .select('user_id, profile_id, score')

  if (entryErr) return NextResponse.json({ error: entryErr.message }, { status: 500 })

  // Sum scores per profile_id and per legacy user_id separately so we don't
  // double-count migrated rows that carry BOTH ids.
  const scoreByProfile = new Map<string, number>()
  const scoreByLegacy = new Map<string, number>()
  for (const e of (entries ?? []) as Array<{ user_id: string | null; profile_id: string | null; score: number | null }>) {
    const s = e.score ?? 0
    if (e.profile_id) {
      scoreByProfile.set(e.profile_id, (scoreByProfile.get(e.profile_id) ?? 0) + s)
    } else if (e.user_id) {
      scoreByLegacy.set(e.user_id, (scoreByLegacy.get(e.user_id) ?? 0) + s)
    }
  }

  const all: AggregatedRow[] = []

  for (const p of (profiles ?? []) as ProfileRow[]) {
    all.push({
      userId: p.id,
      profileId: p.id,
      managerName: p.manager_name || p.display_name || p.first_name || 'Anonymous',
      firstName: p.first_name,
      displayName: p.display_name || p.manager_name || p.first_name || 'Anonymous',
      score: scoreByProfile.get(p.id) ?? 0,
      createdAt: p.created_at,
    })
  }

  // Avoid duplicating a legacy user that was already migrated into a profile
  // (we'd see their score appear under both ids otherwise). Heuristic: if
  // ANY bracket_entries row links legacy user_id → profile_id, skip the
  // legacy row.
  const migratedLegacyIds = new Set<string>()
  for (const e of (entries ?? []) as Array<{ user_id: string | null; profile_id: string | null }>) {
    if (e.user_id && e.profile_id) migratedLegacyIds.add(e.user_id)
  }

  for (const u of (legacyUsers ?? []) as LegacyUserRow[]) {
    if (migratedLegacyIds.has(u.id)) continue
    all.push({
      userId: u.id,
      profileId: null,
      managerName: u.display_name || u.first_name || 'Anonymous',
      firstName: u.first_name,
      displayName: u.display_name || u.first_name || 'Anonymous',
      score: scoreByLegacy.get(u.id) ?? 0,
      createdAt: u.created_at,
    })
  }

  // Sort: score DESC, then created_at ASC (earlier signup = better tiebreak).
  all.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.createdAt.localeCompare(b.createdAt)
  })

  const ranked: RankedRow[] = all.map((r, i) => ({ ...r, rank: i + 1 }))
  const total = ranked.length

  const start = (page - 1) * pageSize
  const rows = ranked.slice(start, start + pageSize)

  // Caller's standing — pinned above the table on the client.
  let me: { rank: number; score: number; total: number; managerName: string; firstName: string | null } | null = null
  if (meId) {
    const meRow = ranked.find(r => r.userId === meId || r.profileId === meId)
    if (meRow) {
      me = {
        rank: meRow.rank,
        score: meRow.score,
        total,
        managerName: meRow.managerName,
        firstName: meRow.firstName,
      }
    }
  }

  return NextResponse.json({
    ok: true,
    rows,
    page,
    pageSize,
    total,
    me,
  })
}

// ─── League (unchanged behavior, but now properly counts profile-keyed members) ──

async function leagueLeaderboard(
  supabase: SupabaseClient,
  leagueCode: string,
  meId: string | null,
) {
  const { data: league } = await supabase
    .from('wc26_leagues')
    .select('id')
    .eq('invite_code', leagueCode.toUpperCase())
    .single()

  if (!league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 })
  }

  const { data: members } = await (supabase
    .from('wc26_league_members')
    .select('user_id, profile_id')
    .eq('league_id', league.id) as any)

  const memberProfileIds = (members ?? [])
    .map((m: { profile_id: string | null }) => m.profile_id)
    .filter((x: string | null): x is string => !!x)
  const memberLegacyIds = (members ?? [])
    .map((m: { user_id: string | null; profile_id: string | null }) => (m.profile_id ? null : m.user_id))
    .filter((x: string | null): x is string => !!x)

  if (memberProfileIds.length === 0 && memberLegacyIds.length === 0) {
    return NextResponse.json({ ok: true, rows: [], total: 0, me: null })
  }

  // Pull profile + legacy rows in parallel.
  const profilesPromise = memberProfileIds.length
    ? supabase
        .from('profiles')
        .select('id, manager_name, first_name, display_name, created_at, deleted_at')
        .in('id', memberProfileIds)
    : Promise.resolve({ data: [] as ProfileRow[] })

  const legacyPromise = memberLegacyIds.length
    ? (supabase
        .from('bracket_users')
        .select('id, display_name, first_name, created_at')
        .in('id', memberLegacyIds) as any)
    : Promise.resolve({ data: [] as LegacyUserRow[] })

  const [{ data: profiles }, { data: legacyUsers }] = await Promise.all([profilesPromise, legacyPromise])

  // Pull all entries scoped to member ids.
  const orParts: string[] = []
  if (memberProfileIds.length) orParts.push(`profile_id.in.(${memberProfileIds.join(',')})`)
  if (memberLegacyIds.length) orParts.push(`user_id.in.(${memberLegacyIds.join(',')})`)
  const { data: entries } = orParts.length
    ? await (supabase.from('bracket_entries').select('user_id, profile_id, score').or(orParts.join(',')) as any)
    : { data: [] as Array<{ user_id: string | null; profile_id: string | null; score: number | null }> }

  const scoreByProfile = new Map<string, number>()
  const scoreByLegacy = new Map<string, number>()
  for (const e of (entries ?? []) as Array<{ user_id: string | null; profile_id: string | null; score: number | null }>) {
    const s = e.score ?? 0
    if (e.profile_id) scoreByProfile.set(e.profile_id, (scoreByProfile.get(e.profile_id) ?? 0) + s)
    else if (e.user_id) scoreByLegacy.set(e.user_id, (scoreByLegacy.get(e.user_id) ?? 0) + s)
  }

  const all: AggregatedRow[] = []
  for (const p of (profiles ?? []) as ProfileRow[]) {
    all.push({
      userId: p.id,
      profileId: p.id,
      managerName: p.manager_name || p.display_name || p.first_name || 'Anonymous',
      firstName: p.first_name,
      displayName: p.display_name || p.manager_name || p.first_name || 'Anonymous',
      score: scoreByProfile.get(p.id) ?? 0,
      createdAt: p.created_at,
    })
  }
  for (const u of (legacyUsers ?? []) as LegacyUserRow[]) {
    all.push({
      userId: u.id,
      profileId: null,
      managerName: u.display_name || u.first_name || 'Anonymous',
      firstName: u.first_name,
      displayName: u.display_name || u.first_name || 'Anonymous',
      score: scoreByLegacy.get(u.id) ?? 0,
      createdAt: u.created_at,
    })
  }

  all.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.createdAt.localeCompare(b.createdAt)
  })

  const ranked: RankedRow[] = all.map((r, i) => ({ ...r, rank: i + 1 }))
  const total = ranked.length

  let me: { rank: number; score: number; total: number; managerName: string; firstName: string | null } | null = null
  if (meId) {
    const meRow = ranked.find(r => r.userId === meId || r.profileId === meId)
    if (meRow) {
      me = {
        rank: meRow.rank,
        score: meRow.score,
        total,
        managerName: meRow.managerName,
        firstName: meRow.firstName,
      }
    }
  }

  return NextResponse.json({ ok: true, rows: ranked, total, me })
}
