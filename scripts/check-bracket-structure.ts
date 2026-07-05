/**
 * Print the R32 → R16 bracket structure and the actual R32 winners so we
 * can figure out where the resolve script went wrong.
 *
 * Also look for any bracket_seed / bracket_position / next_match_id
 * schema hints.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

;(async () => {
  const { data: r32 } = await sb
    .from('predictor_matches')
    .select('*')
    .eq('round_code', 'r32')
    .order('match_num', { ascending: true })

  console.log('=== R32 columns ===')
  console.log(Object.keys(r32![0] || {}))

  console.log('\n=== All R32 (match_num sorted) ===')
  for (const m of r32!) {
    let winner: string | null = null
    if (m.status === 'final' && m.home_score !== null && m.away_score !== null) {
      if (m.went_to_pks && m.pk_winner_team_code) winner = m.pk_winner_team_code
      else if (m.home_score > m.away_score) winner = m.home_team_code
      else if (m.away_score > m.home_score) winner = m.away_team_code
    }
    console.log(`M${m.match_num} ${m.home_team_code} ${m.home_score ?? '-'}-${m.away_score ?? '-'}${m.went_to_pks ? '(pens:'+m.pk_winner_team_code+')' : ''} ${m.away_team_code}  → ${winner ?? 'TBD'}`)
  }
})().catch(console.error)
