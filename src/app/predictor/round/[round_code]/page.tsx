'use client'

/**
 * /predictor/round/[round_code]
 *
 * Phase 3 ships the full UI but the in-spec flow only exercises
 * round_code = 'group_r1' (Round 1). All 8 round codes are accepted by the
 * route so internal QA can preview other rounds; the actual gameplay flow
 * (counter cap, knockout if-draw picker) follows the spec.
 */

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { flagUrl } from '@/lib/predictor-flags'

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

const GROUP_ROUNDS = new Set(['group_r1', 'group_r2', 'group_r3'])
const ROUND_LABEL: Record<string, string> = {
  group_r1: 'Round 1 — Group Stage 1',
  group_r2: 'Round 2 — Group Stage 2',
  group_r3: 'Round 3 — Group Stage 3',
  r32: 'Round 4 — Round of 32',
  r16: 'Round 5 — Round of 16',
  qf: 'Round 6 — Quarterfinals',
  sf: 'Round 7 — Semifinals',
  final: 'Round 8 — Final & 3rd Place',
}
const ROUND_EXPECTED: Record<string, number> = {
  group_r1: 24, group_r2: 24, group_r3: 24,
  r32: 16, r16: 8, qf: 4, sf: 2, final: 2,
}

interface PredictorMatch {
  id: string
  match_num: number
  round_code: string
  group_code: string | null
  home_team_code: string
  away_team_code: string
  kickoff_at: string
  venue: string | null
  status: string
  is_knockout: boolean
}

interface PickState {
  home: string  // string so empty input is valid
  away: string
  is_star: boolean
  if_draw_winner: string | null
  dirty: boolean
}

export default function RoundPicksPage({
  params,
}: {
  params: Promise<{ round_code: string }>
}) {
  const { round_code } = use(params)

  const isKnockout = !GROUP_ROUNDS.has(round_code)
  const label = ROUND_LABEL[round_code] || round_code

  const [matches, setMatches] = useState<PredictorMatch[]>([])
  const [picks, setPicks] = useState<Record<string, PickState>>({})
  const [lockAt, setLockAt] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/predictor/round/${round_code}`, { credentials: 'include' })
        if (!r.ok) return
        const j = await r.json()
        if (cancelled) return
        setMatches(j.matches || [])
        setLockAt(j.lock_at || null)
        setLocked(Boolean(j.locked))
        const initial: Record<string, PickState> = {}
        for (const p of j.my_picks || []) {
          initial[p.match_id] = {
            home: String(p.home_score),
            away: String(p.away_score),
            is_star: Boolean(p.is_star),
            if_draw_winner: p.if_draw_winner ?? null,
            dirty: false,
          }
        }
        setPicks(initial)
      } catch { /* */ }
    })()
    return () => { cancelled = true }
  }, [round_code])

  const lockMs = lockAt ? new Date(lockAt).getTime() : null
  const countdown = useMemo(
    () => lockMs ? formatCountdown(lockMs - now.getTime()) : '',
    [lockMs, now]
  )

  const filledPicks = useMemo(
    () => Object.entries(picks).filter(([, p]) => p.home !== '' && p.away !== ''),
    [picks]
  )
  const starCount = filledPicks.filter(([, p]) => p.is_star).length

  // Validations
  const capForGroup = 16
  const expected = ROUND_EXPECTED[round_code] ?? 0
  const tooManyGroup = !isKnockout && filledPicks.length > capForGroup
  const tooManyStars = starCount > 1
  const knockoutShort = isKnockout && filledPicks.length !== expected
  const drawNeedsWinner = isKnockout && filledPicks.some(([, p]) =>
    p.home === p.away && !p.if_draw_winner
  )

  const canSubmit = !locked && filledPicks.length > 0 && !tooManyGroup && !tooManyStars && !knockoutShort && !drawNeedsWinner

  function setPick(matchId: string, patch: Partial<PickState>) {
    setPicks((cur) => ({
      ...cur,
      [matchId]: {
        home: cur[matchId]?.home ?? '',
        away: cur[matchId]?.away ?? '',
        is_star: cur[matchId]?.is_star ?? false,
        if_draw_winner: cur[matchId]?.if_draw_winner ?? null,
        ...patch,
        dirty: true,
      },
    }))
  }

  async function submit() {
    if (!canSubmit || busy) return
    setBusy(true); setMsg(null)
    try {
      const payload = {
        round_code,
        picks: filledPicks.map(([match_id, p]) => ({
          match_id,
          home_score: parseInt(p.home, 10),
          away_score: parseInt(p.away, 10),
          if_draw_winner: p.if_draw_winner,
          is_star: p.is_star,
        })),
      }
      const r = await fetch('/api/predictor/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const j = await r.json().catch(() => null)
      if (r.status === 401) {
        setMsg({ kind: 'err', text: 'Sign in to save your picks.' })
      } else if (r.status === 403) {
        setMsg({ kind: 'err', text: 'This round is locked.' })
        setLocked(true)
      } else if (!r.ok) {
        setMsg({ kind: 'err', text: j?.error || 'Save failed.' })
      } else {
        // mark all as not-dirty
        setPicks((cur) => Object.fromEntries(Object.entries(cur).map(
          ([k, v]) => [k, { ...v, dirty: false }]
        )))
        setMsg({ kind: 'ok', text: `Saved ${j.saved_count} pick${j.saved_count === 1 ? '' : 's'}.` })
      }
    } catch {
      setMsg({ kind: 'err', text: 'Network error.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '1.5rem 1rem 7rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/predictor" style={{ color: C.muted, fontSize: '0.8rem', textDecoration: 'none' }}>← Back to Predictor</Link>
        <h1 style={{
          fontSize: 'clamp(1.5rem, 4vw, 1.9rem)',
          fontWeight: 900,
          color: C.gold,
          margin: '0.5rem 0 0.3rem',
        }}>{label}</h1>
        <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0 }}>
          {isKnockout
            ? `Pick every match (${expected} total). 1 star allowed.`
            : `Pick up to 16 of 24 matches. 1 star allowed.`}
        </p>
      </div>

      {/* Sticky counters + lock */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        marginBottom: '1rem',
        padding: '0.6rem 0.9rem',
        borderRadius: '0.6rem',
        backgroundColor: locked ? 'rgba(136,153,204,0.08)' : 'rgba(251,191,36,0.08)',
        border: `1px solid ${locked ? '#2a3550' : 'rgba(251,191,36,0.3)'}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
        fontSize: '0.78rem',
        fontWeight: 700,
      }}>
        <span style={{ color: C.text }}>
          Picks: <span style={{ color: tooManyGroup ? C.red : C.green }}>{filledPicks.length}{!isKnockout ? `/${capForGroup}` : `/${expected}`}</span>
          {' · '}
          Stars: <span style={{ color: tooManyStars ? C.red : C.green }}>{starCount}/1</span>
        </span>
        <span style={{ color: locked ? C.muted : C.gold }}>
          {locked ? 'Round locked' : `Locks in ${countdown}`}
        </span>
      </div>

      {/* Matches */}
      {matches.length === 0 && (
        <div style={{ color: C.muted, textAlign: 'center', padding: '2rem 0' }}>Loading matches…</div>
      )}
      <div style={{ display: 'grid', gap: '0.6rem' }}>
        {matches.map((mt) => {
          const pick = picks[mt.id] || { home: '', away: '', is_star: false, if_draw_winner: null, dirty: false }
          const isDraw = pick.home !== '' && pick.home === pick.away
          const drawNeedsPick = isKnockout && isDraw && !pick.if_draw_winner
          return (
            <MatchCard
              key={mt.id}
              match={mt}
              pick={pick}
              isKnockout={isKnockout}
              locked={locked}
              drawNeedsPick={drawNeedsPick}
              onChange={(patch) => setPick(mt.id, patch)}
            />
          )
        })}
      </div>

      {/* Sticky submit */}
      {!locked && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'rgba(10,15,46,0.97)',
          borderTop: `1px solid ${C.border}`,
          padding: '0.9rem 1rem 1.1rem',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <span style={{ color: C.muted, fontSize: '0.78rem' }}>
            {tooManyGroup && <span style={{ color: C.red }}>{filledPicks.length}/16 — drop {filledPicks.length - 16}</span>}
            {tooManyStars && <span style={{ color: C.red }}> · Too many stars</span>}
            {knockoutShort && <span style={{ color: C.red }}>Pick all {expected} matches</span>}
            {drawNeedsWinner && <span style={{ color: C.red }}>Choose draw advancer</span>}
            {canSubmit && <span>Ready to submit {filledPicks.length} pick{filledPicks.length === 1 ? '' : 's'}</span>}
            {!canSubmit && filledPicks.length === 0 && <span>No picks yet</span>}
          </span>
          <button
            onClick={submit}
            disabled={!canSubmit || busy}
            style={{
              backgroundColor: canSubmit && !busy ? C.green : '#2a3550',
              color: canSubmit && !busy ? '#0A0F2E' : C.muted,
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.6rem 1.2rem',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: canSubmit && !busy ? 'pointer' : 'default',
            }}
          >
            {busy ? 'Saving…' : 'Submit Round'}
          </button>
        </div>
      )}

      {msg && (
        <div style={{
          position: 'fixed',
          bottom: '5.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: msg.kind === 'ok' ? 'rgba(0,230,118,0.12)' : 'rgba(248,113,113,0.12)',
          color: msg.kind === 'ok' ? C.green : C.red,
          border: `1px solid ${msg.kind === 'ok' ? C.green : C.red}`,
          borderRadius: '0.5rem',
          padding: '0.4rem 0.9rem',
          fontSize: '0.78rem',
          fontWeight: 700,
        }}>{msg.text}</div>
      )}
    </main>
  )
}

function MatchCard({
  match, pick, isKnockout, locked, drawNeedsPick, onChange,
}: {
  match: PredictorMatch
  pick: PickState
  isKnockout: boolean
  locked: boolean
  drawNeedsPick: boolean
  onChange: (patch: Partial<PickState>) => void
}) {
  const isDraw = pick.home !== '' && pick.home === pick.away
  const koDate = new Date(match.kickoff_at)
  const dateStr = koDate.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div style={{
      backgroundColor: C.card,
      border: `1px solid ${pick.is_star ? '#FBBF2466' : (drawNeedsPick ? '#F8717166' : C.borderSoft)}`,
      borderRadius: '0.75rem',
      padding: '0.85rem 0.9rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.7rem', color: C.muted }}>
        <span>Match {match.match_num} · {dateStr} CT</span>
        <button
          onClick={() => !locked && onChange({ is_star: !pick.is_star })}
          disabled={locked}
          style={{
            background: 'none',
            border: 'none',
            cursor: locked ? 'default' : 'pointer',
            color: pick.is_star ? C.gold : '#2a3550',
            fontSize: '1.15rem',
            padding: 0,
          }}
          aria-label="Toggle star"
        >★</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <TeamSide team={match.home_team_code} align="right" />
        <ScoreInput value={pick.home} onChange={(v) => !locked && onChange({ home: v })} disabled={locked} />
        <span style={{ color: C.muted, fontSize: '0.85rem' }}>–</span>
        <ScoreInput value={pick.away} onChange={(v) => !locked && onChange({ away: v })} disabled={locked} />
        <TeamSide team={match.away_team_code} align="left" />
      </div>
      {isKnockout && isDraw && (
        <div style={{
          marginTop: '0.6rem',
          padding: '0.5rem 0.7rem',
          borderRadius: '0.4rem',
          backgroundColor: 'rgba(248,113,113,0.06)',
          border: `1px solid ${pick.if_draw_winner ? '#2a3550' : '#F8717155'}`,
        }}>
          <div style={{ color: C.muted, fontSize: '0.72rem', marginBottom: '0.4rem', fontWeight: 700 }}>
            If draw at 90, who advances?
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {[match.home_team_code, match.away_team_code].map((tc) => (
              <button
                key={tc}
                onClick={() => !locked && onChange({ if_draw_winner: tc })}
                disabled={locked}
                style={{
                  flex: 1,
                  backgroundColor: pick.if_draw_winner === tc ? 'rgba(0,230,118,0.15)' : '#0A0F2E',
                  border: `1px solid ${pick.if_draw_winner === tc ? C.green : C.borderSoft}`,
                  borderRadius: '0.35rem',
                  padding: '0.35rem',
                  color: C.text,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: locked ? 'default' : 'pointer',
                }}
              >{tc}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TeamSide({ team, align }: { team: string; align: 'left' | 'right' }) {
  // Try a flag; for placeholder strings like "Winner M73" the flag URL 404s,
  // which renders an empty <img>. We hide it via onError.
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      gap: '0.5rem',
      minWidth: 0,
    }}>
      {align === 'right' && <span style={{ color: C.text, fontSize: '0.82rem', fontWeight: 600, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team}</span>}
      <img
        src={flagUrl(team)}
        alt=""
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        style={{ width: 22, height: 14, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
      />
      {align === 'left' && <span style={{ color: C.text, fontSize: '0.82rem', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team}</span>}
    </div>
  )
}

function ScoreInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={15}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') return onChange('')
        const n = parseInt(raw, 10)
        if (Number.isNaN(n) || n < 0) return
        if (n > 15) return onChange('15')
        onChange(String(n))
      }}
      style={{
        width: 40,
        textAlign: 'center',
        padding: '0.4rem 0.2rem',
        borderRadius: '0.35rem',
        border: `1px solid ${C.border}`,
        backgroundColor: '#0A0F2E',
        color: C.text,
        fontSize: '0.95rem',
        fontWeight: 700,
        appearance: 'textfield',
        MozAppearance: 'textfield',
      }}
    />
  )
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0s'
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
