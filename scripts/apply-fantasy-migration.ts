#!/usr/bin/env tsx
/**
 * Apply the fantasy tables migration via direct SQL execution
 * Uses Supabase Management API
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const MANAGEMENT_TOKEN = JSON.parse(
  fs.readFileSync(path.join(process.env.HOME!, '.openclaw/workspace/keys/supabase-token.json'), 'utf8')
).token

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

if (!PROJECT_REF) {
  console.error('Could not extract project ref from SUPABASE_URL')
  process.exit(1)
}

async function executeSql(sql: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql })
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MANAGEMENT_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data}`))
        }
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          resolve(data)
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main() {
  console.log('📄 Reading migration file...')
  const migrationPath = path.join(__dirname, '../supabase/migrations/2026-06-12-fantasy-tables.sql')
  const sql = fs.readFileSync(migrationPath, 'utf8')
  
  console.log(`🚀 Executing migration on project ${PROJECT_REF}...`)
  
  try {
    const result = await executeSql(sql)
    console.log('✅ Migration applied successfully!')
    console.log(result)
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

main()
