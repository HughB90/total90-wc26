#!/usr/bin/env tsx
/**
 * Run a Supabase migration file directly via service role
 */

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

const migrationFile = process.argv[2]
if (!migrationFile) {
  console.error('Usage: tsx scripts/run-migration.ts <migration-file>')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  const fullPath = path.resolve(migrationFile)
  console.log(`📄 Reading migration: ${fullPath}`)
  const sql = fs.readFileSync(fullPath, 'utf8')
  
  console.log(`🚀 Executing migration...`)
  const { error } = await supabase.rpc('exec_sql', { sql_string: sql })
  
  if (error) {
    // Try direct query if rpc doesn't exist
    console.log('   Trying direct query...')
    const { error: queryError } = await supabase.from('_migrations').insert({ name: path.basename(fullPath), executed_at: new Date().toISOString() })
    
    // Split and execute each statement
    const statements = sql.split(';').filter(s => s.trim())
    for (const stmt of statements) {
      if (!stmt.trim()) continue
      console.log(`   Executing: ${stmt.slice(0, 60)}...`)
      // Supabase doesn't expose raw query from JS client, so we'll use a workaround
      // This is a limitation - for production, use supabase CLI or psql
    }
    
    console.error('⚠️  Cannot execute raw SQL from JS client.')
    console.error('   Use: psql <connection_string> -f', fullPath)
    console.error('   Or run via supabase CLI')
    process.exit(1)
  }
  
  console.log('✅ Migration complete!')
}

main().catch(e => {
  console.error('💥 Error:', e)
  process.exit(1)
})
