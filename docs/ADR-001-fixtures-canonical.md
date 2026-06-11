# ADR-001: `predictor_matches` is the canonical WC26 fixtures table

**Date:** 2026-06-11
**Status:** Accepted
**Authors:** Neo (on behalf of HughB90)

## Context

Hugh's mental model after the live Mexico–South Africa kickoff used a hypothetical `wc26_fixtures` table for the WC26 schedule + live scores. But we already have a fully populated table doing that job:

- `predictor_matches` — 104 rows, one per WC26 fixture (group + KO), with `home_team_code`, `away_team_code`, `kickoff_at`, `venue`, `round_code`, `home_score`, `away_score`, `goalscorers`, `status`, `went_to_pks`, `pk_winner_team_code`, etc. This is what the Bracket, Predictor, and per-match admin score-entry already read/write.

Creating a parallel `wc26_fixtures` table would split the source of truth: bracket + predictor would diverge from `/scores`, manual admin edits would need to be doubled up, and goalscorer events would have to be reconciled across tables.

## Decision

`predictor_matches` is THE canonical fixtures + live-state table for the World Cup 2026 tournament. All new surfaces (the `/scores` page, the Opta sync cron, future schedule widgets) **read from and write to `predictor_matches`**. There is no separate `wc26_fixtures` table.

## Consequences

- The Opta cron (`/api/cron/sync-wc26-fixtures`) writes scores, period, minute, and goalscorers into `predictor_matches`.
- The `/scores` page reads from `predictor_matches` via `/api/scores`.
- The existing `/admin/predictor/score-match` UI continues to be the manual override path — its writes show up everywhere.
- New columns added by the 2026-06-11 migration: `opta_fixture_id`, `last_synced_at`, `period`, `minute`.
- The `status` column already has a CHECK constraint allowing `scheduled | live | final | cancelled` — the cron uses those four values. Finer-grained period info (1H/HT/2H/ET/PEN/FT) lives in the new `period` column, not `status`, so the constraint doesn't need to change.

## Out of scope

- The per-player-per-match `wc26_matches` table is unrelated — that's the WC26-specific stats roster (different scope, separate cron). It is not affected by this decision.
- A future tournament (Euro 2028, WC30) would warrant a more general `tournament_matches` table. For now: WC26-only, this table.

## Reference

- Existing schema: `supabase/migrations/2026-05-19-predictor-phase-3.sql`
- New columns: `supabase/migrations/2026-06-11-predictor-matches-opta-sync.sql`
- Cron: `src/app/api/cron/sync-wc26-fixtures/route.ts`
- API: `src/app/api/scores/route.ts`
- Page: `src/app/scores/page.tsx`
