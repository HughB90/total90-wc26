/**
 * wc-t90-recompute.ts
 * 
 * LOCKED v1.2 scoring formulas for WC T90 / 10k scores.
 * Ported from sheets/build-wc-t90-from-raw.js (lines 360-410).
 * 
 * Used by /api/admin/s3-players/[id] for cascading score recomputation
 * when Cat Score, T90 Score, or Starting XI are overridden via admin UI.
 */

// --- Tier table (LOCKED v1.2, DO NOT MODIFY) ---
const TIER: Record<string, number> = {
  'Argentina':1.30,'Brazil':1.30,'France':1.30,'England':1.30,
  'Spain':1.30,'Germany':1.30,'Portugal':1.30,'Netherlands':1.30,
  'Italy':1.15,'Belgium':1.15,'Croatia':1.15,'Uruguay':1.15,
  'Colombia':1.15,'Morocco':1.15,'Denmark':1.15,'Switzerland':1.15,
  'United States':1.00,'USA':1.00,'Mexico':1.00,'Japan':1.00,
  'Korea Republic':1.00,'South Korea':1.00,'Senegal':1.00,'Poland':1.00,
  'Serbia':1.00,'Ecuador':1.00,"Côte d'Ivoire":1.00,'Ivory Coast':1.00,
  'Egypt':1.00,'Nigeria':1.00,'Australia':1.00,'Cameroon':1.00,
  'IR Iran':1.00,'Iran':1.00,'Ghana':1.00,'Sweden':1.00,
  'Austria':1.00,'Norway':1.00,'Turkey':1.00,'Türkiye':1.00,
  'Czech Republic':1.00,'Czechia':1.00,'Wales':1.00,'Scotland':1.00,
  'Ukraine':1.00,'Bosnia and Herzegovina':1.00,'Bosnia-Herzegovina':1.00,'Hungary':1.00,
  'New Zealand':0.80,'Saudi Arabia':0.80,'Tunisia':0.80,
  'Canada':0.80,'Costa Rica':0.80,'Panama':0.80,'Honduras':0.80,
  'Curaçao':0.80,'Curacao':0.80,'Cabo Verde':0.80,'Cape Verde':0.80,'Jordan':0.80,
  'Uzbekistan':0.80,'Qatar':0.80,'DR Congo':0.80,'Congo DR':0.80,
  // Newly added (qualifier tier by default)
  'Algeria':1.00,'Haiti':0.80,'Iraq':0.80,'Paraguay':1.00,'South Africa':1.00,
};

export function tierOf(nation: string): number {
  return TIER[nation] !== undefined ? TIER[nation] : 1.00;
}

// --- Age multipliers (LOCKED v1.2) ---
export function ageR(age: number | null): number {
  if (age == null) return 1.00;
  if (age <= 19) return 0.92;
  if (age <= 21) return 0.98;
  if (age <= 23) return 1.02;
  if (age <= 28) return 1.05;
  if (age <= 30) return 1.00;
  if (age <= 32) return 0.92;
  if (age <= 35) return 0.78;
  return 0.55;
}

export function ageD(age: number | null): number {
  if (age == null) return 1.00;
  if (age <= 19) return 1.20;
  if (age <= 21) return 1.15;
  if (age <= 23) return 1.08;
  if (age <= 28) return 1.00;
  if (age <= 30) return 0.90;
  if (age <= 32) return 0.78;
  if (age <= 35) return 0.62;
  return 0.40;
}

// --- Rounding helper ---
function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

// --- Core recompute function ---
export interface RecomputeInput {
  catScore: number;        // posCat (position-weighted FIFA sub-cats)
  ovr: number | null;      // FIFA overall (null if no FIFA data)
  pot: number | null;      // FIFA potential (null if no FIFA data)
  wcAge: number | null;    // Age at WC (can be null)
  nation: string;          // Player's nation (for tier lookup)
  startingXi: 1 | 2 | 3;   // Depth flag
}

export interface RecomputeResult {
  t90: number;
  tenk: number;
  tenkDyn: number;
}

/**
 * Recomputes T90 + 10k + 10k Dynasty scores using LOCKED v1.2 formulas.
 * 
 * RULE (Hugh 2026-06-05): When ovr or pot is null (no FIFA data), default both to 60.
 * 
 * When catScore is overridden via admin UI:
 *   - Use the overridden catScore as posCat directly
 *   - Recompute T90 + tenk + tenkDyn from formula
 * 
 * When t90 is directly overridden via admin UI (NOT catScore):
 *   - Caller should NOT call this function for T90 (use override value)
 *   - Caller MAY still recompute tenk using existing catScore (see API route logic)
 * 
 * This function always computes all three scores. API route decides which to apply.
 */
export function recomputeScores(input: RecomputeInput): RecomputeResult {
  const { catScore, ovr, pot, wcAge, nation, startingXi } = input;

  // Default FIFA values to 60 if missing (RULE Hugh 2026-06-05)
  const ovrFinal = ovr ?? 60;
  const potFinal = pot ?? 60;

  // Blended score: posCat*0.50 + ovr*0.30 + pot*0.20
  const blended = catScore * 0.50 + ovrFinal * 0.30 + potFinal * 0.20;

  // Depth multiplier
  const depth = {1: 1.00, 2: 0.65, 3: 0.30}[startingXi] ?? 1.00;

  // Tier multiplier
  const tier = tierOf(nation);

  // Age multipliers
  const ageRVal = ageR(wcAge);
  const ageDVal = ageD(wcAge);

  // Potential multipliers
  const rawPot = 1 + ((potFinal - ovrFinal) / 100);
  const potR = Math.max(1.0, rawPot);
  const potD = rawPot;

  // T90 score
  const t90 = r1(blended * depth * tier);

  // 10k scores (clamped 500-10000, rounded)
  const tenk = Math.max(500, Math.min(10000, Math.round(blended * depth * tier * ageRVal * potR * 83)));
  const tenkDyn = Math.max(500, Math.min(10000, Math.round(blended * depth * tier * ageDVal * potD * 78)));

  return { t90, tenk, tenkDyn };
}
