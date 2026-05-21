'use client'

/**
 * /predictor/leagues/[code] — per-league dashboard.
 *
 * Shows:
 *   - League name + invite code (with copy)
 *   - League leaderboard (same sticky top-3 + my-row + 25/page pattern)
 *   - If current profile is creator: Admin tab with member list,
 *     remove-member, edit-invite-code (with 3-change cap counter)
 */

import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import AuthHeader from '@/components/AuthHeader'
import PredictorLeaderboardTable from '@/components/PredictorLeaderboardTable'

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

interface AdminMember {
  profile_id: string | null
  user_id: string | null
  account_email: string | null
  first_name: string | null
  manager_name: string | null
  joined_at: string | null
  total_pts: number
}

interface AdminPayload {
  league: {
    id: string
    name: string
    invite_code: string
    code_changes_used: number
    code_changes_remaining: number
    code_change_cap: number
    is_creator: boolean
  }
  members: AdminMember[]
}

export default function LeaguePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)

  const [tab, setTab] = useState<'leaderboard' | 'admin'>('leaderboard')
  const [admin, setAdmin] = useState<AdminPayload | null>(null)
  const [adminErr, setAdminErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // Edit-code modal state
  const [editing, setEditing] = useState(false)
  const [editCode, setEditCode] = useState('')

  const loadAdmin = useCallback(async () => {
    try {
      const r = await fetch(`/api/leagues/${encodeURIComponent(code)}/admin`, { credentials: 'include', cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        if (r.status === 403 || r.status === 401) {
          setAdmin(null)
          setAdminErr(null) // expected for non-creators
        } else {
          setAdminErr(j?.error || 'admin_load_failed')
        }
        return
      }
      setAdmin(j)
      setAdminErr(null)
    } catch {
      setAdminErr('network_error')
    }
  }, [code])

  useEffect(() => { loadAdmin() }, [loadAdmin])

  const isCreator = Boolean(admin?.league?.is_creator)

  async function copyCode() {
    const c = admin?.league?.invite_code ?? code
    try { await navigator.clipboard.writeText(c); setCopied(true); setTimeout(() => setCopied(false), 1200) } catch { /* */ }
  }

  async function handleKick(member: AdminMember) {
    if (!admin || !member.profile_id) return
    if (!confirm(`Remove ${member.first_name || 'this member'} (${member.manager_name || member.account_email || ''}) from "${admin.league.name}"?`)) return
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`/api/leagues/${admin.league.id}/members/${member.profile_id}`, {
        method: 'DELETE', credentials: 'include',
      })
      const j = await r.json().catch(() => null)
      if (r.ok) {
        setMsg({ kind: 'ok', text: 'Member removed.' })
        loadAdmin()
      } else {
        setMsg({ kind: 'err', text: j?.error || 'Remove failed.' })
      }
    } catch {
      setMsg({ kind: 'err', text: 'Network error.' })
    } finally {
      setBusy(false)
    }
  }

  async function submitCodeChange() {
    if (!admin) return
    const trimmed = editCode.trim().toUpperCase()
    if (trimmed && !/^[A-Z0-9]{6}$/.test(trimmed)) {
      setMsg({ kind: 'err', text: 'Code must be exactly 6 uppercase letters/numbers.' })
      return
    }
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`/api/leagues/${admin.league.id}/code`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trimmed ? { new_code: trimmed } : {}),
      })
      const j = await r.json().catch(() => null)
      if (r.ok) {
        setMsg({ kind: 'ok', text: `Code changed to ${j.league.invite_code}` })
        setEditing(false); setEditCode('')
        loadAdmin()
        // Redirect to the new code URL so the address bar is right
        if (j?.league?.invite_code && j.league.invite_code !== code) {
          window.history.replaceState(null, '', `/predictor/leagues/${j.league.invite_code}`)
        }
      } else {
        setMsg({ kind: 'err', text: j?.error || 'Code change failed.' })
      }
    } catch {
      setMsg({ kind: 'err', text: 'Network error.' })
    } finally {
      setBusy(false)
    }
  }

  const displayCode = admin?.league?.invite_code ?? code.toUpperCase()
  const leagueName = admin?.league?.name ?? `League ${displayCode}`

  return (
    <>
      <AuthHeader />
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '1.25rem 1rem 6rem' }}>
        <div style={{ marginBottom: '0.6rem' }}>
          <Link href="/predictor" style={{ color: C.muted, textDecoration: 'none', fontSize: '0.78rem' }}>
            ← Predictor
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <h1 style={{ fontSize: 'clamp(1.4rem, 4vw, 1.9rem)', fontWeight: 900, color: C.gold, margin: 0 }}>
            {leagueName} {isCreator && <span title="You are the commissioner">👑</span>}
          </h1>
        </div>
        <div style={{ color: C.muted, fontSize: '0.78rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>Code:</span>
          <strong style={{ color: C.text, letterSpacing: '0.05em' }}>{displayCode}</strong>
          <button onClick={copyCode} style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.35rem',
            color: copied ? C.green : C.muted, fontSize: '0.68rem',
            padding: '1px 6px', cursor: 'pointer', fontFamily: 'inherit',
          }}>{copied ? 'Copied!' : 'Copy'}</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', borderBottom: `1px solid ${C.borderSoft}` }}>
          <TabBtn label="Leaderboard" active={tab === 'leaderboard'} onClick={() => setTab('leaderboard')} />
          {isCreator && <TabBtn label="Admin" active={tab === 'admin'} onClick={() => setTab('admin')} />}
        </div>

        {msg && (
          <div style={{
            color: msg.kind === 'ok' ? C.green : C.red,
            fontSize: '0.78rem',
            margin: '0.5rem 0 0.75rem',
          }}>{msg.text}</div>
        )}

        {tab === 'leaderboard' && (
          <PredictorLeaderboardTable leagueCode={displayCode} pageSize={25} />
        )}

        {tab === 'admin' && isCreator && admin && (
          <AdminPanel
            admin={admin}
            busy={busy}
            onKick={handleKick}
            onEditCode={() => { setEditing(true); setEditCode('') }}
          />
        )}

        {tab === 'admin' && !isCreator && !adminErr && (
          <div style={{ color: C.muted, fontSize: '0.85rem', padding: '1rem', textAlign: 'center' }}>
            Admin view is only available to the league commissioner.
          </div>
        )}

        {adminErr && (
          <div style={{ color: C.red, fontSize: '0.8rem', marginTop: '0.5rem' }}>
            Admin load failed: {adminErr}
          </div>
        )}
      </main>

      {/* Edit-code modal */}
      {editing && admin && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50,
        }}>
          <div style={{
            backgroundColor: C.card, border: `1px solid ${C.border}`,
            borderRadius: '0.75rem', padding: '1.25rem',
            width: 'min(420px, 92vw)',
          }}>
            <h3 style={{ color: C.gold, fontSize: '1.05rem', fontWeight: 800, margin: '0 0 0.4rem' }}>
              Change Invite Code
            </h3>
            <p style={{ color: C.muted, fontSize: '0.78rem', margin: '0 0 0.75rem', lineHeight: 1.4 }}>
              {admin.league.code_changes_used} of {admin.league.code_change_cap} changes used.
              {' '}You have <strong style={{ color: C.text }}>{admin.league.code_changes_remaining}</strong> remaining.
              Old code redirects to this league for 7 days.
            </p>
            <input
              value={editCode}
              onChange={(e) => setEditCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="Leave blank to auto-generate"
              maxLength={6}
              style={{
                width: '100%', boxSizing: 'border-box',
                backgroundColor: '#091736', border: `1px solid ${C.border}`,
                color: C.text, padding: '0.55rem 0.7rem',
                borderRadius: '0.4rem', fontSize: '0.95rem',
                fontFamily: 'inherit', textTransform: 'uppercase',
                letterSpacing: '0.1em', textAlign: 'center',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => { setEditing(false); setEditCode('') }} style={ghostBtn}>Cancel</button>
              <button onClick={submitCodeChange} disabled={busy || admin.league.code_changes_remaining <= 0} style={primaryBtn(busy || admin.league.code_changes_remaining <= 0)}>
                {busy ? 'Saving…' : 'Change Code'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none',
      color: active ? C.gold : C.muted,
      borderBottom: `2px solid ${active ? C.gold : 'transparent'}`,
      padding: '0.5rem 0.8rem',
      fontSize: '0.8rem', fontWeight: 700,
      cursor: 'pointer', fontFamily: 'inherit',
    }}>{label}</button>
  )
}

function AdminPanel({ admin, busy, onKick, onEditCode }: {
  admin: AdminPayload
  busy: boolean
  onKick: (m: AdminMember) => void
  onEditCode: () => void
}) {
  const { league, members } = admin
  return (
    <div>
      <div style={{
        backgroundColor: C.card, border: `1px solid ${C.border}`,
        borderRadius: '0.75rem', padding: '1rem',
        marginBottom: '1rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ color: C.muted, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Invite Code Changes
          </div>
          <div style={{ color: C.text, fontSize: '1rem', fontWeight: 800, marginTop: '2px' }}>
            {league.code_changes_used} of {league.code_change_cap} used
          </div>
          <div style={{ color: C.muted, fontSize: '0.75rem', marginTop: '2px' }}>
            {league.code_changes_remaining} remaining
          </div>
        </div>
        <button onClick={onEditCode} disabled={league.code_changes_remaining <= 0} style={primaryBtn(league.code_changes_remaining <= 0)}>
          {league.code_changes_remaining <= 0 ? 'Cap reached' : 'Edit invite code'}
        </button>
      </div>

      <h3 style={{ color: C.gold, fontSize: '0.95rem', fontWeight: 800, margin: '0 0 0.4rem' }}>
        Members ({members.length})
      </h3>
      <div style={{
        backgroundColor: C.card, border: `1px solid ${C.border}`,
        borderRadius: '0.6rem', overflow: 'hidden',
      }}>
        {members.length === 0 && (
          <div style={{ color: C.muted, padding: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>
            No members yet — share the invite code.
          </div>
        )}
        {members.map((m) => (
          <div key={(m.profile_id || m.user_id) ?? Math.random()} style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: '0.5rem',
            alignItems: 'center',
            padding: '0.6rem 0.85rem',
            borderBottom: `1px solid ${C.borderSoft}`,
          }}>
            <div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: '0.85rem' }}>
                {m.manager_name || m.first_name || '—'}
                {m.first_name && m.manager_name && <span style={{ color: C.muted, fontWeight: 400, marginLeft: '0.4rem' }}>({m.first_name})</span>}
              </div>
              <div style={{ color: C.muted, fontSize: '0.7rem' }}>
                {m.account_email || '—'}
                {m.joined_at && <span> · joined {new Date(m.joined_at).toLocaleDateString()}</span>}
                {' · '}<span style={{ color: m.total_pts > 0 ? '#00E676' : C.muted }}>{m.total_pts} pts</span>
              </div>
            </div>
            <button onClick={() => onKick(m)} disabled={busy || !m.profile_id} style={{
              background: 'transparent', border: `1px solid ${C.red}55`,
              color: C.red, padding: '0.3rem 0.55rem',
              borderRadius: '0.35rem', fontSize: '0.7rem',
              cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
              opacity: m.profile_id ? 1 : 0.4,
            }} title={m.profile_id ? 'Remove member' : 'Legacy member (no profile)'}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  background: 'transparent', border: `1px solid ${C.border}`,
  color: C.muted, padding: '0.45rem 0.85rem',
  borderRadius: '0.4rem', fontSize: '0.78rem',
  cursor: 'pointer', fontFamily: 'inherit',
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    backgroundColor: disabled ? '#1a2550' : C.gold,
    border: 'none', color: disabled ? C.muted : '#0A0F2E',
    padding: '0.5rem 0.9rem', borderRadius: '0.4rem',
    fontSize: '0.78rem', fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
  }
}
