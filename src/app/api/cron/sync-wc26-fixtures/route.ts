/**
 * GET /api/cron/sync-wc26-fixtures
 *
 * Pulls live WC26 fixtures from Opta MA1, matches each Opta fixture to a
 * row in `predictor_matches`, and writes scores / period / minute /
 * goalscorers back. Idempotent. Safe to call every minute during a live
 * window.
 *
 * Phase 4 auto-scoring is now IN-PROCESS:
 *   - When a row transitions to status=final, we call scoreMatchById()
 *     directly (no HTTP roundtrip to /api/predictor/score-match).
 *   - At the end of every tick we run a sweep that finds any final match
 *     with picks but no scores and heals it. This makes us resilient to
 *     missed transitions (e.g. function timeout during a previous tick,
 *     manual DB edits, deploys mid-match).
 *
 * Auth: required. Provide one of:
 *   - header `x-cron-secret: <CRON_SECRET>`
 *   - query `?secret=<CRON_SECRET>`
 *   - Vercel cron header `x-vercel-cron-signature` (Vercel infra; trusted)
 *
 * Required env vars (set in Vercel):
 *   OPTA_OUTLET, OPTA_KEY (alias), OPTA_SECRET — Opta auth
 *   CRON_SECRET                                 — shared secret for hand-rolled calls
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — Supabase admin
 *
 * Response 200: see body below.
 *
 * Error codes:
 *   401 — bad cron secret
 *   500 — Opta or Supabase failure (see body.error)
 *   503 — required env vars not configured
 */

import { NextResponse, type NextRequest } from 'next/server'
import { predictorAdmin } from '@/lib/predictor-db'
import {
  buildSyncUpdate,
  matchOptaFixtureToPredictor,
  shouldSyncRow,
  shouldTriggerPhase4,
  type OptaMatch,
  type PredictorMatchRow,
} from '@/lib/wc26-fixtures-sync'
import { buildWc26MatchesUrl, optaGet } from '@/lib/opta-client'
import {
  scoreMatchById,
  sweepUnscored,
  type ScoreMatchResult,
} from '@/lib/predictor/score-match-core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Pro tier supports up to 300s; we set 60s as a sane ceiling. Cron should
// usually finish in 3–8s but Opta latency + the in-process scoring of
// freshly-finalized matches can push it to ~15s on busy ticks.
export const maxDuration = 60

interface OptaMa1Response {
  match?: OptaMatch[]
  matches?: OptaMatch[]
}

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

export async function GET(request: NextRequest) {
  const started = Date.now()
  try {
    if (!process.env.OPTA_OUTLET || !process.env.OPTA_SECRET) {
      return NextResponse.json(
        { ok: false, error: 'OPTA_OUTLET / OPTA_SECRET not configured' },
        { status: 503 }
      )
    }
    if (!process.env.CRON_SECRET) {
      return NextResponse.json(
        { ok: false, error: 'CRON_SECRET not configured' },
        { status: 503 }
      )
    }
    if (!authOk(request)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    // ── 1. Load all predictor_matches rows ─────────────────────────────────
    const sb = predictorAdmin()
    const { data: rows, error: loadErr } = await sb
      .from('predictor_matches')
      .select(
        'id, match_num, round_code, home_team_code, away_team_code, kickoff_at, status, opta_fixture_id, last_synced_at'
      )

    if (loadErr) {
      console.error('[cron/sync-wc26-fixtures] load error:', loadErr.message)
      return NextResponse.json({ ok: false, error: loadErr.message }, { status: 500 })
    }
    const predictorRows: PredictorMatchRow[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      match_num: r.match_num as number,
      round_code: r.round_code as string,
      home_team_code: r.home_team_code as string,
      away_team_code: r.away_team_code as string,
      kickoff_at: r.kickoff_at as string,
      opta_fixture_id: (r.opta_fixture_id as string | null) ?? null,
    }))

    // ── 2. Fetch live + recent fixtures from Opta ──────────────────────────
    let opta: OptaMa1Response
    try {
      opta = await optaGet<OptaMa1Response>(buildWc26MatchesUrl({ live: true, pageSize: 200 }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[cron/sync-wc26-fixtures] opta fetch failed:', msg)
      return NextResponse.json({ ok: false, error: `opta_fetch_failed: ${msg}` }, { status: 500 })
    }

    const optaMatches: OptaMatch[] = opta.match ?? opta.matches ?? []

    // ── 3. Match each Opta fixture to a predictor row, build update ────────
    const nowIso = new Date().toISOString()
    let matched = 0
    let updated = 0
    let skipped_final = 0
    const unmatched: Array<{ opta_id: string | null; summary: string }> = []
    const errors: Array<{ predictor_id: string; error: string }> = []
    const matchIdsNewlyFinal: string[] = []

    for (const om of optaMatches) {
      const predictorMatchId = matchOptaFixtureToPredictor(om, predictorRows)
      const optaId = om.matchInfo?.id ?? om.id ?? null
      const teams = (om.matchInfo?.contestant ?? [])
        .map((c) => c.code ?? c.name ?? '?')
        .join(' vs ')

      if (!predictorMatchId) {
        unmatched.push({ opta_id: optaId, summary: teams })
        continue
      }
      matched++

      const predictorRow = predictorRows.find((r) => r.id === predictorMatchId)!
      const dbRow = (rows ?? []).find((r) => r.id === predictorMatchId)!

      if (dbRow.status === 'final') {
        skipped_final++
        continue
      }

      const update = buildSyncUpdate(om, predictorRow, nowIso)
      const patchKeys = Object.keys(update.patch).filter(
        (k) => k !== 'last_synced_at'
      )
      if (patchKeys.length === 0 && !predictorRow.opta_fixture_id && optaId) {
        update.patch.opta_fixture_id = optaId
      }

      const prevStatus = dbRow.status as string | null | undefined
      const newStatus = update.patch.status

      const { error: updErr } = await sb
        .from('predictor_matches')
        .update({ ...update.patch, updated_at: nowIso })
        .eq('id', predictorMatchId)

      if (updErr) {
        errors.push({ predictor_id: predictorMatchId, error: updErr.message })
        console.error(
          `[cron/sync-wc26-fixtures] update failed for ${predictorMatchId}:`,
          updErr.message
        )
      } else {
        updated++
        if (shouldTriggerPhase4(prevStatus, newStatus)) {
          matchIdsNewlyFinal.push(predictorMatchId)
        }
      }
    }

    // ── 4. In-process Phase 4 scoring for newly-finalized matches ────────
    // No HTTP roundtrip. No second function invocation. No PREDICTOR_ADMIN_KEY
    // needed on the cron path (the POST endpoint still requires it).
    const phase4Results: ScoreMatchResult[] = []
    for (const mid of matchIdsNewlyFinal) {
      const res = await scoreMatchById(sb, mid)
      phase4Results.push(res)
    }

    // ── 5. Safety-net sweep: heal any final match missing scores ──────────
    // Catches matches that flipped to final on a previous tick but failed to
    // get scored (e.g. function timeout, deploy mid-trigger, manual DB edit).
    // Bounded at 5/tick so a backlog doesn't bust the function timeout.
    const sweep = await sweepUnscored(sb, 5)
    const swept = sweep.healed.filter((h) => h.ok).length
    const sweepFailed = sweep.healed.filter((h) => !h.ok)

    const duration_ms = Date.now() - started
    console.log(
      `[cron/sync-wc26-fixtures] matched=${matched} updated=${updated} ` +
        `skipped_final=${skipped_final} unmatched=${unmatched.length} ` +
        `errors=${errors.length} phase4=${phase4Results.length} ` +
        `swept=${swept} sweep_failed=${sweepFailed.length} ` +
        `duration_ms=${duration_ms}`
    )

    return NextResponse.json({
      ok: true,
      opta_fixture_count: optaMatches.length,
      matched,
      updated,
      skipped_final,
      unmatched_count: unmatched.length,
      unmatched: unmatched.slice(0, 10),
      errors_count: errors.length,
      errors: errors.slice(0, 5),
      phase4_triggered: phase4Results.length,
      phase4_results: phase4Results,
      sweep: {
        scanned: sweep.scanned,
        healed_ok: swept,
        healed_failed: sweepFailed.length,
        failed_details: sweepFailed.slice(0, 5),
      },
      duration_ms,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[cron/sync-wc26-fixtures] unexpected:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

// Reference: shouldSyncRow is exported for future use to pre-filter the
// candidate set before the Opta call — currently we rely on Opta's `live=yes`
// param to scope server-side, which is more efficient.
export const _shouldSyncRow = shouldSyncRow
