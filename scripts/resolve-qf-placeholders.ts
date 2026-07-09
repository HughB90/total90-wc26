/**
 * QF preparation: resolve every "Winner MX" placeholder in
 * predictor_matches (round_code=qf) to the actual advancing team.
 *
 * Walks R16 matches, determines winners (using pk_winner_team_code when
 * went_to_pks). Rewrites QF rows' home_team_code / away_team_code.
 *
 * Adapted from resolve-r16-placeholders.ts.
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
  const { data: r16 } = await sb
    .from('predictor_matches')
    .select('match_num, home_team_code, away_team_code, home_score, away_score, went_to_pks, pk_winner_team_code, status')
    .eq('round_code', 'r16')
  const winners = new Map<number, string>()
  for (const m of r16!) {
    if (m.status !== 'final' || m.home_score === null || m.away_score === null) continue
    let winner: string | null = null
    if (m.went_to_pks && m.pk_winner_team_code) winner = m.pk_winner_team_code
    else if (m.home_score > m.away_score) winner = m.home_team_code
    else if (m.away_score > m.home_score) winner = m.away_team_code
    if (winner) winners.set(m.match_num, normalizeTeam(winner))
  }
  console.log(`resolved R16 winners: ${winners.size}/8`)
  for (const [k, v] of winners) console.log(`  M${k} → ${v}`)

  const { data: qf } = await sb
    .from('predictor_matches')
    .select('id, match_num, home_team_code, away_team_code')
    .eq('round_code', 'qf')
    .order('match_num', { ascending: true })

  let written = 0
  let skipped = 0
  for (const m of qf!) {
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
