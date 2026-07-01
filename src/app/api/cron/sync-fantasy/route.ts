/**
 * GET /api/cron/sync-fantasy
 *
 * Pulls played WC2026 fixtures from Opta, scores each player via the
 * vendored Python scoring service (HughB90/total90-scoring-controller,
 * Josue v1.4), and upserts results into:
 *   - fantasy_fixtures
 *   - fantasy_player_match_stats
 *
 * Idempotent. Safe to run every 15 minutes during the tournament window.
 *
 * Auth (mirrors /api/cron/sync-wc26-fixtures):
 *   - header `x-cron-secret: <CRON_SECRET>`
 *   - query `?secret=<CRON_SECRET>`
 *   - Vercel cron header `x-vercel-cron-signature` (trusted infra)
 *   - user-agent matching `/vercel-cron/i`
 *
 * Required env:
 *   OPTA_OUTLET, OPTA_SECRET
 *   CRON_SECRET
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SCORING_API_URL, SCORING_API_TOKEN
 *
 * Response 200:
 *   {
 *     ok: true,
 *     fixtures: int,
 *     fixtures_played: int,
 *     players_scored: int,
 *     players_failed: int,
 *     ms: int,
 *     hit_deadline: bool
 *   }
 *
 * Error codes:
 *   401 — bad cron secret
 *   500 — Opta / Supabase / scoring service failure
 *   503 — required env vars not configured
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runFantasySync } from '@/lib/fantasy/sync'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Vercel function maxDuration. wc26 is on Hobby (60s) until we upgrade — keep
// the inner deadline under that so we exit cleanly.
export const maxDuration = 60

function authOk(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron-signature')) return true
  const ua = req.headers.get('user-agent') ?? ''
  if (/vercel-cron/i.test(ua)) return true

  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const fromHeader = req.headers.get('x-cron-secret')
  const fromQuery = new URL(req.url).searchParams.get('secret')
  return fromHeader === expected || fromQuery === expected
}

const REQUIRED_ENV = [
  'OPTA_OUTLET',
  'OPTA_SECRET',
  'CRON_SECRET',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SCORING_API_URL',
  'SCORING_API_TOKEN',
] as const

export async function GET(request: NextRequest) {
  const started = Date.now()
  try {
    const missing = REQUIRED_ENV.filter((k) => !process.env[k])
    if (missing.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Missing env: ${missing.join(', ')}` },
        { status: 503 }
      )
    }
    if (!authOk(request)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    // ── Live-window short-circuit ─────────────────────────────────────────
    // Cron runs every 5 min; full sync (Opta MA1/MA2 + scoring service)
    // is only meaningful when a fixture is about to kick off, currently
    // in progress, or just finished. Outside that window we'd repeatedly
    // re-pull Opta + re-score finalized fixtures for nothing.
    //
    // Live window = any predictor_matches row whose kickoff_at lies in
    // [now − 4h, now + 15min]. The 4h tail covers full match (~2h),
    // post-FT stat finalization, and Opta's lag flipping status to 'Played'.
    // The 15min lead lets us pre-warm stub fixture rows.
    //
    // predictor_matches is fed by the 1-min /api/cron/sync-wc26-fixtures
    // cron (kickoff_at + status kept fresh), so this is a single cheap
    // indexed SELECT (idx_predictor_matches_kickoff exists).
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const now = new Date()
    const windowStart = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString()
    const windowEnd = new Date(now.getTime() + 15 * 60 * 1000).toISOString()
    const { data: liveRows, error: liveErr } = await supabase
      .from('predictor_matches')
      .select('id, status, kickoff_at')
      .gte('kickoff_at', windowStart)
      .lte('kickoff_at', windowEnd)
      .limit(1)

    if (liveErr) {
      console.warn(`[cron/sync-fantasy] live-window probe failed: ${liveErr.message}`)
      // Fall through to full sync — probe failure shouldn't block scoring.
    } else if (!liveRows || liveRows.length === 0) {
      console.log(
        `[cron/sync-fantasy] No live or recent fixtures in [${windowStart} .. ${windowEnd}], skipping full sync`
      )
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: 'no_live_fixtures',
          window_start: windowStart,
          window_end: windowEnd,
          ms: Date.now() - started,
        },
        { status: 200 }
      )
    }

    // Cap inner runtime to 50s — leaves a 10s safety margin under
    // Vercel's 60s function limit so the route can return cleanly.
    const result = await runFantasySync({
      deadlineMs: 50_000,
      scoringConcurrency: 5,
      onLog: (line) => console.log(`[cron/sync-fantasy] ${line}`),
    })

    return NextResponse.json(
      {
        ok: true,
        fixtures: result.fixtures,
        fixtures_played: result.fixtures_played,
        players_scored: result.players_scored,
        players_failed: result.players_failed,
        fixtures_skipped_already_scored: result.fixtures_skipped_already_scored,
        hit_deadline: result.hit_deadline,
        ms: Date.now() - started,
      },
      { status: 200 }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[cron/sync-fantasy] failed: ${msg}`)
    return NextResponse.json({ ok: false, error: msg, ms: Date.now() - started }, { status: 500 })
  }
}
