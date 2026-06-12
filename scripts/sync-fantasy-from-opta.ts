#!/usr/bin/env tsx
/**
 * Sync fantasy stats from Opta MA1+MA2 to Supabase fantasy tables.
 * 
 * Pulls all played WC2026 fixtures, scores each player using v1.4 controller,
 * and upserts to fantasy_fixtures + fantasy_player_match_stats.
 * 
 * Usage:
 *   npm run sync:fantasy              # full sync
 *   npm run sync:fantasy -- --dry-run # preview without DB write
 */

import * as dotenv from 'dotenv'
import * as crypto from 'crypto'
import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

// Load .env.local
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const optaKey = JSON.parse(fs.readFileSync(path.join(process.env.HOME!, '.openclaw/workspace/keys/opta-api.json'), 'utf8'))
const OUTLET_KEY = optaKey.outletApiKey
const SECRET_KEY = optaKey.secretKey1
const WC2026_TMCL = '873cbl9cd9butm4air0mugxzo'

const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ──────────────────────────────────────────────────────────────────────────────
// Opta OAuth
// ──────────────────────────────────────────────────────────────────────────────

function getOptaToken(): Promise<string> {
  const ts = Date.now().toString()
  const hash = crypto.createHash('sha512').update(OUTLET_KEY + ts + SECRET_KEY).digest('hex')
  const body = new URLSearchParams({ grant_type: 'client_credentials', scope: 'b2b-feeds-auth' }).toString()
  
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth.performgroup.com',
      path: `/oauth/token/${OUTLET_KEY}?_fmt=json&_rt=b`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${hash}`,
        'Timestamp': ts,
      },
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (!json.access_token) return reject(new Error('No token: ' + data))
          resolve(json.access_token)
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function optaGet(token: string, path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.performfeeds.com',
      path,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`))
        }
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

// ──────────────────────────────────────────────────────────────────────────────
// v1.4 Scoring
// ──────────────────────────────────────────────────────────────────────────────

type PosType = 'GK' | 'DEF' | 'MID' | 'FWD'

// Opta position strings observed: "Goalkeeper", "Defender", "Wing Back",
// "Defensive Midfielder", "Midfielder", "Attacking Midfielder", "Striker", "Forward", "Substitute".
// Per v1.4 doc: Strikers AND Attacking Midfielders both use FWD weights.
function getPos(posRaw: string | undefined): PosType {
  if (!posRaw) return 'MID'
  const p = posRaw.toUpperCase()
  if (p === 'GOALKEEPER' || p === 'GK' || p.includes('KEEPER')) return 'GK'
  // FWD must be checked BEFORE generic 'MIDFIELDER' check — "Attacking Midfielder" is FWD per v1.4
  if (p === 'STRIKER' || p === 'FORWARD' || p === 'ATTACKING MIDFIELDER' ||
      p.includes('FORWARD') || p.includes('STRIKER') || p.includes('ATTACKING MID') ||
      p === 'FW' || p === 'LW' || p === 'RW' || p === 'ST' || p === 'CF' || p === 'CAM') {
    return 'FWD'
  }
  // DEF: explicit list (don't use 'DEF' substring, would match "Defensive Midfielder")
  if (p === 'DEFENDER' || p === 'WING BACK' || p === 'CB' || p === 'LB' || p === 'RB' || p === 'WB' ||
      p === 'CENTER BACK' || p === 'FULL BACK') {
    return 'DEF'
  }
  if (p === 'MIDFIELDER' || p === 'DEFENSIVE MIDFIELDER' || p.includes('MIDFIELDER') ||
      p === 'CM' || p === 'DM' || p === 'CDM') {
    return 'MID'
  }
  // 'Substitute' — unknown on-field role. Default MID; future: lookup FIFA roster position.
  return 'MID'
}

const PTS: Record<PosType, Record<string, number>> = {
  FWD: { mins45:3, minsU45:1, goals:7, assist:7, sot:1, snot:1, foulDrawn:1, dribble:1, aerialWon:0.25, foul:-1, interception:0.5, tackle:0.5, block:0.25, offside:-1, penCon:-3, ownGoal:-5, yellow:-1, red:-10, pass:0.1, longBall:0.25, f3:0.2, ppa:0.2, throughBall:1, keyPass:1, touchInBox:1, winningGoal:5, ballRecovery:0.5, dispossessed:-1, possLost:-0.25, cross:0.5 },
  MID: { mins45:5, minsU45:2, goals:5, assist:5, sot:0.5, snot:0.5, foulDrawn:0.5, dribble:0.5, aerialWon:0.25, foul:-1, interception:0.5, tackle:0.5, block:0.25, offside:-1, penCon:-3, ownGoal:-5, yellow:-1, red:-10, pass:0.1, longBall:0.25, f3:0.2, ppa:0.2, throughBall:1, keyPass:1, touchInBox:1, winningGoal:5, ballRecovery:0.5, dispossessed:-1, possLost:-0.25, cross:0.5 },
  DEF: { mins45:7, minsU45:3, goals:3, assist:3, sot:0.25, snot:0.25, foulDrawn:0.25, dribble:0.25, aerialWon:0.5, cleanSheet:3, gc:-2, foul:-0.5, interception:1, tackle:1, block:0.5, offside:-1, penCon:-3, ownGoal:-5, yellow:-1, red:-10, pass:0.1, longBall:0.25, f3:0.2, ppa:0.2, throughBall:1, keyPass:1, touchInBox:1, winningGoal:5, ballRecovery:0.5, dispossessed:-1, possLost:-0.25, cross:0.5 },
  GK:  { mins45:10, minsU45:4, goals:3, assist:3, sot:0.25, snot:0.25, foulDrawn:0.25, dribble:0.25, aerialWon:0.5, cleanSheet:3, gc:-2, foul:-0.5, interception:1, tackle:1, block:0.5, offside:-1, penCon:-3, ownGoal:-5, yellow:-1, red:-10, pass:0.1, longBall:0.1, f3:0.2, ppa:0.2, throughBall:1, keyPass:1, touchInBox:1, winningGoal:5, ballRecovery:0, dispossessed:-1, possLost:-0.25, save:1, cross:0.5, keeperThrow:0.25, goalKick:0.2 },
}

function statMap(player: any): Record<string, number> {
  const m: Record<string, number> = {}
  for (const s of (player.stat || [])) {
    m[s.type] = parseFloat(s.value) || 0
  }
  return m
}

const g = (m: Record<string, number>, k: string) => m[k] || 0

function scorePlayer(
  player: any,
  posType: PosType,
  teamCleanSheet: boolean,
  teamGoalsConceded: number,
  isWinner: boolean
): { total: number; breakdown: Record<string, number>; mins: number; rawStats: Record<string, number> } {
  const s = statMap(player)
  const M = PTS[posType]
  const breakdown: Record<string, number> = {}
  let total = 0
  const add = (label: string, val: number) => {
    if (val) {
      breakdown[label] = Math.round(val * 100) / 100
      total += val
    }
  }

  const mins = g(s, 'minsPlayed')
  if (mins > 0) add('mins', mins >= 45 ? M.mins45 : M.minsU45)

  add('goals', g(s, 'goals') * M.goals)
  add('assist', g(s, 'goalAssist') * M.assist)

  const sot = g(s, 'ontargetScoringAtt')
  const totalShots = g(s, 'totalScoringAtt')
  const snot = Math.max(0, totalShots - sot)
  add('shot_on_target', sot * M.sot)
  add('shot_off_target', snot * M.snot)

  add('fouled', g(s, 'wasFouled') * M.foulDrawn)
  add('dribble', g(s, 'wonContest') * M.dribble)
  add('aerial_won', g(s, 'aerialWon') * M.aerialWon)

  if (posType === 'DEF' || posType === 'GK') {
    if (teamCleanSheet && mins >= 60 && g(s, 'cleanSheet')) add('clean_sheet', M.cleanSheet)
    add('goals_conceded', teamGoalsConceded * M.gc)
  }

  add('foul', g(s, 'fouls') * M.foul)
  add('interception', g(s, 'interceptionWon') * M.interception)
  add('tackle', g(s, 'wonTackle') * M.tackle)
  add('block', g(s, 'outfielderBlock') * M.block)
  add('offside', g(s, 'totalOffside') * M.offside)
  add('yellow', g(s, 'yellowCard') * M.yellow)
  add('red', g(s, 'redCard') * M.red)

  add('accurate_pass', g(s, 'accuratePass') * M.pass)
  add('accurate_long_ball', g(s, 'accurateLongBalls') * M.longBall)
  add('accurate_cross', g(s, 'accurateCrossNocorner') * M.cross)
  add('final_third_pass', g(s, 'successfulFinalThirdPasses') * M.f3)
  add('pen_area_pass', g(s, 'successfulPenAreaEntries') * M.ppa)

  add('key_pass', g(s, 'totalAttAssist') * M.keyPass)
  add('through_ball', g(s, 'accurateThroughBall') * M.throughBall)
  add('touch_in_box', g(s, 'touchesInOppBox') * M.touchInBox)
  add('winning_goal', g(s, 'winningGoal') * M.winningGoal)

  add('ball_recovery', g(s, 'ballRecovery') * M.ballRecovery)
  add('dispossessed', g(s, 'dispossessed') * M.dispossessed)
  add('poss_lost', g(s, 'possLostAll') * M.possLost)

  if (posType === 'GK') {
    add('save', g(s, 'saves') * M.save)
    add('keeper_throw', g(s, 'accurateKeeperThrows') * (M.keeperThrow || 0.25))
    add('goal_kick', g(s, 'accurateGoalKicks') * (M.goalKick || 0.2))
  }

  return { total: Math.round(total * 100) / 100, breakdown, mins, rawStats: s }
}

// ──────────────────────────────────────────────────────────────────────────────
// Round code derivation
// ──────────────────────────────────────────────────────────────────────────────

function deriveRoundCode(stage: string | undefined, matchNum: number): string {
  if (!stage) return 'WC2026-MD1'
  const s = stage.toLowerCase()
  if (s.includes('group') || matchNum <= 48) {
    if (matchNum <= 16) return 'WC2026-MD1'
    if (matchNum <= 32) return 'WC2026-MD2'
    return 'WC2026-MD3'
  }
  if (s.includes('32')) return 'WC2026-R32'
  if (s.includes('16')) return 'WC2026-R16'
  if (s.includes('quarter')) return 'WC2026-QF'
  if (s.includes('semi')) return 'WC2026-SF'
  if (s.includes('final')) return matchNum === 103 ? 'WC2026-3RD' : 'WC2026-F'
  return 'WC2026-MD1'
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔐 Getting Opta token...')
  const token = await getOptaToken()

  console.log('📥 Pulling MA1 fixtures (live=yes)...')
  const ma1 = await optaGet(token, `/soccerdata/match/${OUTLET_KEY}?tmcl=${WC2026_TMCL}&live=yes&_rt=b&_fmt=json&_pgSz=200`)
  const matches = ma1.match || []
  console.log(`   ${matches.length} fixtures total`)

  const played = matches.filter((m: any) => m.liveData?.matchDetails?.matchStatus === 'Played')
  console.log(`   ${played.length} played`)

  if (played.length === 0) {
    console.log('✅ No played matches yet. Exiting.')
    return
  }

  // Get WC2026 competition ID
  const { data: comp } = await supabase.from('fantasy_competitions').select('id').eq('code', 'WC2026').single()
  if (!comp) throw new Error('WC2026 competition not found in DB')
  const compId = comp.id

  const fixtureRows: any[] = []
  const playerRows: any[] = []

  for (const m of played) {
    const mi = m.matchInfo
    const fxId = mi.id
    console.log(`\n🔄 Processing fixture ${fxId}...`)

    // Pull MA2
    let ma2: any
    try {
      ma2 = await optaGet(token, `/soccerdata/matchstats/${OUTLET_KEY}?fx=${fxId}&detailed=yes&_rt=b&_fmt=json`)
    } catch (e: any) {
      console.error(`   ❌ MA2 fail: ${e.message}`)
      continue
    }

    const liveData = ma2.liveData || ma2
    const lineUps = liveData.lineUp || ma2.matchStats || []
    const home = mi.contestant?.find((c: any) => c.position === 'home')
    const away = mi.contestant?.find((c: any) => c.position === 'away')
    const scores = m.liveData?.matchDetails?.scores || {}
    const homeScore = scores.total?.home ?? scores.ft?.home ?? 0
    const awayScore = scores.total?.away ?? scores.ft?.away ?? 0

    const roundCode = deriveRoundCode(mi.stage?.name, mi.matchNumber)

    fixtureRows.push({
      competition_id: compId,
      opta_fixture_id: fxId,
      date: mi.date,
      round_code: roundCode,
      round_name: mi.stage?.name || 'Group Stage',
      stage: roundCode.includes('MD') ? 'Group' : 'Knockout',
      home_team: home?.name || 'Unknown',
      away_team: away?.name || 'Unknown',
      home_score: homeScore,
      away_score: awayScore,
      status: 'played',
    })

    for (const lu of lineUps) {
      const isHome = lu.contestantId === home?.id
      const teamName = isHome ? home?.name : away?.name
      const teamGoals = isHome ? homeScore : awayScore
      const opponentGoals = isHome ? awayScore : homeScore
      const teamCleanSheet = opponentGoals === 0
      const isWinner = teamGoals > opponentGoals

      for (const p of (lu.player || [])) {
        const posType = getPos(p.position || p.matchPosition)
        const result = scorePlayer(p, posType, teamCleanSheet, opponentGoals, isWinner)
        if (result.mins === 0) continue

        playerRows.push({
          competition_id: compId,
          opta_player_id: p.playerId,
          name: p.matchName || p.shortName || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
          team: teamName,
          position: p.position || p.matchPosition,
          pos_type: posType,
          mins: result.mins,
          fantasy_points: result.total,
          breakdown: result.breakdown,
          raw_stats: result.rawStats,
        })
      }
    }

    await new Promise(r => setTimeout(r, 400)) // Rate limit
  }

  console.log(`\n📊 Summary:`)
  console.log(`   ${fixtureRows.length} fixtures`)
  console.log(`   ${playerRows.length} player-match rows`)

  if (DRY_RUN) {
    console.log('\n🚧 DRY RUN — no DB write')
    console.log('\nTop 10 performers:')
    playerRows.sort((a, b) => b.fantasy_points - a.fantasy_points)
    playerRows.slice(0, 10).forEach((p, i) => {
      console.log(`${i+1}. ${p.name} (${p.pos_type}, ${p.team}) — ${p.fantasy_points} pts`)
    })
    return
  }

  console.log('\n💾 Writing to Supabase...')

  // Upsert fixtures
  for (const fx of fixtureRows) {
    const { error } = await supabase.from('fantasy_fixtures').upsert(fx, {
      onConflict: 'competition_id,opta_fixture_id',
    })
    if (error) console.error(`   ❌ Fixture upsert error:`, error)
  }

  // Get fixture UUIDs
  const { data: fixtures } = await supabase
    .from('fantasy_fixtures')
    .select('id, opta_fixture_id')
    .eq('competition_id', compId)
  
  const fixtureIdMap = new Map(fixtures?.map(f => [f.opta_fixture_id, f.id]) || [])

  // Enrich player rows with fixture_id
  for (const pr of playerRows) {
    const fixtureOptaId = fixtureRows.find(f => f.home_team === pr.team || f.away_team === pr.team)?.opta_fixture_id
    if (fixtureOptaId) {
      pr.fixture_id = fixtureIdMap.get(fixtureOptaId)
    }
  }

  // Upsert player stats
  for (const pr of playerRows) {
    if (!pr.fixture_id) continue
    const { error } = await supabase.from('fantasy_player_match_stats').upsert(pr, {
      onConflict: 'fixture_id,opta_player_id',
    })
    if (error) console.error(`   ❌ Player stat upsert error:`, error)
  }

  console.log('✅ Sync complete!')
}

main().catch(e => {
  console.error('💥 FATAL:', e)
  process.exit(1)
})
