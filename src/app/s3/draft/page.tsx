'use client'

/**
 * /s3/draft — "My Draft" — Top 250 ranked players, with per-row toggles
 * (Drafted / My Team / Favorite) saved per-profile to s3_draft_picks.
 *
 * Auth-gated: signed-out visitors see a centered sign-in nudge above the
 * shared AuthHeader's Sign In button. Authed visitors see the full table.
 *
 * Layout:
 *   - viewport > 700px  → desktop table (legacy)
 *   - viewport ≤ 700px  → mobile card list
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

/**
 * Position pill style — STANDARDIZED 3-letter format with locked colors.
 * DB stores 'GK' | 'DEF' | 'MID' | 'FWD'; we render 'GK' as 'GKP'.
 *   GKP → red    (#DC2626)
 *   DEF → green  (#15803D)
 *   MID → yellow (#EAB308) — chosen over #A16207 for legibility on dark bg
 *   FWD → teal   (#0891B2)
 */
const POS_PILL: Record<string, { label: string; bg: string; fg: string }> = {
  GK:  { label: 'GKP', bg: '#DC2626', fg: '#fff' },
  GKP: { label: 'GKP', bg: '#DC2626', fg: '#fff' },
  DEF: { label: 'DEF', bg: '#15803D', fg: '#fff' },
  MID: { label: 'MID', bg: '#EAB308', fg: '#0A0F2E' },
  FWD: { label: 'FWD', bg: '#0891B2', fg: '#fff' },
}

function posPill(position: string): { label: string; bg: string; fg: string } {
  return POS_PILL[position] ?? { label: position || '—', bg: '#374151', fg: '#fff' }
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
  const lo = 55
  const hi = 88
  const t = Math.max(0, Math.min(1, (strength - lo) / (hi - lo)))
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
        const ranked = data
          .filter(p => p.t90_rank != null)
          .sort((a, b) => (a.t90_rank ?? 9999) - (b.t90_rank ?? 9999))
          .slice(0, MAX_ROWS)
        setPlayers(ranked)
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

  // ── View filter (All / My Team / Favorited) ─────────────────────────────
  // 2026-06-05: drop the Drafted chip per Hugh; surface My Team + Favorited
  // as clickable filters so a tap re-populates the list with only the
  // matching picks. 'All' is the default.
  const [viewFilter, setViewFilter] = useState<'all' | 'my_team' | 'favorite'>('all')
  const visiblePlayers = useMemo(() => {
    if (viewFilter === 'all') return players
    return players.filter(p => {
      const pick = picks[p.id]
      if (!pick) return false
      return viewFilter === 'my_team' ? !!pick.my_team : !!pick.favorite
    })
  }, [players, picks, viewFilter])

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
      <DraftStyles />
      <AuthHeader />

      {/* Branded page header — horizontal on desktop, stacked on mobile */}
      <header className="draft-page-header">
        {/* Row 1 on mobile: logo + opta badge.
            Desktop: logo cell (left), title cell (middle), opta cell (right). */}
        <div className="dph-logo">
          <img src="/total90-logo-green.png" alt="Total90" style={{ width: 40, height: 40, objectFit: 'contain' }} />
          <span style={{ color: C.gold, fontWeight: 800, letterSpacing: '-0.02em' }}>TOTAL90</span>
        </div>
        <div className="dph-title">
          <h1>Total90 Intelligence — Top 250 Ranked Players</h1>
          <p>Powered by Opta · Last updated: {formatDate(lastSync)}</p>
        </div>
        <div className="dph-opta">
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
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            flexWrap: 'wrap',
          }}>
            <FilterChip
              label="All"
              value={players.length}
              color={C.text}
              active={viewFilter === 'all'}
              onClick={() => setViewFilter('all')}
            />
            <FilterChip
              label="My Team"
              value={counts.my_team}
              color={C.green}
              active={viewFilter === 'my_team'}
              onClick={() => setViewFilter('my_team')}
            />
            <FilterChip
              label="Favorited"
              value={counts.favorite}
              color={C.star}
              active={viewFilter === 'favorite'}
              onClick={() => setViewFilter('favorite')}
            />
            <div style={{ flex: 1, minWidth: 8 }} />
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

        {/* Desktop table — hidden on mobile via CSS */}
        {me && (
          <div className="draft-table-wrap" style={{
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
                  {!loadingPlayers && visiblePlayers.length === 0 && (
                    <tr><td colSpan={11} style={{ padding: '3rem', textAlign: 'center', color: C.muted }}>
                      {viewFilter === 'all'
                        ? 'No ranked players found.'
                        : `No players tagged as ${viewFilter === 'my_team' ? 'My Team' : 'Favorite'} yet.`}
                    </td></tr>
                  )}
                  {!loadingPlayers && visiblePlayers.map(p => {
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

        {/* Mobile cards — hidden on desktop via CSS */}
        {me && (
          <div className="draft-cards" style={{ marginTop: '0.75rem' }}>
            {loadingPlayers && (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', color: C.muted }}>
                Loading top 250…
              </div>
            )}
            {!loadingPlayers && visiblePlayers.length === 0 && (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', color: C.muted }}>
                {viewFilter === 'all'
                  ? 'No ranked players found.'
                  : `No players tagged as ${viewFilter === 'my_team' ? 'My Team' : 'Favorite'} yet.`}
              </div>
            )}
            {!loadingPlayers && visiblePlayers.map(p => {
              const pick = picks[p.id] ?? defaultPick()
              const iso = nationToIso(p.nationality)
              const group = nationGroup(p.nationality)
              const strength = groupStrengthFor(p.nationality)
              return (
                <PlayerCard
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
          </div>
        )}
      </main>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Desktop row
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
            referrerPolicy="no-referrer"
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
        <PosPill position={player.position} />
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
// Mobile card
// ─────────────────────────────────────────────────────────────────────────

function PlayerCard({ player, pick, iso, group, strength, onToggle }: {
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

  const xi = player.starting_xi
  const xiColor = xi && XI_COLORS[xi] ? XI_COLORS[xi] : null
  const strengthColor = groupStrengthColor(strength)

  const cardStyle: React.CSSProperties = {
    background: myTeamTint ? 'rgba(21,128,61,0.14)' : C.card,
    border: `1px solid ${C.border}`,
    borderLeft: myTeamTint ? `4px solid ${C.green}` : `1px solid ${C.border}`,
    borderRadius: 12,
    padding: '0.85rem 0.9rem',
    marginBottom: '0.6rem',
    opacity: draftedDim ? 0.35 : 1,
    transition: 'opacity 0.15s, background 0.15s',
  }

  const nameStyle: React.CSSProperties = {
    fontWeight: 800, color: C.text, fontSize: '0.98rem',
    textDecoration: draftedDim ? 'line-through' : 'none',
    lineHeight: 1.2,
  }

  // 2026-06-05 layout: photo+name on the left, vertical toggle column on the right.
  // Saves ~80px per card vs the old horizontal toggle row. Drafted toggle removed
  // per Hugh — keeping just My Team + Favorite.
  return (
    <div className="draft-card" style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: '0.7rem' }}>
        {/* LEFT: photo + name + flag/club + metrics + pos pill */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            {player.photo_url ? (
              <img
                src={player.photo_url}
                alt={player.name}
                width={44}
                height={44}
                referrerPolicy="no-referrer"
                style={{ borderRadius: '50%', objectFit: 'cover', display: 'block', flexShrink: 0 }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: C.border, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: C.muted, fontSize: 16, fontWeight: 700, flexShrink: 0,
              }}>{player.name?.[0] ?? '?'}</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={nameStyle}>
                {favorite && <span style={{ color: C.star, marginRight: 4 }}>★</span>}
                {player.name}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                marginTop: 3, color: C.muted, fontSize: 12,
              }}>
                {iso ? (
                  <span className={`fi fi-${iso}`} style={{ width: 24, height: 18, borderRadius: 2, boxShadow: '0 0 0 1px rgba(0,0,0,0.3)', flexShrink: 0 }} />
                ) : (
                  <span style={{ width: 24, height: 18, background: C.border, borderRadius: 2, display: 'inline-block', textAlign: 'center', fontSize: 10, color: C.muted, lineHeight: '18px', flexShrink: 0 }}>?</span>
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {player.club ?? player.nationality}
                </span>
              </div>
            </div>
          </div>

          {/* Metrics row */}
          <div style={{
            marginTop: '0.55rem', fontSize: 12, color: C.muted,
            display: 'flex', flexWrap: 'wrap', gap: '0.35rem',
            alignItems: 'center',
          }}>
        <span style={{ color: C.gold, fontWeight: 700 }}>#{player.t90_rank}</span>
        <span style={{ color: C.border }}>·</span>
        <span style={{ color: C.text, fontWeight: 700 }}>
          T90 {player.t90_score != null ? Number(player.t90_score).toFixed(1) : '—'}
        </span>
        {xiColor && (
          <>
            <span style={{ color: C.border }}>·</span>
            <span title={xiColor.label}>
              XI <span style={{ color: xiColor.bg, fontWeight: 700 }}>{xi}</span>
            </span>
          </>
        )}
        {strength != null && (
          <>
            <span style={{ color: C.border }}>·</span>
            <span>
              GS <span style={{ color: strengthColor, fontWeight: 700 }}>{strength.toFixed(1)}</span>
              {group && <span style={{ color: C.muted }}> ({group})</span>}
            </span>
          </>
        )}
          </div>
        </div>

        {/* RIGHT: pos pill + vertical toggle column (saves vertical space) */}
        <div style={{
          flexShrink: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between',
          paddingLeft: '0.5rem', borderLeft: `1px solid ${C.border}`,
        }}>
          <PosPill position={player.position} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center' }}>
            <ToggleWithLabel
              on={pick.my_team}
              label="My Team"
              onColor={C.green}
              onClick={() => onToggle(player.id, 'my_team')}
            />
            <ToggleWithLabel
              on={pick.favorite}
              label="Favorite"
              onColor={C.star}
              onClick={() => onToggle(player.id, 'favorite')}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Shared pill + toggles
// ─────────────────────────────────────────────────────────────────────────

function PosPill({ position }: { position: string }) {
  const pp = posPill(position)
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px',
      borderRadius: 4, fontSize: 11, fontWeight: 800,
      background: pp.bg, color: pp.fg,
      letterSpacing: '0.04em',
      minWidth: 36, textAlign: 'center',
    }}>{pp.label}</span>
  )
}

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

function ToggleWithLabel({ on, label, onColor, onClick }: {
  on: boolean
  label: string
  onColor: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`${label}: ${on ? 'on' : 'off'}`}
      className="draft-toggle-mobile"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'transparent', border: 'none',
        cursor: 'pointer', padding: '0.25rem 0.35rem',
        color: on ? onColor : C.muted,
        fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
        letterSpacing: '0.01em',
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        border: `2px ${on ? 'solid' : 'dashed'} ${on ? onColor : '#3A4F7E'}`,
        background: on ? onColor : 'transparent',
        display: 'inline-block',
        transition: 'background 0.12s, border 0.12s',
      }} />
      <span>{label}</span>
    </button>
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

// Same look as CounterChip but clickable + supports an active (selected) state.
// Used for the All / My Team / Favorited filter row added 2026-06-05.
function FilterChip({ label, value, color, active, onClick }: {
  label: string
  value: number
  color: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '0.4rem 0.75rem', borderRadius: 999,
        background: active ? color : C.card,
        border: `1px solid ${active ? color : C.border}`,
        fontSize: '0.8rem',
        color: active ? '#0A0F2E' : C.muted,
        fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit',
        transition: 'background 0.12s, border 0.12s, color 0.12s',
      }}
    >
      <span style={{ color: active ? '#0A0F2E' : color, fontWeight: 800 }}>{value}</span>
      <span>{label}</span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Styles — desktop/mobile layout + print
// ─────────────────────────────────────────────────────────────────────────

function DraftStyles() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      /* Header layout — desktop default (3 columns). */
      .draft-page-header {
        max-width: 1280px; margin: 0 auto; padding: 1.5rem 1.25rem 1rem;
        display: grid; grid-template-columns: 1fr auto 1fr;
        align-items: center; gap: 1rem;
      }
      .draft-page-header .dph-logo {
        display: flex; align-items: center; gap: 0.6rem;
      }
      .draft-page-header .dph-title { text-align: center; }
      .draft-page-header .dph-title h1 {
        margin: 0; font-size: clamp(1.1rem, 2.6vw, 1.65rem);
        font-weight: 900; letter-spacing: -0.02em; color: #F0F4FF;
      }
      .draft-page-header .dph-title p {
        margin: 0.25rem 0 0; color: #8899CC; font-size: 0.78rem;
      }
      .draft-page-header .dph-opta { justify-self: end; }

      /* Mobile cards hidden on desktop; desktop table hidden on mobile. */
      .draft-cards { display: none; }
      .draft-table-wrap { display: block; }

      @media (max-width: 700px) {
        /* Stack header: Row 1 = logo + opta, Row 2 = title, Row 3 = sub. */
        .draft-page-header {
          grid-template-columns: 1fr auto;
          grid-template-areas:
            "logo opta"
            "title title";
          row-gap: 0.85rem;
          padding: 1rem 1rem 0.75rem;
        }
        .draft-page-header .dph-logo  { grid-area: logo; justify-self: start; }
        .draft-page-header .dph-opta  { grid-area: opta; justify-self: end; }
        .draft-page-header .dph-title { grid-area: title; }
        .draft-page-header .dph-title h1 {
          font-size: 1.15rem;
          line-height: 1.25;
        }
        .draft-page-header .dph-title p { font-size: 0.72rem; }

        /* Swap table for cards. */
        .draft-table-wrap { display: none; }
        .draft-cards { display: block; }

        /* Hide the site-wide Fantasy App floating CTA on /s3/draft (mobile). */
        #floating-fantasy-cta { display: none !important; }
        #app-launch-banner   { display: none !important; }
      }

      /* Always hide the floating CTA + top app banner on this page — desktop too.
         (Spec 2026-06-05: draft-tools visitors already have the app, don't pitch them.) */
      #floating-fantasy-cta { display: none !important; }
      #app-launch-banner   { display: none !important; }

      @media print {
        @page { size: landscape; margin: 0.4in; }
        body { background: white !important; color: #111 !important; }
        .draft-toolbar { display: none !important; }
        .draft-cards { display: none !important; }
        .draft-table-wrap { display: block !important; }
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
        .draft-toggle, .draft-toggle-mobile {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .draft-row[style*="opacity: 0.42"] {
          opacity: 1 !important;
        }
      }
    ` }} />
  )
}
