#!/usr/bin/env node
/**
 * Migration: accounts table → Supabase auth.users
 *
 * Idempotent. For each row in `accounts`:
 *   1. Look up auth.users by email. If exists, reuse — do NOT recreate.
 *   2. Otherwise create a new auth.users row with id = accounts.id
 *      (so all existing FKs that point at accounts.id stay valid against
 *      auth.users.id without a backfill).
 *   3. Mark email_confirmed_at = NOW (no email-verification click required).
 *   4. Set a random temp password. The user will reset it via email link.
 *   5. Verify that every profile in `profiles` with this account_id still
 *      resolves correctly (account_id should already equal new auth.users.id).
 *
 * After all 5 are migrated, rename `accounts` → `accounts_deprecated_2026_05_20`
 * via a SQL migration. We rename rather than drop so we have a 14-day rollback.
 *
 * Run with:
 *   node scripts/migrate-accounts-to-supabase-auth.mjs
 *   node scripts/migrate-accounts-to-supabase-auth.mjs --rename-accounts-table
 *
 * Env required (read from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// ---- env loader ----
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = resolve(__dirname, '..', '.env.local')
try {
  const raw = readFileSync(envPath, 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
} catch (err) {
  console.warn('Could not read .env.local:', err.message)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function randomTempPassword() {
  // 32 random bytes, base64url. Way more than enough entropy.
  return randomBytes(32).toString('base64url')
}

// Direct admin-API call so we can pass an explicit `id` (the official JS SDK
// doesn't accept id on create as of @supabase/supabase-js@2.104).
async function adminCreateUserWithId({ id, email, password, emailConfirm }) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id,
      email,
      password,
      email_confirm: emailConfirm,
      user_metadata: { migrated_from_accounts: true, migration_date: '2026-05-20' },
    }),
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

async function findAuthUserByEmail(email) {
  // The admin API listUsers can filter by email via the page hack; cleanest is
  // to scan a small list. We've got 5 accounts so this is fine.
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw error
  const lc = email.toLowerCase().trim()
  return data.users.find((u) => (u.email ?? '').toLowerCase() === lc) ?? null
}

async function ensureProfileLinkage(accountId) {
  // We don't change anything — just sanity check that profiles still resolve.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, account_id, first_name, manager_name, is_owner')
    .eq('account_id', accountId)
    .is('deleted_at', null)
  if (error) throw error
  return data ?? []
}

async function main() {
  console.log('== Account → auth.users migration ==')
  console.log('Supabase:', SUPABASE_URL)

  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, email, created_at')
    .order('created_at', { ascending: true })

  if (accErr) {
    if (accErr.code === '42P01') {
      console.log(`'accounts' table not found — already renamed? Migration appears complete.`)
      process.exit(0)
    }
    throw accErr
  }

  if (!accounts || accounts.length === 0) {
    console.log('No accounts to migrate.')
    return
  }

  console.log(`Found ${accounts.length} accounts to migrate.\n`)

  const summary = []

  for (const acc of accounts) {
    const lcEmail = acc.email.toLowerCase().trim()
    let authUser = null
    let action = ''

    // 1. Already in auth.users?
    const existing = await findAuthUserByEmail(lcEmail)
    if (existing) {
      authUser = existing
      action = existing.id === acc.id ? 'EXISTS_SAME_ID' : 'EXISTS_DIFFERENT_ID'
    } else {
      // 2. Create with id pinned to accounts.id
      const tempPw = randomTempPassword()
      const created = await adminCreateUserWithId({
        id: acc.id,
        email: lcEmail,
        password: tempPw,
        emailConfirm: true,
      })
      if (!created.ok) {
        console.error(
          `[ERROR] ${lcEmail}: admin create failed`,
          created.status,
          JSON.stringify(created.body)
        )
        summary.push({ email: lcEmail, accountId: acc.id, status: 'FAIL', error: created.body })
        continue
      }
      authUser = created.body
      action = 'CREATED'
    }

    // 3. Verify + (if needed) backfill FK linkage
    let profiles = await ensureProfileLinkage(acc.id)
    let backfilled = 0
    if (authUser.id !== acc.id && profiles.length > 0) {
      // Existing FKs point at the old accounts.id. Rewrite them to point at the
      // new auth.users.id. profiles.id is unchanged — only profiles.account_id moves.
      const { error: upErr, count } = await supabase
        .from('profiles')
        .update({ account_id: authUser.id })
        .eq('account_id', acc.id)
        .select('id', { count: 'exact', head: true })
      if (upErr) {
        console.error(`   ⚠ profile FK backfill failed for ${lcEmail}:`, upErr.message)
      } else {
        backfilled = count ?? profiles.length
        // Re-fetch under the new account_id (the old id no longer matches)
        profiles = await ensureProfileLinkage(authUser.id)
      }
    }
    const linkageWarning =
      profiles.length === 0
        ? '⚠ no profiles linked to this account_id'
        : `${profiles.length} profile(s) linked${backfilled ? ` (backfilled ${backfilled})` : ''}`

    summary.push({
      email: lcEmail,
      oldAccountId: acc.id,
      newAuthUserId: authUser.id,
      idsMatch: authUser.id === acc.id,
      action,
      profiles: profiles.length,
      backfilled,
      linkageNote: linkageWarning,
    })

    console.log(
      `[${action.padEnd(20)}] ${lcEmail.padEnd(28)} auth.user.id=${authUser.id}  (${linkageWarning})`
    )

    if (authUser.id !== acc.id) {
      console.warn(
        `   ℹ️  IDs do not match (auth user pre-existed). Old accounts.id=${acc.id} new auth.users.id=${authUser.id}. ` +
          `Profiles backfilled in-place (count=${backfilled}).`
      )
    }
  }

  console.log('\n--- SUMMARY ---')
  console.table(summary)

  // Optionally rename `accounts` table
  if (process.argv.includes('--rename-accounts-table')) {
    console.log('\nRenaming `accounts` → `accounts_deprecated_2026_05_20`…')
    const { error: renameErr } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE accounts RENAME TO accounts_deprecated_2026_05_20;',
    })
    if (renameErr) {
      console.error('Rename failed (RPC may not exist):', renameErr.message)
      console.log('Run this manually in the Supabase SQL editor:')
      console.log('  ALTER TABLE accounts RENAME TO accounts_deprecated_2026_05_20;')
    } else {
      console.log('✅ Renamed.')
    }
  } else {
    console.log(
      '\n(skip rename: pass --rename-accounts-table to also rename the legacy table)'
    )
  }

  const failed = summary.filter((s) => s.status === 'FAIL')
  const mismatched = summary.filter((s) => s.idsMatch === false)
  if (failed.length || mismatched.length) {
    console.error(`\n${failed.length} failures, ${mismatched.length} id-mismatches.`)
    process.exit(1)
  }
  console.log('\n✅ Migration complete.')
}

main().catch((err) => {
  console.error('Migration crashed:', err)
  process.exit(1)
})
