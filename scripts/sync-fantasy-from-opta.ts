#!/usr/bin/env tsx
/**
 * Sync fantasy stats from Opta MA1+MA2 to Supabase fantasy tables.
 *
 * Scoring is delegated to the vendored Python service
 * (HughB90/total90-scoring-controller, pinned to Josue v1.4 commit
 * 9ae12789494e8c5b2e26a3933a555c932fda4600). This script is a thin CLI
 * wrapper around `src/lib/fantasy/sync.ts`.
 *
 * Usage:
 *   npm run sync:fantasy              # full sync, writes to Supabase
 *   npm run sync:fantasy -- --dry-run # preview, no DB write
 *
 * Env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SCORING_API_URL        — base URL of total90-scoring-controller
 *   SCORING_API_TOKEN      — bearer token
 *   (Opta creds fall back to ~/.openclaw/workspace/keys/opta-api.json
 *    in dev — set OPTA_OUTLET + OPTA_SECRET to skip.)
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local before importing anything that reads env at module scope.
dotenv.config({ path: path.join(__dirname, '../.env.local') })

import { runFantasySync } from '../src/lib/fantasy/sync'

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const result = await runFantasySync({ dryRun: DRY_RUN })
  console.log('\n=== Result ===')
  console.log(JSON.stringify({ ...result, failures: undefined }, null, 2))
  if (result.failures.length > 0) {
    console.log(`First 5 failures:`)
    for (const f of result.failures.slice(0, 5)) {
      console.log(`  - ${f.opta_player_id}: ${f.error}`)
    }
  }
}

main().catch((e) => {
  console.error('💥 FATAL:', e)
  process.exit(1)
})
