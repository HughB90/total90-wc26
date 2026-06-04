# WC26 Predictor — Canonical Scoring Rules (v2)

**Locked:** 2026-06-03 by Hugh (bundled-pick clarification)
**Supersedes:** all prior placeholder rules and the earlier v2 draft that used a separate `advancer_pk_pts` bonus (discarded)
**Implementation:** `src/lib/predictor/scoring.ts`
**Tests:** `src/lib/predictor/scoring.test.ts`

This is the source of truth. If code, UI copy, or a doc disagrees with this file,
this file wins.

---

## Mental model — bundled-pick (knockouts)

Group stage is simple: it's just W/D/L on the final scoreline.

Knockouts are different. A predicted **draw scoreline** in a knockout match is a
**bundled prediction** meaning:

> "This match goes to penalties, and **X** wins the shootout."

The PK side (`pk_advance_team_id`) is **not a separate bet**. It's part of the
same prediction as the scoreline. There is **NO separate +3 bonus** — the PK
information is folded directly into the two existing point types (exact 10,
result 4).

That gives us a clean rule:

- **Predicted draw in a knockout** = "PKs, and X advances."
  - Exact (10): 90+ET scoreline matches AND match actually went to PKs AND `pk_advance_team_id` matches the PK winner.
  - Result (4): predicted advancer (`pk_advance_team_id`) matches actual advancer.

- **Predicted non-draw in a knockout** = "decided in 90 or ET, winning side is X."
  - Exact (10): 90+ET scoreline matches AND match did NOT go to PKs.
  - Result (4): predicted winning side matches actual advancer (whether that team advanced in 90, ET, or even PKs).

If the user predicts a draw in a knockout WITHOUT setting `pk_advance_team_id`,
the pick is **invalid for both exact and result** → 0 pts.

---

## Rounds

Round codes used in `predictor_matches.round_code`:

| Code        | Friendly name           | Notes                                                  |
|-------------|-------------------------|--------------------------------------------------------|
| `group_r1`  | R1 — Group Matchday 1   | Group stage                                            |
| `group_r2`  | R2 — Group Matchday 2   | Group stage                                            |
| `group_r3`  | R3 — Group Matchday 3   | Group stage                                            |
| `r32`       | R4 — Round of 32        | Knockouts begin                                        |
| `r16`       | R5 — Round of 16        | Goalscorer picks begin                                 |
| `qf`        | R6 — Quarter-finals     |                                                        |
| `sf`        | R7 — Semi-finals        |                                                        |
| `final`     | R8 — Final + 3rd place  | One round_code covers both matches                     |

"R1–R4" means group stage + R32. "R5–R8" means R16 through Final.

---

## Per-match scoring (every round)

| Outcome                                                | Points |
|--------------------------------------------------------|--------|
| **Exact score correct** (rules above)                  | **10** |
| **Result correct** (rules above), score wrong          | **4**  |
| Wrong result                                           | 0      |

No goal-difference bonus. No both-teams-to-score bonus. No separate PK bonus.

---

## Starred picks (R1–R4 only)

- Star a match → that match's total is doubled (×2 multiplier).
- 1 star per round, 4 stars total across the tournament (R1, R2, R3, R4).
- **R5–R8 have NO stars.** If `is_star = true` on a R5–R8 match, the library forces the multiplier to 1.

---

## Anytime Goalscorer (R5–R8 only — R16 through Final + 3rd-place playoff)

- **+2 pts** per correct scorer pick.
- 1 pick per match.
- **Eligibility is INDEPENDENT of the result.** If their picked player scores (open play or ET — NOT shootout goals), award +2 regardless of whether the scoreline or result was right.
- No tournament-wide cap.
- In R1–R4 (group + R32), goalscorer picks are ignored — `scorer_pts` is always 0.

Shootout goals do not count. The caller is responsible for passing only open-play + ET scorers in `actual.scorer_player_ids`.

---

## Tournament winner pick

- **+40 pts** if the champion is picked correctly.
- Locked at R1 kickoff (single pick for the tournament).
- "Correctly picked" = the team that lifts the trophy, regardless of how the final ended (90 / ET / PKs).

This is scored separately from per-match `predictor_scores` rows — see leaderboard cache (`winner_pick_pts`).

---

## Worked examples

These are the canonical examples. Tests in `scoring.test.ts` are named `E-G1`..`E-K12` to match.

### Group stage (R1–R3)

| ID   | Prediction         | Actual                       | Result          |
|------|--------------------|------------------------------|-----------------|
| E-G1 | Pred 2-1           | Actual 2-1                   | exact (10) — **10 / teal** |
| E-G2 | Pred 2-1           | Actual 3-1                   | result (4, right winner, wrong score) — **4 / green** |
| E-G3 | Pred 1-1           | Actual 1-1                   | exact (10) — **10 / teal** |
| E-G4 | Pred 1-1           | Actual 2-2                   | result (4, draw vs draw) — **4 / green** |
| E-G5 | Pred 2-1           | Actual 1-2                   | wrong — **0 / red** |

### Knockouts, non-draw predictions (R4–R8)

| ID   | Prediction              | Actual                                  | Result          |
|------|-------------------------|-----------------------------------------|-----------------|
| E-K1 | Pred Brazil 2-1         | Brazil 2-1 in regulation                | exact (10) — **10 / teal** |
| E-K2 | Pred Brazil 2-1         | Brazil 3-1 in regulation                | result (4, Brazil advanced) — **4 / green** |
| E-K3 | Pred Brazil 2-1         | 1-1, Brazil wins on PKs                 | result (4, Brazil advanced via PKs; no exact because pred said no-PKs) — **4 / green** |
| E-K4 | Pred Brazil 2-1         | France 2-1 in regulation                | wrong — **0 / red** |
| E-K5 | Pred Brazil 2-1         | 1-1, France wins on PKs                 | wrong — **0 / red** |

### Knockouts, predicted draw + PK-advance (R4–R8)

| ID    | Prediction                   | Actual                              | Result          |
|-------|------------------------------|-------------------------------------|-----------------|
| E-K6  | Pred 1-1 + Brazil PK         | 1-1, Brazil wins on PKs             | exact (10, scoreline + PK side both right) — **10 / teal** |
| E-K7  | Pred 1-1 + Brazil PK         | 0-0, Brazil wins on PKs             | result (4, Brazil advanced via PKs as predicted) — **4 / green** |
| E-K8  | Pred 1-1 + Brazil PK         | Brazil 2-1 in ET                    | result (4, Brazil advanced) — **4 / green** |
| E-K9  | Pred 1-1 + Brazil PK         | 1-1, France wins on PKs             | wrong advancer — **0 / red** |
| E-K10 | Pred 1-1 + Brazil PK         | France 2-1 in ET                    | wrong — **0 / red** |
| E-K11 | Pred 0-0 + Brazil PK         | 0-0, Brazil wins on PKs             | exact (10) — **10 / teal** |
| E-K12 | Pred draw, `pk_advance_team_id = null` in knockout | any actual              | invalid pick — **0 / red** |

---

## `exact` vs `result` — they don't stack

When `exact_pts = 10`, `result_pts = 0`. You get one or the other, never both. The library guarantees this.

---

## Score components (DB column `predictor_scores`)

| Column            | Meaning                                            |
|-------------------|----------------------------------------------------|
| `exact_pts`       | 10 if exact, else 0                                |
| `result_pts`      | 4 if result-only correct, else 0                   |
| `scorer_pts`      | 0 or 2 (R5–R8 only)                                |
| `star_multiplier` | 1 or 2 (2 only if `is_star` AND round is R1–R4)    |
| `total_pts`       | `(exact + result + scorer) * star_multiplier`      |
| `outcome_color`   | `teal` / `green` / `red`                           |

### `outcome_color`

- `teal` — `exact_pts > 0`
- `green` — `result_pts > 0 OR scorer_pts > 0`
- `red` — pick exists but all components are 0
- `gray` — no pick submitted (library-only state; not stored in DB rows)

---

## Tiebreakers

When two managers have the same `total_pts` on a leaderboard, break ties in this order — highest wins:

1. **Total points**
2. **Most exact scores correct** — count of matches where `exact_pts > 0`
3. **Most correct results** — count of matches where `exact_pts > 0 OR result_pts > 0`
4. **Alphabetical `manager_name`** — final fallback (A before Z)

(Apply step 4 only if 1–3 all tie.)

---

## Library API summary

```ts
import { scorePick } from '@/lib/predictor/scoring';

const breakdown = scorePick(pickOrNull, matchActual);
// breakdown: { exact_pts, result_pts, scorer_pts,
//              star_multiplier, total_pts, outcome_color }
```

The library is a **pure function**: no DB calls, no network, no clock. The caller maps DB rows into `PickInput` / `MatchActual` and persists `ScoreBreakdown` back.

### Mapping note (caller responsibility)

The DB columns differ slightly from the library's input shape:

| DB (`predictor_picks`)                 | Library (`PickInput`)         |
|----------------------------------------|-------------------------------|
| `home_score` (int, non-null)           | `home_score` (number \| null) |
| `away_score` (int, non-null)           | `away_score` (number \| null) |
| `goalscorer_player_id` (uuid)          | `scorer_player_ids: string[]` |
| `if_draw_winner` (legacy team_code)    | `pk_advance_team_id` (new)    |
| `pk_advance_team_id` (added 2026-06-03)| `pk_advance_team_id`          |
| `is_star`                              | `is_star`                     |

The DB has a single `goalscorer_player_id` (uuid). The library accepts an array of strings to keep the contract generic — callers wrap the single id in a one-element array (or pass `[]` if null).

`pk_advance_team_id` is the new canonical column (added in the 2026-06-03 migration); the legacy `if_draw_winner` continues to exist for back-compat. Picks UI should write the new column going forward.

### Note on `predictor_scores` generated columns

The original phase-3 migration (`2026-05-19-predictor-phase-3.sql`) defines
`total_pts` and `outcome_color` as generated columns based on
`(exact_pts + result_pts + scorer_pts) * star_multiplier`. Those definitions
remain correct under the bundled-pick model and are NOT modified by the
2026-06-03 migration.

The DB `outcome_color` generated column flags `green` only when `result_pts > 0`
(it predates the goalscorer's independent-of-result behavior). The library's
in-memory `outcome_color` is broader: `green` when `result_pts > 0` OR
`scorer_pts > 0`. For group stage and R32, `scorer_pts` is always 0, so they
agree. For R5–R8 a row where `exact = 0, result = 0, scorer = 2` will read as
`red` in the generated column but `green` in the library output. Callers that
need the library's view (e.g. picks-tab tile coloring) should compute it from
the breakdown rather than reading the generated column directly.
