#!/usr/bin/env node
/**
 * apply-t90-to-players-rename.js
 *
 * Renames public.t90_players → public.players and
 *         public.t90_player_intelligence → public.player_intelligence
 * via the Supabase Management SQL endpoint.
 *
 * Coordination:
 *   - LeagueReg has its own `public.players` table (youth roster). It must be
 *     renamed to `public.youth_players` BEFORE this script can run, otherwise
 *     `ALTER TABLE t90_players RENAME TO players` will fail with
 *     "relation 'players' already exists". This script pre-checks for that
 *     collision and aborts with a clear message.
 *
 * Default: DRY RUN. Pass --apply to write.
 *
 * Usage:
 *   node scripts/apply-t90-to-players-rename.js
 *   node scripts/apply-t90-to-players-rename.js --apply
 *
 * Project ref: tituygkbondyjhzomwji
 * Token:        ~/.openclaw/workspace/keys/supabase-token.json
 */

const fs   = require('fs');
const path = require('path');

const APPLY        = process.argv.includes('--apply');
const PROJECT_REF  = 'tituygkbondyjhzomwji';
const MGMT_URL     = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
const MIGRATION_SQL = path.join(__dirname, '..', 'supabase', 'migrations', '2026-06-06-rename-t90-tables-to-players.sql');

function loadMgmtToken() {
  const p = path.join(process.env.HOME, '.openclaw/workspace/keys/supabase-token.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).token;
}

const MGMT_TOKEN = loadMgmtToken();

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

function tableExists(rows, name) {
  return rows.some(r => r.table_name === name);
}

(async () => {
  console.log(`\n=== apply-t90-to-players-rename  [${APPLY ? 'APPLY' : 'DRY RUN'}] ===\n`);

  // ---------- STEP 1: Pre-state ----------
  console.log('[1/4] Pre-state inspection');
  const tables = await mgmtQuery(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public'
       AND table_name IN ('t90_players','t90_player_intelligence','players','player_intelligence','wc26_matches');
  `);
  const hasT90Players       = tableExists(tables, 't90_players');
  const hasT90Intelligence  = tableExists(tables, 't90_player_intelligence');
  const hasPlayers          = tableExists(tables, 'players');
  const hasIntelligence     = tableExists(tables, 'player_intelligence');
  const hasMatches          = tableExists(tables, 'wc26_matches');

  console.log(`   t90_players               : ${hasT90Players ? '✅' : '❌'}`);
  console.log(`   t90_player_intelligence   : ${hasT90Intelligence ? '✅' : '❌'}`);
  console.log(`   players                   : ${hasPlayers ? '⚠️  EXISTS' : '✅ free'}`);
  console.log(`   player_intelligence       : ${hasIntelligence ? '⚠️  EXISTS' : '✅ free'}`);
  console.log(`   wc26_matches              : ${hasMatches ? '✅' : '❌'}`);

  if (!hasT90Players || !hasT90Intelligence) {
    console.error('\n❌ Source tables t90_players / t90_player_intelligence are missing. Has the schema-split migration been applied?');
    process.exit(1);
  }

  if (hasPlayers || hasIntelligence) {
    console.error('\n❌ Target name slot occupied. The LeagueReg rename (players → youth_players) has NOT been applied yet, or someone else owns the name.');
    console.error('   Coordinate with the LeagueReg team before re-running.');
    process.exit(1);
  }

  const preCounts = await mgmtQuery(`
    SELECT
      (SELECT COUNT(*) FROM t90_players)              AS t90_players,
      (SELECT COUNT(*) FROM t90_player_intelligence)  AS t90_player_intelligence,
      (SELECT COUNT(*) FROM wc26_matches)             AS wc26_matches;
  `);
  const pre = preCounts[0];
  console.log('\n   Pre-state row counts:');
  console.log(`     t90_players              : ${pre.t90_players}`);
  console.log(`     t90_player_intelligence  : ${pre.t90_player_intelligence}`);
  console.log(`     wc26_matches             : ${pre.wc26_matches}`);

  // ---------- STEP 2: Show SQL ----------
  console.log('\n[2/4] Migration SQL');
  const sql = fs.readFileSync(MIGRATION_SQL, 'utf8');
  console.log('   ' + MIGRATION_SQL.replace(process.env.HOME, '~'));
  console.log('   (' + sql.split('\n').length + ' lines)');

  if (!APPLY) {
    console.log('\n[3/4] DRY RUN — skipping write');
    console.log('\n[4/4] DRY RUN — skipping post-checks');
    console.log('\n✅ Dry run complete. Re-run with --apply to execute.\n');
    return;
  }

  // ---------- STEP 3: Apply ----------
  console.log('\n[3/4] APPLYING migration...');
  await mgmtQuery(sql);
  console.log('   ✅ migration applied');

  // PostgREST schema cache reload (proven flaky in schema-split migration)
  await mgmtQuery(`NOTIFY pgrst, 'reload schema';`);
  console.log('   ↻ PostgREST schema reload notified');
  await new Promise(r => setTimeout(r, 6000));

  // ---------- STEP 4: Post-state verification ----------
  console.log('\n[4/4] Post-state verification');

  const tablesAfter = await mgmtQuery(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public'
       AND table_name IN ('t90_players','t90_player_intelligence','players','player_intelligence','wc26_matches');
  `);
  const stillHasT90Players      = tableExists(tablesAfter, 't90_players');
  const stillHasT90Intelligence = tableExists(tablesAfter, 't90_player_intelligence');
  const hasPlayersNow           = tableExists(tablesAfter, 'players');
  const hasIntelligenceNow      = tableExists(tablesAfter, 'player_intelligence');
  const hasMatchesNow           = tableExists(tablesAfter, 'wc26_matches');

  console.log(`   t90_players gone          : ${!stillHasT90Players ? '✅' : '❌ still present'}`);
  console.log(`   t90_player_intelligence gone : ${!stillHasT90Intelligence ? '✅' : '❌ still present'}`);
  console.log(`   players present           : ${hasPlayersNow ? '✅' : '❌'}`);
  console.log(`   player_intelligence present  : ${hasIntelligenceNow ? '✅' : '❌'}`);
  console.log(`   wc26_matches still present   : ${hasMatchesNow ? '✅' : '❌'}`);

  const postCounts = await mgmtQuery(`
    SELECT
      (SELECT COUNT(*) FROM players)              AS players,
      (SELECT COUNT(*) FROM player_intelligence)  AS player_intelligence,
      (SELECT COUNT(*) FROM wc26_matches)         AS wc26_matches;
  `);
  const post = postCounts[0];
  console.log('\n   Post-state row counts:');
  console.log(`     players                  : ${post.players}    (pre t90_players: ${pre.t90_players})`);
  console.log(`     player_intelligence      : ${post.player_intelligence}    (pre t90_player_intelligence: ${pre.t90_player_intelligence})`);
  console.log(`     wc26_matches             : ${post.wc26_matches}    (pre: ${pre.wc26_matches})`);

  const ok =
    Number(post.players) === Number(pre.t90_players) &&
    Number(post.player_intelligence) === Number(pre.t90_player_intelligence) &&
    Number(post.wc26_matches) === Number(pre.wc26_matches) &&
    !stillHasT90Players &&
    !stillHasT90Intelligence;

  if (ok) {
    console.log('\n✅ Rename complete. Row counts preserved. Old names gone.\n');
  } else {
    console.error('\n❌ Verification failed. Inspect manually before pushing code.\n');
    process.exit(2);
  }
})().catch(err => {
  console.error('\n❌ Script failed:', err.message);
  process.exit(1);
});
