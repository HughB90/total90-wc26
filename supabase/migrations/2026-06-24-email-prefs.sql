-- 2026-06-24 — Email preferences + send audit log
--
-- Adds:
--   * email_prefs — one row per auth.users, holds per-type toggles + a stable
--     unsub_token used in token-based unsubscribe links (no auth required to
--     act on the link).
--   * email_sends — append-only audit log of every send attempt (sent /
--     failed / skipped_unsub) so we never double-send and so we can debug
--     mass-email drops.
--   * trigger on auth.users INSERT auto-creates the prefs row.
--   * Backfill: insert prefs rows for all existing auth.users.
--
-- Idempotent guards used throughout so this is safe to re-run.

create extension if not exists "pgcrypto";

create table if not exists public.email_prefs (
  account_id       uuid primary key references auth.users(id) on delete cascade,
  unsub_token      uuid not null default gen_random_uuid() unique,
  round_reminders  boolean not null default true,
  league_invites   boolean not null default true,
  winner_lock      boolean not null default true,
  marketing        boolean not null default true,
  unsub_all        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_email_prefs_token on public.email_prefs(unsub_token);

-- RLS: a logged-in account can read/update its own prefs row. All token-based
-- writes (the public /account/unsubscribe page) go through the service-role
-- client server-side, so they bypass RLS.
alter table public.email_prefs enable row level security;

drop policy if exists "email_prefs_self_select" on public.email_prefs;
create policy "email_prefs_self_select"
  on public.email_prefs
  for select
  using (auth.uid() = account_id);

drop policy if exists "email_prefs_self_update" on public.email_prefs;
create policy "email_prefs_self_update"
  on public.email_prefs
  for update
  using (auth.uid() = account_id)
  with check (auth.uid() = account_id);

-- Auto-create a prefs row whenever a new auth user is created.
create or replace function public.ensure_email_prefs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.email_prefs(account_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_email_prefs_on_signup on auth.users;
create trigger trg_email_prefs_on_signup
  after insert on auth.users
  for each row execute function public.ensure_email_prefs();

-- Backfill existing users
insert into public.email_prefs(account_id)
  select id from auth.users
  on conflict do nothing;

-- ---------------------------------------------------------------------------
-- email_sends — audit log of every send attempt.
-- ---------------------------------------------------------------------------
create table if not exists public.email_sends (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid references auth.users(id) on delete set null,
  email       text not null,
  email_type  text not null,  -- e.g. 'round_reminder:group_r3', 'welcome', 'bracket_magic_link'
  status      text not null,  -- 'sent' | 'failed' | 'skipped_unsub'
  error       text,
  sent_at     timestamptz not null default now()
);

create index if not exists idx_email_sends_account on public.email_sends(account_id);
create index if not exists idx_email_sends_type    on public.email_sends(email_type);
create index if not exists idx_email_sends_sent_at on public.email_sends(sent_at desc);

-- Audit log is service-role only. Lock it down.
alter table public.email_sends enable row level security;
-- (no policies = no anon/auth access; service role bypasses RLS by design)

comment on table public.email_prefs is 'Per-account email preferences. unsub_token authorizes the public /account/unsubscribe page.';
comment on table public.email_sends is 'Append-only audit log of email send attempts.';
