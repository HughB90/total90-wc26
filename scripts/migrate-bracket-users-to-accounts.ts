/**
 * ONE-SHOT MIGRATION: bracket_users → accounts + profiles
 * 
 * Run manually when flipping MULTI_PROFILE_ENABLED flag.
 * Idempotent: safe to re-run, skips existing accounts.
 * 
 * For each bracket_users row:
 * 1. Create account (email + password_hash = existing pin_hash as placeholder)
 * 2. Create owner profile (first_name + pin_hash + manager_name = first_name + "'s Bracket")
 * 3. Update bracket_entries.profile_id to point at new profile
 * 4. Update wc26_league_members.profile_id to point at new profile
 * 
 * DOES NOT delete bracket_users rows (kept for rollback reference).
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface BracketUser {
  id: string
  email: string | null
  display_name: string | null
  first_name: string | null
  pin_hash: string
  created_at: string
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════╗')
  console.log('║  MIGRATION: bracket_users → accounts + profiles                 ║')
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n')

  // Fetch all bracket_users
  const { data: bracketUsers, error: fetchError } = await supabase
    .from('bracket_users')
    .select('*')
    .order('created_at', { ascending: true })

  if (fetchError) {
    console.error('ERROR fetching bracket_users:', fetchError.message)
    process.exit(1)
  }

  if (!bracketUsers || bracketUsers.length === 0) {
    console.log('✅ No bracket_users found. Migration complete (nothing to do).\n')
    return
  }

  console.log(`Found ${bracketUsers.length} bracket_users to migrate:\n`)

  let migrated = 0
  let skipped = 0
  let failed = 0

  for (const user of bracketUsers as BracketUser[]) {
    const email = user.email || `generated-${user.id}@placeholder.total90.com`
    const firstName = user.first_name || user.display_name || 'User'
    const managerName = `${firstName}'s Bracket`

    console.log(`──────────────────────────────────────────────────────────────────`)
    console.log(`Processing: ${firstName} (${email})`)
    console.log(`  bracket_users.id: ${user.id}`)

    // Check if account already exists
    const { data: existingAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('email', email)
      .single()

    if (existingAccount) {
      console.log(`  ⏭️  SKIPPED: Account already exists (${existingAccount.id})`)
      skipped++
      continue
    }

    try {
      // 1. Create account (password_hash = existing pin_hash as placeholder)
      const { data: newAccount, error: accountError } = await supabase
        .from('accounts')
        .insert({
          email,
          password_hash: user.pin_hash,  // Parent can still log in with old PIN as password initially
          created_at: user.created_at
        })
        .select('id')
        .single()

      if (accountError) {
        console.error(`  ❌ ERROR creating account:`, accountError.message)
        failed++
        continue
      }

      console.log(`  ✅ Created account: ${newAccount.id}`)

      // 2. Create owner profile
      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert({
          account_id: newAccount.id,
          first_name: firstName,
          pin_hash: user.pin_hash,
          manager_name: managerName,
          display_name: user.display_name,
          is_owner: true,
          created_at: user.created_at
        })
        .select('id')
        .single()

      if (profileError) {
        console.error(`  ❌ ERROR creating profile:`, profileError.message)
        // Rollback account if profile fails
        await supabase.from('accounts').delete().eq('id', newAccount.id)
        failed++
        continue
      }

      console.log(`  ✅ Created owner profile: ${newProfile.id}`)
      console.log(`     Manager name: "${managerName}"`)

      // 3. Update bracket_entries.profile_id
      const { data: entries, error: entriesSelectError } = await supabase
        .from('bracket_entries')
        .select('id')
        .eq('user_id', user.id)

      if (entriesSelectError) {
        console.warn(`  ⚠️  Could not fetch bracket_entries for user ${user.id}:`, entriesSelectError.message)
      } else if (entries && entries.length > 0) {
        const { error: entriesUpdateError } = await supabase
          .from('bracket_entries')
          .update({ profile_id: newProfile.id })
          .eq('user_id', user.id)

        if (entriesUpdateError) {
          console.warn(`  ⚠️  Could not update bracket_entries.profile_id:`, entriesUpdateError.message)
        } else {
          console.log(`  ✅ Updated ${entries.length} bracket_entries.profile_id → ${newProfile.id}`)
        }
      }

      // 4. Update wc26_league_members.profile_id
      const { data: memberships, error: membershipsSelectError } = await supabase
        .from('wc26_league_members')
        .select('league_id')
        .eq('user_id', user.id)

      if (membershipsSelectError) {
        console.warn(`  ⚠️  Could not fetch wc26_league_members for user ${user.id}:`, membershipsSelectError.message)
      } else if (memberships && memberships.length > 0) {
        const { error: membershipsUpdateError } = await supabase
          .from('wc26_league_members')
          .update({ profile_id: newProfile.id })
          .eq('user_id', user.id)

        if (membershipsUpdateError) {
          console.warn(`  ⚠️  Could not update wc26_league_members.profile_id:`, membershipsUpdateError.message)
        } else {
          console.log(`  ✅ Updated ${memberships.length} wc26_league_members.profile_id → ${newProfile.id}`)
        }
      }

      migrated++

    } catch (err: any) {
      console.error(`  ❌ UNEXPECTED ERROR:`, err.message)
      failed++
    }
  }

  console.log(`\n╔═══════════════════════════════════════════════════════════════════╗`)
  console.log(`║  MIGRATION SUMMARY                                               ║`)
  console.log(`╠═══════════════════════════════════════════════════════════════════╣`)
  console.log(`║  Total users processed:  ${String(bracketUsers.length).padStart(3)}                                        ║`)
  console.log(`║  Successfully migrated:  ${String(migrated).padStart(3)}                                        ║`)
  console.log(`║  Skipped (already exist): ${String(skipped).padStart(3)}                                        ║`)
  console.log(`║  Failed:                 ${String(failed).padStart(3)}                                        ║`)
  console.log(`╚═══════════════════════════════════════════════════════════════════╝\n`)

  if (failed > 0) {
    console.error('⚠️  Some migrations failed. Review errors above.')
    process.exit(1)
  } else {
    console.log('✅ Migration complete!\n')
  }
}

main().catch(err => {
  console.error('FATAL ERROR:', err)
  process.exit(1)
})
