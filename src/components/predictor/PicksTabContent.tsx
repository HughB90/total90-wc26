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

interface RoundPick {
  match_id: string
  home_team: string
  away_team: string
  home_score: number
  away_score: number
  is_star: boolean
  if_draw_winner: string | null
  goalscorer_name: string | null
  goalscorer_team: string | null
}

interface RoundSummary {
  code: string
  label: string
  picks: RoundPick[]
  matchCount: number
}

export default function PicksTabContent({ authed }: { authed: boolean }) {
  const [rounds, setRounds] = useState<RoundSummary[] | null>(null)
  const [winnerPick, setWinnerPick] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const results = await Promise.all(PREDICTOR_ROUND_OPTIONS.map(async (rm) => {
        try {
          const r = await fetch(`/api/predictor/round/${rm.code}`, {
            credentials: 'include',
            cache: 'no-store',
          })
          if (!r.ok) {
            return { code: rm.code, label: rm.label, picks: [], matchCount: 0 }
          }
          const j = await r.json()
          const matches = (j.matches ?? []) as { id: string; home_team_code: string; away_team_code: string }[]
          const matchMap = new Map<string, { home: string; away: string }>()
          for (const m of matches) matchMap.set(m.id, { home: m.home_team_code, away: m.away_team_code })

          const myPicks = (j.my_picks ?? []) as {
            match_id: string
            home_score: number
            away_score: number
            is_star: boolean
            if_draw_winner?: string | null
            goalscorer_team_code?: string | null
            goalscorer_player?: { short_name?: string | null; name?: string | null; last_name?: string | null } | null
          }[]

          const picks: RoundPick[] = myPicks.map((p) => {
            const mm = matchMap.get(p.match_id)
            const gp = p.goalscorer_player
            const goalscorerName = gp?.short_name || gp?.name || gp?.last_name || null
            return {
              match_id: p.match_id,
              home_team: mm?.home ?? '?',
              away_team: mm?.away ?? '?',
              home_score: p.home_score,
              away_score: p.away_score,
              is_star: Boolean(p.is_star),
              if_draw_winner: p.if_draw_winner ?? null,
              goalscorer_name: goalscorerName,
              goalscorer_team: p.goalscorer_team_code ?? null,
            }
          })

          return { code: rm.code, label: rm.label, picks, matchCount: matches.length }
        } catch {
          return { code: rm.code, label: rm.label, picks: [], matchCount: 0 }
        }
      }))
      if (!cancelled) setRounds(results)
    })()

    if (authed) {
      ;(async () => {
        try {
          const r = await fetch('/api/predictor/winner', { credentials: 'include', cache: 'no-store' })
          const j = await r.json().catch(() => null)
          if (!cancelled) setWinnerPick(j?.pick?.team_code ?? null)
        } catch { /* */ }
      })()
    } else {
      setWinnerPick(null)
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
        {!authed ? (
          <p style={{ color: C.muted, fontSize: '0.82rem', margin: 0, lineHeight: 1.5 }}>
            Sign in to pick your champion. Worth 40 pts.
          </p>
        ) : winnerPick ? (
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
        ) : (
          <p style={{ color: C.muted, fontSize: '0.82rem', margin: 0 }}>No pick yet.</p>
        )}
      </Pill>

      {/* 8 Round pills */}
      {(rounds ?? PREDICTOR_ROUND_OPTIONS.map((rm) => ({ code: rm.code, label: rm.label, picks: [], matchCount: 0 }))).map((r) => (
        <Pill
          key={r.code}
          title={r.label}
          editHref={`/predictor/round/${r.code}`}
          rightExtra={
            <span style={{ color: C.muted, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
              {r.picks.length} pick{r.picks.length === 1 ? '' : 's'}
            </span>
          }
        >
          {!authed ? (
            <p style={{ color: C.muted, fontSize: '0.82rem', margin: 0, lineHeight: 1.5 }}>
              Sign in to make picks.
            </p>
          ) : !rounds ? (
            <p style={{ color: C.muted, fontSize: '0.78rem', margin: 0 }}>Loading…</p>
          ) : r.picks.length === 0 ? (
            <p style={{ color: C.muted, fontSize: '0.78rem', margin: 0 }}>No picks yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.3rem', minWidth: 0 }}>
              {r.picks.map((p) => (
                <PickRow key={p.match_id} pick={p} showGoalscorer={GOALSCORER_ROUND_CODES.has(r.code)} />
              ))}
            </div>
          )}
        </Pill>
      ))}
    </div>
  )
}

function PickRow({ pick, showGoalscorer }: { pick: RoundPick; showGoalscorer: boolean }) {
  return (
    <div style={{
      padding: '0.4rem 0.5rem',
      backgroundColor: 'rgba(255,255,255,0.02)',
      borderRadius: '0.35rem',
      minWidth: 0,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr auto',
        alignItems: 'center',
        gap: '0.4rem',
        minWidth: 0,
      }}>
        <span style={{
          color: C.text,
          fontSize: '0.8rem',
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}>{pick.home_team}</span>
        <strong style={{
          color: C.gold,
          fontSize: '0.85rem',
          whiteSpace: 'nowrap',
          padding: '0 0.2rem',
        }}>{pick.home_score} – {pick.away_score}</strong>
        <span style={{
          color: C.text,
          fontSize: '0.8rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}>{pick.away_team}</span>
        <span style={{
          color: C.gold,
          fontSize: '0.95rem',
          width: 14,
          textAlign: 'center',
          flexShrink: 0,
        }}>{pick.is_star ? '★' : ''}</span>
      </div>
      {pick.if_draw_winner && (
        <div style={{
          marginTop: '0.2rem',
          color: C.muted,
          fontSize: '0.7rem',
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>→ {pick.if_draw_winner} adv on PKs</div>
      )}
      {showGoalscorer && pick.goalscorer_name && (
        <div style={{
          marginTop: '0.2rem',
          color: C.muted,
          fontSize: '0.72rem',
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>⚽ {pick.goalscorer_name}{pick.goalscorer_team ? ` (${pick.goalscorer_team})` : ''}</div>
      )}
    </div>
  )
}

function Pill({
  title,
  editHref,
  rightExtra,
  children,
}: {
  title: string
  editHref: string
  rightExtra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{
      backgroundColor: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: '0.7rem',
      padding: '0.85rem 1rem',
      minWidth: 0,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem',
        marginBottom: '0.5rem',
        minWidth: 0,
      }}>
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
          flex: 1,
        }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {rightExtra}
          <Link href={editHref} style={editBtnStyle}>
            <span aria-hidden="true">✏️</span>
            <span>Edit</span>
          </Link>
        </div>
      </div>
      {children}
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
