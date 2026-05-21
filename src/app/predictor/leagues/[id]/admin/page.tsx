'use client'

/**
 * /predictor/leagues/[id]/admin — admin-only league management.
 *
 * Capabilities:
 *   - Rename league (PATCH /api/predictor/leagues/[id])
 *   - Regenerate invite code (PATCH ... { regen_invite: true })
 *   - Kick member (DELETE /api/predictor/leagues/[id]/members/[profile_id])
 *   - Delete league (DELETE /api/predictor/leagues/[id])
 *
 * Authorization is enforced server-side via is_admin on
 * wc26_predictor_league_members. This page just hides the UI if
 * the GET response comes back with is_admin = false.
 */

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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

interface LeagueInfo {
  league: { id: string; name: string; invite_code: string; created_by: string }
  members: { profile_id: string; manager_name: string; first_name: string; is_admin: boolean }[]
  is_admin: boolean
}

export default function LeagueAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [info, setInfo] = useState<LeagueInfo | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/predictor/leagues/${id}`, { credentials: 'include', cache: 'no-store' })
      if (r.status === 404) { setLoadErr('League not found.'); return }
      if (!r.ok) { setLoadErr('Failed to load.'); return }
      const j = await r.json()
      setInfo(j)
      setName(j.league.name)
    } catch {
      setLoadErr('Network error.')
    }
  }, [id])

  useEffect(() => { refresh() }, [refresh])

  async function saveName() {
    if (!name.trim() || !info) return
    if (name.trim() === info.league.name) { setRenaming(false); return }
    setBusy('rename'); setMsg(null)
    try {
      const r = await fetch(`/api/predictor/leagues/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        setMsg({ kind: 'err', text: j?.error ?? 'Rename failed.' })
      } else {
        setMsg({ kind: 'ok', text: 'League renamed.' })
        setRenaming(false)
        refresh()
      }
    } catch {
      setMsg({ kind: 'err', text: 'Network error.' })
    } finally {
      setBusy(null)
    }
  }

  async function regenInvite() {
    if (!confirm('Regenerate the invite code? The old code will stop working.')) return
    setBusy('regen'); setMsg(null)
    try {
      const r = await fetch(`/api/predictor/leagues/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regen_invite: true }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        setMsg({ kind: 'err', text: j?.error ?? 'Regen failed.' })
      } else {
        setMsg({ kind: 'ok', text: 'New invite code generated.' })
        refresh()
      }
    } catch {
      setMsg({ kind: 'err', text: 'Network error.' })
    } finally {
      setBusy(null)
    }
  }

  async function kickMember(profileId: string, label: string) {
    if (!confirm(`Kick ${label}? They can rejoin with the invite code unless you regen it.`)) return
    setBusy(`kick:${profileId}`); setMsg(null)
    try {
      const r = await fetch(`/api/predictor/leagues/${id}/members/${profileId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        setMsg({ kind: 'err', text: j?.error ?? 'Kick failed.' })
      } else {
        setMsg({ kind: 'ok', text: `${label} removed.` })
        refresh()
      }
    } catch {
      setMsg({ kind: 'err', text: 'Network error.' })
    } finally {
      setBusy(null)
    }
  }

  async function deleteLeague() {
    if (!info) return
    const typed = prompt(`Type "${info.league.name}" to confirm delete. This wipes the league for all members.`)
    if (typed !== info.league.name) {
      if (typed !== null) alert('Name did not match. Delete cancelled.')
      return
    }
    setBusy('delete'); setMsg(null)
    try {
      const r = await fetch(`/api/predictor/leagues/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        setMsg({ kind: 'err', text: j?.error ?? 'Delete failed.' })
        setBusy(null)
      } else {
        router.push('/predictor')
      }
    } catch {
      setMsg({ kind: 'err', text: 'Network error.' })
      setBusy(null)
    }
  }

  if (loadErr) {
    return (
      <>
        <AuthHeader />
        <main style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1rem' }}>
          <Link href={`/predictor/leagues/${id}`} style={{ color: C.muted, fontSize: '0.8rem', textDecoration: 'none' }}>← Back to league</Link>
          <div style={{ marginTop: '2rem', padding: '1.25rem', backgroundColor: C.card, border: `1px solid ${C.red}55`, borderRadius: '0.75rem', textAlign: 'center', color: C.red }}>{loadErr}</div>
        </main>
      </>
    )
  }

  if (!info) {
    return (
      <>
        <AuthHeader />
        <main style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1rem' }}>
          <p style={{ color: C.muted }}>Loading…</p>
        </main>
      </>
    )
  }

  if (!info.is_admin) {
    return (
      <>
        <AuthHeader />
        <main style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1rem' }}>
          <Link href={`/predictor/leagues/${id}`} style={{ color: C.muted, fontSize: '0.8rem', textDecoration: 'none' }}>← Back to league</Link>
          <div style={{ marginTop: '2rem', padding: '1.25rem', backgroundColor: C.card, border: `1px solid ${C.red}55`, borderRadius: '0.75rem', textAlign: 'center', color: C.red }}>
            You don&apos;t have admin access to this league.
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <AuthHeader />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
        <Link href={`/predictor/leagues/${id}`} style={{ color: C.muted, fontSize: '0.8rem', textDecoration: 'none' }}>← Back to league</Link>

        <h1 style={{
          color: C.gold,
          fontWeight: 900,
          fontSize: 'clamp(1.4rem, 4vw, 1.8rem)',
          margin: '0.75rem 0 0.4rem',
          letterSpacing: '-0.02em',
        }}>League admin</h1>
        <p style={{ color: C.muted, fontSize: '0.82rem', margin: '0 0 1.5rem' }}>
          {info.league.name}
        </p>

        {msg && (
          <div style={{
            marginBottom: '1rem',
            padding: '0.55rem 0.85rem',
            borderRadius: '0.5rem',
            backgroundColor: msg.kind === 'ok' ? 'rgba(0,230,118,0.08)' : 'rgba(248,113,113,0.08)',
            border: `1px solid ${msg.kind === 'ok' ? C.green : C.red}55`,
            color: msg.kind === 'ok' ? C.green : C.red,
            fontSize: '0.82rem',
          }}>{msg.text}</div>
        )}

        {/* Rename */}
        <Card title="League name">
          {renaming ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                autoFocus
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.5rem 0.7rem',
                  borderRadius: '0.45rem',
                  border: `1px solid ${C.border}`,
                  backgroundColor: '#0A0F2E',
                  color: C.text,
                  fontSize: '0.9rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              <button onClick={saveName} disabled={busy === 'rename'} style={primaryBtn(true)}>
                {busy === 'rename' ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => { setRenaming(false); setName(info.league.name) }} style={secondaryBtn}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: C.text, fontSize: '0.95rem', fontWeight: 600 }}>{info.league.name}</span>
              <button onClick={() => setRenaming(true)} style={secondaryBtn}>Rename</button>
            </div>
          )}
        </Card>

        {/* Invite code */}
        <Card title="Invite code">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <span style={{ color: C.gold, fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.15em' }}>{info.league.invite_code}</span>
            <button onClick={regenInvite} disabled={busy === 'regen'} style={secondaryBtn}>
              {busy === 'regen' ? 'Generating…' : 'Regenerate'}
            </button>
          </div>
          <p style={{ color: C.muted, fontSize: '0.75rem', margin: '0.5rem 0 0', lineHeight: 1.4 }}>
            Share this code with anyone you want to invite. Regenerating it
            invalidates the old code.
          </p>
        </Card>

        {/* Members */}
        <Card title={`Members (${info.members.length})`}>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {info.members.map((m) => {
              const isOwner = m.profile_id === info.league.created_by
              return (
                <div key={m.profile_id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.5rem 0.6rem',
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: '0.45rem',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.text, fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.manager_name}
                    </div>
                    {m.first_name && m.first_name !== m.manager_name && (
                      <div style={{ color: C.muted, fontSize: '0.7rem' }}>{m.first_name}</div>
                    )}
                  </div>
                  {isOwner ? (
                    <span style={{ color: C.gold, fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Owner</span>
                  ) : (
                    <button
                      onClick={() => kickMember(m.profile_id, m.manager_name)}
                      disabled={busy === `kick:${m.profile_id}`}
                      style={{
                        background: 'none',
                        border: `1px solid ${C.red}55`,
                        color: C.red,
                        borderRadius: '0.35rem',
                        padding: '0.25rem 0.55rem',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >{busy === `kick:${m.profile_id}` ? '…' : 'Kick'}</button>
                  )}
                </div>
              )
            })}
          </div>
        </Card>

        {/* Danger zone */}
        <Card title="Danger zone" tone="danger">
          <p style={{ color: C.muted, fontSize: '0.78rem', margin: '0 0 0.7rem', lineHeight: 1.5 }}>
            Deleting a league removes it for everyone. Picks themselves stay
            on each profile — only the league + membership rows are wiped.
          </p>
          <button
            onClick={deleteLeague}
            disabled={busy === 'delete'}
            style={{
              backgroundColor: C.red,
              color: '#0A0F2E',
              border: 'none',
              borderRadius: '0.4rem',
              padding: '0.5rem 0.95rem',
              fontWeight: 800,
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >{busy === 'delete' ? 'Deleting…' : 'Delete league'}</button>
        </Card>
      </main>
    </>
  )
}

function Card({ title, children, tone }: { title: string; children: React.ReactNode; tone?: 'danger' }) {
  return (
    <div style={{
      backgroundColor: C.card,
      border: `1px solid ${tone === 'danger' ? `${C.red}55` : C.border}`,
      borderRadius: '0.7rem',
      padding: '1rem 1.15rem',
      marginBottom: '0.85rem',
    }}>
      <h3 style={{
        color: tone === 'danger' ? C.red : C.gold,
        fontSize: '0.72rem',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin: '0 0 0.6rem',
      }}>{title}</h3>
      {children}
    </div>
  )
}

function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    backgroundColor: enabled ? C.green : '#2a3550',
    color: enabled ? '#0A0F2E' : C.muted,
    border: 'none',
    borderRadius: '0.4rem',
    padding: '0.5rem 0.85rem',
    fontWeight: 800,
    fontSize: '0.8rem',
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontFamily: 'inherit',
  }
}

const secondaryBtn: React.CSSProperties = {
  background: 'transparent',
  color: C.muted,
  border: `1px solid ${C.border}`,
  borderRadius: '0.4rem',
  padding: '0.5rem 0.85rem',
  fontWeight: 700,
  fontSize: '0.78rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
