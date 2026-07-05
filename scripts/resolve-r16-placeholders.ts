/**
 * R16 preparation: resolve every "Winner MX" placeholder in
 * `predictor_matches` to the actual advancing team.
 *
 * Walks R32 matches, determines winners (using pk_winner_team_code when
 * went_to_pks). Rewrites R16 rows' home_team_code / away_team_code.
 *
 * Also normalizes "USA" → "United States" so the picker (which queries
 * s3_players.nationality = "United States") lines up. Team-code aliases
 * cover this at the API layer too, but rewriting the DB keeps the round
 * page's rendering path clean.
 *
 * Only writes for a matchup when BOTH sides resolve. Leaves the row
 * untouched otherwise (M95 pending Colombia/Ghana today).
 *
 * Safe / idempotent. Re-running after M88 finalizes will fill M95.
 * Dry-run: pass --dry to print the plan without writing.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const DRY = process.argv.includes('--dry')

function normalizeTeam(code: string): string {
  const map: Record<string, string> = {
    USA: 'United States',
  }
  return map[code] ?? code
}

;(async () => {
  const { data: r32 } = await sb
    .from('predictor_matches')
    .select('match_num, home_team_code, away_team_code, home_score, away_score, went_to_pks, pk_winner_team_code, status')
    .eq('round_code', 'r32')
  const winners = new Map<number, string>()
  for (const m of r32!) {
    if (m.status !== 'final' || m.home_score === null || m.away_score === null) continue
    let winner: string | null = null
    if (m.went_to_pks && m.pk_winner_team_code) winner = m.pk_winner_team_code
    else if (m.home_score > m.away_score) winner = m.home_team_code
    else if (m.away_score > m.home_score) winner = m.away_team_code
    if (winner) winners.set(m.match_num, normalizeTeam(winner))
  }
  console.log(`resolved R32 winners: ${winners.size}/32`)

  const { data: r16 } = await sb
    .from('predictor_matches')
    .select('id, match_num, home_team_code, away_team_code')
    .eq('round_code', 'r16')
    .order('match_num', { ascending: true })

  let written = 0
  let skipped = 0
  for (const m of r16!) {
    const hm = /Winner M(\d+)/.exec(m.home_team_code)
    const am = /Winner M(\d+)/.exec(m.away_team_code)
    const homeNew = hm ? winners.get(+hm[1]) : m.home_team_code
    const awayNew = am ? winners.get(+am[1]) : m.away_team_code

    if (!homeNew || !awayNew) {
      console.log(`M${m.match_num}: SKIP (unresolved) — home=${m.home_team_code}[${homeNew ?? '?'}]  away=${m.away_team_code}[${awayNew ?? '?'}]`)
      skipped++
      continue
    }
    const patch: Record<string, string> = {}
    if (homeNew !== m.home_team_code) patch.home_team_code = homeNew
    if (awayNew !== m.away_team_code) patch.away_team_code = awayNew
    if (Object.keys(patch).length === 0) {
      console.log(`M${m.match_num}: already resolved (${m.home_team_code} vs ${m.away_team_code})`)
      continue
    }

    console.log(`M${m.match_num}: ${m.home_team_code} → ${homeNew}  |  ${m.away_team_code} → ${awayNew}${DRY ? '  (DRY)' : ''}`)
    if (!DRY) {
      const { error } = await sb.from('predictor_matches').update(patch).eq('id', m.id)
      if (error) { console.error(`  FAIL: ${error.message}`); continue }
    }
    written++
  }

  console.log(`\n${DRY ? 'PLAN' : 'DONE'}: ${written} matches ${DRY ? 'to update' : 'updated'}, ${skipped} skipped (unresolved)`)
})().catch(e => { console.error(e); process.exit(1) })
