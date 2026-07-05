/**
 * REPAIR: overwrite R16 pairings in predictor_matches with ground truth
 * from Opta MA1 fixtures endpoint.
 *
 * Prior script `resolve-r16-placeholders.ts` was WRONG — it assumed the
 * "Winner M73/M74/M75..." placeholders paired sequentially, but the real
 * WC 2026 bracket uses group-position seeding (group winners cross with
 * runner-ups). Ground truth pulled from Opta 2026-07-04.
 *
 * Correct pairings (verified against Opta):
 *   M89 Canada vs Morocco       (Jul 4 17:00 UTC)
 *   M90 Paraguay vs France      (Jul 4 21:00 UTC)
 *   M91 Brazil vs Norway        (Jul 5 20:00 UTC)
 *   M92 Mexico vs England       (Jul 6 00:00 UTC)
 *   M93 Portugal vs Spain       (Jul 6 19:00 UTC)
 *   M94 United States vs Belgium (Jul 7 00:00 UTC)
 *   M95 Argentina vs Egypt      (Jul 7 16:00 UTC)
 *   M96 Switzerland vs Colombia (Jul 7 20:00 UTC)
 *
 * Kickoff times + venues left alone (they were already correct in DB).
 * Also fills opta_fixture_id where we now know it (helps the fixture-sync
 * cron pick up live scores when R16 kicks off).
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const DRY = process.argv.includes('--dry')

// Verified via /soccerdata/match/... on 2026-07-04.
const R16_TRUTH: Array<{ num: number; home: string; away: string; opta_id: string }> = [
  { num: 89, home: 'Canada',        away: 'Morocco',   opta_id: '1tfdd32vy6ouod43ek7l7kc9g' },
  { num: 90, home: 'Paraguay',      away: 'France',    opta_id: '71syco9icpb3gpojexfq9sh04' },
  { num: 91, home: 'Brazil',        away: 'Norway',    opta_id: '9fqb3vpytcmgk9pozahr7iz9w' },
  { num: 92, home: 'Mexico',        away: 'England',   opta_id: 'b083yrj18tbck1z0og2evbhuc' },
  { num: 93, home: 'Portugal',      away: 'Spain',     opta_id: '5fim3od605k9wne6uuiw641ec' },
  { num: 94, home: 'United States', away: 'Belgium',   opta_id: '7djxwsgj6k02ts4b8lj2akqok' },
  { num: 95, home: 'Argentina',     away: 'Egypt',     opta_id: 'ceq6z0bte8pgdbc2uwxni0x78' },
  { num: 96, home: 'Switzerland',   away: 'Colombia',  opta_id: 'em70mwgw22fdt9i4womogw93o' },
]

;(async () => {
  for (const row of R16_TRUTH) {
    const { data: existing } = await sb
      .from('predictor_matches')
      .select('id, match_num, home_team_code, away_team_code, opta_fixture_id')
      .eq('match_num', row.num)
      .maybeSingle()
    if (!existing) { console.log(`M${row.num}: NOT FOUND`); continue }

    const patch: Record<string, string> = {}
    if (existing.home_team_code !== row.home) patch.home_team_code = row.home
    if (existing.away_team_code !== row.away) patch.away_team_code = row.away
    if (existing.opta_fixture_id !== row.opta_id) patch.opta_fixture_id = row.opta_id

    if (Object.keys(patch).length === 0) {
      console.log(`M${row.num}: already correct (${row.home} vs ${row.away})`)
      continue
    }
    console.log(`M${row.num}: ${existing.home_team_code} → ${row.home}  |  ${existing.away_team_code} → ${row.away}${DRY ? '  (DRY)' : ''}`)
    if (!DRY) {
      const { error } = await sb.from('predictor_matches').update(patch).eq('id', existing.id)
      if (error) { console.error(`  FAIL: ${error.message}`); continue }
    }
  }
  console.log(`\n${DRY ? 'PLAN' : 'DONE'}`)
})().catch(e => { console.error(e); process.exit(1) })
