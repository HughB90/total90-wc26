#!/usr/bin/env node
/**
 * migrate-sofifa-photos.js
 *
 * Migrates s3_players.photo_url values pointing at cdn.sofifa.net to our own
 * Supabase Storage bucket (`player-photos`), so the live site doesn't depend
 * on a CDN that blocks hotlinking with HTTP 403.
 *
 * For each row whose photo_url matches '%sofifa%':
 *   1. GET the sofifa URL with NO Referer header (sofifa returns 200 w/o referer).
 *   2. If the response is a valid PNG, upload to
 *        player-photos/players/<opta_id>.png   (or <id>.png if opta_id is null)
 *      and update s3_players.photo_url to the public Supabase URL.
 *   3. On any failure (404, 403, non-image, upload error), log the row and set
 *      photo_url to NULL so the UI falls back to default.png.
 *
 * Safety / behavior:
 *   - Resumable: rows whose photo_url is already on the Supabase Storage domain
 *     are skipped. Re-running after a crash is safe.
 *   - Rate-limited: 5 concurrent fetches, 300ms gap between fetch starts.
 *   - Never touches any other column or table.
 *
 * Usage:
 *   node scripts/migrate-sofifa-photos.js [--dry-run] [--limit=N]
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// ─── env ──────────────────────────────────────────────────────────────────
const envCandidates = [
  path.resolve(__dirname, '..', '.env.local'),
  // Fallback: sibling main repo (worktrees usually don't have .env.local)
  path.resolve(__dirname, '..', '..', 'total90-wc26', '.env.local'),
]
const envFile = envCandidates.find((p) => fs.existsSync(p))
if (!envFile) {
  console.error('Could not find .env.local in', envCandidates)
  process.exit(1)
}
fs.readFileSync(envFile, 'utf8').split('\n').forEach((line) => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// ─── config ───────────────────────────────────────────────────────────────
const BUCKET = 'player-photos'
const PATH_PREFIX = 'players'
const CONCURRENCY = 5
const FETCH_GAP_MS = 300
const FETCH_TIMEOUT_MS = 15000
const SUPABASE_STORAGE_HOST = new URL(SUPABASE_URL).host // tituygkbondyjhzomwji.supabase.co

const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='))
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : null

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── helpers ──────────────────────────────────────────────────────────────
function publicUrlFor(filename) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${PATH_PREFIX}/${filename}`
}

function isPng(buffer) {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.length < 8) return false
  return (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  )
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    // Explicit headers: do NOT set Referer. Use a plain UA so sofifa returns 200.
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Total90-Migrator/1.0)',
        Accept: 'image/png,image/*;q=0.8,*/*;q=0.5',
      },
      signal: controller.signal,
      redirect: 'follow',
    })
    return res
  } finally {
    clearTimeout(timer)
  }
}

async function migrateOne(row) {
  const filename = `${(row.opta_id && String(row.opta_id).trim()) || row.id}.png`
  const storagePath = `${PATH_PREFIX}/${filename}`
  const newPublicUrl = publicUrlFor(filename)

  // 1) Fetch sofifa source
  let res
  try {
    res = await fetchWithTimeout(row.photo_url, FETCH_TIMEOUT_MS)
  } catch (e) {
    return { row, ok: false, reason: `fetch_error: ${e.name || ''} ${e.message || e}` }
  }
  if (!res.ok) {
    return { row, ok: false, reason: `fetch_status_${res.status}` }
  }
  const ab = await res.arrayBuffer()
  const buf = Buffer.from(ab)
  if (buf.length === 0) {
    return { row, ok: false, reason: 'empty_body' }
  }
  if (!isPng(buf)) {
    return { row, ok: false, reason: `not_png (first_bytes=${buf.slice(0, 8).toString('hex')})` }
  }

  // 2) Upload to Supabase Storage (upsert so re-runs overwrite cleanly)
  if (DRY_RUN) {
    return { row, ok: true, dryRun: true, newPublicUrl, bytes: buf.length }
  }

  const { error: upErr } = await sb.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: 'image/png',
    upsert: true,
    cacheControl: '604800',
  })
  if (upErr) {
    return { row, ok: false, reason: `upload_error: ${upErr.message || upErr}` }
  }

  // 3) Update row
  const { error: updErr } = await sb
    .from('s3_players')
    .update({ photo_url: newPublicUrl })
    .eq('id', row.id)
  if (updErr) {
    return { row, ok: false, reason: `db_update_error: ${updErr.message || updErr}` }
  }

  return { row, ok: true, newPublicUrl, bytes: buf.length }
}

async function nullifyPhoto(row, reason) {
  if (DRY_RUN) return { ok: true, dryRun: true }
  const { error } = await sb.from('s3_players').update({ photo_url: null }).eq('id', row.id)
  if (error) {
    return { ok: false, reason: `nullify_error: ${error.message || error}` }
  }
  return { ok: true, reason }
}

// ─── concurrency runner ───────────────────────────────────────────────────
async function runPool(items, worker, { concurrency, gapMs }) {
  const results = []
  let idx = 0
  let inflight = 0
  let lastStart = 0

  return new Promise((resolve, reject) => {
    const launchNext = () => {
      while (inflight < concurrency && idx < items.length) {
        const now = Date.now()
        const wait = Math.max(0, lastStart + gapMs - now)
        const myIdx = idx++
        inflight++
        lastStart = now + wait
        setTimeout(() => {
          worker(items[myIdx], myIdx)
            .then((r) => {
              results[myIdx] = r
            })
            .catch((e) => {
              results[myIdx] = { ok: false, reason: `worker_throw: ${e.message || e}`, row: items[myIdx] }
            })
            .finally(() => {
              inflight--
              if (idx >= items.length && inflight === 0) {
                resolve(results)
              } else {
                launchNext()
              }
            })
        }, wait)
      }
    }
    try {
      launchNext()
      if (items.length === 0) resolve(results)
    } catch (e) {
      reject(e)
    }
  })
}

// ─── main ─────────────────────────────────────────────────────────────────
;(async () => {
  console.log('==> migrate-sofifa-photos.js')
  console.log('   bucket:        ', BUCKET)
  console.log('   storage host:  ', SUPABASE_STORAGE_HOST)
  console.log('   dry-run:       ', DRY_RUN)
  console.log('   limit:         ', LIMIT ?? '(none)')
  console.log('   concurrency:   ', CONCURRENCY)
  console.log('   fetch gap ms:  ', FETCH_GAP_MS)
  console.log('')

  // Pull all sofifa rows
  let query = sb
    .from('s3_players')
    .select('id, opta_id, name, photo_url')
    .ilike('photo_url', '%sofifa%')
    .order('name')
  if (LIMIT) query = query.limit(LIMIT)
  const { data: rows, error } = await query
  if (error) {
    console.error('Query error:', error)
    process.exit(1)
  }
  console.log(`Found ${rows.length} sofifa-hosted rows.`)

  // Filter out anything already on supabase domain (defensive; resumability)
  const eligible = rows.filter((r) => !r.photo_url || !r.photo_url.includes(SUPABASE_STORAGE_HOST))
  const skippedAlready = rows.length - eligible.length
  if (skippedAlready > 0) {
    console.log(`Skipping ${skippedAlready} already on supabase domain.`)
  }
  console.log(`Will process ${eligible.length} rows.\n`)

  const t0 = Date.now()
  let done = 0
  const results = await runPool(
    eligible,
    async (row) => {
      const r = await migrateOne(row)
      done++
      if (done % 25 === 0 || done === eligible.length) {
        const pct = ((done / eligible.length) * 100).toFixed(1)
        console.log(`   [${done}/${eligible.length}] (${pct}%) last: ${row.name} -> ${r.ok ? 'ok' : 'FAIL ' + r.reason}`)
      }
      if (!r.ok) {
        // Null out so the UI falls back to default.png
        const nullRes = await nullifyPhoto(row, r.reason)
        r.nullified = nullRes.ok
        if (!nullRes.ok) r.nullifyReason = nullRes.reason
      }
      return r
    },
    { concurrency: CONCURRENCY, gapMs: FETCH_GAP_MS }
  )
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1)

  // Tally
  const migrated = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)

  console.log('\n==> summary')
  console.log(`   total found:   ${rows.length}`)
  console.log(`   processed:     ${eligible.length}`)
  console.log(`   migrated ok:   ${migrated.length}`)
  console.log(`   failed:        ${failed.length}`)
  console.log(`   skipped (already supabase): ${skippedAlready}`)
  console.log(`   elapsed:       ${elapsedSec}s`)

  // Write report
  const reportPath = path.resolve(__dirname, 'sofifa-migration-report.md')
  const reasonGroups = {}
  for (const f of failed) {
    const key = (f.reason || 'unknown').split(':')[0].split(' ')[0]
    reasonGroups[key] = (reasonGroups[key] || 0) + 1
  }
  const reasonLines = Object.entries(reasonGroups)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- \`${k}\`: ${v}`)
    .join('\n')

  const failList = failed
    .map((f) => `- ${f.row.name} (\`${f.row.opta_id || f.row.id}\`) — ${f.reason}${f.nullified ? ' [nullified]' : ''}`)
    .join('\n')

  const report = `# sofifa → Supabase Storage photo migration report

**Date:** ${new Date().toISOString()}
**Script:** \`scripts/migrate-sofifa-photos.js\`
**Bucket:** \`${BUCKET}\` (path \`${PATH_PREFIX}/<opta_id>.png\`)
**Dry run:** ${DRY_RUN}

## Totals
- Rows matching \`photo_url ILIKE '%sofifa%'\`: **${rows.length}**
- Skipped (already on \`${SUPABASE_STORAGE_HOST}\`): **${skippedAlready}**
- Processed: **${eligible.length}**
- Migrated successfully: **${migrated.length}**
- Failed (photo_url set to NULL → falls back to default.png): **${failed.length}**
- Elapsed: ${elapsedSec}s

## Failure reasons
${reasonLines || '_None._'}

## Failed rows
${failList || '_None._'}
`
  fs.writeFileSync(reportPath, report)
  console.log(`\nReport written to ${reportPath}`)

  process.exit(0)
})().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
