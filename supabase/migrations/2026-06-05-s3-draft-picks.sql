-- S3 My Draft feature — per-user (per-profile) draft picks for the Top 250 player list.
-- Each row holds the three composable toggles for a single (profile_id, player_id) pair.
--
-- Auth model note: total90-wc26 uses its own profile-based session (public.profiles),
-- NOT Supabase Auth (auth.users). All access is gated server-side via API routes that
-- validate the signed session cookie. We rely on the API layer rather than RLS,
-- mirroring s3_players / predictor tables.

create table if not exists public.s3_draft_picks (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  player_id  uuid not null references public.s3_players(id) on delete cascade,
  drafted    boolean not null default false,
  my_team    boolean not null default false,
  favorite   boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (profile_id, player_id)
);

create index if not exists idx_s3_draft_picks_profile on public.s3_draft_picks(profile_id);
