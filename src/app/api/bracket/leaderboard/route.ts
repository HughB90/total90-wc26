/**
 * GET /api/bracket/leaderboard
 *
 * Edge-cacheable global/league bracket leaderboard. Returns ONLY public
 * data — the caller's per-user rank lives at
 * /api/bracket/leaderboard/me.
 *
 * Global (no leagueCode):
 *   ?page=N&pageSize=10 (default 1 / 10, max pageSize 50)
 *   → { ok, rows, page, pageSize, total }
 *
 * League (?leagueCode=ABC123):
 *   → { ok, rows, total }     (leagues are small, no pagination)
 *
 * Cache: Cache-Control: public, s-maxage=30, stale-while-revalidate=120
 *   The response is identical for every viewer at a given (leagueCode,
 *   page, pageSize) tuple, so Vercel's edge cache keys naturally split
 *   per league / per page. NOTE: `meId` is intentionally ignored here
 *   — including it would defeat the cache. Use /me endpoint instead.
 *
 * Back-compat: the response still includes `me: null` so older callers
 * that read `.me` off this endpoint don't crash; they should switch to
 * /api/bracket/leaderboard/me to actually get a value.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  computeGlobalRanking,
  computeLeagueRanking,
  PUBLIC_LEADERBOARD_CACHE_CONTROL,
} from '@/lib/bracket/leaderboard-core'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const leagueCode = searchParams.get('leagueCode')
    const pageRaw = parseInt(searchParams.get('page') || '1', 10)
    const pageSizeRaw = parseInt(searchParams.get('pageSize') || '10', 10)
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
    const pageSize =
      Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 && pageSizeRaw <= 50 ? pageSizeRaw : 10

    const supabase = getSupabase()

    if (leagueCode) {
      const result = await computeLeagueRanking(supabase, leagueCode)
      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }
      return NextResponse.json(
        { ok: true, rows: result.ranked, total: result.ranked.length, me: null },
        { headers: { 'Cache-Control': PUBLIC_LEADERBOARD_CACHE_CONTROL } }
      )
    }

    const result = await computeGlobalRanking(supabase)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    const ranked = result.ranked
    const start = (page - 1) * pageSize
    const rows = ranked.slice(start, start + pageSize)
    return NextResponse.json(
      { ok: true, rows, page, pageSize, total: ranked.length, me: null },
      { headers: { 'Cache-Control': PUBLIC_LEADERBOARD_CACHE_CONTROL } }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
