/**
 * <PicksTabContent /> — Picks tab on `/predictor`.
 *
 * Top to bottom:
 *   1. Tournament Winner pill (flag + team name, Edit → /predictor/winner)
 *   2..9. One pill per round R1..R8 (read-only summary, Edit → /predictor/round/{code})
 *
 * No inline editing. Edit buttons navigate to the existing round/winner pages.
 * Empty rounds still render a pill so users know all 8 rounds exist.
 */

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { flagUrl } from '@/lib/predictor-flags'
import { PREDICTOR_ROUND_OPTIONS } from '@/lib/select-style'
import { PickSummaryRow, type PickSummaryData, type PickSummaryScore } from './PickSummaryRow'

const C = {
  card: '#0F1C4D',
  border: '#1E3A6E',
  borderSoft: '#162040',
  gold: '#FBBF24',
  green: '#00E676',
  muted: '#8899CC',
  text: '#F0F4FF',
}

const GOALSCORER_ROUND_CODES = new Set(['r16', 'qf', 'sf', 'final'])

interface RoundSummary {
  code: string
  label: string
  picks: PickSummaryData[]
  matchCount: number
  /** Sum of all post-match points earned in this round. */
  round_pts: number
  /** Number of matches finalized in this round. Drives 'X of Y final' UI. */
  finalized_count: number
}

// sessionStorage cache keys. Bumped if the response shape changes.
// v2: shape changed to include post-match result fields + per-pick scores.
const CACHE_VERSION = 'v2'
const ROUNDS_CACHE_KEY = `predictor.picks.rounds.${CACHE_VERSION}`
const WINNER_CACHE_KEY = `predictor.picks.winner.${CACHE_VERSION}`

function readCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeCache(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / private-mode — silent */
  }
}

export default function PicksTabContent({ authed }: { authed: boolean }) {
  // Hydrate from sessionStorage so flipping to the Picks tab a second time
  // renders instantly; we still re-fetch in the background to refresh data.
  const [rounds, setRounds] = useState<RoundSummary[] | null>(() => readCache<RoundSummary[]>(ROUNDS_CACHE_KEY))
  const [winnerPick, setWinnerPick] = useState<string | null>(() => readCache<string | null>(WINNER_CACHE_KEY))

  useEffect(() => {
    let cancelled = false

    // Helper: fetch with an AbortController + hard timeout so a hung route
    // can never freeze the Picks tab on "Loading…" forever.
    async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), ms)
      try {
        return await fetch(url, { credentials: 'include', cache: 'no-store', signal: ac.signal })
      } finally {
        clearTimeout(t)
      }
    }

    ;(async () => {
      const results = await Promise.all(PREDICTOR_ROUND_OPTIONS.map(async (rm) => {
        try {
          const r = await fetchWithTimeout(`/api/predictor/round/${rm.code}`)
          if (!r.ok) {
            return { code: rm.code, label: rm.label, picks: [], matchCount: 0, round_pts: 0, finalized_count: 0 }
          }
          const j = await r.json()
          const matches = (j.matches ?? []) as {
            id: string
            home_team_code: string
            away_team_code: string
            home_score: number | null
            away_score: number | null
            went_to_pks: boolean | null
            pk_winner_team_code: string | null
          }[]
          const matchMap = new Map<string, typeof matches[number]>()
          for (const m of matches) matchMap.set(m.id, m)
          const myScores = (j.my_scores ?? {}) as Record<string, PickSummaryScore>

          const myPicks = (j.my_picks ?? []) as {
            match_id: string
            home_score: number
            away_score: number
            is_star: boolean
            if_draw_winner?: string | null
            goalscorer_team_code?: string | null
            goalscorer_player?: { short_name?: string | null; name?: string | null; last_name?: string | null } | null
          }[]

          const picks: PickSummaryData[] = myPicks.map((p) => {
            const mm = matchMap.get(p.match_id)
            const gp = p.goalscorer_player
            const goalscorerName = gp?.short_name || gp?.name || gp?.last_name || null
            return {
              match_id: p.match_id,
              home_team: mm?.home_team_code ?? '?',
              away_team: mm?.away_team_code ?? '?',
              pick_home: p.home_score,
              pick_away: p.away_score,
              is_star: Boolean(p.is_star),
              if_draw_winner: p.if_draw_winner ?? null,
              goalscorer_name: goalscorerName,
              goalscorer_team: p.goalscorer_team_code ?? null,
              actual_home: mm?.home_score ?? null,
              actual_away: mm?.away_score ?? null,
              went_to_pks: Boolean(mm?.went_to_pks),
              pk_winner_team_code: mm?.pk_winner_team_code ?? null,
              score: myScores[p.match_id] ?? null,
            }
          })

          const round_pts = picks.reduce((acc, p) => acc + (p.score?.total_pts ?? 0), 0)
          const finalized_count = matches.filter((m) => m.home_score !== null && m.away_score !== null).length

          return { code: rm.code, label: rm.label, picks, matchCount: matches.length, round_pts, finalized_count }
        } catch {
          return { code: rm.code, label: rm.label, picks: [], matchCount: 0, round_pts: 0, finalized_count: 0 }
        }
      }))
      if (!cancelled) {
        setRounds(results)
        writeCache(ROUNDS_CACHE_KEY, results)
      }
    })()

    if (authed) {
      ;(async () => {
        try {
          const r = await fetchWithTimeout('/api/predictor/winner')
          const j = await r.json().catch(() => null)
          const code = j?.pick?.team_code ?? null
          if (!cancelled) {
            setWinnerPick(code)
            writeCache(WINNER_CACHE_KEY, code)
          }
        } catch { /* timeout or network — leave as null */ }
      })()
    } else {
      setWinnerPick(null)
      writeCache(WINNER_CACHE_KEY, null)
    }

    return () => { cancelled = true }
  }, [authed])

  return (
    <div style={{ display: 'grid', gap: '0.85rem', minWidth: 0 }}>
      {/* Tournament Winner pill */}
      <Pill
        title="Tournament Winner"
        editHref="/predictor/winner"
      >
        {winnerPick ? (
          // Trust the API: if it returned a pick, render it regardless of the
          // parent's `authed` prop (which can lag the actual session cookie).
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
            <img
              src={flagUrl(winnerPick)}
              alt=""
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              style={{ width: 22, height: 14, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
            />
            <strong style={{
              color: C.text,
              fontSize: '0.95rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}>{winnerPick}</strong>
          </div>
        ) : !authed ? (
          <p style={{ color: C.muted, fontSize: '0.82rem', margin: 0, lineHeight: 1.5 }}>
            Sign in to pick your champion. Worth 40 pts.
          </p>
        ) : (
          <p style={{ color: C.muted, fontSize: '0.82rem', margin: 0 }}>No pick yet.</p>
        )}
      </Pill>

      {/* 8 Round pills — finalized rounds collapsed by default, click to expand */}
      {(rounds ?? PREDICTOR_ROUND_OPTIONS.map((rm) => ({ code: rm.code, label: rm.label, picks: [], matchCount: 0, round_pts: 0, finalized_count: 0 }))).map((r) => {
        const isFinalized = r.matchCount > 0 && r.finalized_count === r.matchCount
        return (
          <Pill
            key={r.code}
            title={r.label}
            editHref={`/predictor/round/${r.code}`}
            defaultCollapsed={isFinalized}
            rightExtra={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                {r.finalized_count > 0 && (
                  <span style={{
                    color: C.green,
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}>{r.round_pts > 0 ? `+${r.round_pts}` : r.round_pts} pts</span>
                )}
                <span style={{ color: C.muted, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                  {r.picks.length} pick{r.picks.length === 1 ? '' : 's'}
                </span>
              </span>
            }
          >
            {r.picks.length > 0 ? (
              // Trust the API: render picks whenever they're present, regardless
              // of the parent's `authed` prop. The parent can lag the cookie.
              <div style={{ display: 'grid', gap: '0.4rem', minWidth: 0 }}>
                {r.picks.map((p) => (
                  <PickSummaryRow key={p.match_id} pick={p} showGoalscorer={GOALSCORER_ROUND_CODES.has(r.code)} />
                ))}
              </div>
            ) : !authed ? (
              <p style={{ color: C.muted, fontSize: '0.82rem', margin: 0, lineHeight: 1.5 }}>
                Sign in to make picks.
              </p>
            ) : !rounds ? (
              <p style={{ color: C.muted, fontSize: '0.78rem', margin: 0 }}>Loading…</p>
            ) : (
              <p style={{ color: C.muted, fontSize: '0.78rem', margin: 0 }}>No picks yet.</p>
            )}
          </Pill>
        )
      })}
    </div>
  )
}

function Pill({
  title,
  editHref,
  rightExtra,
  children,
  defaultCollapsed = false,
}: {
  title: string
  editHref: string
  rightExtra?: React.ReactNode
  children: React.ReactNode
  defaultCollapsed?: boolean
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  // Re-sync if the parent's default flips (e.g. cache hydrates, round just
  // finalized) and the user hasn't manually toggled yet — light-touch UX.
  // We track whether the user manually toggled to avoid stomping their choice.
  const [userToggled, setUserToggled] = useState(false)
  useEffect(() => {
    if (!userToggled) setCollapsed(defaultCollapsed)
  }, [defaultCollapsed, userToggled])

  const toggle = () => {
    setUserToggled(true)
    setCollapsed((v) => !v)
  }

  return (
    <div style={{
      backgroundColor: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: '0.7rem',
      padding: '0.85rem 1rem',
      minWidth: 0,
      overflow: 'hidden',
    }}>
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          marginBottom: collapsed ? 0 : '0.5rem',
          minWidth: 0,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, flex: 1 }}>
          <span aria-hidden="true" style={{
            display: 'inline-block',
            color: C.muted,
            fontSize: '0.7rem',
            width: '0.7rem',
            textAlign: 'center',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
            lineHeight: 1,
          }}>▾</span>
          <span style={{
            color: C.gold,
            fontSize: '0.72rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}>{title}</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {rightExtra}
          <Link
            href={editHref}
            style={editBtnStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <span aria-hidden="true">✏️</span>
            <span>Edit</span>
          </Link>
        </div>
      </div>
      {!collapsed && children}
    </div>
  )
}

const editBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  background: 'rgba(251,191,36,0.08)',
  color: C.gold,
  border: '1px solid rgba(251,191,36,0.3)',
  borderRadius: '0.4rem',
  padding: '0.25rem 0.55rem',
  fontSize: '0.7rem',
  fontWeight: 800,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
  lineHeight: 1.2,
}
