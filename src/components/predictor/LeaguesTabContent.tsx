/**
 * <LeaguesTabContent /> — Leagues tab on `/predictor`.
 *
 * Top:
 *   [+ Create League]  [Join with Code]
 *
 * Below:
 *   "My Leagues" pill — row per league: name + my rank + member count + score.
 *   Each row links to `/predictor/leagues/{id}`.
 *
 * Modals are self-contained here so the tab is drop-in.
 */

'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'

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

interface MyLeague {
  id: string
  name: string
  invite_code: string
  member_count: number
  my_rank: number
  is_admin: boolean
  total?: number // when Wave D ships, the API can populate this
}

export default function LeaguesTabContent({ authed }: { authed: boolean }) {
  const router = useRouter()
  const [leagues, setLeagues] = useState<MyLeague[]>([])
  const [loaded, setLoaded] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/predictor/leagues/mine', {
        credentials: 'include',
        cache: 'no-store',
      })
      const j = await r.json().catch(() => null)
      setLeagues(j?.leagues ?? [])
    } catch { /* */ } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!authed) { setLeagues([]); setLoaded(true); return }
    refresh()
  }, [authed, refresh])

  return (
    <div style={{ display: 'grid', gap: '0.85rem', minWidth: 0 }}>
      {/* Top action row */}
      <div style={{ display: 'flex', gap: '0.5rem', minWidth: 0 }}>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={!authed}
          style={createBtnStyle(authed)}
        >+ Create League</button>
        <button
          type="button"
          onClick={() => setJoinOpen(true)}
          disabled={!authed}
          style={joinBtnStyle(authed)}
        >Join with Code</button>
      </div>

      {!authed && (
        <p style={{ color: C.muted, fontSize: '0.82rem', margin: 0, lineHeight: 1.5 }}>
          Sign in up top to create a private league with friends or join one with an invite code.
        </p>
      )}

      {/* My Leagues pill */}
      {authed && (
        <div style={cardOuter}>
          <div style={cardHeader}>
            <span>My Leagues</span>
            <span style={{ color: C.muted, fontSize: '0.7rem' }}>
              {leagues.length} joined
            </span>
          </div>

          {!loaded ? (
            <p style={{ color: C.muted, fontSize: '0.82rem', margin: '0.55rem 0 0' }}>Loading…</p>
          ) : leagues.length === 0 ? (
            <p style={{ color: C.muted, fontSize: '0.82rem', margin: '0.55rem 0 0', lineHeight: 1.5 }}>
              You're not in any leagues yet — create or join one above.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.55rem' }}>
              {leagues.map((lg) => (
                <Link
                  key={lg.id}
                  href={`/predictor/leagues/${lg.id}`}
                  style={leagueRowStyle}
                >
                  <span style={{ flexShrink: 0, fontSize: '0.95rem' }} aria-hidden="true">🏆</span>
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <div style={{
                      color: C.text,
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>{lg.name}</div>
                    <div style={{
                      color: C.muted,
                      fontSize: '0.7rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      #{lg.my_rank} of {lg.member_count}
                      {' · '}
                      <span style={{ color: C.gold }}>{lg.total ?? 0} pts</span>
                      {lg.is_admin && <span style={{ color: C.gold, marginLeft: '0.4rem' }}>· admin</span>}
                    </div>
                  </div>
                  <span style={{ color: C.muted, fontSize: '0.9rem', flexShrink: 0 }}>›</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {createOpen && (
        <CreateLeagueModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false)
            router.push(`/predictor/leagues/${id}`)
          }}
        />
      )}
      {joinOpen && (
        <JoinLeagueModal
          onClose={() => setJoinOpen(false)}
          onJoined={(id) => {
            setJoinOpen(false)
            refresh()
            router.push(`/predictor/leagues/${id}`)
          }}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Modals — self-contained so the tab is drop-in.
// ────────────────────────────────────────────────────────────────────────────

function CreateLeagueModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/predictor/leagues/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        setErr(j?.error === 'unauthenticated' ? 'Sign in to create a league.' : (j?.error ?? 'Create failed.'))
        setBusy(false)
        return
      }
      onCreated(j.league_id)
    } catch {
      setErr('Network error.')
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Create a league" onClose={onClose}>
      <form onSubmit={submit}>
        <label style={modalLabelStyle}>League name</label>
        <input
          autoFocus
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Group Chat World Cup"
          style={modalInputStyle}
        />
        {err && <div style={modalErrStyle}>{err}</div>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem' }}>
          <button type="button" onClick={onClose} style={modalSecondaryBtn}>Cancel</button>
          <button type="submit" disabled={!name.trim() || busy} style={modalPrimaryBtn(Boolean(name.trim()) && !busy)}>
            {busy ? 'Creating…' : 'Create league'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function JoinLeagueModal({ onClose, onJoined }: { onClose: () => void; onJoined: (id: string) => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/predictor/leagues/join', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: code.trim() }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        setErr(j?.error === 'league_not_found' ? 'Invite code not found.' : (j?.error ?? 'Join failed.'))
        setBusy(false)
        return
      }
      onJoined(j.league_id)
    } catch {
      setErr('Network error.')
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Join with code" onClose={onClose}>
      <form onSubmit={submit}>
        <label style={modalLabelStyle}>Invite code</label>
        <input
          autoFocus
          maxLength={12}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC234"
          style={{ ...modalInputStyle, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}
        />
        {err && <div style={modalErrStyle}>{err}</div>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem' }}>
          <button type="button" onClick={onClose} style={modalSecondaryBtn}>Cancel</button>
          <button type="submit" disabled={!code.trim() || busy} style={modalPrimaryBtn(Boolean(code.trim()) && !busy)}>
            {busy ? 'Joining…' : 'Join league'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(2px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 380,
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '0.85rem',
          padding: '1.2rem 1.25rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <h2 style={{ color: C.gold, fontSize: '1rem', fontWeight: 800, margin: 0 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '1.2rem', padding: 0, lineHeight: 1 }}
            aria-label="Close"
          >×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────────────

function createBtnStyle(enabled: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    backgroundColor: enabled ? C.gold : '#2a3550',
    color: enabled ? '#0A0F2E' : C.muted,
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.6rem 0.5rem',
    fontWeight: 800,
    fontSize: '0.82rem',
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }
}

function joinBtnStyle(enabled: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'transparent',
    color: enabled ? C.text : C.muted,
    border: `1px solid ${C.border}`,
    borderRadius: '0.5rem',
    padding: '0.6rem 0.5rem',
    fontWeight: 700,
    fontSize: '0.82rem',
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }
}

const cardOuter: CSSProperties = {
  backgroundColor: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: '0.85rem',
  padding: '0.9rem 1rem 1rem',
  minWidth: 0,
  overflow: 'hidden',
}

const cardHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.5rem',
  color: C.gold,
  fontSize: '0.74rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  minWidth: 0,
}

const leagueRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.55rem',
  padding: '0.55rem 0.65rem',
  backgroundColor: 'rgba(255,255,255,0.02)',
  border: `1px solid ${C.borderSoft}`,
  borderRadius: '0.45rem',
  textDecoration: 'none',
  minWidth: 0,
  overflow: 'hidden',
}

const modalLabelStyle: CSSProperties = {
  display: 'block',
  color: C.muted,
  fontSize: '0.72rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '0.4rem',
}

const modalInputStyle: CSSProperties = {
  width: '100%',
  padding: '0.55rem 0.7rem',
  borderRadius: '0.5rem',
  border: `1px solid ${C.border}`,
  backgroundColor: '#0A0F2E',
  color: C.text,
  fontSize: '0.95rem',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

const modalErrStyle: CSSProperties = {
  marginTop: '0.5rem',
  color: C.red,
  fontSize: '0.78rem',
}

function modalPrimaryBtn(enabled: boolean): CSSProperties {
  return {
    flex: 1,
    backgroundColor: enabled ? C.green : '#2a3550',
    color: enabled ? '#0A0F2E' : C.muted,
    border: 'none',
    borderRadius: '0.45rem',
    padding: '0.55rem',
    fontWeight: 800,
    fontSize: '0.85rem',
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontFamily: 'inherit',
  }
}

const modalSecondaryBtn: CSSProperties = {
  flex: 1,
  backgroundColor: 'transparent',
  color: C.muted,
  border: `1px solid ${C.border}`,
  borderRadius: '0.45rem',
  padding: '0.55rem',
  fontWeight: 700,
  fontSize: '0.85rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
