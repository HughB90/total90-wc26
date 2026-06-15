/**
 * GET /api/cron/sync-wc26-fixtures
 *
 * Pulls live WC26 fixtures from Opta MA1, matches each Opta fixture to a
 * row in `predictor_matches`, and writes scores / period / minute /
 * goalscorers back. Idempotent. Safe to call every minute during a live
 * window.
 *
 * SCORING PIPELINE (2026-06-15 hardening):
 *   Two paths trigger Phase 4 scoring inside this handler, both calling
 *   `scoreMatchById()` IN-PROCESS (no HTTP fetch). The legacy fetch path
 *   tried to hit `/api/predictor/score-match` over its own deployment URL,
 *   which on Vercel previews is gated by deployment protection and returned
 *   an HTML 401 SSO page — scoring silently failed for 5 matches on
 *   2026-06-14 before manual backfill. Direct in-process calls bypass that
 *   entirely.
 *
 *   1. Newly-final scoring: any predictor_matches row that flipped from
 *      a non-final status to 'final' this tick (detected via
 *      shouldTriggerPhase4) is scored immediately.
 *
 *   2. Safety-net sweep: at the END of the tick, scan all predictor_matches
 *      where status='final' and look for any that have predictor_picks rows
 *      but ZERO predictor_scores rows — those are matches Phase 4 missed
 *      (cron crash, transient DB error, manual final flip outside cron,
 *      etc.). Score up to MAX 5 per tick to avoid stampeding the DB on the
 *      first deploy after a long outage. This is the belt-and-suspenders
 *      that catches the next failure mode we haven't predicted yet.
 *
 * Auth: required. Provide one of:
 *   - header `x-cron-secret: <CRON_SECRET>`
 *   - query `?secret=<CRON_SECRET>`
 *   - Vercel cron header `x-vercel-cron-signature` (Vercel infra; trusted)
 *
 * Required env vars (set in Vercel):
 *   OPTA_OUTLET, OPTA_KEY (alias), OPTA_SECRET — Opta auth
 *   CRON_SECRET                                 — shared secret for hand-rolled calls
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — already in use
 *
 * Response 200:
 *   {
 *     ok: true,
 *     matched: int,            // Opta fixtures we found a predictor row for
 *     updated: int,            // rows actually patched
 *     skipped_final: int,
 *     unmatched: [{ opta_id, summary }],
 *     phase4_triggered: int,   // newly-final scored this tick
 *     phase4_results: [...],
 *     safety_net_swept: [...], // recovered missing scoring this tick
 *     duration_ms: int
 *   }
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
import { scoreMatchById } from '@/lib/predictor/score-match-core'

/** Per-match scoring result, surfaced in the cron JSON response. */
interface Phase4Result {
  match_id: string
  ok: boolean
  scored_profiles?: number
  cache_refreshed?: number
  status?: number
  error?: string
}

/** Maximum number of stale-final matches the safety-net will sweep per tick. */
const SAFETY_NET_MAX_PER_TICK = 5

/**
 * Score one match in-process. Errors are caught + returned as a Phase4Result
 * so one bad scoring call can't poison the cron response. Idempotent — the
 * scoring core upserts predictor_scores on (profile_id, match_id) and
 * fully re-sums leaderboard_cache.
 */
async function scoreInProcess(matchId: string): Promise<Phase4Result> {
  try {
    const result = await scoreMatchById(matchId)
    if (!result.ok) {
      console.warn(
        `[cron/sync-wc26-fixtures] phase4 failed for ${matchId}: status=${result.status} error=${result.error}`,
      )
      return {
        match_id: matchId,
        ok: false,
        status: result.status,
        error: result.error,
      }
    }
    console.log(
      `[cron/sync-wc26-fixtures] phase4 ok match=${matchId} scored=${result.scored_profiles} cache=${result.cache_refreshed}`,
    )
    return {
      match_id: matchId,
      ok: true,
      scored_profiles: result.scored_profiles,
      cache_refreshed: result.cache_refreshed,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[cron/sync-wc26-fixtures] phase4 threw for ${matchId}: ${msg}`)
    return { match_id: matchId, ok: false, error: msg }
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface OptaMa1Response {
  match?: OptaMatch[]
  matches?: OptaMatch[]
}

function authOk(req: NextRequest): boolean {
  // Vercel cron requests carry x-vercel-cron-signature (or user-agent vercel-cron).
  // We accept those without our shared secret.
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
      // Always at least update last_synced_at + opta_fixture_id on first match,
      // so subsequent passes can skip the team-name matching step.
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
        // Detect prev → final transition. Run AFTER successful patch so we
        // only trigger on rows that actually flipped in DB this tick.
        if (shouldTriggerPhase4(prevStatus, newStatus)) {
          matchIdsNewlyFinal.push(predictorMatchId)
        }
      }
    }

    // ── 4. Fire Phase 4 scoring for newly-finalized matches ──────────────
    // Serial loop on purpose: finalization events are rare (1–3 per WC tick
    // max), and the scoring core hits Supabase hard — don't stampede.
    // In-process call (NOT fetch) — bypasses Vercel deployment protection.
    const phase4Results: Phase4Result[] = []
    const newlyFinalScored = new Set<string>()
    for (const mid of matchIdsNewlyFinal) {
      const result = await scoreInProcess(mid)
      phase4Results.push(result)
      newlyFinalScored.add(mid)
    }

    // ── 5. Safety-net sweep: catch any final matches whose scoring slipped ──
    // Belt-and-suspenders for future failure modes we haven't predicted yet.
    // Look for predictor_matches with status='final' AND predictor_picks rows
    // AND zero predictor_scores rows, score up to MAX 5 per tick.
    const safetyNetSwept: Phase4Result[] = []
    try {
      const { data: finalRows, error: finalErr } = await sb
        .from('predictor_matches')
        .select('id')
        .eq('status', 'final')

      if (finalErr) {
        console.error(
          '[cron/sync-wc26-fixtures] safety-net final lookup error:',
          finalErr.message,
        )
      } else {
        const finalIds = (finalRows ?? [])
          .map((r) => r.id as string)
          .filter((id) => !newlyFinalScored.has(id))

        if (finalIds.length > 0) {
          // Find which finals already have ANY predictor_scores row.
          const { data: scoredRows, error: scoredErr } = await sb
            .from('predictor_scores')
            .select('match_id')
            .in('match_id', finalIds)

          if (scoredErr) {
            console.error(
              '[cron/sync-wc26-fixtures] safety-net scores lookup error:',
              scoredErr.message,
            )
          } else {
            const alreadyScored = new Set(
              (scoredRows ?? []).map((r) => r.match_id as string),
            )
            const missingScores = finalIds.filter((id) => !alreadyScored.has(id))

            if (missingScores.length > 0) {
              // Of these, which actually have picks? If a final match has zero
              // picks AND zero scores, that's fine — nothing to score.
              const { data: pickRows, error: pickErr } = await sb
                .from('predictor_picks')
                .select('match_id')
                .in('match_id', missingScores)

              if (pickErr) {
                console.error(
                  '[cron/sync-wc26-fixtures] safety-net picks lookup error:',
                  pickErr.message,
                )
              } else {
                const haveAnyPicks = new Set(
                  (pickRows ?? []).map((r) => r.match_id as string),
                )
                const candidates = missingScores
                  .filter((id) => haveAnyPicks.has(id))
                  .slice(0, SAFETY_NET_MAX_PER_TICK)

                for (const mid of candidates) {
                  const result = await scoreInProcess(mid)
                  safetyNetSwept.push(result)
                }

                if (safetyNetSwept.length > 0) {
                  console.log(
                    `[cron/sync-wc26-fixtures] safety-net swept ${safetyNetSwept.length} final matches with missing scores`,
                  )
                }
              }
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron/sync-wc26-fixtures] safety-net sweep threw: ${msg}`)
      // Non-fatal — don't fail the cron tick over a safety-net hiccup.
    }

    const duration_ms = Date.now() - started
    console.log(
      `[cron/sync-wc26-fixtures] matched=${matched} updated=${updated} skipped_final=${skipped_final} unmatched=${unmatched.length} errors=${errors.length} phase4_triggered=${phase4Results.length} safety_net=${safetyNetSwept.length} duration_ms=${duration_ms}`
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
      safety_net_swept: safetyNetSwept,
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
