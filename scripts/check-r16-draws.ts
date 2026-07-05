import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

;(async () => {
  const { data: r16 } = await sb.from('predictor_matches').select('id, match_num, home_team_code, away_team_code').eq('round_code', 'r16')
  const rowMap = new Map(r16!.map(r => [r.id, r]))

  const { data: picks } = await sb
    .from('predictor_picks')
    .select('id, match_id, profile_id, home_score, away_score, if_draw_winner, pk_advance_team_id')
    .in('match_id', r16!.map(r => r.id))
  console.log(`total R16 picks: ${picks!.length}`)

  let placeholderRefs = 0
  let mismatchedIfDraw = 0
  for (const p of picks!) {
    const m = rowMap.get(p.match_id)!
    if (p.if_draw_winner && /^Winner M\d+$/.test(p.if_draw_winner)) placeholderRefs++
    if (p.pk_advance_team_id && /^Winner M\d+$/.test(p.pk_advance_team_id)) placeholderRefs++
    // Does if_draw_winner match either resolved team name?
    if (p.if_draw_winner && p.if_draw_winner !== m.home_team_code && p.if_draw_winner !== m.away_team_code) {
      mismatchedIfDraw++
    }
  }
  console.log(`picks with placeholder team refs (Winner MX): ${placeholderRefs}`)
  console.log(`picks with if_draw_winner not matching new team codes: ${mismatchedIfDraw}`)

  // Sample the mismatches
  const mismatches: any[] = []
  for (const p of picks!) {
    const m = rowMap.get(p.match_id)!
    if (p.if_draw_winner && p.if_draw_winner !== m.home_team_code && p.if_draw_winner !== m.away_team_code) {
      mismatches.push({ match_num: m.match_num, home: m.home_team_code, away: m.away_team_code, if_draw_winner: p.if_draw_winner, hs: p.home_score, as: p.away_score })
    }
  }
  console.log('\nsample mismatches:')
  console.log(mismatches.slice(0, 10))
})().catch(console.error)
