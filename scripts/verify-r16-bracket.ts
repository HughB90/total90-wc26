/**
 * Look for R16 fixture pairings from Opta (the actual bracket).
 * We can pull the FIFA WC 2026 tournament calendar and inspect the R16
 * matches that Opta has scheduled — their contestant slots will show
 * the actual placeholder pairings.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

;(async () => {
  // First check what kickoff times / venues we have for R16 — maybe I can
  // cross-reference with public sources (fifa.com, wikipedia) to reverse
  // the pairing from the venue schedule.
  const { data: r16 } = await sb
    .from('predictor_matches')
    .select('match_num, home_team_code, away_team_code, kickoff_at, venue, opta_fixture_id')
    .eq('round_code', 'r16')
    .order('match_num', { ascending: true })
  console.log('=== Current R16 in DB (post-overwrite) ===')
  for (const m of r16!) {
    console.log(`M${m.match_num}  ${m.home_team_code}  vs  ${m.away_team_code}  @${m.kickoff_at}  ${m.venue}  opta=${m.opta_fixture_id ?? 'none'}`)
  }

  // Also print the R16 fixtures scores page defines, if any
  console.log('\n=== s3_players.club check for pattern insight ===')

  // Check the Opta fixtures / fantasy_fixtures table for R16 pairings
  const { data: fFix, error: fErr } = await sb
    .from('fantasy_fixtures')
    .select('*')
    .gte('kickoff_at', '2026-07-04T00:00:00Z')
    .lte('kickoff_at', '2026-07-08T00:00:00Z')
    .order('kickoff_at', { ascending: true })
  console.log(`fantasy_fixtures err=${fErr?.message} rows=${fFix?.length}`)
  console.log(fFix)
})().catch(console.error)
