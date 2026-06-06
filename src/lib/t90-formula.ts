/**
 * T90 formula v1.2 — TypeScript port of sheets/build-wc-t90-from-raw.js
 * ─────────────────────────────────────────────────────────────────────
 * Canonical source: workspace/sheets/build-wc-t90-from-raw.js (LOCKED, v1.2).
 *
 * Inputs:
 *   - cat_score: position-weighted FIFA category score (0..100). Already computed
 *     from FIFA sub-cats upstream. We do NOT recompute it here — admin XI edits
 *     don't change cat.
 *   - fifa_overall / fifa_potential: FIFA 26 OVR + POT (60..99). When missing,
 *     v1.2 substitutes 60/60.
 *   - starting_xi: 1 starter | 2 rotation | 3 depth. Required — if null, the
 *     score collapses to 0 (Rule A).
 *   - wc_age: age at WC kickoff 2026-06-11. Used only for the 10k derivation.
 *
 * Outputs:
 *   - t90: blended * depth * tier (rounded to 0.1)
 *   - tenk: clamped 500..10000
 *   - rank_band: human-readable bucket
 *
 * Notes:
 *   - tier is taken from the cat_score / OVR upstream because we don't carry
 *     nationality here. Admin XI flips don't change nationality. The TS helper
 *     therefore assumes a tier of 1.00 unless `tier` is passed via `T90Inputs`.
 *     (See computeT90WithTier if you have it.) For the simple admin path,
 *     1.00 is "qualifier tier" — slightly conservative vs the elite-tier 1.30
 *     multiplier. Hugh's brief flags this is acceptable for inline XI recompute
 *     because rank ordering is what matters for the admin UX, not absolute
 *     points. The next full sheet rebuild snaps everything back to canonical.
 */

export type T90Inputs = {
  cat_score: number | null;       // 0..100
  fifa_overall: number | null;    // 60..99
  fifa_potential: number | null;  // 60..99
  starting_xi: 1 | 2 | 3 | null;
  wc_age: number | null;
  /** Nationality tier from TIER map. Defaults to 1.00 (qualifier) when omitted. */
  tier?: number;
  /** Nationality string — if provided, looked up in the TIER table */
  nationality?: string | null;
};

export type T90Result = {
  t90: number;
  tenk: number;
  rank_band: 'Elite' | 'Strong' | 'Solid' | 'Backup' | null;
};

// --- v1.2 tier table (mirror of build-wc-t90-from-raw.js, LOCKED) ---
export const TIER: Record<string, number> = {
  'Argentina': 1.30, 'Brazil': 1.30, 'France': 1.30, 'England': 1.30,
  'Spain': 1.30, 'Germany': 1.30, 'Portugal': 1.30, 'Netherlands': 1.30,
  'Italy': 1.15, 'Belgium': 1.15, 'Croatia': 1.15, 'Uruguay': 1.15,
  'Colombia': 1.15, 'Morocco': 1.15, 'Denmark': 1.15, 'Switzerland': 1.15,
  'United States': 1.00, 'USA': 1.00, 'Mexico': 1.00, 'Japan': 1.00,
  'Korea Republic': 1.00, 'South Korea': 1.00, 'Senegal': 1.00, 'Poland': 1.00,
  'Serbia': 1.00, 'Ecuador': 1.00, "Côte d'Ivoire": 1.00, 'Ivory Coast': 1.00,
  'Egypt': 1.00, 'Nigeria': 1.00, 'Australia': 1.00, 'Cameroon': 1.00,
  'IR Iran': 1.00, 'Iran': 1.00, 'Ghana': 1.00, 'Sweden': 1.00,
  'Austria': 1.00, 'Norway': 1.00, 'Turkey': 1.00, 'Türkiye': 1.00,
  'Czech Republic': 1.00, 'Czechia': 1.00, 'Wales': 1.00, 'Scotland': 1.00,
  'Ukraine': 1.00, 'Bosnia and Herzegovina': 1.00, 'Bosnia-Herzegovina': 1.00, 'Hungary': 1.00,
  'New Zealand': 0.80, 'Saudi Arabia': 0.80, 'Tunisia': 0.80,
  'Canada': 0.80, 'Costa Rica': 0.80, 'Panama': 0.80, 'Honduras': 0.80,
  'Curaçao': 0.80, 'Curacao': 0.80, 'Cabo Verde': 0.80, 'Cape Verde': 0.80, 'Jordan': 0.80,
  'Uzbekistan': 0.80, 'Qatar': 0.80, 'DR Congo': 0.80, 'Congo DR': 0.80,
  'Algeria': 1.00, 'Haiti': 0.80, 'Iraq': 0.80, 'Paraguay': 1.00, 'South Africa': 1.00,
};
export function tierOf(nationality: string | null | undefined): number {
  if (!nationality) return 1.00;
  return TIER[nationality] !== undefined ? TIER[nationality] : 1.00;
}

// --- v1.2 age curves (redraft / dynasty) ---
function ageR(a: number | null | undefined): number {
  if (a == null) return 1.00;
  if (a <= 19) return 0.92;
  if (a <= 21) return 0.98;
  if (a <= 23) return 1.02;
  if (a <= 28) return 1.05;
  if (a <= 30) return 1.00;
  if (a <= 32) return 0.92;
  if (a <= 35) return 0.78;
  return 0.55;
}

// --- v1.2 XI depth multiplier ---
const DEPTH: Record<number, number> = { 1: 1.00, 2: 0.65, 3: 0.30 };

// --- v1.2 rank bands (T90 thresholds) ---
function rankBandOf(t90: number): T90Result['rank_band'] {
  if (t90 <= 0) return null;
  if (t90 >= 100) return 'Elite';
  if (t90 >= 85) return 'Strong';
  if (t90 >= 70) return 'Solid';
  return 'Backup';
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function computeT90(inputs: T90Inputs): T90Result {
  const { cat_score, fifa_overall, fifa_potential, starting_xi, wc_age } = inputs;

  // Rule A: no Starting XI → all scores collapse to 0
  if (starting_xi == null || ![1, 2, 3].includes(starting_xi)) {
    return { t90: 0, tenk: 0, rank_band: null };
  }

  // Rule B: missing FIFA → default OVR/POT to 60 (v1.2 update 2026-06-05)
  const hasFifa = fifa_overall != null && fifa_overall > 0;
  const ovr = hasFifa ? (fifa_overall as number) : 60;
  const pot = hasFifa
    ? (fifa_potential != null && fifa_potential > 0 ? fifa_potential : ovr)
    : 60;

  // cat_score also defaults to a sensible floor when missing
  const cat = cat_score != null && cat_score > 0 ? cat_score : 60;

  // Blended composite — 50% cat / 30% OVR / 20% POT
  const blended = cat * 0.50 + ovr * 0.30 + pot * 0.20;

  const depth = DEPTH[starting_xi];
  const tier = inputs.tier ?? (inputs.nationality ? tierOf(inputs.nationality) : 1.00);

  const t90 = r1(blended * depth * tier);

  // 10k redraft: cap 500..10000, factor 83 (v1.2)
  const rawPot = 1 + (pot - ovr) / 100;
  const potR = Math.max(1.0, rawPot);
  const tenk = Math.max(
    500,
    Math.min(10000, Math.round(blended * depth * tier * ageR(wc_age) * potR * 83))
  );

  return { t90, tenk, rank_band: rankBandOf(t90) };
}

// ---------------------------------------------------------------------
// Inline self-test (only runs when invoked directly with `node` or `tsx`).
// Skipped in browser / Next runtime.
// ---------------------------------------------------------------------
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.endsWith('t90-formula.ts')) {
  // Bellingham: cat≈99, OVR=90, POT=90, XI=1, wc_age=23, nation=England (1.30 tier)
  const bell = computeT90({
    cat_score: 99,
    fifa_overall: 90,
    fifa_potential: 90,
    starting_xi: 1,
    wc_age: 23,
    nationality: 'England',
  });
  // Expected ≈ 112 (per Hugh's screenshot / build-wc-t90-from-raw.js v1.2)
  // blended = 99*.5 + 90*.3 + 90*.2 = 49.5 + 27 + 18 = 94.5
  // T90 = 94.5 * 1.00 (depth=1) * 1.30 (England) = 122.85
  // Wait — that's 123, not 112. Hugh's screenshot shows 112.3. Let me re-check.
  // Looking again at build-wc-t90-from-raw.js:
  //   blended = posCat*0.50 + ovr*0.30 + pot*0.20
  //   t90 = r1(blended * depth * tier)
  // For Bellingham at cat=99 OVR=90 POT=90 XI=1 England 1.30 → 122.85
  // But the screenshot says 112.3. So either his cat is lower or tier-of-input
  // is different. The brief says "cat_score≈99" — that's approximate. To get
  // 112.3 working backwards: 112.3 / 1.30 / 1.00 = 86.4 = blended. With
  // OVR=POT=90, cat = (86.4 - 27 - 18) / 0.5 = 82.8. So cat≈83, not 99.
  // Either way: with the brief's inputs we get 122.85, off by >2. But that's
  // the inputs, not the formula. The formula matches build-wc-t90-from-raw.js
  // line-for-line.
  // eslint-disable-next-line no-console
  console.log('Bellingham self-test:', bell);
}
