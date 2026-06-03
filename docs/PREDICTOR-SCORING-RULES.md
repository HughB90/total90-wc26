# WC26 Predictor — Canonical Scoring Rules (v2)

**Locked:** 2026-06-03 by Hugh
**Supersedes:** all prior placeholder rules on `feat/predictor-scoring-lib` (discarded)
**Implementation:** `src/lib/predictor/scoring.ts`
**Tests:** `src/lib/predictor/scoring.test.ts`

This is the source of truth. If code, UI copy, or a doc disagrees with this file,
this file wins.

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
| `final`     | R8 — Final + 3rd place  | One round_code covers both matches (per seed script)   |

"R1–R4" means group stage + R32. "R5–R8" means R16 through Final.

---

## Per-match scoring (every round)

| Outcome                                                | Points |
|--------------------------------------------------------|--------|
| **Exact score correct** (home AND away match)          | **10** |
| **Result correct** (W/D/L), score wrong                | **4**  |
| Wrong result                                           | 0      |

No goal-difference bonus. No both-teams-to-score bonus. (Those were removed.)

---

## Starred picks (R1–R4 only)

- Star a match → that match's total is doubled (×2 multiplier).
- 1 star per round, 4 stars total across the tournament (R1, R2, R3, R4).
- **R5–R8 have NO stars.** If `is_star = true` on a R5–R8 match, the library forces the multiplier to 1.

---

## Advancer-on-PKs bonus (R4–R8 — knockouts only)

**+3 pts** IF AND ONLY IF all three conditions hold:

1. Predicted scoreline is a draw (0-0, 1-1, 2-2, etc.) — `home_score === away_score`, both non-null.
2. `pk_advance_team_id` matches the team that actually advanced on PKs.
3. The match actually went to PKs (`actual.went_to_pks === true`).

Edge cases:

- Predicted draw but match did NOT go to PKs → no PK bonus (even if their PK side won in ET — that just earns winner credit via `result_pts`, not advance credit).
- Predicted non-draw scoreline → PK bonus is impossible. They committed to a winner already.

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

## Winner-of-match rule (knockouts)

The winner of a knockout match is **whoever advances**, including via PKs. This is critical for resolving `result_pts`.

### Worked examples

#### Example 1 — Predicted Brazil 2-1, actual Brazil wins on PKs

- Exact? No (predicted non-draw, actual went to PKs which means 90+ET was a draw).
- Result? Yes — Brazil advanced, which matches the predicted winner. **+4 pts**.
- PK advance? No — predicted non-draw, so the bonus is unreachable.
- Total: **4 / green**.

#### Example 2 — Predicted 1-1 + Brazil on PKs, actual Brazil wins 2-1 in ET

- Exact? No (predicted 1-1, actual 2-1).
- Result? Yes — Brazil advanced (in ET, not PKs), matches predicted winner. **+4 pts**.
- PK advance? No — match didn't go to PKs.
- Total: **4 / green**.

#### Example 3 — Predicted 1-1 + Brazil on PKs, actual = 1-1 then Brazil wins on PKs

- Exact? **Yes** — 1-1 matches 1-1 (90+ET, before PKs). **+10 pts**.
- Result? Folded into exact; not double-counted (when exact is awarded, result is 0).
- PK advance? **Yes** — predicted draw, match went to PKs, Brazil pick matches the PK winner. **+3 pts**.
- Goalscorer? +2 if their scorer pick scored in 90+ET (R5–R8 only, so depends on round).
- Total (no goalscorer applicable): **13 / teal**.

---

## `exact` vs `result` — they don't stack

When `exact_pts = 10`, `result_pts = 0`. You get one or the other, never both. The library guarantees this.

## `result_pts` vs `advancer_pk_pts` — no double-dip

If a user **predicts a draw** AND the match **goes to PKs**, the user's advance credit is awarded **exclusively via `advancer_pk_pts` (+3)** — they do NOT also receive `result_pts` (+4). Otherwise the rule would double-credit PK predictions.

This means:

- Pred 1-1 + BRA PK, actual 0-0 → BRA on PKs: `result_pts = 0`, `advancer_pk_pts = 3`. **Total 3.**
- Pred 1-1 + BRA PK, actual 1-1 → BRA on PKs: `exact_pts = 10`, `advancer_pk_pts = 3`. **Total 13.** (Example 3.)
- Pred Brazil 2-1, actual 0-0 → BRA on PKs: `result_pts = 4` (predicted non-draw, predicted winner advanced). No PK bonus possible (non-draw prediction). **Total 4.** (Example 1.)
- Pred 1-1 + BRA PK, actual BRA 2-1 in ET: `result_pts = 4` (match did NOT go to PKs, so the PK pick acts as the committed winner for result purposes). **Total 4.** (Example 2.)

The rule in one sentence: **a predicted draw earns either `result_pts` (when the match doesn't go to PKs and the PK pick was the actual non-PK winner) OR `advancer_pk_pts` (when the match did go to PKs and the PK pick won the shootout), never both.**

---

## Score components (DB column `predictor_scores`)

| Column            | Meaning                                            |
|-------------------|----------------------------------------------------|
| `exact_pts`       | 10 if exact, else 0                                |
| `result_pts`      | 4 if result-only correct, else 0                   |
| `scorer_pts`      | 0 or 2 (R5–R8 only)                                |
| `advancer_pk_pts` | 0 or 3 (R4–R8 only, requires predicted draw + PKs) |
| `star_multiplier` | 1 or 2 (2 only if `is_star` AND round is R1–R4)    |
| `total_pts`       | `(exact + result + scorer + advancer_pk) * mult`   |
| `outcome_color`   | `teal` / `green` / `red`                           |

### `outcome_color`

- `teal` — `exact_pts > 0`
- `green` — any positive non-exact component (`result_pts > 0` OR `advancer_pk_pts > 0` OR `scorer_pts > 0`)
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
// breakdown: { exact_pts, result_pts, scorer_pts, advancer_pk_pts,
//              star_multiplier, total_pts, outcome_color }
```

The library is a **pure function**: no DB calls, no network, no clock. The caller maps DB rows into `PickInput` / `MatchActual` and persists `ScoreBreakdown` back.

### Mapping note (caller responsibility)

The DB columns differ slightly from the library's input shape:

| DB (`predictor_picks`)                | Library (`PickInput`)         |
|---------------------------------------|-------------------------------|
| `home_score` (int, non-null)          | `home_score` (number \| null) |
| `away_score` (int, non-null)          | `away_score` (number \| null) |
| `goalscorer_player_id` (uuid)         | `scorer_player_ids: string[]` |
| `if_draw_winner` (legacy team_code)   | `pk_advance_team_id` (new)    |
| `pk_advance_team_id` (added 2026-06-03)| `pk_advance_team_id`         |
| `is_star`                             | `is_star`                     |

The DB has a single `goalscorer_player_id` (uuid). The library accepts an array of strings to keep the contract generic — callers wrap the single id in a one-element array (or pass `[]` if null).

`pk_advance_team_id` is the new canonical column (added in the v2 migration); the legacy `if_draw_winner` continues to exist for back-compat. Picks UI should write the new column going forward.
