# Pass 2 + Pass 5 Auth Migration — Notes

Branch: `feat/pass2-5-auth-migration`
Date: 2026-05-19
Author: HughB90 (via Neo)

---

## What changed

### Data model (schema already migrated before this branch)
- `accounts (id, email, password_hash)` and `profiles (id, account_id,
  first_name, pin_hash, manager_name, display_name, is_owner)` are live.
- 4 accounts + 4 owner profiles were created from `bracket_users` by
  `scripts/migrate-users-to-accounts.js`.
- `bracket_entries.profile_id` and `wc26_league_members.profile_id` were
  backfilled. The old `bracket_users` rows + `bracket_entries.user_id`
  column are untouched and remain the rollback path.

### Auth surface (this branch)

**Canonical endpoints** (use these going forward):

| Method | Path                          | Purpose                                                        |
| ------ | ----------------------------- | -------------------------------------------------------------- |
| GET    | `/api/auth/me`                | Returns `{ account, profile }` or nulls. Used by header hydration. |
| POST   | `/api/auth/signin-tier1`      | `{ email, first_name, pin }` → sets both cookies, returns profile. |
| POST   | `/api/auth/signin-tier2`      | `{ first_name, pin }` (requires account cookie) → sets profile cookie. |
| POST   | `/api/auth/signin-tier3`      | `{ email, password }` → sets account cookie, returns profile list. Refuses `password_hash === 'PENDING_SET'`. |
| POST   | `/api/auth/pick-profile`      | `{ profile_id }` (requires account cookie) → sets profile cookie. |
| POST   | `/api/auth/create-account`    | `{ email, first_name, pin, manager_name, display_name? }` → creates account + owner profile, sets both cookies, sends Resend welcome email. |
| POST   | `/api/auth/signout`           | Clears both cookies (and legacy unsigned cookies).             |

**Legacy endpoints kept alive** (no behaviour change for in-flight clients):

- `/api/bracket/auth` — the original PIN endpoint. On a successful PIN
  match it now ALSO sets the new signed cookies, so any client still
  using legacy localStorage auto-upgrades on next sign-in.
- `/api/auth/signin`, `/api/auth/account-signin`, `/api/auth/quick-signin`,
  `/api/auth/profiles` — earlier (feature-flagged) first cut of Pass 5.
  The feature flag was removed so the orphan `/auth/signin`,
  `/auth/account-signin`, `/auth/picker`, `/auth/profiles/new` pages
  still function. These endpoints are equivalent to the canonical ones
  above; pick a name and stick with it.

### Cookies (NEW model)

| Cookie name        | Lifetime               | Purpose                              |
| ------------------ | ---------------------- | ------------------------------------ |
| `t90_account_id`   | 30-day rolling         | Account identity. Set on any auth.   |
| `t90_profile_id`   | Session (no max-age)   | Active profile. Set on profile pick. |

Both are httpOnly, `sameSite=lax`, signed with HMAC-SHA256 using
`AUTH_COOKIE_SECRET`. Tampering yields nulls (timing-safe compare).
Legacy unsigned cookies `t90_account_session` / `t90_profile_session`
are still accepted on read (not on write).

Helpers: `src/lib/auth-cookies.ts` (sign/verify), `src/lib/auth-session-server.ts`
(`resolveSession()` returns `{ account, profile }`).

### UI

- **`src/components/AuthForm.tsx`** — fully rewritten. Three modes: Sign In
  (Tier 1: email + first_name + PIN), Create Account, Parent password
  (Tier 3). Defaults to Sign In. If Tier 3 hits PENDING_SET it falls back
  to Sign In with a helpful message. Keeps legacy localStorage keys in
  sync so the bracket page (which still reads them) doesn't log the user
  out.
- **`src/components/AuthModal.tsx`** — now hosts the "Who's playing?"
  profile picker when Tier 3 succeeds.
- **`src/components/AuthHeader.tsx`** (NEW) — self-hydrating header bar.
  Calls `/api/auth/me` on mount, shows "Sign in" button (anon) or
  "{display_name} ▾" dropdown (authed). Used on `/s3`, `/scores`, `/news`.
  `/predictor` and `/bracket` are intentionally not switched to this
  component yet (`/bracket` already has its own auth state machinery via
  `Header.tsx` props).
- **`src/app/bracket/page.tsx`** — sign-out now also hits
  `/api/auth/signout` to clear the new cookies. Hard gate was already
  removed in Pass 2 (commit `0026e7a`).
- **Leaderboard manager column** — `src/app/api/bracket/leaderboard/route.ts`
  joins `profiles` via `bracket_entries.profile_id` and now returns
  `{ rank, userId, profileId, displayName, managerName, firstName, score }`.
  The Bracket page leaderboard renders **Manager** as the primary column
  (using `managerName`) and **Name** as the secondary (using `firstName`).
  League view also shows manager name with first name underneath.

### Config

- New env var: `AUTH_COOKIE_SECRET` (32-byte hex). Set in `.env.local`.
  **Must be added to Vercel env (Preview + Production)** before any
  deploy that exercises the new endpoints. If absent the helpers throw
  on use (deliberately — fail loud).
- `MULTI_PROFILE_ENABLED` flipped to `true` in `.env.local` for
  consistency, though the canonical endpoints no longer check it. Vercel
  env should match.

---

## Smoke-test results (local dev, 2026-05-19)

All 10 endpoint paths exercised via curl. All passed.

1. anon `/api/auth/me` → `{account:null, profile:null}` ✓
2. Tier 1 bad PIN → 401 "Incorrect PIN." ✓
3. Tier 1 success (Zach, temporary PIN 1234) → returns profile, sets
   both signed cookies ✓
4. `/api/auth/me` with cookies → returns full account + profile ✓
5. Tier 3 against `PENDING_SET` → 409 with `code: PASSWORD_PENDING` and
   the "set a password via Account Settings" message ✓
6. `/api/auth/signout` → `{ok:true}` ✓
7. `/api/auth/create-account` + `/api/auth/signin-tier2` + cross-account
   `/api/auth/pick-profile` (correctly 404s on someone else's profile) ✓
8. Legacy `/api/bracket/auth` still works; on success it ALSO sets the
   new signed cookies ✓
9. `/api/auth/me` with the cookies issued by the legacy endpoint → full
   account + profile ✓
10. `/api/bracket/leaderboard` returns `managerName` + `firstName` on
    every row, drawn from `profiles` ✓

Also confirmed: `/bracket`, `/s3`, `/scores`, `/news` all 200 with
`AuthHeader` mounted. `npm run build` produces a clean optimized build
with all 8 new routes registered.

---

## What's deferred

- **Account-settings UI / set-password flow.** Migrated parents (all 4
  current accounts have `password_hash = 'PENDING_SET'`) must use Tier 1
  until we ship a UI that lets them set a real password. Tier 3 will
  refuse them with a helpful message in the meantime. Recommend building
  this before opening any "log in with password" entry point.
- **`/predictor` page.** Doesn't exist on this branch (the predictor
  backend lives on the parallel `feat/predictor-phase-3` branch). When
  it's added, drop `<AuthHeader />` into it the same way `/s3` does.
- **Removing `bracket_users` and `bracket_entries.user_id`.** Per
  CONTEXT.md instructions: leave for ~2 weeks post-launch as rollback
  path. The legacy `/api/bracket/auth` endpoint and the legacy
  localStorage keys will start logging deprecation warnings once we're
  ready to retire them.
- **Pass 4 (Josue mobile SSO).** Still blocked on Josue.

## What to decide (open questions for Neo/Hugh)

1. **Which UI for "set a password"?** Quick option: a one-screen form
   under `/account/set-password` that requires Tier 1 cookies present
   and posts to a new `/api/auth/set-password` (verify Tier-1 currently
   signed in, hash + persist). Punted to a follow-up.
2. **Sign-in default tab.** Currently the modal defaults to "Sign In"
   (Tier 1). Should it auto-pick "Quick login" (Tier 2) when a
   `t90_account_id` cookie is present but no profile? Worth a UX pass
   before launch — right now Tier 2 isn't exposed in the form, it's
   only used in the picker.
3. **Bracket page header.** Still uses the older props-based
   `Header.tsx` because it owns the auth-state machinery. Could be
   unified onto `AuthHeader` later for consistency, but not required.

---

## How to roll back

If signed-cookie auth misbehaves in production:

1. **Disable the new endpoints fast:** revert this commit (`7de243c`)
   on `main`. The old localStorage + legacy `/api/bracket/auth` path
   stays fully functional (it was never removed).
2. **If just the cookie signing is broken:** unset `AUTH_COOKIE_SECRET`
   in Vercel — the helpers will throw on use, which fails the new
   endpoints loudly while the legacy bracket-auth path keeps working.
   Hard-clear any deployed cookies via header in the response.
3. **Database is 100% reversible:** `bracket_users` and
   `bracket_entries.user_id` are untouched. Drop `accounts` + `profiles`
   tables in Supabase if you want to nuke the new model entirely — no
   foreign keys point INTO `bracket_users` from those tables, only out.
4. **Resend welcome emails are non-blocking** — disabling
   `RESEND_API_KEY` won't break account creation.
