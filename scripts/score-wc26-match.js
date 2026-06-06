#!/usr/bin/env node
/**
 * Manual trigger: score a single WC 2026 match by Opta fixture ID.
 *
 * Usage:
 *   node scripts/score-wc26-match.js <fixtureId> [--force]
 *
 * Loads .env.local automatically if present.
 *
 * NOTE: This script imports compiled TypeScript via tsx/ts-node if available,
 * otherwise relies on the Next runtime. For local testing, prefer running via
 * `npx tsx scripts/score-wc26-match.js <fixtureId>`.
 */

const path = require('path');
const fs = require('fs');

// Load .env.local manually (simple parser, no extra deps)
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fixtureId = args.find(a => !a.startsWith('--'));
  const force = args.includes('--force');

  if (!fixtureId) {
    console.error('Usage: node scripts/score-wc26-match.js <fixtureId> [--force]');
    process.exit(1);
  }

  // Try to use tsx loader to import TS modules
  let scoreMatch;
  try {
    // tsx runtime hook (if installed)
    try { require('tsx/cjs'); } catch (_) { /* ignore */ }
    ({ scoreMatch } = require('../src/lib/scoring/wc26-match-scorer.ts'));
  } catch (e) {
    console.error('Failed to load TS scorer. Run with: npx tsx scripts/score-wc26-match.js <fixtureId>');
    console.error('Underlying error:', e.message);
    process.exit(2);
  }

  console.log(`Scoring fixture ${fixtureId} (force=${force})...`);
  const start = Date.now();
  try {
    const result = await scoreMatch(fixtureId, { force });
    console.log('\n=== Result ===');
    console.log(JSON.stringify(result, null, 2));
    console.log(`\nDone in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    if (result.errors.length > 0) process.exit(3);
  } catch (e) {
    console.error('Score failed:', e.message);
    console.error(e.stack);
    process.exit(4);
  }
}

main();
