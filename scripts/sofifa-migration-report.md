# sofifa → Supabase Storage photo migration report

**Date:** 2026-06-06T03:36:18.187Z
**Script:** `scripts/migrate-sofifa-photos.js`
**Bucket:** `player-photos` (path `players/<opta_id>.png`)
**Dry run:** false

## Totals
- Rows matching `photo_url ILIKE '%sofifa%'`: **399**
- Skipped (already on `tituygkbondyjhzomwji.supabase.co`): **0**
- Processed: **399**
- Migrated successfully: **392**
- Failed (photo_url set to NULL → falls back to default.png): **7**
- Elapsed: 122.9s

## Failure reasons
- `fetch_status_404`: 7

## Failed rows
- Adem Arous (`5gc13odno30w98ib9ioqd1bmc`) — fetch_status_404 [nullified]
- Bassam Husham Ali Al Rawi (`28a883m3vivjdrssdxvxk84ix`) — fetch_status_404 [nullified]
- Jhon Córdoba (`b4mjy8dua9w3zuaocw5j7z4k5`) — fetch_status_404 [nullified]
- João Paulo Moreira Fernandes (`62wiaf9aq81mxp47zfebv66p6`) — fetch_status_404 [nullified]
- Jorge Gutiérrez (`60heyptjjpkrufn7mebb75p0p`) — fetch_status_404 [nullified]
- Lucas Michel Mendes (`iav4dcbhxbyykj8kfd3y1fx1`) — fetch_status_404 [nullified]
- Ricardo Adé (`ecaofku4htx8if4kk2teq1rrp`) — fetch_status_404 [nullified]
