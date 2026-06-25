#!/usr/bin/env tsx
/**
 * Backfill `first_name` / `last_name` on `fantasy_player_match_stats` from
 * the canonical Opta WC 2026 squads cache:
 *   ~/.openclaw/workspace/sheets/.cache/wc2026-squads-raw.json
 *
 * Each player in that cache has:
 *   { id, firstName, lastName, matchName, ... }
 *
 * `id` = Opta player ID = our `opta_player_id` foreign key.
 *
 * Run:
 *   cd ~/.openclaw/workspace/total90-wc26
 *   tsx scripts/backfill-fantasy-player-names.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 * (loaded via dotenv).
 */

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

// Load .env.local if present (tsx doesn't auto-load it)
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

const SQUADS_CACHE = path.resolve(
  process.env.HOME!,
  '.openclaw/workspace/sheets/.cache/wc2026-squads-raw.json'
)

interface OptaPerson {
  id: string
  firstName?: string
  lastName?: string
  matchName?: string
  shortFirstName?: string
  shortLastName?: string
}

interface SquadTeam {
  contestantName: string
  person: OptaPerson[]
}

interface SquadsCache {
  squad: SquadTeam[]
  lastUpdated: string
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  if (!fs.existsSync(SQUADS_CACHE)) {
    console.error(`❌ Squads cache not found at ${SQUADS_CACHE}`)
    console.error('   Run: node ~/.openclaw/workspace/sheets/_subagent-pull-opta-wc26-squads.js')
    process.exit(1)
  }

  const cache = JSON.parse(fs.readFileSync(SQUADS_CACHE, 'utf8')) as SquadsCache
  console.log(`📦 Loaded squads cache (lastUpdated: ${cache.lastUpdated})`)
  console.log(`   ${cache.squad.length} teams`)

  // Build map: opta_player_id -> { first_name, last_name }
  const nameMap = new Map<string, { first_name: string; last_name: string }>()
  for (const team of cache.squad) {
    for (const person of team.person) {
      if (!person.id) continue
      const first = person.firstName || person.shortFirstName || ''
      const last = person.lastName || person.shortLastName || ''
      if (!first && !last) continue
      nameMap.set(person.id, { first_name: first, last_name: last })
    }
  }
  console.log(`   ${nameMap.size} unique players with names`)

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Get all distinct opta_player_ids in fantasy_player_match_stats
  const { data: rows, error: fetchErr } = await supabase
    .from('fantasy_player_match_stats')
    .select('id, opta_player_id, first_name, last_name')

  if (fetchErr) {
    console.error('❌ Fetch error:', fetchErr.message)
    process.exit(1)
  }

  console.log(`\n📊 ${rows?.length || 0} fantasy_player_match_stats rows in DB`)

  const distinctIds = new Set((rows || []).map(r => r.opta_player_id))
  console.log(`   ${distinctIds.size} distinct players`)

  let updated = 0
  let missing = 0
  let alreadyFilled = 0

  // Group rows by opta_player_id, update each group in one go
  const byPlayer = new Map<string, typeof rows>()
  for (const r of rows || []) {
    if (!byPlayer.has(r.opta_player_id)) byPlayer.set(r.opta_player_id, [])
    byPlayer.get(r.opta_player_id)!.push(r)
  }

  const missingPlayers: string[] = []

  for (const [playerId, playerRows] of byPlayer) {
    const names = nameMap.get(playerId)
    if (!names) {
      missing++
      missingPlayers.push(playerId)
      continue
    }

    // Skip if all rows already have these names set (idempotent)
    const allFilled = playerRows!.every(
      r => r.first_name === names.first_name && r.last_name === names.last_name
    )
    if (allFilled) {
      alreadyFilled++
      continue
    }

    const { error: updErr } = await supabase
      .from('fantasy_player_match_stats')
      .update({ first_name: names.first_name, last_name: names.last_name })
      .eq('opta_player_id', playerId)

    if (updErr) {
      console.error(`   ❌ Update fail for ${playerId}: ${updErr.message}`)
      continue
    }
    updated += playerRows!.length
  }

  console.log(`\n✅ Backfill complete`)
  console.log(`   Player rows updated: ${updated}`)
  console.log(`   Players already filled (skipped): ${alreadyFilled}`)
  console.log(`   Players missing from squads cache: ${missing}`)
  if (missingPlayers.length > 0 && missingPlayers.length <= 20) {
    console.log(`   Missing opta_player_ids: ${missingPlayers.join(', ')}`)
  }
}

main().catch(e => {
  console.error('❌ Fatal:', e)
  process.exit(1)
})
