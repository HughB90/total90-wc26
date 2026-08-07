-- Late-entry winner-pick penalty (Hugh, 2026-06-12).
--
-- Adds three columns to predictor_winner_picks tracking how many calendar
-- days late (America/Chicago) the user submitted their pick, the resulting
-- max bonus they can earn, and the penalty delta (for transparent UI).
--
-- Spec:
--   bonus_cap   = max(0, 40 - days_late * 5)
--   penalty_pts = 40 - bonus_cap
--
-- These are LOCKED at first save and never recomputed on subsequent updates
-- (Hugh's spec: late entrants get one shot). Pre-existing rows (submitted
-- before this migration runs) are backfilled assuming their submitted_at is
-- the source of truth.
--
-- We deliberately keep the computation in application code (see
-- src/lib/predictor/winner-penalty.ts) rather than a generated column so the
-- "first-save-locks-it" semantics are explicit and not subject to future
-- schema drift.

alter table predictor_winner_picks
  add column if not exists days_late   int not null default 0,
  add column if not exists bonus_cap   int not null default 40,
  add column if not exists penalty_pts int not null default 0;

-- Backfill for any rows that already exist. Pre-kickoff submissions
-- (submitted_at <= 2026-06-11 19:00 UTC = 14:00 CT) stay at the defaults
-- (days_late=0, bonus_cap=40, penalty_pts=0). Anything submitted later than
-- that uses the same CT-calendar-day math the helper applies.
update predictor_winner_picks
set
  days_late   = greatest(0, (date(submitted_at at time zone 'America/Chicago') - date '2026-06-11')),
  bonus_cap   = greatest(0, 40 - greatest(0, (date(submitted_at at time zone 'America/Chicago') - date '2026-06-11')) * 5),
  penalty_pts = 40 - greatest(0, 40 - greatest(0, (date(submitted_at at time zone 'America/Chicago') - date '2026-06-11')) * 5)
where days_late = 0
  and submitted_at > timestamptz '2026-06-11 19:00:00+00';

comment on column predictor_winner_picks.days_late   is 'Calendar days late (America/Chicago) at first save. Locked thereafter.';
comment on column predictor_winner_picks.bonus_cap   is 'Max points awardable if this winner pick is correct. Locked at first save.';
comment on column predictor_winner_picks.penalty_pts is 'Pts forfeited vs the full 40-pt bonus due to late entry. Locked at first save.';
