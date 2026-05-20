# Predictor Phase 3 — Delivery Notes

**Branch:** `feat/predictor-phase-3` (do NOT merge — Phase 3 of 6 only)
**Spec:** `projects/wc26-page/PREDICTOR-PLAN.md` § "Build Phases" → Phase 3
**Date:** 2026-05-19
**Author:** subagent `wc26-predictor-phase-3` (Sonnet)

## What shipped

### 1. SQL migration applied + verified
- `supabase/migrations/2026-05-19-predictor-phase-3.sql`
- Applied via Supabase Management API SQL endpoint to project `tituygkbondyjhzomwji`.
- 5 new tables: `predictor_matches`, `predictor_picks`, `predictor_winner_picks`, `predictor_scores`, `predictor_leaderboard_cache`.
- RLS enabled on all 5; profile-scoped policies use helper fn `predictor_current_profile_id()` reading `request.jwt.claims->>'profile_id'`.
- Touch-`updated_at` trigger on the three user-writable tables.

### 2. Fixture seed
- `scripts/seed-predictor-matches.js` parses the `MATCHES` array in `src/app/scores/page.tsx` via regex (handles both single-quoted and double-quoted venues — needed for "Levi's Stadium").
- Round-code mapping: `stage:'group',round:N → group_rN`; knockout stages used verbatim (`r32`, `r16`, `qf`, `sf`, `final`). Confirmed match 103 (3rd place) and 104 (Final) both encode as `final` — matches spec § "Tournament Structure".
- Match IDs `match_001` through `match_104`.
- Kickoff times: parsed as America/Chicago (CDT, UTC-5 — no DST transition during WC) and stored as UTC ISO. R1 first kickoff = `2026-06-11T19:00:00.000Z` ✓ matches spec lock.
- Idempotent: inserts new rows, refreshes schedule fields on existing rows, never overwrites `home_score/away_score/status/goalscorers` (scoring engine owns those — Phase 4).
- **Final count: 104 rows.** ✓

### 3. API endpoints (all 4 implemented)
All under `src/app/api/predictor/`:

| Endpoint | Method(s) | Status |
|---|---|---|
| `/api/predictor/winner` | GET, POST | ✓ |
| `/api/predictor/winner-picks` | GET | ✓ |
| `/api/predictor/picks` | POST | ✓ |
| `/api/predictor/round/[round_code]` | GET | ✓ |

### 4. UI screens (all 3 shipped)
All under `src/app/predictor/`:

- **`/predictor`** — landing dashboard. Cards for Tournament Winner pick + Round 1 picks with `Open / Submitted / Locked` badges. Anon users get a "Sign in to play" nudge that routes to `/bracket` (see "Stubbed" below).
- **`/predictor/winner`** — 48-nation grid (extracted from `predictor_matches` group_r1 rows), single-select with sticky submit + countdown banner.
- **`/predictor/round/[round_code]`** — supports all 8 round codes for QA preview, but the in-spec flow is `group_r1` only (Round 1) in Phase 3. Sticky counters: "Picks: X/16" + "Stars: 0/1", knockout if-draw winner picker, save-as-you-go to local state, single "Submit Round" commit. Score inputs clamp 0–15. Submit disabled when validation fails (too many picks/stars, missing draw advancer, etc.).

### 5. WC26 hub tile + nav
- `src/app/page.tsx` — new `Score Predictor` card (Target icon, red-pink accent, `tag: 'new'`) inserted after Bracket.
- `src/app/layout.tsx` — added `Predictor` link to the sticky `NAV_LINKS`.

## Smoke test summary

DB-level smoke (`scripts/smoke-test-predictor.js`): all 8 checks pass — counts, upserts, multi-row picks, idempotent re-submit, profile-scoped reads.

End-to-end via production `next start` on port 3200 (13 curl tests):

| # | Test | Expected | Got |
|---|---|---|---|
| 1 | GET winner anon | 200 `{pick:null}` | ✓ |
| 2 | GET winner with header auth | 200 | ✓ |
| 3 | POST winner no auth | 401 | ✓ |
| 4 | POST winner with auth | 200 + pick | ✓ |
| 5 | GET winner-picks pre-lock | 403 | ✓ |
| 6 | GET round group_r1 anon | 200 + 24 matches | ✓ |
| 7 | GET round bad code | 400 | ✓ |
| 8 | POST picks no auth | 401 | ✓ |
| 9 | POST picks (2 picks, 1 star) | 200 | ✓ |
| 10 | POST picks 2 stars | 400 `too_many_stars` | ✓ |
| 11 | POST picks 17 in group | 400 `group_round_max_16_picks` | ✓ |
| 12 | POST picks wrong-round match | 400 `match_not_in_round` | ✓ |
| 13 | POST picks SF draw no if-draw | 400 `if_draw_winner_required` | ✓ |

Build verified: `npx next build` ✓ (Next 16.2.4 Turbopack, all 4 predictor APIs + 3 pages registered in route table).

Hugh's test picks were cleaned up after each smoke run — DB is back to zero predictor rows.

## What's stubbed / deferred

### Auth session helper — **stubbed**
The companion auth subagent (`wc26-pass2-5-auth`) is mid-flight on branch `feat/pass2-5-auth-migration` and has `src/lib/auth-session-server.ts` (with `resolveSession()`). My branch is off `main` and cannot import that file directly.

`src/lib/predictor-session.ts` handles both paths:
1. **Preferred:** dynamic-imports `./auth-session-server` at runtime. When the auth branch merges, this picks up the real cookie-backed session automatically.
2. **Fallback:** reads `x-profile-id` header. **For smoke-testing only** — must be removed before public launch. Marked with a clear `TODO` comment.

The fallback also synthesizes `account_id = profile_id` since Phase 3 endpoints never read `account_id`. When the real helper lands, `account_id` will be authoritative.

### Goalscorer feature — **deferred to Phase 5**
- No `predictor_players` table created. (Note: `players` table exists in this DB but it's camp registrations from Sessions — orthogonal.)
- No `goalscorer_id` column on `predictor_picks`. SQL has an inline `TODO Phase 5` comment marking where to add it.
- No goalscorer dropdown in the round picks UI.

### Phase 4 / 5 / 6 — not built
- Scoring engine (compute exact/result/scorer/star pts on match-final). Phase 4.
- Realtime broadcasts. Phase 4.
- Leaderboard UI + cache refresh. Phase 4.
- Goalscorer autocomplete + bonus scoring. Phase 5.
- Email reminders, late-entry messaging, admin tools. Phase 6.

### Round pages for `group_r2`, `group_r3`, `r32`, etc.
- `/predictor/round/[round_code]` accepts all 8 round codes today but the landing page only links to `group_r1`. The other rounds can be browsed by typing the URL directly — useful for QA. Per spec, dedicated dashboard CTAs for those rounds open in Phase 4 once leaderboard exists.

## Open questions for Hugh (decide before launch)

1. **Anon prompt UX** — Phase 3 anon CTAs currently do `alert() + redirect('/bracket')` because the proper `AuthModal` lives on the auth-migration branch and isn't on main yet. After the auth branch merges, swap to the modal directly (no redirect needed). **No question for Hugh — just flagging the swap.**

2. **`if_draw_winner` in API for non-knockout** — spec says the field is knockout-only. My picks endpoint currently *accepts* `if_draw_winner` on a group-stage pick but ignores it semantically (no enforcement). If Hugh wants a strict 400 for "if_draw_winner sent on group_rN match", say the word and I'll tighten.

3. **`predictor_winner_picks` lock enforcement on UPDATE** — endpoint blocks POST after lock, but doesn't enforce read-only via DB constraint. If Hugh wants belt-and-suspenders, add a CHECK constraint at the SQL level. For now, app-layer-only.

4. **48-team list source** — currently derived at request-time from group-stage `predictor_matches` rows. Cheap (no extra table needed for Phase 3). If the rosters page lands first (Teams tab), we might want to source from there instead. Non-blocking.

## How to verify

```bash
cd ~/.openclaw/workspace/total90-wc26
git checkout feat/predictor-phase-3
node scripts/smoke-test-predictor.js     # 8 DB checks
npx next build                            # production build check
npx next start -p 3200                    # then run the curl block from this doc
```

## File inventory

**Created (10 files):**
```
supabase/migrations/2026-05-19-predictor-phase-3.sql
scripts/seed-predictor-matches.js
scripts/smoke-test-predictor.js
src/lib/predictor-db.ts
src/lib/predictor-flags.ts
src/lib/predictor-session.ts
src/app/api/predictor/winner/route.ts
src/app/api/predictor/winner-picks/route.ts
src/app/api/predictor/picks/route.ts
src/app/api/predictor/round/[round_code]/route.ts
src/app/predictor/page.tsx
src/app/predictor/winner/page.tsx
src/app/predictor/round/[round_code]/page.tsx
```

(13 files — recount.)

**Modified (2 files):**
```
src/app/page.tsx        (+12 lines: Score Predictor hub tile)
src/app/layout.tsx      (+1 line:  Predictor nav link)
```

**Commits:** 2 on `feat/predictor-phase-3` (data layer + UI layer).
