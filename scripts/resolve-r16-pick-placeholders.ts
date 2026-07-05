/**
 * Resolve "Winner MX" placeholder strings in R16 picks' if_draw_winner
 * field into real team names, using finalized R32 results.
 *
 * Context: users made R16 picks in June while home/away were still
 * placeholders ("Winner M83" vs "Winner M84"). Their if_draw_winner
 * saved as e.g. "Winner M85". Now that we've overwritten home/away to
 * real team names, the pick's if_draw_winner still references the
 * placeholder — the scoring engine can't match it. Cascade-resolve.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const DRY = process.argv.includes('--dry')

;(async () => {
  // Build R32 winners map
  const { data: r32 } = await sb
    .from('predictor_matches')
    .select('match_num, home_team_code, away_team_code, home_score, away_score, went_to_pks, pk_winner_team_code, status')
    .eq('round_code', 'r32')
  const winners = new Map<number, string>()
  const losers = new Map<number, string>()
  for (const m of r32!) {
    if (m.status !== 'final' || m.home_score === null || m.away_score === null) continue
    let w: string | null = null
    if (m.went_to_pks && m.pk_winner_team_code) w = m.pk_winner_team_code
    else if (m.home_score > m.away_score) w = m.home_team_code
    else if (m.away_score > m.home_score) w = m.away_team_code
    if (w) {
      winners.set(m.match_num, w === 'USA' ? 'United States' : w)
      const l = w === m.home_team_code ? m.away_team_code : m.home_team_code
      losers.set(m.match_num, l === 'USA' ? 'United States' : l)
    }
  }
  console.log(`R32 winners resolved: ${winners.size}/32`)

  // Fetch R16 picks with placeholder if_draw_winner
  const { data: r16Rows } = await sb.from('predictor_matches').select('id, match_num, home_team_code, away_team_code').eq('round_code', 'r16')
  const rowMap = new Map(r16Rows!.map(r => [r.id, r]))
  const { data: picks } = await sb
    .from('predictor_picks')
    .select('id, match_id, profile_id, if_draw_winner, pk_advance_team_id, home_score, away_score')
    .in('match_id', r16Rows!.map(r => r.id))
  console.log(`R16 picks loaded: ${picks!.length}`)

  const PLACEHOLDER = /^(Winner|Loser) M(\d+)$/i

  let fixed = 0
  let deadEnds = 0
  for (const p of picks!) {
    const patch: Record<string, string | null> = {}
    for (const field of ['if_draw_winner', 'pk_advance_team_id'] as const) {
      const raw = (p as any)[field] as string | null
      if (!raw) continue
      const mm = PLACEHOLDER.exec(raw)
      if (!mm) continue
      const [, kind, numStr] = mm
      const num = +numStr
      const target = kind.toLowerCase() === 'winner' ? winners.get(num) : losers.get(num)
      if (!target) { deadEnds++; continue }
      // Verify target is actually one of the two teams in this R16 match
      const row = rowMap.get(p.match_id)!
      if (target !== row.home_team_code && target !== row.away_team_code) {
        // The user picked a team that isn't actually in this match (real
        // bracket differed from the placeholder assumption). Null the field
        // so the scoring engine treats it as "no pick for the draw case"
        // rather than a broken team reference.
        console.log(`  M${row.match_num} pick ${p.id}: ${field}=${raw} → ${target}, but row is ${row.home_team_code} vs ${row.away_team_code}. Nulling.`)
        patch[field] = null
        deadEnds++
        continue
      }
      patch[field] = target
      console.log(`  pick ${p.id} M${row.match_num}: ${field}  ${raw} → ${target}${DRY ? '  (DRY)' : ''}`)
    }
    if (Object.keys(patch).length === 0) continue
    if (!DRY) {
      const { error } = await sb.from('predictor_picks').update(patch).eq('id', p.id)
      if (error) { console.error(`  FAIL: ${error.message}`); continue }
    }
    fixed++
  }
  console.log(`\n${DRY ? 'PLAN' : 'DONE'}: fixed ${fixed} picks, ${deadEnds} unresolvable`)
})().catch(e => { console.error(e); process.exit(1) })
