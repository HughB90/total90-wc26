'use client'

/**
 * /predictor/winner — tournament winner pick.
 *
 * Three states:
 *   1. PRE-KICKOFF (before Jun 11, 14:00 CT):
 *      - User picks freely, can change before lock. Full +40 if correct.
 *   2. LATE ENTRY (after Jun 11 kickoff, but before tournament finalized):
 *      - User has no existing pick → can submit ONE TIME. Their bonus is
 *        capped at 40 − 5*(days late, CT). Shown live before commit.
 *      - User already has a pick → display only, no edits.
 *      - User who picked pre-kickoff → display only ("Locked in pre-kickoff").
 *   3. TOURNAMENT FINALIZED: read-only for everyone.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { flagUrl } from '@/lib/predictor-flags'
import AuthHeader from '@/components/AuthHeader'
import { computeWinnerPenalty, FULL_BONUS_PTS } from '@/lib/predictor/winner-penalty'

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

const WINNER_LOCK_ISO = '2026-06-11T19:00:00.000Z'

interface SavedPick {
  team_code: string
  days_late: number
  bonus_cap: number
  penalty_pts: number
}

export default function WinnerPickPage() {
  const [teams, setTeams] = useState<string[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [savedPick, setSavedPick] = useState<SavedPick | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Load teams
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/predictor/round/group_r1')
        const j = await r.json()
        const all = new Set<string>()
        for (const m of j.matches ?? []) {
          all.add(m.home_team_code)
          all.add(m.away_team_code)
        }
        if (!cancelled) setTeams(Array.from(all).sort())
      } catch {
        if (!cancelled) setTeams([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Load current pick
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/predictor/winner', { credentials: 'include' })
        if (!r.ok) return
        const j = await r.json()
        if (!cancelled && j?.pick?.team_code) {
          setSavedPick({
            team_code: j.pick.team_code,
            days_late: j.pick.days_late ?? 0,
            bonus_cap: j.pick.bonus_cap ?? FULL_BONUS_PTS,
            penalty_pts: j.pick.penalty_pts ?? 0,
          })
          setSelected(j.pick.team_code)
        }
      } catch { /* anon */ }
    })()
    return () => { cancelled = true }
  }, [])

  const isPreKickoff = now.getTime() < new Date(WINNER_LOCK_ISO).getTime()

  // Live penalty preview (for late-entry users without a saved pick).
  const livePenalty = useMemo(() => computeWinnerPenalty(now), [now])

  // Once a late-entry user has saved, they're locked. Pre-kickoff users
  // can still change up until the kickoff.
  const lockedReason: 'none' | 'pre_locked_in' | 'late_one_shot_used' | 'finalized' = (() => {
    if (!savedPick) return 'none'
    // Pre-kickoff users with a saved pick can still update until lock.
    if (isPreKickoff && savedPick.days_late === 0) return 'none'
    return 'late_one_shot_used'
  })()
  const locked = lockedReason !== 'none'

  const countdown = useMemo(
    () => formatCountdown(new Date(WINNER_LOCK_ISO).getTime() - now.getTime()),
    [now]
  )

  async function submit() {
    if (!selected || busy || locked) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch('/api/predictor/winner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ team_code: selected }),
      })
      const j = await r.json().catch(() => null)
      if (r.status === 401) {
        setMsg({ kind: 'err', text: 'Sign in to save your pick.' })
      } else if (r.status === 403 && j?.error === 'winner_pick_already_set') {
        setMsg({ kind: 'err', text: 'Late entry: one shot only. Your pick is locked.' })
        if (j.pick) setSavedPick({
          team_code: j.pick.team_code,
          days_late: j.pick.days_late ?? 0,
          bonus_cap: j.pick.bonus_cap ?? FULL_BONUS_PTS,
          penalty_pts: j.pick.penalty_pts ?? 0,
        })
      } else if (r.status === 403 && j?.error === 'tournament_finalized') {
        setMsg({ kind: 'err', text: 'Tournament is over — winner picks are closed.' })
      } else if (r.status === 403) {
        setMsg({ kind: 'err', text: 'Winner pick is locked.' })
      } else if (!r.ok) {
        setMsg({ kind: 'err', text: j?.error || 'Failed to save.' })
      } else {
        setSavedPick({
          team_code: j.pick.team_code,
          days_late: j.pick.days_late ?? 0,
          bonus_cap: j.pick.bonus_cap ?? FULL_BONUS_PTS,
          penalty_pts: j.pick.penalty_pts ?? 0,
        })
        setMsg({ kind: 'ok', text: 'Saved.' })
      }
    } catch {
      setMsg({ kind: 'err', text: 'Network error.' })
    } finally {
      setBusy(false)
    }
  }

  const dirty = selected && selected !== savedPick?.team_code

  return (
    <>
    <AuthHeader />
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '1.5rem 1rem 6rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/predictor" style={{ color: C.muted, fontSize: '0.8rem', textDecoration: 'none' }}>← Back to Predictor</Link>
        <h1 style={{
          fontSize: 'clamp(1.5rem, 4vw, 2rem)',
          fontWeight: 900,
          color: C.gold,
          margin: '0.5rem 0 0.3rem',
        }}>
          Pick the Tournament Winner
        </h1>
        <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0 }}>
          One team. Up to {FULL_BONUS_PTS} pts if you nail it.
        </p>
      </div>

      {/* Status banner — context-aware */}
      <StatusBanner
        isPreKickoff={isPreKickoff}
        countdown={countdown}
        livePenalty={livePenalty}
        savedPick={savedPick}
        lockedReason={lockedReason}
      />

      {/* Grid */}
      {!teams && <div style={{ color: C.muted, textAlign: 'center', padding: '2rem 0' }}>Loading nations…</div>}
      {teams && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
          gap: '0.6rem',
          marginBottom: '6rem',
        }}>
          {teams.map((team) => {
            const isSel = selected === team
            return (
              <button
                key={team}
                onClick={() => !locked && setSelected(team)}
                disabled={locked && !isSel}
                style={{
                  backgroundColor: isSel ? 'rgba(0,230,118,0.12)' : C.card,
                  border: `2px solid ${isSel ? C.green : C.borderSoft}`,
                  borderRadius: '0.6rem',
                  padding: '0.65rem 0.4rem',
                  cursor: locked ? 'default' : 'pointer',
                  color: C.text,
                  fontSize: '0.72rem',
                  fontWeight: isSel ? 700 : 500,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.4rem',
                  textAlign: 'center',
                  transition: 'background-color 120ms, border-color 120ms',
                  opacity: locked && !isSel ? 0.4 : 1,
                }}
              >
                <img
                  src={flagUrl(team)}
                  alt={team}
                  loading="lazy"
                  style={{ width: 40, height: 26, objectFit: 'cover', borderRadius: 3 }}
                />
                <span style={{ lineHeight: 1.15 }}>{team}</span>
              </button>
            )
          })}
        </div>
      )}

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
          <span style={{ color: C.muted, fontSize: '0.8rem' }}>
            {selected ? (
              <>
                Pick: <strong style={{ color: C.text }}>{selected}</strong>
                {!isPreKickoff && !savedPick && (
                  <span style={{ color: C.gold, marginLeft: '0.4rem' }}>
                    · Max {livePenalty.bonusCap} pts
                    {livePenalty.daysLate > 0 && ` (${livePenalty.daysLate} day${livePenalty.daysLate === 1 ? '' : 's'} late)`}
                  </span>
                )}
              </>
            ) : 'No pick yet'}
          </span>
          <button
            onClick={submit}
            disabled={!dirty || busy}
            style={{
              backgroundColor: dirty && !busy ? C.green : '#2a3550',
              color: dirty && !busy ? '#0A0F2E' : C.muted,
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.6rem 1.2rem',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: dirty && !busy ? 'pointer' : 'default',
            }}
          >
            {busy ? 'Saving…' : (savedPick ? 'Update Pick' : (isPreKickoff ? 'Submit Pick' : 'Lock In Pick'))}
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
    </>
  )
}

/**
 * Top-of-page banner. Shows the right context: pre-kickoff countdown, late-entry
 * penalty preview, or "your pick is locked at +X" once saved.
 */
function StatusBanner({
  isPreKickoff, countdown, livePenalty, savedPick, lockedReason,
}: {
  isPreKickoff: boolean
  countdown: string
  livePenalty: { daysLate: number; bonusCap: number; penaltyPts: number }
  savedPick: SavedPick | null
  lockedReason: 'none' | 'pre_locked_in' | 'late_one_shot_used' | 'finalized'
}) {
  // Pre-kickoff branch
  if (isPreKickoff) {
    return (
      <div style={{
        marginBottom: '1.25rem',
        padding: '0.75rem 1rem',
        borderRadius: '0.6rem',
        backgroundColor: 'rgba(251,191,36,0.08)',
        border: '1px solid rgba(251,191,36,0.3)',
        textAlign: 'center',
      }}>
        <div style={{ color: C.gold, fontSize: '0.85rem', fontWeight: 800 }}>
          Locks in {countdown} (June 11, 2:00 PM CT) · Full +{FULL_BONUS_PTS} pts
        </div>
      </div>
    )
  }

  // Post-kickoff branches
  if (savedPick) {
    // Locked: already used the one shot.
    return (
      <div style={{
        marginBottom: '1.25rem',
        padding: '0.85rem 1rem',
        borderRadius: '0.6rem',
        backgroundColor: 'rgba(0,230,118,0.08)',
        border: '1px solid rgba(0,230,118,0.3)',
        textAlign: 'center',
        display: 'grid',
        gap: '0.3rem',
      }}>
        <div style={{ color: C.green, fontSize: '0.85rem', fontWeight: 800 }}>
          Your pick: {savedPick.team_code} · Max +{savedPick.bonus_cap} pts
        </div>
        <div style={{ color: C.muted, fontSize: '0.72rem' }}>
          {savedPick.days_late === 0
            ? 'Locked in pre-kickoff — full bonus.'
            : `+${FULL_BONUS_PTS} − ${savedPick.penalty_pts} (${savedPick.days_late} day${savedPick.days_late === 1 ? '' : 's'} late) = +${savedPick.bonus_cap}`
          }
          {' · '}Pick is locked — late entry is one-shot.
        </div>
      </div>
    )
  }

  // Late entry, no pick yet — show live preview
  return (
    <div style={{
      marginBottom: '1.25rem',
      padding: '0.85rem 1rem',
      borderRadius: '0.6rem',
      backgroundColor: 'rgba(248,113,113,0.06)',
      border: '1px solid rgba(248,113,113,0.3)',
      textAlign: 'center',
      display: 'grid',
      gap: '0.35rem',
    }}>
      <div style={{ color: C.red, fontSize: '0.85rem', fontWeight: 800 }}>
        Late entry — one shot, no edits
      </div>
      <div style={{ color: C.text, fontSize: '0.78rem' }}>
        Max bonus today: <strong style={{ color: C.gold }}>+{livePenalty.bonusCap} pts</strong>
        {livePenalty.daysLate > 0 && (
          <span style={{ color: C.muted }}>
            {' '}(+{FULL_BONUS_PTS} − {livePenalty.penaltyPts} for {livePenalty.daysLate} day{livePenalty.daysLate === 1 ? '' : 's'} late)
          </span>
        )}
      </div>
      <div style={{ color: C.muted, fontSize: '0.7rem' }}>
        −5 pts per calendar day after June 11. Once you save, your pick is locked.
      </div>
    </div>
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
