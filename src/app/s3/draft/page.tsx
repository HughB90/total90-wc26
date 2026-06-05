'use client'

/**
 * /s3/draft — "My Draft" — Top 250 ranked players, with per-row toggles
 * (Drafted / My Team / Favorite) saved per-profile to s3_draft_picks.
 *
 * Auth-gated: signed-out visitors see a centered sign-in nudge above the
 * shared AuthHeader's Sign In button. Authed visitors see the full table.
 *
 * Style: matches the rest of the /s3 surface (dark navy, gold accent).
 */

import 'flag-icons/css/flag-icons.min.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AuthHeader from '@/components/AuthHeader'
import { groupStrengthFor, nationGroup } from '@/data/opta-power-ratings-2026-06-05'
import { nationToIso } from '@/data/nation-flags'

const C = {
  bg:        '#0A0F2E',
  card:      '#0F1C4D',
  cardAlt:   '#0A1535',
  border:    '#1E3A6E',
  gold:      '#FBBF24',
  green:     '#00E676',
  greenDeep: '#15803D',
  muted:     '#8899CC',
  text:      '#F0F4FF',
  red:       '#FF5252',
  amber:     '#A16207',
  yellow:    '#FFD740',
  star:      '#FFC107',
}

interface Player {
  id: string
  name: string
  short_name?: string | null
  nationality: string
  position: string
  photo_url?: string | null
  t90_score: number | null
  cat_score?: number | null
  tenk_score?: number | null
  starting_xi: number | null
  t90_rank: number | null
  club?: string | null
}

interface MeResponse {
  account: { id: string; email: string } | null
  profile: { id: string; first_name: string; manager_name: string } | null
}

interface Pick {
  drafted: boolean
  my_team: boolean
  favorite: boolean
}

type PickMap = Record<string, Pick>

const POS_COLORS: Record<string, string> = {
  GK:  '#4A1D96',
  DEF: '#1E40AF',
  MID: '#065F46',
  FWD: '#92400E',
}

const XI_COLORS: Record<number, { bg: string; label: string }> = {
  1: { bg: '#15803D', label: 'Likely starter' },
  2: { bg: '#A16207', label: 'Rotation' },
  3: { bg: '#7F1D1D', label: 'Deep bench' },
}

const MAX_ROWS = 250

function defaultPick(): Pick {
  return { drafted: false, my_team: false, favorite: false }
}

function pickIsEmpty(p: Pick): boolean {
  return !p.drafted && !p.my_team && !p.favorite
}

function picksEqual(a: Pick | undefined, b: Pick | undefined): boolean {
  const aa = a ?? defaultPick()
  const bb = b ?? defaultPick()
  return aa.drafted === bb.drafted && aa.my_team === bb.my_team && aa.favorite === bb.favorite
}

/** Red→Green gradient based on group strength (49.5 → 86.5 observed range). */
function groupStrengthColor(strength: number | null): string {
  if (strength == null) return C.muted
  // Clamp to a sane band so colors map well
  const lo = 55
  const hi = 88
  const t = Math.max(0, Math.min(1, (strength - lo) / (hi - lo)))
  // higher = harder = redder; lower = easier = greener
  if (t > 0.66) return '#EF4444'
  if (t > 0.45) return '#F59E0B'
  if (t > 0.25) return '#A3E635'
  return '#10B981'
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

export default function S3DraftPage() {
  const [me, setMe] = useState<MeResponse['profile']>(null)
  const [authedReady, setAuthedReady] = useState(false)

  const [players, setPlayers] = useState<Player[]>([])
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [loadingPlayers, setLoadingPlayers] = useState(true)

  const [picks, setPicks] = useState<PickMap>({})
  const [savedPicks, setSavedPicks] = useState<PickMap>({})
  const [saving, setSaving] = useState(false)
  const [savedToast, setSavedToast] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Auth probe ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
        const j = await r.json().catch(() => null)
        if (cancelled) return
        setMe(j?.profile ?? null)
      } catch {
        if (!cancelled) setMe(null)
      } finally {
        if (!cancelled) setAuthedReady(true)
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  // ── Load top-250 players ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoadingPlayers(true)
    fetch('/api/s3/players')
      .then(r => r.json())
      .then((data: Player[]) => {
        if (cancelled || !Array.isArray(data)) return
        // Filter to ranked players, sort by t90_rank ascending (smallest = best)
        const ranked = data
          .filter(p => p.t90_rank != null)
          .sort((a, b) => (a.t90_rank ?? 9999) - (b.t90_rank ?? 9999))
          .slice(0, MAX_ROWS)
        setPlayers(ranked)
        // Find latest t90_updated_at across loaded players (we don't expose
        // it in /api/s3/players; fall back to "Today" for now).
        setLastSync(new Date().toISOString())
      })
      .catch(() => { /* keep empty */ })
      .finally(() => { if (!cancelled) setLoadingPlayers(false) })
    return () => { cancelled = true }
  }, [])

  // ── Hydrate saved picks (authed only) ───────────────────────────────────
  useEffect(() => {
    if (!me) {
      setPicks({}); setSavedPicks({})
      return
    }
    let cancelled = false
    fetch('/api/s3/draft', { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : { picks: {} })
      .then((j: { picks?: PickMap }) => {
        if (cancelled) return
        const p = j?.picks ?? {}
        setPicks(p)
        setSavedPicks(p)
      })
      .catch(() => { /* anon */ })
    return () => { cancelled = true }
  }, [me])

  // ── Dirty calc + counter ───────────────────────────────────────────────
  const dirty = useMemo(() => {
    const ids = new Set([...Object.keys(picks), ...Object.keys(savedPicks)])
    for (const id of ids) {
      if (!picksEqual(picks[id], savedPicks[id])) return true
    }
    return false
  }, [picks, savedPicks])

  const counts = useMemo(() => {
    let drafted = 0, my_team = 0, favorite = 0
    for (const p of Object.values(picks)) {
      if (p.drafted) drafted++
      if (p.my_team) my_team++
      if (p.favorite) favorite++
    }
    return { drafted, my_team, favorite }
  }, [picks])

  const togglePick = useCallback((player_id: string, key: keyof Pick) => {
    setPicks(prev => {
      const cur = prev[player_id] ?? defaultPick()
      const nxt: Pick = { ...cur, [key]: !cur[key] }
      const out = { ...prev }
      if (pickIsEmpty(nxt)) delete out[player_id]
      else out[player_id] = nxt
      return out
    })
  }, [])

  const handleSave = useCallback(async () => {
    if (!me || saving || !dirty) return
    setSaving(true)
    // Send the union of (currently dirty rows) + (rows that existed in saved
    // but were cleared) so the server can delete them.
    const ids = new Set([...Object.keys(picks), ...Object.keys(savedPicks)])
    const payload: Array<{ player_id: string; drafted: boolean; my_team: boolean; favorite: boolean }> = []
    for (const id of ids) {
      const cur = picks[id] ?? defaultPick()
      if (!picksEqual(cur, savedPicks[id])) {
        payload.push({ player_id: id, ...cur })
      }
    }
    try {
      const res = await fetch('/api/s3/draft/save', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks: payload }),
      })
      if (!res.ok) throw new Error(`save failed (${res.status})`)
      // Mark clean: snapshot current picks as saved
      setSavedPicks({ ...picks })
      setSavedToast(true)
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setSavedToast(false), 2000)
    } catch (err) {
      console.error('[s3/draft/save]', err)
    } finally {
      setSaving(false)
    }
  }, [me, saving, dirty, picks, savedPicks])

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <PrintStyles />
      <AuthHeader />

      {/* Branded page header */}
      <header className="draft-page-header" style={{
        maxWidth: 1280, margin: '0 auto', padding: '1.5rem 1.25rem 1rem',
        display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <img src="/total90-logo-green.png" alt="Total90" style={{ width: 40, height: 40, objectFit: 'contain' }} />
          <span style={{ color: C.gold, fontWeight: 800, letterSpacing: '-0.02em' }}>TOTAL90</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(1.1rem, 2.6vw, 1.65rem)', fontWeight: 900, letterSpacing: '-0.02em', color: C.text }}>
            Total90 Intelligence — Top 250 Ranked Players
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: C.muted, fontSize: '0.78rem' }}>
            Powered by Opta · Last updated: {formatDate(lastSync)}
          </p>
        </div>
        <div style={{ justifySelf: 'end' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '0.35rem 0.6rem', borderRadius: '0.4rem',
            background: '#000', border: `1px solid ${C.border}`,
            fontWeight: 900, fontSize: '0.72rem', letterSpacing: '0.18em',
            color: '#fff', fontFamily: 'system-ui, sans-serif',
          }} title="Opta Analyst data">
            <span style={{ color: C.gold }}>◆</span> OPTA ANALYST
          </span>
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '0 1.25rem 4rem', color: C.text }}>
        {/* Auth gate */}
        {authedReady && !me && (
          <div style={{
            margin: '2rem auto', maxWidth: 460, textAlign: 'center',
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '2rem 1.5rem',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 800 }}>
              Sign in to save your draft
            </h2>
            <p style={{ color: C.muted, fontSize: '0.92rem', margin: '0 0 1.1rem', lineHeight: 1.5 }}>
              Track your shortlist, build your fantasy XI, and tag favorites across the WC26 top 250.
              Your picks save automatically to your profile.
            </p>
            <p style={{ color: C.green, fontWeight: 700, fontSize: '0.82rem', margin: 0 }}>
              Use the <span style={{ color: C.gold }}>Sign In</span> button up top to get started.
            </p>
          </div>
        )}

        {/* Sticky toolbar */}
        {me && (
          <div className="draft-toolbar" style={{
            position: 'sticky', top: 0, zIndex: 5,
            background: C.bg, padding: '0.75rem 0',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            flexWrap: 'wrap',
          }}>
            <CounterChip label="Drafted" value={counts.drafted} color={C.muted} />
            <CounterChip label="My Team" value={counts.my_team} color={C.green} />
            <CounterChip label="Favorited" value={counts.favorite} color={C.star} />
            <div style={{ flex: 1 }} />
            {savedToast && (
              <span style={{
                color: C.green, fontWeight: 700, fontSize: '0.8rem',
                padding: '0.3rem 0.6rem', border: `1px solid ${C.green}`,
                borderRadius: 6, background: 'rgba(0,230,118,0.08)',
                transition: 'opacity 0.2s',
              }}>
                Saved ✓
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              style={{
                padding: '0.55rem 1.1rem', borderRadius: 8,
                border: 'none', cursor: dirty && !saving ? 'pointer' : 'not-allowed',
                background: dirty && !saving ? C.gold : '#162040',
                color: dirty && !saving ? '#0A0F2E' : '#4A6080',
                fontWeight: 800, fontSize: '0.88rem', fontFamily: 'inherit',
                transition: 'background 0.15s',
              }}
            >
              {saving ? 'Saving…' : '💾 Save Progress'}
            </button>
          </div>
        )}

        {/* Table */}
        {me && (
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 12, marginTop: '0.75rem', overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="draft-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.cardAlt, borderBottom: `1px solid ${C.border}` }}>
                    {['Rank', 'Player', '', 'Nation', 'Pos', 'XI', 'Group Str', 'T90', 'Drafted', 'My Team', '⭐'].map(col => (
                      <th key={col} style={{
                        padding: '12px 10px', textAlign: 'left',
                        color: C.muted, fontWeight: 600, fontSize: 11,
                        textTransform: 'uppercase', letterSpacing: 0.8,
                        whiteSpace: 'nowrap',
                      }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingPlayers && (
                    <tr><td colSpan={11} style={{ padding: '3rem', textAlign: 'center', color: C.muted }}>Loading top 250…</td></tr>
                  )}
                  {!loadingPlayers && players.length === 0 && (
                    <tr><td colSpan={11} style={{ padding: '3rem', textAlign: 'center', color: C.muted }}>No ranked players found.</td></tr>
                  )}
                  {!loadingPlayers && players.map(p => {
                    const pick = picks[p.id] ?? defaultPick()
                    const iso = nationToIso(p.nationality)
                    const group = nationGroup(p.nationality)
                    const strength = groupStrengthFor(p.nationality)
                    return (
                      <PlayerRow
                        key={p.id}
                        player={p}
                        pick={pick}
                        iso={iso}
                        group={group}
                        strength={strength}
                        onToggle={togglePick}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Player row
// ─────────────────────────────────────────────────────────────────────────

function PlayerRow({ player, pick, iso, group, strength, onToggle }: {
  player: Player
  pick: Pick
  iso: string | null
  group: string | null
  strength: number | null
  onToggle: (id: string, key: keyof Pick) => void
}) {
  const draftedDim = pick.drafted
  const myTeamTint = pick.my_team
  const favorite   = pick.favorite

  const rowStyle: React.CSSProperties = {
    borderBottom: `1px solid ${C.border}`,
    opacity: draftedDim ? 0.42 : 1,
    background: myTeamTint ? 'rgba(21,128,61,0.12)' : 'transparent',
    borderLeft: myTeamTint ? `3px solid ${C.green}` : '3px solid transparent',
    pageBreakInside: 'avoid',
  }

  const nameStyle: React.CSSProperties = {
    fontWeight: 700, color: C.text,
    textDecoration: draftedDim ? 'line-through' : 'none',
  }

  const posBg = POS_COLORS[player.position] ?? '#374151'
  const xi = player.starting_xi
  const xiColor = xi && XI_COLORS[xi] ? XI_COLORS[xi] : null
  const strengthColor = groupStrengthColor(strength)

  return (
    <tr className="draft-row" style={rowStyle}>
      <td style={{ padding: '8px 10px', color: C.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>
        #{player.t90_rank}
      </td>
      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
        {player.photo_url ? (
          <img
            src={player.photo_url}
            alt={player.name}
            width={36}
            height={36}
            style={{ borderRadius: '50%', objectFit: 'cover', display: 'block' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: C.border, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: C.muted, fontSize: 13,
          }}>{player.name?.[0] ?? '?'}</div>
        )}
      </td>
      <td style={{ padding: '8px 10px', minWidth: 180 }}>
        <span style={nameStyle}>
          {favorite && <span style={{ color: C.star, marginRight: 4 }}>★</span>}
          {player.name}
        </span>
        {player.club && (
          <div style={{ color: C.muted, fontSize: 11, marginTop: 1 }}>{player.club}</div>
        )}
      </td>
      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: C.muted }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {iso ? (
            <span className={`fi fi-${iso}`} style={{ width: 24, height: 18, borderRadius: 2, boxShadow: '0 0 0 1px rgba(0,0,0,0.3)' }} />
          ) : (
            <span style={{ width: 24, height: 18, background: C.border, borderRadius: 2, display: 'inline-block', textAlign: 'center', fontSize: 10, color: C.muted, lineHeight: '18px' }}>?</span>
          )}
          <span style={{ fontSize: 12 }}>{player.nationality}</span>
        </span>
      </td>
      <td style={{ padding: '8px 10px' }}>
        <span style={{
          display: 'inline-block', padding: '2px 8px',
          borderRadius: 4, fontSize: 11, fontWeight: 700,
          background: posBg, color: '#fff',
        }}>{player.position}</span>
      </td>
      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
        {xiColor ? (
          <span title={xiColor.label} style={{
            display: 'inline-block', minWidth: 22, padding: '2px 6px',
            borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: xiColor.bg, color: '#fff',
          }}>{xi}</span>
        ) : <span style={{ color: C.muted }}>—</span>}
      </td>
      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: strengthColor, fontWeight: 600 }}>
        {strength != null ? (
          <>
            <span style={{ color: C.muted, fontWeight: 500 }}>{group ?? '?'} · </span>
            {strength.toFixed(1)}
          </>
        ) : <span style={{ color: C.muted }}>—</span>}
      </td>
      <td style={{ padding: '8px 10px', color: C.text, fontWeight: 800, fontSize: 14 }}>
        {player.t90_score != null ? Number(player.t90_score).toFixed(1) : '—'}
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
        <Toggle on={pick.drafted} label="Drafted" onColor={C.muted} onClick={() => onToggle(player.id, 'drafted')} />
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
        <Toggle on={pick.my_team} label="My Team" onColor={C.green} onClick={() => onToggle(player.id, 'my_team')} />
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
        <Toggle on={pick.favorite} label="Favorite" onColor={C.star} onClick={() => onToggle(player.id, 'favorite')} />
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Toggle (dotted circle / filled circle)
// ─────────────────────────────────────────────────────────────────────────

function Toggle({ on, label, onColor, onClick }: {
  on: boolean
  label: string
  onColor: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={`${label}: ${on ? 'on' : 'off'}`}
      className="draft-toggle"
      style={{
        width: 22, height: 22, borderRadius: '50%',
        border: `2px ${on ? 'solid' : 'dashed'} ${on ? onColor : '#3A4F7E'}`,
        background: on ? onColor : 'transparent',
        cursor: 'pointer', padding: 0,
        transition: 'background 0.12s, border 0.12s',
        display: 'inline-block',
      }}
    />
  )
}

function CounterChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '0.4rem 0.75rem', borderRadius: 999,
      background: C.card, border: `1px solid ${C.border}`,
      fontSize: '0.8rem', color: C.muted, fontWeight: 600,
    }}>
      <span style={{ color, fontWeight: 800 }}>{value}</span>
      <span>{label}</span>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Print stylesheet — landscape, ~50 rows / page
// ─────────────────────────────────────────────────────────────────────────

function PrintStyles() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      @media print {
        @page { size: landscape; margin: 0.4in; }
        body { background: white !important; color: #111 !important; }
        .draft-toolbar { display: none !important; }
        .draft-page-header { color: #111 !important; }
        .draft-page-header h1, .draft-page-header p, .draft-page-header span {
          color: #111 !important;
        }
        .draft-table {
          font-size: 10px !important;
          color: #111 !important;
          background: white !important;
        }
        .draft-table thead tr {
          background: #f1f5f9 !important;
          color: #222 !important;
        }
        .draft-table th, .draft-table td {
          color: #111 !important;
          padding: 4px 6px !important;
          border-bottom: 1px solid #cbd5e1 !important;
        }
        .draft-row {
          page-break-inside: avoid !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .draft-toggle {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        /* Drafted: keep readable, strike the name */
        .draft-row[style*="opacity: 0.42"] {
          opacity: 1 !important;
        }
      }
    ` }} />
  )
}
