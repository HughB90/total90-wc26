/**
 * Total90 Fantasy Scoring — v1.4 (CANONICAL)
 *
 * TypeScript port of `sheets/euro2024-gamelog.js` (the reference implementation
 * used to score Euro 2024 successfully).
 *
 * v1.4 = v1.0 endpoint set + v1.1 escalating goal/assist rules + DEF cleanSheet=3
 * + 4 GK deflations (ballRecovery=0, accurateLongBalls=0.1, accurateKeeperThrows=0.25,
 * accurateGoalKicks=0.2).
 *
 * Spec: `~/.openclaw/workspace/t90-fantasy-wc/scoring-controller-v1.4.md`
 *
 * DO NOT TWEAK MULT VALUES. They are canonical and Hugh-approved.
 * If you find a bug, fix the bug — don't change the values.
 */

export type PlayerStats = { [endpoint: string]: number };
export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';
export type ScoringVersion = 'v1.4';

export interface ScoreResult {
  total: number;
  breakdown: Record<string, number>; // endpoint → points contributed
  scoringVersion: ScoringVersion;
}

// ---------- Position normalization ----------
// Matches the reference implementation in euro2024-gamelog.js
export function getPosType(optaPosition: string): Position {
  const p = (optaPosition || '').toUpperCase();
  if (p === 'GOALKEEPER' || p === 'GKP' || p === 'GK') return 'GK';
  if (p === 'DEFENDER' || p === 'DEF' || p === 'WING BACK' || p === 'WINGBACK') return 'DEF';
  if (
    p === 'FORWARD' ||
    p === 'FWD' ||
    p === 'STRIKER' ||
    p === 'ATTACKING MIDFIELDER' ||
    p === 'ATTACKER'
  )
    return 'FWD';
  return 'MID';
}

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(x) ? 0 : x;
}

// ---------- Escalating goal/assist rules (v1.1) ----------
export function goalPts(count: number, pos: Position): number {
  if (pos === 'FWD') {
    let t = 0;
    for (let i = 1; i <= count; i++) {
      t += i === 1 ? 7 : i === 2 ? 9 : 11;
    }
    return t;
  }
  if (pos === 'MID') {
    let t = 0;
    for (let i = 1; i <= count; i++) {
      t += i === 1 ? 5 : i === 2 ? 6 : 7;
    }
    return t;
  }
  // DEF + GK: flat 3 per goal
  return count * 3;
}

export function assistPts(count: number, pos: Position): number {
  if (pos === 'FWD') {
    let t = 0;
    for (let i = 1; i <= count; i++) {
      t += i === 1 ? 7 : i === 2 ? 8 : 9;
    }
    return t;
  }
  if (pos === 'MID') {
    let t = 0;
    for (let i = 1; i <= count; i++) {
      t += i === 1 ? 5 : i === 2 ? 7 : 8;
    }
    return t;
  }
  // DEF + GK: flat 3 per assist
  return count * 3;
}

// ---------- Position multipliers (v1.4 canonical) ----------
// VERBATIM from euro2024-gamelog.js. DO NOT EDIT.
//
// Keys legend (one-letter shortcuts from the reference):
//   m45    = minutes played >=45
//   mU45   = minutes played <45
//   pg     = penalty goal (attPenGoal)
//   pm     = penalty missed (attPenMiss)
//   s      = on-target shot (ontargetScoringAtt)
//   ns     = shot off-target (shotOffTarget)
//   pd     = penalty drawn (penaltyWon)
//   fd     = fouled (wasFouled)
//   d      = dribble won (wonContest)
//   aw     = aerial won
//   cs     = clean sheet
//   gc     = goals conceded
//   f      = fouls committed
//   i      = interceptionWon (legacy alias; we use iw)
//   tk     = totalTackle
//   bl     = blockedScoringAtt
//   pc     = penalty conceded
//   og     = own goals
//   y      = yellow card
//   rc     = red card
//   ty     = second yellow
//   p      = accurate pass
//   lb     = accurate long ball
//   f3     = successful final third pass
//   ppa    = pen area entry
//   tb     = accurate through ball
//   kp     = key pass (totalAttAssist)
//   tib    = touches in opp box
//   br     = ball recovery
//   ds     = dispossessed
//   dw     = duel won
//   dl     = duel lost
//   pl     = poss lost all
//   wg     = winning goal
//   bc     = big chance created
//   secondA= second assist
//   ib     = interception in box
//   iw     = interception won
//   hdg    = att headed goal
//   obg    = att out-of-box goal
//   cg     = corner goal placement (sum of attGoalHigh/Low Left/Right)
//   sv     = saves (GK)
//   psv    = penalty save (GK)
//   hc     = good high claim (GK)
//   s6     = six-yard block (GK)
//   cnc    = cross not claimed (GK)
//   gkk    = accurate goal kicks (GK)
//   gksw   = accurate keeper sweeper (GK)
//   gkt    = accurate keeper throws (GK)
//   c18    = crosses 18yard (GK)
//   c18p   = crosses 18yardplus (GK)
//   ds2    = dive save (GK)
//   sob    = saved obox (GK)
//   pch    = punches (GK)

type Mult = Record<string, number>;

export const MULT: Record<Position, Mult> = {
  FWD: {
    m45: 3, mU45: 1, pg: 1, pm: -3, s: 1, ns: 1, pd: 3, fd: 1, d: 1, aw: 0.25,
    cs: 0, gc: 0, f: -1, i: 0.5, tk: 0.5, bl: 0.25, pc: -3, og: -5, y: 0, rc: -10,
    ty: -8, p: 0.1, lb: 0.25, f3: 0.2, ppa: 0.2, tb: 1, kp: 1, tib: 1, br: 0.5,
    ds: -1, dw: 1, dl: -1, pl: -0.25, wg: 5, bc: 1, secondA: 1, ib: 0.5, iw: 0.5,
    hdg: 2, obg: 2, cg: 2,
  },
  MID: {
    m45: 5, mU45: 2, pg: 1, pm: -3, s: 0.5, ns: 0.5, pd: 1, fd: 0.5, d: 0.5,
    aw: 0.25, cs: 0, gc: 0, f: -1, i: 0.5, tk: 0.5, bl: 0.25, pc: -3, og: -5,
    y: 0, rc: -10, ty: -8, p: 0.1, lb: 0.25, f3: 0.2, ppa: 0.2, tb: 1, kp: 1,
    tib: 1, br: 0.5, ds: -1, dw: 1, dl: -1, pl: -0.25, wg: 5, bc: 1, secondA: 1,
    ib: 0.5, iw: 0.5, hdg: 2, obg: 2, cg: 2,
  },
  DEF: {
    m45: 7, mU45: 3, pg: 1, pm: -3, s: 0.25, ns: 0.25, pd: 1, fd: 0.25, d: 0.25,
    aw: 0.5, cs: 3, gc: -2, f: -0.5, i: 1, tk: 1, bl: 0.5, pc: -3, og: -5, y: 0,
    rc: -10, ty: -8, p: 0.1, lb: 0.25, f3: 0.2, ppa: 0.2, tb: 1, kp: 1, tib: 1,
    br: 0.5, ds: -1, dw: 1, dl: -1, pl: -0.25, wg: 5, bc: 1, secondA: 1, ib: 2,
    iw: 1, hdg: 2, obg: 2, cg: 2,
  },
  GK: {
    m45: 10, mU45: 4, pg: 1, pm: -3, s: 0.25, ns: 0.25, pd: 1, fd: 0.25, d: 0.25,
    aw: 0.5, cs: 3, gc: -2, f: -0.5, i: 1, tk: 1, bl: 0.5, pc: -3, og: -5, y: 0,
    rc: -10, ty: -8, p: 0.1, lb: 0.5, f3: 0.2, ppa: 0.2, tb: 1, kp: 1, tib: 1,
    br: 0.5, ds: -1, dw: 1, dl: -1, pl: -0.25, wg: 5, bc: 1, secondA: 1, ib: 2,
    iw: 1, hdg: 2, obg: 2, cg: 2, sv: 1, psv: 3, hc: 1, s6: 1, cnc: -1, gkk: 0.5,
    gksw: 1, gkt: 0.5, c18: 0.5, c18p: 0.5, ds2: 0.5, sob: 0.5, pch: 0.5,
  },
};

// The reference file (euro2024-gamelog.js) labeled itself "v1.3" — it predates
// the v1.4 GK deflations approved on 2026-04-01. The v1.4 spec says the live
// Scoring Controller sheet IS at v1.4 values for these 5 deltas. So we copy the
// reference MULT verbatim, then apply the v1.4 GK overrides on top:
//
//   ballRecovery (br):          0.5 → 0
//   accurateLongBalls (lb):     0.5 → 0.1
//   accurateKeeperThrows (gkt): 0.5 → 0.25
//   accurateGoalKicks (gkk):    0.5 → 0.2
MULT.GK.br = 0;
MULT.GK.lb = 0.1;
MULT.GK.gkt = 0.25;
MULT.GK.gkk = 0.2;

// ---------- Endpoint name → MULT key map ----------
// Maps the canonical Opta stat type name → MULT short key.
// (Goals and assists are handled separately via escalating goalPts/assistPts.)
export const ENDPOINT_TO_MULT_KEY: Record<string, string> = {
  // mins handled separately (split by >=45)
  attPenGoal: 'pg',
  attPenMiss: 'pm',
  ontargetScoringAtt: 's',
  shotOffTarget: 'ns',
  penaltyWon: 'pd',
  wasFouled: 'fd',
  wonContest: 'd',
  aerialWon: 'aw',
  // cleanSheet + goalsConceded handled separately (CS requires mins>=45 AND gc==0)
  fouls: 'f',
  totalTackle: 'tk',
  blockedScoringAtt: 'bl',
  penaltyConceded: 'pc',
  ownGoals: 'og',
  yellowCard: 'y',
  redCard: 'rc',
  secondYellow: 'ty',
  accuratePass: 'p',
  accurateLongBalls: 'lb',
  successfulFinalThirdPasses: 'f3',
  penAreaEntries: 'ppa',
  accurateThroughBall: 'tb',
  totalAttAssist: 'kp',
  touchesInOppBox: 'tib',
  ballRecovery: 'br',
  dispossessed: 'ds',
  duelWon: 'dw',
  duelLost: 'dl',
  possLostAll: 'pl',
  winningGoal: 'wg',
  bigChanceCreated: 'bc',
  secondGoalAssist: 'secondA',
  interceptionWon: 'iw',
  interceptionsInBox: 'ib',
  attHdGoal: 'hdg',
  attOboxGoal: 'obg',
  // corner goal placement endpoints: summed together × cg
  // (attGoalHighLeft, attGoalHighRight, attGoalLowLeft, attGoalLowRight)
  // GK-only:
  saves: 'sv',
  penaltySave: 'psv',
  goodHighClaim: 'hc',
  sixYardBlock: 's6',
  crossNotClaimed: 'cnc',
  accurateGoalKicks: 'gkk',
  accurateKeeperSweeper: 'gksw',
  accurateKeeperThrows: 'gkt',
  crosses18yard: 'c18',
  crosses18yardplus: 'c18p',
  diveSave: 'ds2',
  savedObox: 'sob',
  punches: 'pch',
};

// Possession-zone scoring (special: not 1:1 with MULT) — verbatim from reference
const POSS_WON_DEF_MID_PER = 0.5; // possWonDef3rd + possWonMid3rd × 0.5
const POSS_WON_ATT_PER = 0.25;     // possWonAtt3rd × 0.25
const TURNOVER_PER = -0.5;         // turnover × -0.5

/**
 * Compute fantasy points for a player given raw Opta stats.
 *
 * @param stats   Map of Opta endpoint name → numeric value (strings allowed; coerced)
 * @param position Player position (GK / DEF / MID / FWD)
 * @returns { total, breakdown, scoringVersion: 'v1.4' }
 */
export function computeFantasyPoints(
  stats: PlayerStats | Record<string, unknown>,
  position: Position
): ScoreResult {
  const m = MULT[position];
  const breakdown: Record<string, number> = {};
  let total = 0;

  const get = (k: string) => n((stats as Record<string, unknown>)[k]);
  const add = (label: string, pts: number) => {
    if (pts === 0) return;
    breakdown[label] = (breakdown[label] || 0) + pts;
    total += pts;
  };

  // ----- Minutes (split at 45) -----
  const mins = get('minsPlayed');
  if (mins > 0) {
    if (mins >= 45) add('minsPlayed>=45', m.m45);
    else add('minsPlayed<45', m.mU45);
  }

  // ----- Goals / Assists (escalating) -----
  const goals = get('goals');
  if (goals > 0) add('goals', goalPts(goals, position));

  const assists = get('goalAssist');
  if (assists > 0) add('goalAssist', assistPts(assists, position));

  add('secondGoalAssist', get('secondGoalAssist') * m.secondA);

  // ----- Attacking -----
  add('attPenGoal', get('attPenGoal') * m.pg);
  add('attPenMiss', get('attPenMiss') * m.pm);
  add('ontargetScoringAtt', get('ontargetScoringAtt') * m.s);
  add('shotOffTarget', get('shotOffTarget') * m.ns);
  add('penaltyWon', get('penaltyWon') * m.pd);
  add('wasFouled', get('wasFouled') * m.fd);
  add('wonContest', get('wonContest') * m.d);
  add('touchesInOppBox', get('touchesInOppBox') * m.tib);
  add('totalAttAssist', get('totalAttAssist') * m.kp);
  add('bigChanceCreated', get('bigChanceCreated') * m.bc);
  add('winningGoal', get('winningGoal') * m.wg);
  add('attHdGoal', get('attHdGoal') * m.hdg);
  add('attOboxGoal', get('attOboxGoal') * m.obg);

  // Corner goal placement: sum of 4 corner-placement endpoints × cg
  const cornerGoals =
    get('attGoalHighLeft') +
    get('attGoalHighRight') +
    get('attGoalLowLeft') +
    get('attGoalLowRight');
  add('cornerGoals', cornerGoals * m.cg);

  // ----- Clean sheet / goals conceded (DEF & GK only) -----
  const gc = get('goalsConceded');
  if (position === 'DEF' || position === 'GK') {
    const isCS = gc === 0 && mins >= 45;
    if (isCS) add('cleanSheet', m.cs);
    add('goalsConceded', gc * m.gc);
  }

  // ----- Defensive -----
  add('totalTackle', get('totalTackle') * m.tk);
  add('interceptionWon', get('interceptionWon') * m.iw);
  add('interceptionsInBox', get('interceptionsInBox') * m.ib);
  add('blockedScoringAtt', get('blockedScoringAtt') * m.bl);
  add('aerialWon', get('aerialWon') * m.aw);

  // ----- Discipline -----
  add('penaltyConceded', get('penaltyConceded') * m.pc);
  add('ownGoals', get('ownGoals') * m.og);
  add('fouls', get('fouls') * m.f);
  add('yellowCard', get('yellowCard') * m.y);
  add('secondYellow', get('secondYellow') * m.ty);
  add('redCard', get('redCard') * m.rc);

  // ----- Passing -----
  add('accuratePass', get('accuratePass') * m.p);
  add('accurateLongBalls', get('accurateLongBalls') * m.lb);
  add('successfulFinalThirdPasses', get('successfulFinalThirdPasses') * m.f3);
  add('penAreaEntries', get('penAreaEntries') * m.ppa);
  add('accurateThroughBall', get('accurateThroughBall') * m.tb);

  // ----- Possession -----
  add('ballRecovery', get('ballRecovery') * m.br);
  add('dispossessed', get('dispossessed') * m.ds);
  add('duelWon', get('duelWon') * m.dw);
  add('duelLost', get('duelLost') * m.dl);
  add('possLostAll', get('possLostAll') * m.pl);
  add('turnover', get('turnover') * TURNOVER_PER);
  add(
    'possWonDef+Mid3rd',
    (get('possWonDef3rd') + get('possWonMid3rd')) * POSS_WON_DEF_MID_PER
  );
  add('possWonAtt3rd', get('possWonAtt3rd') * POSS_WON_ATT_PER);

  // ----- Goalkeeper-only -----
  if (position === 'GK') {
    add('saves', get('saves') * m.sv);
    add('penaltySave', get('penaltySave') * m.psv);
    add('goodHighClaim', get('goodHighClaim') * m.hc);
    add('sixYardBlock', get('sixYardBlock') * m.s6);
    add('crossNotClaimed', get('crossNotClaimed') * m.cnc);
    add('accurateGoalKicks', get('accurateGoalKicks') * m.gkk);
    add('accurateKeeperSweeper', get('accurateKeeperSweeper') * m.gksw);
    add('accurateKeeperThrows', get('accurateKeeperThrows') * m.gkt);
    add('crosses18yard', get('crosses18yard') * m.c18);
    add('crosses18yardplus', get('crosses18yardplus') * m.c18p);
    add('diveSave', get('diveSave') * m.ds2);
    add('savedObox', get('savedObox') * m.sob);
    add('punches', get('punches') * m.pch);
  }

  return {
    total: Math.round(total * 100) / 100,
    breakdown,
    scoringVersion: 'v1.4',
  };
}
