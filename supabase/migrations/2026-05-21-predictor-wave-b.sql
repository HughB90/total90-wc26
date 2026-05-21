-- ============================================================================
-- WC26 Predictor — Wave B schema additions
-- Date: 2026-05-21
-- Branch: feat/predictor-wave-b
-- Spec: projects/total90-wc26/PREDICTOR_SPEC.md § amendments 2026-05-20
-- ============================================================================
-- NOTES:
--   * Adds `predictor_picks.goalscorer_id` (Phase 5 — Anytime Goalscorer R5–R8)
--   * Adds `predictor_players` (lightweight scorer autocomplete table)
--   * No change to lock_at columns — lock times now live in code
--     (src/lib/predictor-rounds.ts) and are enforced server-side per request.
-- ============================================================================

-- ---- predictor_players -----------------------------------------------------
-- Minimal autocomplete table for "Anytime Goalscorer" pick. Populated from
-- Opta squad pulls (sheets/opta-squad-pull-wc2026.js → import to this table).
create table if not exists predictor_players (
  id            uuid primary key default gen_random_uuid(),
  team_code     text not null,
  display_name  text not null,
  position      text,
  aliases       text[] not null default '{}'::text[],
  external_id   text,                              -- Opta player ID
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_predictor_players_team on predictor_players (team_code);
create index if not exists idx_predictor_players_display_name on predictor_players (display_name);

-- ---- predictor_picks.goalscorer_id ----------------------------------------
alter table predictor_picks
  add column if not exists goalscorer_id uuid references predictor_players(id) on delete set null;

create index if not exists idx_predictor_picks_goalscorer on predictor_picks (goalscorer_id);

-- ============================================================================
-- RLS for predictor_players (public read, no public writes — service role only)
-- ============================================================================
alter table predictor_players enable row level security;

drop policy if exists "predictor_players_anon_read" on predictor_players;
create policy "predictor_players_anon_read"
  on predictor_players for select
  to anon, authenticated
  using (true);

drop policy if exists "predictor_players_service_role_all" on predictor_players;
create policy "predictor_players_service_role_all"
  on predictor_players for all
  to service_role
  using (true) with check (true);
