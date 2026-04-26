'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────

const WC_GROUPS: Record<string, string[]> = {
  A: ['Mexico', 'South Korea', 'South Africa', 'UEFA Playoff D'],
  B: ['Canada', 'Switzerland', 'Qatar', 'UEFA Playoff A'],
  C: ['Brazil', 'Morocco', 'Scotland', 'Haiti'],
  D: ['USA', 'Australia', 'Paraguay', 'UEFA Playoff D'],
  E: ['Germany', 'Ecuador', 'Ivory Coast', 'Curacao'],
  F: ['Netherlands', 'Japan', 'Tunisia', 'UEFA Playoff B'],
  G: ['Belgium', 'Iran', 'Egypt', 'New Zealand'],
  H: ['Spain', 'Uruguay', 'Saudi Arabia', 'Cape Verde'],
  I: ['France', 'Senegal', 'Norway', 'FIFA Playoff 2'],
  J: ['Argentina', 'Austria', 'Algeria', 'Jordan'],
  K: ['Portugal', 'Colombia', 'Uzbekistan', 'FIFA Playoff 1'],
  L: ['England', 'Croatia', 'Panama', 'Ghana'],
}

const GROUP_LETTERS = Object.keys(WC_GROUPS)

const COUNTRY_CODES: Record<string, string> = {
  England: 'gb-eng', France: 'fr', Spain: 'es', Germany: 'de',
  Brazil: 'br', Argentina: 'ar', Portugal: 'pt', Netherlands: 'nl',
  Belgium: 'be', Italy: 'it', Morocco: 'ma', USA: 'us',
  Mexico: 'mx', Japan: 'jp', Colombia: 'co', Uruguay: 'uy',
  Croatia: 'hr', Senegal: 'sn', Canada: 'ca', Switzerland: 'ch',
  Ecuador: 'ec', 'South Korea': 'kr', Serbia: 'rs', Australia: 'au',
  Poland: 'pl', Czechia: 'cz', Slovakia: 'sk', 'Saudi Arabia': 'sa',
  Paraguay: 'py', Algeria: 'dz', 'New Zealand': 'nz', Venezuela: 've',
  Bolivia: 'bo', Jamaica: 'jm', Bahrain: 'bh', 'Costa Rica': 'cr',
  Panama: 'pa', Ghana: 'gh', Haiti: 'ht', Turkey: 'tr',
  Egypt: 'eg', Oman: 'om', 'Ivory Coast': 'ci', Jordan: 'jo',
  Honduras: 'hn', Chile: 'cl', Peru: 'pe',
}

function flagUrl(country: string) {
  const code = COUNTRY_CODES[country] ?? country.toLowerCase().replace(/\s+/g, '-')
  return `https://flagcdn.com/w40/${code}.png`
}

// R32 bracket: 16 matchups covering 12×1st + 12×2nd + 8×Best3rd = 32 teams
const R32_MATCHUPS: { id: string; s1: string; s2: string }[] = [
  { id: 'M1',  s1: '1st · Group A', s2: 'Best 3rd Qualifier #1' },
  { id: 'M2',  s1: '1st · Group B', s2: '2nd · Group A' },
  { id: 'M3',  s1: '1st · Group C', s2: '2nd · Group B' },
  { id: 'M4',  s1: '2nd · Group C', s2: 'Best 3rd Qualifier #2' },
  { id: 'M5',  s1: '1st · Group D', s2: 'Best 3rd Qualifier #3' },
  { id: 'M6',  s1: '1st · Group E', s2: '2nd · Group D' },
  { id: 'M7',  s1: '1st · Group F', s2: '2nd · Group E' },
  { id: 'M8',  s1: '2nd · Group F', s2: 'Best 3rd Qualifier #4' },
  { id: 'M9',  s1: '1st · Group G', s2: 'Best 3rd Qualifier #5' },
  { id: 'M10', s1: '1st · Group H', s2: '2nd · Group G' },
  { id: 'M11', s1: '1st · Group I', s2: '2nd · Group H' },
  { id: 'M12', s1: '2nd · Group I', s2: 'Best 3rd Qualifier #6' },
  { id: 'M13', s1: '1st · Group J', s2: 'Best 3rd Qualifier #7' },
  { id: 'M14', s1: '1st · Group K', s2: '2nd · Group J' },
  { id: 'M15', s1: '1st · Group L', s2: '2nd · Group K' },
  { id: 'M16', s1: '2nd · Group L', s2: 'Best 3rd Qualifier #8' },
]

// R16: pairs of R32 winners
const R16_PAIRS: [string, string][] = [
  ['M1', 'M2'], ['M3', 'M4'],
  ['M5', 'M6'], ['M7', 'M8'],
  ['M9', 'M10'], ['M11', 'M12'],
  ['M13', 'M14'], ['M15', 'M16'],
]

const R16_IDS = R16_PAIRS.map((_, i) => `R16_${i + 1}`)

// QF: pairs of R16 winners
const QF_PAIRS: [string, string][] = [
  ['R16_1', 'R16_2'], ['R16_3', 'R16_4'],
  ['R16_5', 'R16_6'], ['R16_7', 'R16_8'],
]
const QF_IDS = QF_PAIRS.map((_, i) => `QF_${i + 1}`)

// SF: pairs of QF winners
const SF_PAIRS: [string, string][] = [['QF_1', 'QF_2'], ['QF_3', 'QF_4']]
const SF_IDS = ['SF_1', 'SF_2']

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupPicks = Record<string, string[]>   // group → [1st, 2nd, 3rd, (4th auto)]
type ThirdPicks = string[]                    // checked group letters (max 8)
type KnockoutPicks = Record<string, string>  // matchId → chosen team label

type LeaderboardRow = { rank: number; userId: string; displayName: string; score: number }
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ─── Colour tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  gold: '#FBBF24',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
  green: '#00E676',
  text: '#F0F4FF',
  muted: '#8899CC',
}

// ─── Rank pill ────────────────────────────────────────────────────────────────
function RankPill({ rank }: { rank: number }) {
  const labels = ['1st', '2nd', '3rd']
  const colors = [C.gold, C.silver, C.bronze]
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: '999px',
      backgroundColor: colors[rank - 1], color: '#0A0F2E', marginLeft: '6px',
      display: 'inline-block',
    }}>{labels[rank - 1]}</span>
  )
}

// ─── Save button ──────────────────────────────────────────────────────────────
function SaveButton({ status, onClick }: { status: SaveStatus; onClick: () => void }) {
  const label = status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : status === 'error' ? 'Error — Retry' : 'Save Picks'
  const bg = status === 'saved' ? C.green : status === 'error' ? '#ef4444' : C.gold
  return (
    <button
      onClick={onClick}
      disabled={status === 'saving'}
      style={{
        marginTop: '1.25rem', backgroundColor: bg, color: '#0A0F2E', fontWeight: 700,
        fontSize: '0.875rem', padding: '0.6rem 1.5rem', borderRadius: '0.75rem',
        border: 'none', cursor: status === 'saving' ? 'not-allowed' : 'pointer', display: 'block',
      }}
    >{label}</button>
  )
}

// ─── Auth form ────────────────────────────────────────────────────────────────
function AuthForm({ onAuth }: { onAuth: (id: string, name: string) => void }) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pin, setPin] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !displayName || !pin) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/bracket/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, display_name: displayName, pin, invite_code: inviteCode || undefined }),
      })
      const data = await res.json() as { ok?: boolean; userId?: string; displayName?: string; error?: string }
      if (!data.ok) { setError(data.error ?? 'Authentication failed'); return }
      localStorage.setItem('bracket_user_id', data.userId!)
      localStorage.setItem('bracket_display_name', data.displayName!)
      onAuth(data.userId!, data.displayName!)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', backgroundColor: C.card, border: `1px solid ${C.border}`,
    borderRadius: '0.75rem', padding: '0.65rem 1rem', color: C.text,
    fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '1.25rem', padding: '2rem', width: '100%', maxWidth: '400px' }}>
        <h1 style={{ color: C.gold, fontWeight: 800, fontSize: '1.5rem', margin: '0 0 0.25rem', textAlign: 'center' }}>
          🏆 Bracket Challenge
        </h1>
        <p style={{ color: C.muted, fontSize: '0.85rem', textAlign: 'center', margin: '0 0 1.5rem' }}>
          Sign in or create an account with your 4-digit PIN
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ color: C.muted, fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required style={inputStyle} />
          </div>
          <div>
            <label style={{ color: C.muted, fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Display Name</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="GoatFC" required style={inputStyle} />
          </div>
          <div>
            <label style={{ color: C.muted, fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>4-Digit PIN</label>
            <input
              type="password" inputMode="numeric" pattern="\d{4}" maxLength={4}
              value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••" required style={inputStyle}
            />
          </div>
          <div>
            <label style={{ color: C.muted, fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Invite Code (optional)</label>
            <input
              type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
              placeholder="ABC123" style={inputStyle} maxLength={6}
            />
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: 0 }}>{error}</p>}

          <button
            type="submit" disabled={loading}
            style={{
              marginTop: '0.5rem', backgroundColor: C.gold, color: '#0A0F2E',
              fontWeight: 700, fontSize: '0.9rem', padding: '0.7rem',
              borderRadius: '0.75rem', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Entering…' : 'Enter Bracket'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Group Stage Tab ──────────────────────────────────────────────────────────
function GroupStageTab({ userId, savedPicks }: { userId: string; savedPicks: GroupPicks }) {
  const [picks, setPicks] = useState<GroupPicks>(savedPicks)
  const [status, setStatus] = useState<SaveStatus>('idle')

  useEffect(() => { setPicks(savedPicks) }, [savedPicks])

  function handleTeamClick(group: string, team: string) {
    setPicks(prev => {
      const current = prev[group] ?? []
      const idx = current.indexOf(team)
      if (idx >= 0) {
        return { ...prev, [group]: current.filter(t => t !== team) }
      }
      if (current.length < 3) {
        return { ...prev, [group]: [...current, team] }
      }
      return prev
    })
    setStatus('idle')
  }

  async function handleSave() {
    setStatus('saving')
    try {
      const res = await fetch('/api/bracket/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, phase: 'group', picks }),
      })
      const data = await res.json() as { ok?: boolean }
      setStatus(data.ok ? 'saved' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div>
      <p style={{ color: C.muted, fontSize: '0.8rem', marginBottom: '1rem' }}>
        Click teams to rank them: 1st → 2nd → 3rd (4th is auto). Click a ranked team to deselect.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {GROUP_LETTERS.map(group => {
          const teams = WC_GROUPS[group]
          const ranked = picks[group] ?? []
          const auto4th = teams.find(t => !ranked.includes(t))

          return (
            <div key={group} style={{
              backgroundColor: C.card, border: `1px solid ${C.border}`,
              borderRadius: '1rem', padding: '1rem',
            }}>
              <h3 style={{ color: C.gold, fontWeight: 800, fontSize: '1rem', margin: '0 0 0.75rem' }}>
                Group {group}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {teams.map(team => {
                  const rank = ranked.indexOf(team)
                  const isAuto4th = ranked.length === 3 && team === auto4th
                  return (
                    <div
                      key={team}
                      onClick={() => handleTeamClick(group, team)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.45rem 0.6rem', borderRadius: '0.6rem',
                        backgroundColor: rank >= 0 ? 'rgba(251,191,36,0.08)' : 'transparent',
                        border: rank >= 0 ? `1px solid rgba(251,191,36,0.2)` : '1px solid transparent',
                        cursor: isAuto4th ? 'default' : 'pointer',
                        transition: 'background 0.15s',
                      }}
                    >
                      <img
                        src={flagUrl(team)}
                        alt={team}
                        width={24} height={16}
                        style={{ borderRadius: '50%', objectFit: 'cover', width: '24px', height: '24px', flexShrink: 0 }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                      <span style={{ color: C.text, fontSize: '0.875rem', flex: 1 }}>{team}</span>
                      {rank >= 0 && <RankPill rank={rank + 1} />}
                      {isAuto4th && (
                        <span style={{ fontSize: '0.65rem', color: C.muted, marginLeft: '6px' }}>4th</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <SaveButton status={status} onClick={handleSave} />
    </div>
  )
}

// ─── 3rd Place Tab ────────────────────────────────────────────────────────────
function ThirdPlaceTab({ userId, savedPicks, groupPicks }: {
  userId: string
  savedPicks: ThirdPicks
  groupPicks: GroupPicks
}) {
  const [checked, setChecked] = useState<string[]>(savedPicks)
  const [status, setStatus] = useState<SaveStatus>('idle')

  useEffect(() => { setChecked(savedPicks) }, [savedPicks])

  function toggle(group: string) {
    setChecked(prev => {
      if (prev.includes(group)) return prev.filter(g => g !== group)
      if (prev.length >= 8) return prev
      return [...prev, group]
    })
    setStatus('idle')
  }

  async function handleSave() {
    setStatus('saving')
    try {
      const res = await fetch('/api/bracket/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, phase: 'third', picks: checked }),
      })
      const data = await res.json() as { ok?: boolean }
      setStatus(data.ok ? 'saved' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div>
      <p style={{ color: C.muted, fontSize: '0.8rem', marginBottom: '0.5rem' }}>
        Pick the 8 best 3rd-place teams that will advance to the Round of 32.
      </p>
      <p style={{ color: checked.length >= 8 ? C.gold : C.muted, fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>
        {checked.length}/8 selected
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.6rem' }}>
        {GROUP_LETTERS.map(group => {
          const ranked = groupPicks[group] ?? []
          // 3rd-place team = ranked[2], or if not yet picked, show placeholder
          const teams = WC_GROUPS[group]
          const auto4th = teams.find(t => !ranked.includes(t))
          const third = ranked[2] ?? (ranked.length === 3 ? auto4th : null) ?? null
          const isChecked = checked.includes(group)
          const disabled = !isChecked && checked.length >= 8

          return (
            <div
              key={group}
              onClick={() => !disabled && toggle(group)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 1rem',
                backgroundColor: isChecked ? 'rgba(251,191,36,0.1)' : C.card,
                border: `1px solid ${isChecked ? C.gold : C.border}`,
                borderRadius: '0.75rem',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <div style={{
                width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0,
                border: `2px solid ${isChecked ? C.gold : C.muted}`,
                backgroundColor: isChecked ? C.gold : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isChecked && <span style={{ color: '#0A0F2E', fontSize: '0.75rem', fontWeight: 900 }}>✓</span>}
              </div>
              <div style={{ flex: 1 }}>
                {/* Top row: 3rd place team prominently */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <span style={{ color: '#CD7F32', fontSize: '0.65rem', fontWeight: 700, background: 'rgba(205,127,50,0.15)', border: '1px solid rgba(205,127,50,0.4)', borderRadius: '0.3rem', padding: '0.1rem 0.4rem' }}>3rd</span>
                  {third ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <img src={flagUrl(third)} alt={third}
                        style={{ borderRadius: '50%', objectFit: 'cover', width: '20px', height: '20px', flexShrink: 0 }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                      <span style={{ color: C.text, fontSize: '0.875rem', fontWeight: 600 }}>{third}</span>
                    </div>
                  ) : (
                    <span style={{ color: C.muted, fontSize: '0.8rem', fontStyle: 'italic' }}>Set group picks first</span>
                  )}
                </div>
                {/* Second row: other teams in context */}
                {ranked.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {[0, 1, 3].map(idx => {
                      const label = idx === 0 ? '1st' : idx === 1 ? '2nd' : '4th'
                      const labelColor = idx === 0 ? C.gold : idx === 1 ? '#C0C0C0' : C.muted
                      const team = idx < 3 ? ranked[idx] : teams.find(t => !ranked.includes(t))
                      if (!team) return null
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <span style={{ color: labelColor, fontSize: '0.6rem', fontWeight: 700 }}>{label}</span>
                          <img src={flagUrl(team)} alt={team}
                            style={{ borderRadius: '50%', objectFit: 'cover', width: '14px', height: '14px' }}
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                          <span style={{ color: C.muted, fontSize: '0.68rem' }}>{team}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div style={{ color: C.muted, fontSize: '0.65rem', marginTop: '0.2rem' }}>Group {group}</div>
              </div>
            </div>
          )
        })}
      </div>
      <SaveButton status={status} onClick={handleSave} />
    </div>
  )
}

// ─── Knockout Tab ─────────────────────────────────────────────────────────────
function KnockoutTab({ userId, savedPicks, groupPicks, thirdPicks }: {
  userId: string
  savedPicks: KnockoutPicks
  groupPicks: GroupPicks
  thirdPicks: ThirdPicks
}) {
  const [picks, setPicks] = useState<KnockoutPicks>(savedPicks)
  const [status, setStatus] = useState<SaveStatus>('idle')

  useEffect(() => { setPicks(savedPicks) }, [savedPicks])

  // Resolve a label like "1st · Group A" to the actual team name from group picks
  function resolveLabel(label: string): string {
    const firstMatch = label.match(/^1st · Group ([A-L])$/)
    if (firstMatch) {
      const ranked = groupPicks[firstMatch[1]] ?? []
      return ranked[0] ?? label
    }
    const secondMatch = label.match(/^2nd · Group ([A-L])$/)
    if (secondMatch) {
      const ranked = groupPicks[secondMatch[1]] ?? []
      return ranked[1] ?? label
    }
    const thirdMatch = label.match(/^Best 3rd Qualifier #(\d)$/)
    if (thirdMatch) {
      const slot = parseInt(thirdMatch[1]) - 1
      const group = thirdPicks[slot]
      if (group) {
        const ranked = groupPicks[group] ?? []
        const teams = WC_GROUPS[group]
        const auto4th = teams.find(t => !ranked.includes(t))
        const third = ranked[2] ?? (ranked.length === 3 ? auto4th : null)
        if (third) return `${third} (3rd · Grp ${group})`
      }
    }
    return label
  }

  // Get the winner label for a given matchup id
  function getWinner(matchId: string): string | null {
    return picks[matchId] ?? null
  }

  function handlePick(matchId: string, value: string) {
    setPicks(prev => ({ ...prev, [matchId]: value }))
    setStatus('idle')
  }

  async function handleSave() {
    setStatus('saving')
    try {
      const res = await fetch('/api/bracket/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, phase: 'knockout', picks }),
      })
      const data = await res.json() as { ok?: boolean }
      setStatus(data.ok ? 'saved' : 'error')
    } catch {
      setStatus('error')
    }
  }

  function MatchupRow({
    matchId, opt1, opt2, label,
  }: { matchId: string; opt1: string; opt2: string; label: string }) {
    const winner = picks[matchId] ?? ''
    const r1 = resolveLabel(opt1)
    const r2 = resolveLabel(opt2)
    const showDropdown = r1 !== opt1 || r2 !== opt2 || opt1.includes('Qualifier') || opt2.includes('Qualifier') || true

    return (
      <div style={{
        backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '0.75rem',
        padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
      }}>
        <span style={{ color: C.muted, fontSize: '0.72rem', minWidth: '70px', flexShrink: 0 }}>{label}</span>
        <span style={{ color: C.text, fontSize: '0.8rem', flex: 1, minWidth: '120px' }}>
          <span style={{ color: C.gold, fontWeight: 600 }}>{r1}</span>
          <span style={{ color: C.muted }}> vs </span>
          <span style={{ color: C.gold, fontWeight: 600 }}>{r2}</span>
        </span>
        {showDropdown && (
          <select
            value={winner}
            onChange={e => handlePick(matchId, e.target.value)}
            style={{
              backgroundColor: '#162040', border: `1px solid ${C.border}`, borderRadius: '0.5rem',
              color: winner ? C.gold : C.muted, fontSize: '0.8rem', padding: '0.35rem 0.6rem',
              outline: 'none', cursor: 'pointer', minWidth: '140px',
            }}
          >
            <option value="">Pick winner…</option>
            <option value={r1}>{r1}</option>
            <option value={r2}>{r2}</option>
          </select>
        )}
      </div>
    )
  }

  // Build R16 matchup display — only shows when both R32 picks in the pair are made
  const r16Rows = R16_PAIRS.map(([m1id, m2id], i) => {
    const w1 = getWinner(m1id)
    const w2 = getWinner(m2id)
    const rid = R16_IDS[i]
    return { rid, w1: w1 ?? `Winner ${m1id}`, w2: w2 ?? `Winner ${m2id}`, ready: !!(w1 && w2) }
  })

  const qfRows = QF_PAIRS.map(([r1id, r2id], i) => {
    const w1 = getWinner(r1id)
    const w2 = getWinner(r2id)
    const qid = QF_IDS[i]
    const r16a = r16Rows.find(r => r.rid === r1id)
    const r16b = r16Rows.find(r => r.rid === r2id)
    return {
      qid,
      w1: w1 ?? (r16a ? `Winner ${r1id}` : '?'),
      w2: w2 ?? (r16b ? `Winner ${r2id}` : '?'),
      ready: !!(w1 && w2) || (r16a?.ready && r16b?.ready),
    }
  })

  const sfRows = SF_PAIRS.map(([q1id, q2id], i) => {
    const w1 = getWinner(q1id)
    const w2 = getWinner(q2id)
    const sid = SF_IDS[i]
    return { sid, w1: w1 ?? `Winner ${q1id}`, w2: w2 ?? `Winner ${q2id}`, ready: !!(w1 || w2) }
  })

  const sf1w = getWinner('SF_1')
  const sf2w = getWinner('SF_2')
  const sf1l = sfRows[0] ? (sf1w === sfRows[0].w1 ? sfRows[0].w2 : sfRows[0].w1) : null
  const sf2l = sfRows[1] ? (sf2w === sfRows[1].w1 ? sfRows[1].w2 : sfRows[1].w1) : null

  const SectionHeader = ({ title }: { title: string }) => (
    <h3 style={{ color: C.gold, fontWeight: 800, fontSize: '0.9rem', margin: '1.5rem 0 0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {title}
    </h3>
  )

  return (
    <div>
      <p style={{ color: C.muted, fontSize: '0.8rem', marginBottom: '1rem' }}>
        Pick the winner of each matchup. R16 unlocks after R32 picks. 🏆 picks cascade through.
      </p>

      <SectionHeader title="Round of 32" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {R32_MATCHUPS.map(m => (
          <MatchupRow key={m.id} matchId={m.id} opt1={m.s1} opt2={m.s2} label={m.id} />
        ))}
      </div>

      <SectionHeader title="Round of 16" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {r16Rows.map(({ rid, w1, w2 }) => (
          <MatchupRow key={rid} matchId={rid} opt1={w1} opt2={w2} label={rid.replace('_', ' ')} />
        ))}
      </div>

      <SectionHeader title="Quarter-Finals" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {qfRows.map(({ qid, w1, w2 }) => (
          <MatchupRow key={qid} matchId={qid} opt1={w1} opt2={w2} label={qid.replace('_', ' ')} />
        ))}
      </div>

      <SectionHeader title="Semi-Finals" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {sfRows.map(({ sid, w1, w2 }) => (
          <MatchupRow key={sid} matchId={sid} opt1={w1} opt2={w2} label={sid.replace('_', ' ')} />
        ))}
      </div>

      <SectionHeader title="3rd Place Match" />
      <MatchupRow
        matchId="THIRD"
        opt1={sf1l ?? 'SF1 Loser'}
        opt2={sf2l ?? 'SF2 Loser'}
        label="3rd Place"
      />

      <SectionHeader title="🏆 Final" />
      <MatchupRow
        matchId="FINAL"
        opt1={sf1w ?? 'SF1 Winner'}
        opt2={sf2w ?? 'SF2 Winner'}
        label="Final"
      />

      <SaveButton status={status} onClick={handleSave} />
    </div>
  )
}

// ─── Leaderboard Tab ──────────────────────────────────────────────────────────
function LeaderboardTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [leagueName, setLeagueName] = useState('')
  const [createdCode, setCreatedCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinMsg, setJoinMsg] = useState('')
  const [leagueCode, setLeagueCode] = useState('')
  const [filterCode, setFilterCode] = useState('')
  const [copied, setCopied] = useState(false)

  const fetchLeaderboard = useCallback(async (code?: string) => {
    setLoading(true)
    try {
      const url = code ? `/api/bracket/leaderboard?leagueCode=${code}` : '/api/bracket/leaderboard'
      const res = await fetch(url)
      const data = await res.json() as { ok?: boolean; rows?: LeaderboardRow[] }
      setRows(data.rows ?? [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeaderboard() }, [fetchLeaderboard])

  async function handleCreate() {
    if (!leagueName.trim()) return
    try {
      const res = await fetch('/api/bracket/league', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'create', name: leagueName }),
      })
      const data = await res.json() as { ok?: boolean; league?: { invite_code: string } }
      if (data.ok && data.league) {
        setCreatedCode(data.league.invite_code)
        setLeagueName('')
      }
    } catch { /* silent */ }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return
    try {
      const res = await fetch('/api/bracket/league', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'join', inviteCode: joinCode }),
      })
      const data = await res.json() as { ok?: boolean; league?: { name: string } }
      if (data.ok) {
        setJoinMsg(`Joined "${data.league?.name}"!`)
        setFilterCode(joinCode.toUpperCase())
        fetchLeaderboard(joinCode.toUpperCase())
        setJoinCode('')
      } else {
        setJoinMsg('League not found')
      }
    } catch { setJoinMsg('Error joining league') }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '0.6rem',
    padding: '0.5rem 0.75rem', color: C.text, fontSize: '0.85rem', outline: 'none',
  }

  return (
    <div>
      {/* League actions */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {/* Create league */}
        <div style={{ flex: '1 1 200px', backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '1rem', padding: '1rem' }}>
          <h4 style={{ color: C.gold, margin: '0 0 0.6rem', fontSize: '0.85rem' }}>Create Private League</h4>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input value={leagueName} onChange={e => setLeagueName(e.target.value)} placeholder="League name" style={{ ...inputStyle, flex: 1 }} />
            <button onClick={handleCreate} style={{
              backgroundColor: C.gold, color: '#0A0F2E', fontWeight: 700, fontSize: '0.8rem',
              padding: '0.5rem 0.85rem', borderRadius: '0.6rem', border: 'none', cursor: 'pointer',
            }}>Create</button>
          </div>
          {createdCode && (
            <div style={{ marginTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: C.muted, fontSize: '0.75rem' }}>Code:</span>
              <code style={{ color: C.gold, fontWeight: 800, fontSize: '0.95rem' }}>{createdCode}</code>
              <button onClick={() => copyCode(createdCode)} style={{
                backgroundColor: 'transparent', border: `1px solid ${C.border}`, borderRadius: '0.4rem',
                color: copied ? C.green : C.muted, fontSize: '0.7rem', padding: '2px 8px', cursor: 'pointer',
              }}>{copied ? 'Copied!' : 'Copy'}</button>
            </div>
          )}
        </div>

        {/* Join league */}
        <div style={{ flex: '1 1 200px', backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '1rem', padding: '1rem' }}>
          <h4 style={{ color: C.gold, margin: '0 0 0.6rem', fontSize: '0.85rem' }}>Join a League</h4>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} style={{ ...inputStyle, flex: 1 }} />
            <button onClick={handleJoin} style={{
              backgroundColor: C.card, color: C.gold, fontWeight: 700, fontSize: '0.8rem',
              padding: '0.5rem 0.85rem', borderRadius: '0.6rem', border: `1px solid ${C.gold}`, cursor: 'pointer',
            }}>Join</button>
          </div>
          {joinMsg && <p style={{ color: joinMsg.includes('!') ? C.green : '#ef4444', fontSize: '0.75rem', margin: '0.4rem 0 0' }}>{joinMsg}</p>}
        </div>
      </div>

      {/* Filter controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <span style={{ color: C.muted, fontSize: '0.8rem' }}>Filter by league:</span>
        <input value={filterCode} onChange={e => setFilterCode(e.target.value.toUpperCase())} placeholder="Code" maxLength={6} style={{ ...inputStyle, width: '90px' }} />
        <button onClick={() => fetchLeaderboard(filterCode || undefined)} style={{
          backgroundColor: 'transparent', border: `1px solid ${C.border}`, borderRadius: '0.5rem',
          color: C.muted, fontSize: '0.75rem', padding: '0.3rem 0.7rem', cursor: 'pointer',
        }}>Go</button>
        {filterCode && (
          <button onClick={() => { setFilterCode(''); fetchLeaderboard() }} style={{
            backgroundColor: 'transparent', border: 'none', color: C.muted, fontSize: '0.75rem', cursor: 'pointer',
          }}>✕ Clear</button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ color: C.muted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: C.muted, fontStyle: 'italic' }}>No picks submitted yet. Be the first!</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr>
                {['Rank', 'Name', 'Score'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '0.5rem 0.75rem', color: C.muted,
                    fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: `1px solid ${C.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.userId} style={{ borderBottom: `1px solid rgba(30,58,110,0.4)` }}>
                  <td style={{ padding: '0.6rem 0.75rem', color: row.rank <= 3 ? C.gold : C.muted, fontWeight: 700 }}>
                    {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `#${row.rank}`}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', color: row.userId === userId ? C.green : C.text, fontWeight: row.userId === userId ? 700 : 400 }}>
                    {row.displayName} {row.userId === userId && <span style={{ color: C.muted, fontSize: '0.7rem' }}>(you)</span>}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', color: C.gold, fontWeight: 700 }}>
                    {row.score}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'group', label: '⚽ Group Stage' },
  { id: 'third', label: '3rd Place' },
  { id: 'knockout', label: '🏆 Knockout' },
  { id: 'leaderboard', label: '📊 Leaderboard' },
]

export default function BracketPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [activeTab, setActiveTab] = useState('group')
  const [groupPicks, setGroupPicks] = useState<GroupPicks>({})
  const [thirdPicks, setThirdPicks] = useState<ThirdPicks>([])
  const [knockoutPicks, setKnockoutPicks] = useState<KnockoutPicks>({})
  const [picksLoaded, setPicksLoaded] = useState(false)

  // Hydrate auth from localStorage
  useEffect(() => {
    const id = localStorage.getItem('bracket_user_id')
    const name = localStorage.getItem('bracket_display_name')
    if (id) { setUserId(id); setDisplayName(name ?? '') }
  }, [])

  // Load existing picks once authenticated
  useEffect(() => {
    if (!userId || picksLoaded) return
    fetch(`/api/bracket/picks?userId=${userId}`)
      .then(r => r.json())
      .then((data: { ok?: boolean; entries?: { phase: string; picks: unknown }[] }) => {
        if (!data.ok) return
        for (const entry of data.entries ?? []) {
          if (entry.phase === 'group') setGroupPicks(entry.picks as GroupPicks)
          if (entry.phase === 'third') setThirdPicks(entry.picks as ThirdPicks)
          if (entry.phase === 'knockout') setKnockoutPicks(entry.picks as KnockoutPicks)
        }
        setPicksLoaded(true)
      })
      .catch(() => setPicksLoaded(true))
  }, [userId, picksLoaded])

  function handleAuth(id: string, name: string) {
    setUserId(id)
    setDisplayName(name)
  }

  function handleLogout() {
    localStorage.removeItem('bracket_user_id')
    localStorage.removeItem('bracket_display_name')
    setUserId(null)
    setDisplayName('')
    setPicksLoaded(false)
    setGroupPicks({})
    setThirdPicks([])
    setKnockoutPicks({})
  }

  if (!userId) return <AuthForm onAuth={handleAuth} />

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', color: C.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1rem 1rem 4rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h1 style={{ color: C.gold, fontWeight: 900, fontSize: '1.4rem', margin: 0 }}>🏆 Bracket Challenge</h1>
            <p style={{ color: C.muted, fontSize: '0.8rem', margin: '0.2rem 0 0' }}>World Cup 2026 · Make your picks</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ color: C.green, fontSize: '0.8rem', fontWeight: 600 }}>👤 {displayName}</span>
            <button onClick={handleLogout} style={{
              backgroundColor: 'transparent', border: `1px solid ${C.border}`, borderRadius: '0.5rem',
              color: C.muted, fontSize: '0.75rem', padding: '0.3rem 0.7rem', cursor: 'pointer',
            }}>Log out</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: '1.25rem', overflowX: 'auto' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                backgroundColor: 'transparent', border: 'none',
                borderBottom: activeTab === tab.id ? `2px solid ${C.gold}` : '2px solid transparent',
                color: activeTab === tab.id ? C.gold : C.muted,
                fontWeight: activeTab === tab.id ? 700 : 400,
                fontSize: '0.82rem', padding: '0.6rem 1rem', cursor: 'pointer',
                whiteSpace: 'nowrap', transition: 'color 0.15s',
              }}
            >{tab.label}</button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'group' && (
          <GroupStageTab userId={userId} savedPicks={groupPicks} />
        )}
        {activeTab === 'third' && (
          <ThirdPlaceTab userId={userId} savedPicks={thirdPicks} groupPicks={groupPicks} />
        )}
        {activeTab === 'knockout' && (
          <KnockoutTab userId={userId} savedPicks={knockoutPicks} groupPicks={groupPicks} thirdPicks={thirdPicks} />
        )}
        {activeTab === 'leaderboard' && (
          <LeaderboardTab userId={userId} />
        )}
      </div>
    </div>
  )
}
