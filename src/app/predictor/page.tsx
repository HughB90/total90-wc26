'use client'

/**
 * /predictor — landing dashboard (Wave B redesign).
 *
 * Layout:
 *   - AuthHeader
 *   - Hero (countdown to next lock + winner pick CTA)
 *   - 8-round tab strip (sticky-ish) with status colors
 *   - "My Leagues" section: Global entry + per-league cards
 *   - "Create or join a league" inline
 *
 * Round tab states:
 *   open       — gold border, primary call-to-action
 *   submitted  — green border (count met round.required)
 *   in-progress— yellow border (partial picks)
 *   locked     — greyed out, "Locked"
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import AuthHeader from '@/components/AuthHeader'
import type { RoundConfig } from '@/lib/predictor-rounds'

const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  borderSoft: '#162040',
  gold: '#FBBF24',
  green: '#00E676',
  yellow: '#FBBF24',
  muted: '#8899CC',
  text: '#F0F4FF',
  red: '#F87171',
}

interface RoundWithStatus extends RoundConfig {
  locked: boolean
  my_picks: number
  status: 'open' | 'locked' | 'submitted' | 'in-progress'
}

interface MyLeague {
  id: string
  name: string
  inviteCode: string
  memberCount: number
  myRank: number
  myScore: number
  isCreator: boolean
}

export default function PredictorLanding() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [rounds, setRounds] = useState<RoundWithStatus[]>([])
  const [leagues, setLeagues] = useState<MyLeague[]>([])
  const [winnerPick, setWinnerPick] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  // Join/create state
  const [createName, setCreateName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [actionMsg, setActionMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Auth probe
      let _authed = false
      let _userId: string | null = null
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
        if (r.ok) {
          const j = await r.json().catch(() => null)
          _authed = Boolean(j?.profile?.id || j?.profile_id)
          _userId = j?.account?.id ?? j?.account_id ?? null
        }
      } catch { /* */ }
      if (cancelled) return
      setAuthed(_authed)
      setAccountId(_userId)

      // Rounds
      try {
        const r = await fetch('/api/predictor/rounds', { credentials: 'include', cache: 'no-store' })
        const j = await r.json().catch(() => null)
        if (!cancelled && Array.isArray(j?.rounds)) setRounds(j.rounds)
      } catch { /* */ }

      // Winner pick
      if (_authed) {
        try {
          const r = await fetch('/api/predictor/winner', { credentials: 'include', cache: 'no-store' })
          const j = await r.json().catch(() => null)
          if (!cancelled) setWinnerPick(j?.pick?.team_code ?? null)
        } catch { /* */ }
      }

      // Leagues (uses existing bracket league endpoint — same wc26_leagues table)
      if (_authed && _userId) {
        try {
          const r = await fetch(`/api/bracket/league?userId=${encodeURIComponent(_userId)}`, { cache: 'no-store' })
          const j = await r.json().catch(() => null)
          if (!cancelled && Array.isArray(j?.leagues)) setLeagues(j.leagues)
        } catch { /* */ }
      }
    })()
    return () => { cancelled = true }
  }, [])

  const nextLock = useMemo(() => {
    return rounds.find((r) => !r.locked) ?? null
  }, [rounds])

  const countdown = useMemo(() => {
    if (!nextLock) return ''
    const ms = new Date(nextLock.lock_iso).getTime() - now.getTime()
    return formatCountdown(ms)
  }, [nextLock, now])

  async function refreshLeagues() {
    if (!accountId) return
    try {
      const r = await fetch(`/api/bracket/league?userId=${encodeURIComponent(accountId)}`, { cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (Array.isArray(j?.leagues)) setLeagues(j.leagues)
    } catch { /* */ }
  }

  async function handleCreate() {
    if (!createName.trim() || !accountId || busy) return
    setBusy(true); setActionMsg(null)
    try {
      const r = await fetch('/api/bracket/league', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: accountId, action: 'create', name: createName.trim() }),
      })
      const j = await r.json().catch(() => null)
      if (r.ok && j?.league) {
        setActionMsg({ kind: 'ok', text: `Created "${j.league.name}" · code ${j.league.invite_code}` })
        setCreateName('')
        refreshLeagues()
      } else {
        setActionMsg({ kind: 'err', text: j?.error || 'Create failed' })
      }
    } catch {
      setActionMsg({ kind: 'err', text: 'Network error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin() {
    if (!joinCode.trim() || !accountId || busy) return
    setBusy(true); setActionMsg(null)
    try {
      const r = await fetch('/api/bracket/league', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: accountId, action: 'join', inviteCode: joinCode.trim().toUpperCase() }),
      })
      const j = await r.json().catch(() => null)
      if (r.ok && j?.league) {
        setActionMsg({ kind: 'ok', text: `Joined "${j.league.name}"` })
        setJoinCode('')
        refreshLeagues()
      } else {
        setActionMsg({ kind: 'err', text: j?.error || 'Join failed' })
      }
    } catch {
      setActionMsg({ kind: 'err', text: 'Network error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AuthHeader />
      <main style={{ maxWidth: 880, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <h1 style={{
            fontSize: 'clamp(1.5rem, 4.5vw, 2.2rem)',
            fontWeight: 900, color: C.gold,
            margin: '0 0 0.3rem', letterSpacing: '-0.02em',
          }}>
            Score Predictor
          </h1>
          <p style={{ color: C.muted, fontSize: '0.85rem', margin: '0 0 1rem' }}>
            Predict every match · 104 games · 8 rounds · free to play
          </p>
          {nextLock && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              backgroundColor: 'rgba(251,191,36,0.08)',
              border: '1px solid rgba(251,191,36,0.3)',
              borderRadius: '2rem', padding: '0.35rem 0.9rem',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: C.gold }} />
              <span style={{ color: C.gold, fontSize: '0.72rem', fontWeight: 700 }}>
                {nextLock.shortLabel} locks in {countdown}
              </span>
            </div>
          )}
        </div>

        {/* Winner pick mini-card */}
        {authed !== false && (
          <Link href="/predictor/winner" style={{ textDecoration: 'none' }}>
            <div style={{
              backgroundColor: C.card,
              border: `1px solid ${winnerPick ? C.green + '55' : C.gold + '55'}`,
              borderRadius: '0.75rem',
              padding: '0.7rem 1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '1rem',
              marginBottom: '1.25rem',
              cursor: 'pointer',
            }}>
              <div>
                <div style={{ color: C.text, fontWeight: 700, fontSize: '0.85rem' }}>Tournament Winner Pick</div>
                <div style={{ color: C.muted, fontSize: '0.72rem', marginTop: '2px' }}>
                  {winnerPick ? `Picked: ${winnerPick} · tap to change` : 'Worth 40 pts. Locks at R1 kickoff.'}
                </div>
              </div>
              <div style={{
                fontSize: '0.65rem', fontWeight: 700,
                color: winnerPick ? C.green : C.gold,
                padding: '0.25rem 0.55rem',
                borderRadius: '0.4rem',
                border: `1px solid ${(winnerPick ? C.green : C.gold) + '44'}`,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}>
                {winnerPick ? 'Submitted' : 'Open'}
              </div>
            </div>
          </Link>
        )}

        {/* Round tab strip */}
        <section style={{ marginBottom: '1.75rem' }}>
          <SectionHeader title="Rounds" />
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
            gap: '0.5rem',
            marginTop: '0.5rem',
          }}>
            {rounds.length === 0 && (
              <div style={{ color: C.muted, fontSize: '0.8rem', padding: '1rem', gridColumn: '1 / -1' }}>
                Loading rounds…
              </div>
            )}
            {rounds.map((r) => <RoundTab key={r.code} round={r} />)}
          </div>
        </section>

        {/* My Leagues */}
        <section style={{ marginBottom: '1.75rem' }}>
          <SectionHeader title="Leaderboards" />
          <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
            {/* Global entry */}
            <LeagueCard
              href="/predictor/leaderboard"
              title="🌎 Global Leaderboard"
              subtitle="Everyone playing on Total90"
              accent={C.gold}
            />
            {!authed && (
              <div style={{ color: C.muted, fontSize: '0.78rem', padding: '0.75rem', textAlign: 'center' }}>
                Sign in to see your leagues.
              </div>
            )}
            {authed && leagues.length === 0 && (
              <div style={{ color: C.muted, fontSize: '0.78rem', padding: '0.75rem', textAlign: 'center', backgroundColor: C.card, border: `1px dashed ${C.borderSoft}`, borderRadius: '0.5rem' }}>
                You’re not in any leagues yet. Create or join one below.
              </div>
            )}
            {leagues.map((l) => (
              <LeagueCard
                key={l.id}
                href={`/predictor/leagues/${l.inviteCode}`}
                title={l.name + (l.isCreator ? ' 👑' : '')}
                subtitle={`Rank ${l.myRank} of ${l.memberCount} · ${l.myScore} pts · ${l.inviteCode}`}
                accent={C.green}
              />
            ))}
          </div>
        </section>

        {/* Create / join */}
        {authed && (
          <section style={{ marginBottom: '2rem' }}>
            <SectionHeader title="Create or Join a League" />
            <div style={{
              backgroundColor: C.card, border: `1px solid ${C.border}`,
              borderRadius: '0.75rem', padding: '0.85rem 1rem',
              marginTop: '0.5rem',
              display: 'grid', gap: '0.65rem', gridTemplateColumns: '1fr 1fr',
            }}>
              <div>
                <label style={labelStyle}>Create new</label>
                <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.25rem' }}>
                  <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="League name" style={inputStyle} />
                  <button onClick={handleCreate} disabled={busy || !createName.trim()} style={btnStyle(busy || !createName.trim())}>Create</button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Join with code</label>
                <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.25rem' }}>
                  <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                  <button onClick={handleJoin} disabled={busy || !joinCode.trim()} style={btnStyle(busy || !joinCode.trim())}>Join</button>
                </div>
              </div>
              {actionMsg && (
                <div style={{ gridColumn: '1 / -1', color: actionMsg.kind === 'ok' ? C.green : C.red, fontSize: '0.75rem', marginTop: '0.2rem' }}>
                  {actionMsg.text}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </>
  )
}

// ─── Components ──────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 style={{
      fontSize: '0.72rem', fontWeight: 800, color: C.muted,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      margin: '0 0 0.25rem', padding: '0 0.25rem',
    }}>{title}</h2>
  )
}

function RoundTab({ round }: { round: RoundWithStatus }) {
  const disabled = round.locked && round.my_picks === 0
  const borderColor =
    round.status === 'submitted' ? C.green :
    round.status === 'in-progress' ? C.yellow :
    round.status === 'open' ? C.gold :
    C.borderSoft
  const bg =
    round.status === 'submitted' ? 'rgba(0,230,118,0.06)' :
    round.status === 'in-progress' ? 'rgba(251,191,36,0.06)' :
    round.status === 'open' ? 'rgba(251,191,36,0.04)' :
    C.card
  const opacity = disabled ? 0.45 : 1

  const inner = (
    <div style={{
      backgroundColor: bg,
      border: `2px solid ${borderColor}`,
      borderRadius: '0.6rem',
      padding: '0.55rem 0.4rem',
      textAlign: 'center',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity,
    }}>
      <div style={{ fontSize: '0.78rem', fontWeight: 900, color: C.text, lineHeight: 1.1 }}>{round.shortLabel}</div>
      <div style={{ fontSize: '0.62rem', color: C.muted, marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {round.status === 'locked' ? 'Locked' :
         round.status === 'submitted' ? `${round.my_picks}/${round.required} ✓` :
         round.status === 'in-progress' ? `${round.my_picks}/${round.required}` :
         'Open'}
      </div>
    </div>
  )
  if (disabled) return inner
  return <Link href={`/predictor/round/${round.code}`} style={{ textDecoration: 'none' }}>{inner}</Link>
}

function LeagueCard({ href, title, subtitle, accent }: { href: string; title: string; subtitle: string; accent: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: '0.55rem',
        padding: '0.6rem 0.85rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ color: C.text, fontSize: '0.9rem', fontWeight: 700 }}>{title}</div>
          <div style={{ color: C.muted, fontSize: '0.72rem', marginTop: '2px' }}>{subtitle}</div>
        </div>
        <div style={{ color: C.muted }}>›</div>
      </div>
    </Link>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0,
  backgroundColor: '#091736',
  border: `1px solid ${C.border}`,
  color: C.text,
  padding: '0.4rem 0.55rem',
  borderRadius: '0.4rem',
  fontSize: '0.78rem',
  fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  color: C.muted, fontSize: '0.65rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    backgroundColor: disabled ? '#1a2550' : C.gold,
    border: 'none', color: disabled ? C.muted : '#0A0F2E',
    padding: '0.4rem 0.7rem', borderRadius: '0.4rem',
    fontSize: '0.75rem', fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
  }
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
