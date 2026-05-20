'use client'

/**
 * /predictor/winner — pre-tournament winner pick.
 * 48-nation grid. Single-select. Sticky submit. Lock countdown banner.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { flagUrl } from '@/lib/predictor-flags'
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

export default function WinnerPickPage() {
  const [teams, setTeams] = useState<string[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [savedPick, setSavedPick] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Ticking clock for countdown
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Load teams (from group-stage matches via /api/predictor/round/group_r1)
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
          setSavedPick(j.pick.team_code)
          setSelected(j.pick.team_code)
        }
      } catch { /* anon */ }
    })()
    return () => { cancelled = true }
  }, [])

  const locked = now.getTime() >= new Date(WINNER_LOCK_ISO).getTime()
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
      } else if (r.status === 403) {
        setMsg({ kind: 'err', text: 'Winner pick is locked.' })
      } else if (!r.ok) {
        setMsg({ kind: 'err', text: j?.error || 'Failed to save.' })
      } else {
        setSavedPick(selected)
        setMsg({ kind: 'ok', text: 'Saved.' })
      }
    } catch {
      setMsg({ kind: 'err', text: 'Network error.' })
    } finally {
      setBusy(false)
    }
  }

  const dirty = selected && selected !== savedPick

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
          One team. 40 points if you nail it. Public after submission.
        </p>
      </div>

      {/* Lock banner */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        marginBottom: '1.25rem',
        padding: '0.6rem 1rem',
        borderRadius: '0.6rem',
        backgroundColor: locked ? 'rgba(136,153,204,0.08)' : 'rgba(251,191,36,0.08)',
        border: `1px solid ${locked ? '#2a3550' : 'rgba(251,191,36,0.3)'}`,
        textAlign: 'center',
      }}>
        <span style={{ color: locked ? C.muted : C.gold, fontSize: '0.78rem', fontWeight: 700 }}>
          {locked ? 'Pick locked' : `Locks in ${countdown} (June 11, 2:00 PM CT)`}
        </span>
      </div>

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
        }}>
          <span style={{ color: C.muted, fontSize: '0.8rem' }}>
            {selected ? <>Pick: <strong style={{ color: C.text }}>{selected}</strong></> : 'No pick yet'}
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
            {busy ? 'Saving…' : (savedPick ? 'Update Pick' : 'Submit Pick')}
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

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0s'
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
