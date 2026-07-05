import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

;(async () => {
  const { data: r16Ids } = await sb.from('predictor_matches').select('id').eq('round_code', 'r16')
  const ids = r16Ids!.map(r => r.id)

  const { data: picks, count } = await sb
    .from('predictor_picks')
    .select('*', { count: 'exact' })
    .in('match_id', ids)
  console.log(`R16 picks in table: ${count}`)
  console.log(picks?.slice(0, 5))

  // How many by submitted_at recency
  const { data: recent } = await sb
    .from('predictor_picks')
    .select('match_id, profile_id, submitted_at, home_score, away_score')
    .in('match_id', ids)
    .order('submitted_at', { ascending: false })
    .limit(5)
  console.log('\nmost recent R16 picks:')
  console.log(recent)
})().catch(console.error)
