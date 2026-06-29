'use client'

/**
 * /predictor/knockout
 *
 * One screen, all 5 knockout rounds (R32 → R16 → QF → SF → Final + 3rd Place)
 * laid out as a horizontal scroll-snap carousel.
 *
 * - Round tabs at top jump between rounds; users can also swipe horizontally
 *   on mobile / drag-scroll on desktop.
 * - Cascade: a user's R32 winner pick immediately projects into the R16 entrant
 *   slot ("Winner M73" → "Brazil"). Same cascade flows all the way to the Final.
 * - Per-round auto-save: each round saves independently to /api/predictor/picks
 *   (debounced ~700ms after the last edit). Server-side picks endpoint is
 *   unchanged — saves still keyed by match_id, server has no awareness of
 *   the client-side cascade projection.
 * - Downstream-clear: changing the projected winner of MNN clears any
 *   already-saved pick whose matchup referenced MNN as a parent. The whole
 *   downstream subtree clears recursively.
 * - The existing per-round pages at /predictor/round/[round_code] remain
 *   functional as a fallback and own the Anytime Goalscorer UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import AuthHeader from '@/components/AuthHeader'
import KnockoutRoundPanel from '@/components/predictor/KnockoutRoundPanel'
import type { PickState } from '@/components/predictor/KnockoutRoundPanel'
import type { CascadeMatch, CascadePick } from '@/lib/predictor/cascade'
import { buildCascade, findDownstreamSubtree } from '@/lib/predictor/cascade'

const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  borderSoft: '#162040',
  gold: '#FBBF24',
  green: '#00E676',
  muted: '#8899CC',
  text: '#F0F4FF',
  red: '#F87171',
}

const ROUNDS: { code: string; short: string; label: string }[] = [
  { code: 'r32', short: 'R32', label: 'Round 4 — Round of 32' },
  { code: 'r16', short: 'R16', label: 'Round 5 — Round of 16' },
  { code: 'qf', short: 'QF', label: 'Round 6 — Quarterfinals' },
  { code: 'sf', short: 'SF', label: 'Round 7 — Semifinals' },
  { code: 'final', short: 'Final', label: 'Round 8 — Final & 3rd Place' },
]
const STAR_ROUNDS = new Set(['r32'])
const GOALSCORER_ROUNDS = new Set(['r16', 'qf', 'sf', 'final'])
const ROUND_EXPECTED: Record<string, number> = {
  r32: 16, r16: 8, qf: 4, sf: 2, final: 2,
}

interface ScoreBreakdown {
  exact_pts: number
  result_pts: number
  scorer_pts: number
  star_multiplier: number
  total_pts: number
  outcome_color: 'teal' | 'green' | 'red' | 'gray'
}

interface RoundData {
  matches: CascadeMatch[]
  picks: Record<string, PickState>
  persistedIds: Set<string>
  scores: Record<string, ScoreBreakdown>
  lockAt: string | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function KnockoutCarouselPage() {
  // Per-round data, keyed by round_code.
  const [data, setData] = useState<Record<string, RoundData>>({})
  const [now, setNow] = useState(() => new Date())
  const [activeRound, setActiveRound] = useState<string>('r32')
  const [clearing, setClearing] = useState<Set<string>>(new Set())
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({})
  const [saveErr, setSaveErr] = useState<Record<string, string | null>>({})

  // Debounce timer per round (so the auto-save fires once after the user
  // stops typing in a given round).
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({})

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Tick `now` for kickoff-lock recomputation.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Initial load — fetch all 5 rounds in parallel.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const results = await Promise.all(ROUNDS.map(async (r) => {
        try {
          const res = await fetch(`/api/predictor/round/${r.code}`, { credentials: 'include' })
          if (!res.ok) return [r.code, null] as const
          const j = await res.json()
          return [r.code, j] as const
        } catch {
          return [r.code, null] as const
        }
      }))
      if (cancelled) return
      const next: Record<string, RoundData> = {}
      for (const [code, j] of results) {
        if (!j) continue
        const initialPicks: Record<string, PickState> = {}
        for (const p of (j.my_picks ?? [])) {
          initialPicks[p.match_id] = {
            home: String(p.home_score),
            away: String(p.away_score),
            is_star: Boolean(p.is_star),
            if_draw_winner: p.if_draw_winner ?? null,
            dirty: false,
          }
        }
        next[code] = {
          matches: (j.matches ?? []) as CascadeMatch[],
          picks: initialPicks,
          persistedIds: new Set((j.my_picks ?? []).map((p: { match_id: string }) => p.match_id)),
          scores: (j.my_scores ?? {}) as Record<string, ScoreBreakdown>,
          lockAt: j.lock_at ?? null,
        }
      }
      setData(next)
    })()
    return () => { cancelled = true }
  }, [])

  // ALL knockout matches across all rounds, used as the cascade input.
  const allMatches = useMemo(() => {
    const out: CascadeMatch[] = []
    for (const r of ROUNDS) {
      const rd = data[r.code]
      if (rd) out.push(...rd.matches)
    }
    return out
  }, [data])

  // Map of all picks across all rounds keyed by match_id — cascade input.
  const allPicksByMatchId = useMemo(() => {
    const out = new Map<string, CascadePick>()
    for (const r of ROUNDS) {
      const rd = data[r.code]
      if (!rd) continue
      for (const [matchId, ps] of Object.entries(rd.picks)) {
        const h = parseInt(ps.home, 10)
        const a = parseInt(ps.away, 10)
        if (!Number.isFinite(h) || !Number.isFinite(a)) continue
        out.set(matchId, {
          match_id: matchId,
          home_score: h,
          away_score: a,
          if_draw_winner: ps.if_draw_winner,
        })
      }
    }
    return out
  }, [data])

  // Cascade: match_num → projected { winner, loser } across the whole bracket.
  const cascade = useMemo(
    () => buildCascade(allMatches, allPicksByMatchId),
    [allMatches, allPicksByMatchId],
  )

  // Per-match kickoff lock map across all rounds.
  const matchLockedById = useMemo(() => {
    const map: Record<string, boolean> = {}
    const nowMs = now.getTime()
    for (const m of allMatches) {
      map[m.id] = new Date(m.kickoff_at).getTime() <= nowMs
    }
    return map
  }, [allMatches, now])

  // -------- Save logic ---------------------------------------------------

  const flushSave = useCallback(async (roundCode: string) => {
    const rd = data[roundCode]
    if (!rd) return
    const dirty = Object.entries(rd.picks).filter(([, p]) => p.dirty)
    if (dirty.length === 0) return

    // Filter: server requires every match in `picks` to be unlocked. Don't
    // include any pick whose match has already kicked off.
    const submittable = dirty.filter(([matchId, p]) => {
      if (matchLockedById[matchId]) return false
      // Must have both scores set.
      if (p.home === '' || p.away === '') return false
      // Knockout draws require if_draw_winner.
      if (p.home === p.away && !p.if_draw_winner) return false
      return true
    })

    // Knockout server rule: union of persisted + this batch must cover all
    // matches in the round. Persisted set already covers everything the
    // user has on the server. New picks add to coverage. We only fail this
    // check on the FIRST round-fill (when the user hasn't yet covered all
    // matches) — auto-save defers in that case until they've completed the
    // round.
    if (submittable.length === 0) return
    const round = rd
    const totalCoverage = new Set<string>([
      ...Array.from(round.persistedIds),
      ...submittable.map(([id]) => id),
    ])
    const expected = ROUND_EXPECTED[roundCode] ?? 0
    if (totalCoverage.size !== expected) {
      // Not yet covering the round — wait until user finishes.
      return
    }

    setSaveState((s) => ({ ...s, [roundCode]: 'saving' }))
    setSaveErr((e) => ({ ...e, [roundCode]: null }))
    try {
      const payload = {
        round_code: roundCode,
        picks: submittable.map(([match_id, p]) => ({
          match_id,
          home_score: parseInt(p.home, 10),
          away_score: parseInt(p.away, 10),
          if_draw_winner: p.if_draw_winner,
          is_star: p.is_star,
        })),
      }
      const res = await fetch('/api/predictor/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const j = await res.json().catch(() => null)
      if (res.status === 401) {
        setSaveState((s) => ({ ...s, [roundCode]: 'error' }))
        setSaveErr((e) => ({ ...e, [roundCode]: 'Sign in to save picks.' }))
        return
      }
      if (!res.ok) {
        setSaveState((s) => ({ ...s, [roundCode]: 'error' }))
        setSaveErr((e) => ({ ...e, [roundCode]: j?.error || 'Save failed.' }))
        return
      }
      // Mark all dirty picks in this round as clean + add to persistedIds.
      setData((cur) => {
        const old = cur[roundCode]
        if (!old) return cur
        const nextPicks: Record<string, PickState> = {}
        for (const [k, v] of Object.entries(old.picks)) {
          nextPicks[k] = { ...v, dirty: false }
        }
        const nextPersisted = new Set(old.persistedIds)
        for (const [mid] of submittable) nextPersisted.add(mid)
        return {
          ...cur,
          [roundCode]: { ...old, picks: nextPicks, persistedIds: nextPersisted },
        }
      })
      setSaveState((s) => ({ ...s, [roundCode]: 'saved' }))
      // Fade the "Saved" pill after 1.5s.
      setTimeout(() => {
        setSaveState((s) => (s[roundCode] === 'saved' ? { ...s, [roundCode]: 'idle' } : s))
      }, 1500)
    } catch {
      setSaveState((s) => ({ ...s, [roundCode]: 'error' }))
      setSaveErr((e) => ({ ...e, [roundCode]: 'Network error.' }))
    }
  }, [data, matchLockedById])

  const scheduleSave = useCallback((roundCode: string) => {
    const timer = saveTimers.current[roundCode]
    if (timer) clearTimeout(timer)
    saveTimers.current[roundCode] = setTimeout(() => {
      saveTimers.current[roundCode] = null
      flushSave(roundCode)
    }, 700)
  }, [flushSave])

  // -------- Edit handlers -----------------------------------------------

  const onChangeMatchPick = useCallback((roundCode: string, matchId: string, patch: Partial<PickState>) => {
    setData((cur) => {
      const old = cur[roundCode]
      if (!old) return cur
      const prev = old.picks[matchId] || {
        home: '', away: '', is_star: false, if_draw_winner: null, dirty: false,
      }
      const nextPick: PickState = {
        ...prev,
        ...patch,
        dirty: true,
      }
      // If the user just changed home/away scores, the if_draw_winner may
      // need to clear (e.g. they went from 1-1 to 2-1).
      if ((patch.home !== undefined || patch.away !== undefined)) {
        if (nextPick.home !== '' && nextPick.away !== '' && nextPick.home !== nextPick.away) {
          nextPick.if_draw_winner = null
        }
      }

      // ---- Downstream cascade clear ----
      // If this match's projected WINNER changed compared to before, we
      // need to clear any downstream pick whose matchup referenced this
      // match's number — those picks were made against a stale projection.
      const match = old.matches.find((m) => m.id === matchId)
      const downstreamCleared: { round: string; matchId: string }[] = []
      if (match) {
        const prevWinner = projectWinnerForInline(match, prev)
        const nextWinner = projectWinnerForInline(match, nextPick)
        if (prevWinner && prevWinner !== nextWinner) {
          // Winner flipped (or cleared). Find downstream subtree using ALL
          // matches across the bracket.
          const allMatchesNow: CascadeMatch[] = []
          for (const rr of ROUNDS) {
            const rdr = cur[rr.code]
            if (rdr) allMatchesNow.push(...rdr.matches)
          }
          const downstream = findDownstreamSubtree(match.match_num, allMatchesNow)
          for (const downstreamId of downstream) {
            // Find which round it's in and queue clearing.
            for (const rr of ROUNDS) {
              const rdr = cur[rr.code]
              if (!rdr) continue
              if (rdr.picks[downstreamId]) {
                downstreamCleared.push({ round: rr.code, matchId: downstreamId })
              }
            }
          }
        }
      }

      // Apply primary pick change.
      const nextThisRound: RoundData = {
        ...old,
        picks: { ...old.picks, [matchId]: nextPick },
      }
      const next = { ...cur, [roundCode]: nextThisRound }

      // Apply downstream clears across all affected rounds.
      const groupedByRound = new Map<string, string[]>()
      for (const { round, matchId: mid } of downstreamCleared) {
        const arr = groupedByRound.get(round) ?? []
        arr.push(mid)
        groupedByRound.set(round, arr)
      }
      for (const [rc, midList] of groupedByRound.entries()) {
        const rd = next[rc]
        if (!rd) continue
        const newPicks = { ...rd.picks }
        for (const mid of midList) delete newPicks[mid]
        next[rc] = { ...rd, picks: newPicks }
      }

      // Schedule deletes for any persisted-cleared picks (after state commit).
      // We snapshot the persisted IDs that need DELETE so the effect runs
      // outside this updater.
      if (downstreamCleared.length > 0) {
        const persistedClears: { round: string; matchId: string }[] = []
        for (const { round, matchId: mid } of downstreamCleared) {
          if (cur[round]?.persistedIds.has(mid)) {
            persistedClears.push({ round, matchId: mid })
          }
        }
        // Defer to a microtask so React state is settled.
        if (persistedClears.length > 0) {
          queueMicrotask(() => {
            for (const { round, matchId: mid } of persistedClears) {
              deletePersistedPick(round, mid).then(() => {
                setData((c) => {
                  const r = c[round]
                  if (!r) return c
                  const np = new Set(r.persistedIds)
                  np.delete(mid)
                  return { ...c, [round]: { ...r, persistedIds: np } }
                })
              }).catch(() => {/* swallow — UI already cleared locally */})
            }
          })
        }
      }

      return next
    })
    scheduleSave(roundCode)
  }, [scheduleSave])

  const onClearMatchPick = useCallback(async (roundCode: string, matchId: string) => {
    if (clearing.has(matchId)) return
    const wasPersisted = data[roundCode]?.persistedIds.has(matchId)

    // Find downstream subtree BEFORE clearing — based on current cascade.
    const match = data[roundCode]?.matches.find((m) => m.id === matchId)
    const downstreamIds = match
      ? findDownstreamSubtree(match.match_num, allMatches)
      : new Set<string>()

    // Always clear UI first (optimistic).
    setData((cur) => {
      const next = { ...cur }
      const old = cur[roundCode]
      if (old) {
        const newPicks = { ...old.picks }
        delete newPicks[matchId]
        next[roundCode] = { ...old, picks: newPicks }
      }
      // Clear downstream in their respective rounds.
      for (const dId of downstreamIds) {
        for (const r of ROUNDS) {
          const rd = next[r.code]
          if (rd?.picks[dId]) {
            const newPicks = { ...rd.picks }
            delete newPicks[dId]
            next[r.code] = { ...rd, picks: newPicks }
          }
        }
      }
      return next
    })

    if (!wasPersisted) return
    setClearing((c) => new Set(c).add(matchId))
    try {
      await deletePersistedPick(roundCode, matchId)
      setData((c) => {
        const r = c[roundCode]
        if (!r) return c
        const np = new Set(r.persistedIds)
        np.delete(matchId)
        return { ...c, [roundCode]: { ...r, persistedIds: np } }
      })
      // Also DELETE downstream persisted picks (each in its own round).
      const persistedDownstream: { round: string; matchId: string }[] = []
      for (const dId of downstreamIds) {
        for (const r of ROUNDS) {
          if (data[r.code]?.persistedIds.has(dId)) {
            persistedDownstream.push({ round: r.code, matchId: dId })
          }
        }
      }
      await Promise.all(persistedDownstream.map(({ round, matchId: mid }) =>
        deletePersistedPick(round, mid).then(() => {
          setData((c) => {
            const r = c[round]
            if (!r) return c
            const np = new Set(r.persistedIds)
            np.delete(mid)
            return { ...c, [round]: { ...r, persistedIds: np } }
          })
        }).catch(() => {/* swallow */})
      ))
    } finally {
      setClearing((c) => {
        const n = new Set(c)
        n.delete(matchId)
        return n
      })
    }
  }, [clearing, data, allMatches])

  // -------- Carousel navigation -----------------------------------------

  const scrollToRound = useCallback((code: string) => {
    const el = panelRefs.current[code]
    const scroller = scrollerRef.current
    if (!el || !scroller) return
    scroller.scrollTo({ left: el.offsetLeft, behavior: 'smooth' })
    setActiveRound(code)
  }, [])

  // Observe which panel is centered as user swipes.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const onScroll = () => {
      const center = scroller.scrollLeft + scroller.clientWidth / 2
      let best: { code: string; dist: number } | null = null
      for (const r of ROUNDS) {
        const el = panelRefs.current[r.code]
        if (!el) continue
        const panelCenter = el.offsetLeft + el.clientWidth / 2
        const dist = Math.abs(panelCenter - center)
        if (best === null || dist < best.dist) best = { code: r.code, dist }
      }
      if (best && best.code !== activeRound) setActiveRound(best.code)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [activeRound, data])

  // -------- Per-round metrics -------------------------------------------

  function metricsForRound(roundCode: string) {
    const rd = data[roundCode]
    if (!rd) return { filled: 0, starCount: 0, drawNeedsWinner: false }
    const filled = Object.values(rd.picks).filter((p) => p.home !== '' && p.away !== '').length
    const starCount = Object.values(rd.picks).filter((p) => p.is_star && p.home !== '' && p.away !== '').length
    const drawNeedsWinner = Object.entries(rd.picks).some(([id, p]) => {
      if (matchLockedById[id]) return false
      return p.home !== '' && p.home === p.away && !p.if_draw_winner
    })
    return { filled, starCount, drawNeedsWinner }
  }

  return (
    <>
      <AuthHeader />
      <main style={{
        maxWidth: 900,
        margin: '0 auto',
        padding: '1rem 0 6rem',
        color: C.text,
      }}>
        {/* Header */}
        <div style={{ padding: '0 0.75rem', marginBottom: '0.85rem' }}>
          <div style={{
            display: 'flex',
            gap: '0.6rem',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.4rem',
            flexWrap: 'wrap',
          }}>
            <Link
              href="/predictor"
              style={{
                color: C.gold,
                textDecoration: 'none',
                fontSize: '0.78rem',
                fontWeight: 800,
              }}
            >← Back to Predictor</Link>
            <span style={{ color: C.muted, fontSize: '0.7rem' }}>
              Swipe → between rounds. Picks save automatically.
            </span>
          </div>
          <h1 style={{
            fontSize: 'clamp(1.4rem, 4vw, 1.7rem)',
            fontWeight: 900,
            color: C.gold,
            margin: 0,
          }}>Knockout Bracket</h1>
        </div>

        {/* Sticky round tabs */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backgroundColor: 'rgba(10,15,46,0.97)',
          backdropFilter: 'blur(4px)',
          borderBottom: `1px solid ${C.borderSoft}`,
          padding: '0.55rem 0.75rem 0.65rem',
          marginBottom: '0.85rem',
        }}>
          <div style={{
            display: 'flex',
            gap: '0.4rem',
            justifyContent: 'space-between',
            overflowX: 'auto',
          }}>
            {ROUNDS.map((r) => {
              const active = r.code === activeRound
              const mx = metricsForRound(r.code)
              const expected = ROUND_EXPECTED[r.code]
              const complete = mx.filled === expected
              const ss = saveState[r.code]
              return (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => scrollToRound(r.code)}
                  style={{
                    flex: '1 1 0',
                    minWidth: 64,
                    backgroundColor: active ? 'rgba(251,191,36,0.15)' : 'transparent',
                    border: `1px solid ${active ? C.gold : C.borderSoft}`,
                    borderRadius: '0.45rem',
                    padding: '0.4rem 0.4rem',
                    color: active ? C.gold : C.text,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.15rem',
                    fontWeight: 800,
                    fontSize: '0.78rem',
                  }}
                >
                  <span>{r.short}</span>
                  <span style={{
                    fontSize: '0.62rem',
                    color: complete ? C.green : C.muted,
                    fontWeight: 700,
                  }}>
                    {mx.filled}/{expected}
                    {ss === 'saving' && ' …'}
                    {ss === 'saved' && ' ✓'}
                    {ss === 'error' && ' !'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Horizontal scroll-snap carousel */}
        <style>{`
          .predictor-knockout-scroller::-webkit-scrollbar { display: none; }
        `}</style>
        <div
          ref={scrollerRef}
          className="predictor-knockout-scroller"
          style={{
            display: 'flex',
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            scrollBehavior: 'smooth',
            // Hide scrollbar (still scrolls, just no thumb).
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {ROUNDS.map((r) => {
            const rd = data[r.code]
            const mx = metricsForRound(r.code)
            const ss = saveState[r.code]
            const err = saveErr[r.code]
            return (
              <div
                key={r.code}
                ref={(el) => { panelRefs.current[r.code] = el }}
                style={{
                  flex: '0 0 100%',
                  width: '100%',
                  scrollSnapAlign: 'start',
                  padding: '0 0.75rem',
                  boxSizing: 'border-box',
                }}
              >
                <KnockoutRoundPanel
                  roundCode={r.code}
                  roundLabel={r.label}
                  matches={rd?.matches ?? []}
                  picks={rd?.picks ?? {}}
                  scores={rd?.scores ?? {}}
                  matchLockedById={matchLockedById}
                  cascade={cascade}
                  hasStars={STAR_ROUNDS.has(r.code)}
                  hasGoalscorer={GOALSCORER_ROUNDS.has(r.code)}
                  starCount={mx.starCount}
                  expectedPicks={ROUND_EXPECTED[r.code]}
                  filledCount={mx.filled}
                  drawNeedsWinner={mx.drawNeedsWinner}
                  onChange={(matchId, patch) => onChangeMatchPick(r.code, matchId, patch)}
                  onClear={(matchId) => onClearMatchPick(r.code, matchId)}
                  clearing={clearing}
                />
                {ss === 'error' && err && (
                  <div style={{
                    marginTop: '0.6rem',
                    color: C.red,
                    fontSize: '0.75rem',
                    textAlign: 'center',
                  }}>{err}</div>
                )}
                {ss === 'saved' && (
                  <div style={{
                    marginTop: '0.6rem',
                    color: C.green,
                    fontSize: '0.75rem',
                    textAlign: 'center',
                    fontWeight: 800,
                  }}>✓ Saved</div>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </>
  )
}

// -------- helpers --------------------------------------------------------

async function deletePersistedPick(roundCode: string, matchId: string): Promise<void> {
  const res = await fetch('/api/predictor/picks', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ round_code: roundCode, match_ids: [matchId] }),
  })
  if (!res.ok) {
    // Best-effort: if the match was locked at kickoff, the user can't drop
    // it anyway. Log silently.
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('deletePersistedPick failed', { roundCode, matchId, status: res.status })
    }
    throw new Error('delete_failed')
  }
}

function projectWinnerForInline(match: CascadeMatch, pick: PickState): string | null {
  const h = parseInt(pick.home, 10)
  const a = parseInt(pick.away, 10)
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null
  if (h > a) return match.home_team_code
  if (a > h) return match.away_team_code
  return pick.if_draw_winner
}
