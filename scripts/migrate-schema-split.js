#!/usr/bin/env node
/**
 * migrate-schema-split.js
 *
 * Applies the t90_players / t90_player_intelligence / wc26_matches schema split:
 *   1. Applies the DDL migration (CREATE TABLE x3, ALTER s3_votes, COMMENTs)
 *   2. Backfills `t90_players` from canonical s3_players rows + orphan legacy rows
 *   3. Backfills `t90_player_intelligence` with vote counters MERGED from
 *      legacy-numeric-opta duplicates into their canonical name match
 *   4. Verifies row counts, vote sums, and 5 spot-check players
 *
 * Default: DRY RUN. Pass --apply to write.
 *
 * Usage:
 *   node scripts/migrate-schema-split.js
 *   node scripts/migrate-schema-split.js --apply
 *
 * Project ref: tituygkbondyjhzomwji
 * Token:        ~/.openclaw/workspace/keys/supabase-token.json
 * Service key:  ~/.openclaw/workspace/total90-wc26/.env.local
 */

const fs   = require('fs');
const path = require('path');

const APPLY        = process.argv.includes('--apply');
const PROJECT_REF  = 'tituygkbondyjhzomwji';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const MGMT_URL     = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
const MIGRATION_SQL = path.join(__dirname, '..', 'supabase', 'migrations', '2026-06-06-schema-split-players-intel.sql');

function loadMgmtToken() {
  const p = path.join(process.env.HOME, '.openclaw/workspace/keys/supabase-token.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).token;
}

function loadServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const envPath = path.join(process.env.HOME, '.openclaw/workspace/total90-wc26/.env.local');
  const txt = fs.readFileSync(envPath, 'utf8');
  const m = txt.match(/^SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+?)\s*$/m);
  if (!m) throw new Error('SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  return m[1].trim();
}

const MGMT_TOKEN = loadMgmtToken();
const SR_KEY     = loadServiceRoleKey();

async function mgmtQuery(sql) {
  const resp = await fetch(MGMT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MGMT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`mgmt ${resp.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function sbReq(method, pathFragment, body, prefer = 'return=representation') {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1${pathFragment}`, {
    method,
    headers: {
      'apikey': SR_KEY,
      'Authorization': `Bearer ${SR_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': prefer,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`PostgREST ${method} ${pathFragment} ${resp.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function fetchAllS3Players() {
  const out = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const to = from + PAGE - 1;
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/s3_players?select=*&order=id.asc`,
      {
        headers: {
          'apikey': SR_KEY,
          'Authorization': `Bearer ${SR_KEY}`,
          'Range-Unit': 'items',
          'Range': `${from}-${to}`,
        },
      },
    );
    if (!resp.ok) throw new Error(`fetchAllS3Players ${resp.status}: ${await resp.text()}`);
    const batch = await resp.json();
    out.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

function isLegacyOpta(opta) {
  return /^[0-9]+$/.test(opta || '');
}

function pickShortPos(positionFull) {
  if (!positionFull) return null;
  const p = positionFull.toLowerCase();
  if (p.startsWith('goal') || p === 'gk') return 'GK';
  if (p.includes('def') || p.includes('back')) return 'DEF';
  if (p.includes('mid')) return 'MID';
  if (p.includes('for') || p.includes('strik') || p.includes('att') || p.includes('wing')) return 'FWD';
  return null;
}

(async () => {
  console.log(`\n=== migrate-schema-split  [${APPLY ? 'APPLY' : 'DRY RUN'}] ===\n`);

  // ---------- STEP 1: DDL ----------
  console.log('[1/5] DDL migration');
  const ddl = fs.readFileSync(MIGRATION_SQL, 'utf8');
  if (APPLY) {
    // Idempotency: skip DDL if all 3 tables already exist (allows resume after PostgREST cache lag)
    const existing = await mgmtQuery(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('t90_players','t90_player_intelligence','wc26_matches');`);
    if (existing.length === 3) {
      console.log('   ✅ tables already exist — skipping DDL (idempotent resume)');
    } else {
      console.log('   running migration SQL via management API...');
      await mgmtQuery(ddl);
      console.log('   ✅ tables created (t90_players, t90_player_intelligence, wc26_matches), s3_votes altered');
      console.log('   reloading PostgREST schema cache...');
      await mgmtQuery(`NOTIFY pgrst, 'reload schema';`);
      // Wait for cache to refresh (PostgREST polls notify, can take a few seconds)
      await new Promise(r => setTimeout(r, 6000));
    }
  } else {
    console.log(`   (dry run) would execute ${MIGRATION_SQL}`);
    console.log(`   SQL size: ${ddl.length} chars, ${(ddl.match(/CREATE TABLE/g) || []).length} CREATE TABLE, ${(ddl.match(/ALTER TABLE/g) || []).length} ALTER TABLE`);
  }

  // ---------- STEP 2: read s3_players ----------
  console.log('\n[2/5] reading s3_players...');
  const allRows = await fetchAllS3Players();
  console.log(`   ${allRows.length} rows`);

  const legacyRows    = allRows.filter(r => isLegacyOpta(r.opta_id));
  const canonicalRows = allRows.filter(r => !isLegacyOpta(r.opta_id));
  console.log(`   legacy-numeric-opta rows: ${legacyRows.length}`);
  console.log(`   canonical-uuid-opta rows: ${canonicalRows.length}`);

  // index canonical by name
  const canonByName = new Map();
  for (const c of canonicalRows) {
    if (!canonByName.has(c.name)) canonByName.set(c.name, []);
    canonByName.get(c.name).push(c);
  }

  // ---------- STEP 3: plan vote merges ----------
  console.log('\n[3/5] planning duplicate-merge (legacy → canonical)');
  const merges  = [];         // { legacy, canonical, sums }
  const orphans = [];         // legacy rows with no canonical name-match
  for (const lg of legacyRows) {
    const matches = canonByName.get(lg.name) || [];
    if (matches.length === 0) {
      orphans.push(lg);
      continue;
    }
    if (matches.length > 1) {
      console.log(`   ⚠️  ${lg.name} has ${matches.length} canonical matches — using first by id`);
    }
    const can = matches[0];
    merges.push({
      legacy: lg,
      canonical: can,
      sums: {
        vote_count: lg.vote_count || 0,
        sign_count: lg.sign_count || 0,
        sell_count: lg.sell_count || 0,
        sack_count: lg.sack_count || 0,
      },
    });
  }

  console.log(`   merge pairs: ${merges.length}`);
  console.log(`   orphan legacy (no canonical, kept standalone): ${orphans.length}`);
  console.log();
  console.log('   --- merge plan (legacy → canonical) ---');
  for (const m of merges) {
    const note = m.sums.vote_count > 0 ? '   ← +' + m.sums.vote_count + ' votes' : '';
    console.log(`   ${m.legacy.name.padEnd(34)} ${m.legacy.opta_id.padEnd(8)}(${(m.legacy.nationality || '?').padEnd(22)}) → ${m.canonical.opta_id}  canonical_votes=${m.canonical.vote_count}${note}`);
  }
  if (orphans.length) {
    console.log('\n   --- orphans (kept as own players row, wc26_active=false) ---');
    for (const o of orphans) {
      console.log(`   ${o.name.padEnd(34)} ${o.opta_id} (${o.nationality}) votes=${o.vote_count}`);
    }
  }

  // ---------- STEP 4: build backfill rows ----------
  console.log('\n[4/5] building backfill rows');

  // For each opta_id we'll write 1 players row + 1 player_intelligence row.
  // Canonical rows get merged vote sums from any legacy duplicate.
  const mergedCanonOpta = new Set();
  const mergedSumsByCanonOpta = new Map(); // canon_opta → {vote,sign,sell,sack}
  for (const m of merges) {
    mergedCanonOpta.add(m.canonical.opta_id);
    const acc = mergedSumsByCanonOpta.get(m.canonical.opta_id) || { vote_count:0, sign_count:0, sell_count:0, sack_count:0 };
    acc.vote_count += m.sums.vote_count;
    acc.sign_count += m.sums.sign_count;
    acc.sell_count += m.sums.sell_count;
    acc.sack_count += m.sums.sack_count;
    mergedSumsByCanonOpta.set(m.canonical.opta_id, acc);
  }

  // legacy opta_ids that are being merged → mark wc26_active=false in players, zero out their intel counts
  const mergedLegacyOpta = new Set(merges.map(m => m.legacy.opta_id));

  const playersRows = [];
  const intelRows   = [];

  for (const r of allRows) {
    const opta = r.opta_id;
    const isMergedLegacy = mergedLegacyOpta.has(opta);

    playersRows.push({
      opta_id: opta,
      full_name: r.name,
      short_name: r.short_name,
      first_name: r.first_name,
      last_name: r.last_name,
      nationality: r.nationality,
      position: r.position,
      pos_short: r.pos_short || pickShortPos(r.position),
      club: r.club,
      dob: r.date_of_birth,
      age: r.age,
      wc_age: r.wc_age,
      height_cm: null,
      weight_kg: null,
      photo_url: r.photo_url,
      wc26_group: null,
      wc26_participant: !!r.wc26_participant && !isMergedLegacy,
      wc26_active: !!r.is_active && !isMergedLegacy,
      legacy_player_uuid: r.id,
      created_at: r.created_at,
      updated_at: r.updated_at,
    });

    // intelligence row
    let voteSums = {
      vote_count: r.vote_count || 0,
      sign_count: r.sign_count || 0,
      sell_count: r.sell_count || 0,
      sack_count: r.sack_count || 0,
    };
    if (isMergedLegacy) {
      // legacy duplicate — zero its intel counts (votes are migrated up to canonical)
      voteSums = { vote_count: 0, sign_count: 0, sell_count: 0, sack_count: 0 };
    } else if (mergedCanonOpta.has(opta)) {
      const add = mergedSumsByCanonOpta.get(opta);
      voteSums.vote_count += add.vote_count;
      voteSums.sign_count += add.sign_count;
      voteSums.sell_count += add.sell_count;
      voteSums.sack_count += add.sack_count;
    }

    intelRows.push({
      opta_id: opta,
      t90_score: r.t90_score,
      cat_score: r.cat_score,
      tenk_score: r.tenk_score,
      tenk_dynasty: r.tenk_dynasty,
      starting_xi: r.starting_xi,
      fifa_overall: r.fifa_overall,
      fifa_potential: r.fifa_potential,
      fifa_match_status: r.fifa_match_status,
      ...voteSums,
      t90_rank: r.t90_rank,
      t90_updated_at: r.t90_updated_at,
      updated_at: new Date().toISOString(),
    });
  }

  // Pre-flight check: vote conservation
  const preVoteSum  = allRows.reduce((s, r) => s + (r.vote_count || 0), 0);
  const postVoteSum = intelRows.reduce((s, r) => s + (r.vote_count || 0), 0);
  console.log(`   pre-migration sum(vote_count):  ${preVoteSum}`);
  console.log(`   post-backfill sum(vote_count):  ${postVoteSum}  ${preVoteSum === postVoteSum ? '✅' : '❌ MISMATCH'}`);
  if (preVoteSum !== postVoteSum) {
    throw new Error(`Vote conservation failed: pre=${preVoteSum}, post=${postVoteSum}`);
  }

  if (!APPLY) {
    console.log('\n   (dry run) would insert:');
    console.log(`     players                : ${playersRows.length} rows`);
    console.log(`     player_intelligence    : ${intelRows.length} rows`);
    console.log(`     merges applied         : ${merges.length} pairs (${merges.filter(m => m.sums.vote_count > 0).length} carrying votes)`);
    console.log('\n   Re-run with --apply to write.\n');
    return;
  }

  // ---------- STEP 5: apply backfill ----------
  console.log('\n[5/5] applying backfill...');

  // Insert players in batches
  const BATCH = 200;
  console.log('   writing t90_players...');
  for (let i = 0; i < playersRows.length; i += BATCH) {
    const slice = playersRows.slice(i, i + BATCH);
    await sbReq('POST', '/t90_players?on_conflict=opta_id', slice, 'return=minimal,resolution=merge-duplicates');
    process.stdout.write(`     ${Math.min(i + BATCH, playersRows.length)}/${playersRows.length}\r`);
  }
  console.log();

  console.log('   writing t90_player_intelligence...');
  for (let i = 0; i < intelRows.length; i += BATCH) {
    const slice = intelRows.slice(i, i + BATCH);
    await sbReq('POST', '/t90_player_intelligence?on_conflict=opta_id', slice, 'return=minimal,resolution=merge-duplicates');
    process.stdout.write(`     ${Math.min(i + BATCH, intelRows.length)}/${intelRows.length}\r`);
  }
  console.log();

  // ---------- VERIFICATION ----------
  console.log('\n=== verification ===');
  const v1 = await mgmtQuery(`SELECT COUNT(*) AS n FROM t90_players;`);
  const v2 = await mgmtQuery(`SELECT COUNT(*) AS n FROM t90_player_intelligence;`);
  const v3 = await mgmtQuery(`SELECT COUNT(*) AS n FROM wc26_matches;`);
  const v4 = await mgmtQuery(`SELECT SUM(vote_count) AS s FROM t90_player_intelligence;`);
  const v5 = await mgmtQuery(`SELECT SUM(vote_count) AS s FROM s3_players;`);
  console.log(`   t90_players count:               ${v1[0].n}    (s3_players unique opta: ${new Set(allRows.map(r => r.opta_id)).size})`);
  console.log(`   t90_player_intelligence count:   ${v2[0].n}`);
  console.log(`   wc26_matches count:              ${v3[0].n}    (expected: 0)`);
  console.log(`   sum(intel.vote_count):           ${v4[0].s}    (s3_players sum: ${v5[0].s})`);

  const spotChecks = ['Jude Bellingham', 'Kylian Mbappé', 'Christian Pulisic', 'Weston McKennie', 'Vinícius José Paixão de Oliveira Júnior'];
  for (const name of spotChecks) {
    const q = await mgmtQuery(`SELECT p.opta_id, p.full_name, p.nationality, p.wc26_active, p.wc26_participant, i.vote_count, i.sign_count, i.sell_count, i.sack_count, i.t90_rank FROM t90_players p JOIN t90_player_intelligence i ON p.opta_id = i.opta_id WHERE p.full_name = '${name.replace(/'/g, "''")}' ORDER BY p.wc26_active DESC, i.vote_count DESC;`);
    console.log(`\n   ${name}:`);
    for (const row of q) {
      console.log(`     ${row.opta_id}  (${row.nationality}) active=${row.wc26_active} wc26=${row.wc26_participant} votes=${row.vote_count} (S/S/S=${row.sign_count}/${row.sell_count}/${row.sack_count}) rank=${row.t90_rank ?? '-'}`);
    }
  }

  console.log('\n✅ migration applied successfully\n');
})().catch(e => {
  console.error('\n❌ migration failed:', e.message);
  process.exit(1);
});
