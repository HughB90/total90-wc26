'use client'

/**
 * /predictor — landing dashboard.
 *
 * Authed: cards for "Pick Tournament Winner" + "Round 1 Picks" with status.
 * Anon: same UI; CTAs route to /bracket to sign in (modal swap pending
 *       auth subagent landing on main).
 *
 * Auth detection: we ask /api/predictor/winner once. Because the predictor
 * session helper falls through to `null` when there's no cookie + no header,
 * a 200 with `{ pick: null }` does NOT distinguish authed vs anon. So we
 * also check /api/auth/me (added by the auth subagent — graceful fallback).
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import AuthHeader from '@/components/AuthHeader'

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

interface PredictorSummary {
  authed: boolean
  winnerPickTeam: string | null
  r1Submitted: number  // count of submitted picks in group_r1
  r1Locked: boolean
}

export default function PredictorLanding() {
  const [data, setData] = useState<PredictorSummary | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Best-effort auth probe via /api/auth/me (auth subagent endpoint).
      // If that 200s, we treat the user as authed.
      let authed = false
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
        if (r.ok) {
          const j = await r.json().catch(() => null)
          authed = Boolean(j?.profile_id || j?.profile?.id)
        }
      } catch { /* anon */ }

      // Winner pick (authed only)
      let winnerPickTeam: string | null = null
      if (authed) {
        try {
          const r = await fetch('/api/predictor/winner', { credentials: 'include', cache: 'no-store' })
          const j = await r.json().catch(() => null)
          winnerPickTeam = j?.pick?.team_code ?? null
        } catch { /* */ }
      }

      // R1 submitted count + lock
      let r1Submitted = 0
      let r1Locked = false
      try {
        const r = await fetch('/api/predictor/round/group_r1', { credentials: 'include', cache: 'no-store' })
        const j = await r.json().catch(() => null)
        r1Submitted = Array.isArray(j?.my_picks) ? j.my_picks.length : 0
        r1Locked = Boolean(j?.locked)
      } catch { /* */ }

      if (!cancelled) {
        setData({ authed, winnerPickTeam, r1Submitted, r1Locked })
      }
    })()
    return () => { cancelled = true }
  }, [])

  const winnerLocked = now.getTime() >= new Date(WINNER_LOCK_ISO).getTime()
  const countdown = formatCountdown(new Date(WINNER_LOCK_ISO).getTime() - now.getTime())

  function handleAnonClick(e: React.MouseEvent) {
    if (!data?.authed) {
      e.preventDefault()
      alert('Sign in to play the Predictor. We\'ll send you to the Bracket sign-in for now — same account works for both.')
      window.location.href = '/bracket'
    }
  }

  return (
    <>
    <AuthHeader />
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '2.5rem 1.25rem 5rem' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: '2.25rem' }}>
        <h1 style={{
          fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
          fontWeight: 900,
          color: C.gold,
          margin: '0 0 0.4rem',
          letterSpacing: '-0.02em',
        }}>
          Score Predictor
        </h1>
        <p style={{ color: C.muted, fontSize: '0.9rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
          Predict every match. Star your bangers. Climb the leaderboard.
          <br />
          Free to play · 8 stars · 104 matches · 1 World Cup
        </p>
        {!winnerLocked && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.3)',
            borderRadius: '2rem',
            padding: '0.4rem 1rem',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: C.gold }} />
            <span style={{ color: C.gold, fontSize: '0.72rem', fontWeight: 700 }}>
              Tournament winner pick locks in {countdown}
            </span>
          </div>
        )}
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {/* Winner pick card */}
        <DashboardCard
          title="Pick the Tournament Winner"
          desc={
            winnerLocked
              ? (data?.winnerPickTeam
                  ? `Your pick: ${data.winnerPickTeam}`
                  : 'Pick window closed.')
              : (data?.winnerPickTeam
                  ? `Current pick: ${data.winnerPickTeam} — tap to change`
                  : 'Pick one team to lift the trophy. Worth 40 pts if you nail it.')
          }
          badge={winnerLocked ? 'Locked' : (data?.winnerPickTeam ? 'Submitted' : 'Open')}
          badgeColor={winnerLocked ? C.muted : (data?.winnerPickTeam ? C.green : C.gold)}
          href="/predictor/winner"
          onClick={handleAnonClick}
        />

        {/* Round 1 picks card */}
        <DashboardCard
          title="Round 1 Picks"
          desc={
            data?.r1Locked
              ? 'Round 1 is locked. Results will populate as matches go final.'
              : `Pick 16 of 24 group-stage matches. ${data?.r1Submitted ?? 0}/16 saved so far.`
          }
          badge={data?.r1Locked ? 'Locked' : (data && data.r1Submitted > 0 ? 'In progress' : 'Open')}
          badgeColor={data?.r1Locked ? C.muted : (data && data.r1Submitted > 0 ? C.green : C.gold)}
          href="/predictor/round/group_r1"
          onClick={handleAnonClick}
        />

        {/* Coming soon cards */}
        <DashboardCard
          title="Leaderboard"
          desc="Per-round + tournament-total rankings. Lights up after the first match goes final."
          badge="Coming soon"
          badgeColor={C.muted}
          href="#"
          disabled
        />
        <DashboardCard
          title="Rounds 2–8 (Knockouts + Final)"
          desc="Pick screens open as each round approaches. Goalscorer bonuses in the knockouts."
          badge="Coming soon"
          badgeColor={C.muted}
          href="#"
          disabled
        />
      </div>

      {/* Anon nudge */}
      {data && !data.authed && (
        <div style={{
          marginTop: '2rem',
          padding: '1rem 1.25rem',
          backgroundColor: 'rgba(0,230,118,0.06)',
          border: '1px solid rgba(0,230,118,0.2)',
          borderRadius: '0.75rem',
          textAlign: 'center',
        }}>
          <p style={{ color: C.text, margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
            You&apos;re browsing as a guest. Picks save once you sign in.
          </p>
          <Link href="/bracket" style={{ color: C.green, fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}>
            Sign in to play →
          </Link>
        </div>
      )}
    </main>
    </>
  )
}

function DashboardCard({
  title, desc, badge, badgeColor, href, disabled, onClick,
}: {
  title: string
  desc: string
  badge: string
  badgeColor: string
  href: string
  disabled?: boolean
  onClick?: (e: React.MouseEvent) => void
}) {
  const inner = (
    <div style={{
      backgroundColor: C.card,
      border: `1px solid ${disabled ? C.borderSoft : C.border}`,
      borderRadius: '1rem',
      padding: '1.25rem 1.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? 'default' : 'pointer',
      textDecoration: 'none',
    }}>
      <div>
        <div style={{ color: C.text, fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.3rem' }}>{title}</div>
        <div style={{ color: C.muted, fontSize: '0.82rem', lineHeight: 1.45 }}>{desc}</div>
      </div>
      <div style={{
        flexShrink: 0,
        fontSize: '0.7rem',
        fontWeight: 700,
        color: badgeColor,
        backgroundColor: 'rgba(255,255,255,0.04)',
        padding: '0.3rem 0.6rem',
        borderRadius: '0.5rem',
        border: `1px solid ${badgeColor}33`,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}>{badge}</div>
    </div>
  )

  if (disabled) return inner
  return (
    <Link href={href} onClick={onClick} style={{ textDecoration: 'none' }}>
      {inner}
    </Link>
  )
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0s'
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
