'use client'

import { useEffect, useMemo, useState } from 'react'
import AuthHeader from '@/components/AuthHeader'
import { selectStyle } from '@/lib/select-style'

// ─── Color tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  gold: '#FBBF24',
  muted: '#8899CC',
  text: '#F0F4FF',
  green: '#00E676',
  red: '#FF4D6D',
}

// ─── Country codes ────────────────────────────────────────────────────────────
const COUNTRY_CODES: Record<string, string> = {
  England: 'gb-eng',
  Scotland: 'gb-sct',
  France: 'fr',
  Spain: 'es',
  Germany: 'de',
  Brazil: 'br',
  Argentina: 'ar',
  Portugal: 'pt',
  Netherlands: 'nl',
  Belgium: 'be',
  Italy: 'it',
  Morocco: 'ma',
  USA: 'us',
  Mexico: 'mx',
  Japan: 'jp',
  Colombia: 'co',
  Uruguay: 'uy',
  Croatia: 'hr',
  Senegal: 'sn',
  Canada: 'ca',
  Switzerland: 'ch',
  Ecuador: 'ec',
  'South Korea': 'kr',
  Australia: 'au',
  Czechia: 'cz',
  'Saudi Arabia': 'sa',
  Paraguay: 'py',
  Algeria: 'dz',
  'New Zealand': 'nz',
  Panama: 'pa',
  Ghana: 'gh',
  Haiti: 'ht',
  Turkey: 'tr', 'Türkiye': 'tr',
  Egypt: 'eg',
  'Ivory Coast': 'ci',
  Jordan: 'jo',
  Qatar: 'qa',
  Tunisia: 'tn',
  'South Africa': 'za',
  'Bosnia & Herzegovina': 'ba',
  'Bosnia and Herzegovina': 'ba',
  Sweden: 'se',
  Iraq: 'iq',
  'DR Congo': 'cd',
  'Curaçao': 'cw',
  Curacao: 'cw',
  'Cape Verde': 'cv',
  Uzbekistan: 'uz',
  Norway: 'no',
  Iran: 'ir',
  Austria: 'at',
  Nigeria: 'ng',
  Serbia: 'rs',
  Poland: 'pl',
}

function flagUrl(country: string) {
  const code = COUNTRY_CODES[country] ?? country.toLowerCase().replace(/\s+/g, '-')
  return `https://flagcdn.com/w160/${code}.png`
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Stage = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'final'

interface TeamSlot {
  name: string
  placeholder?: boolean
}

interface ApiMatch {
  id: string
  match_num: number
  round_code: string
  group_code: string | null
  home_team_code: string
  away_team_code: string
  kickoff_at: string
  venue: string | null
  home_score: number | null
  away_score: number | null
  status: 'scheduled' | 'live' | 'final' | 'cancelled'
  period: string | null
  minute: number | null
  is_knockout: boolean
  went_to_pks: boolean
  pk_winner_team_code: string | null
  goalscorers: unknown[]
  last_synced_at: string | null
}

interface Match {
  num: number
  stage: Stage
  round?: 1 | 2 | 3
  group?: string
  date: string
  time: string
  home: TeamSlot
  away: TeamSlot
  venue: string
  score: { home: number; away: number } | null
  status: 'fixture' | 'playing' | 'played'
  period: string | null
  minute: number | null
  wentToPks: boolean
  pkWinner: string | null
}

// ─── DB → UI mapping ──────────────────────────────────────────────────────────
const ROUND_CODE_TO_STAGE: Record<string, Stage> = {
  group_r1: 'group',
  group_r2: 'group',
  group_r3: 'group',
  r32: 'r32',
  r16: 'r16',
  qf: 'qf',
  sf: 'sf',
  '3rd': 'final',
  final: 'final',
}

const ROUND_CODE_TO_ROUND: Record<string, 1 | 2 | 3 | undefined> = {
  group_r1: 1,
  group_r2: 2,
  group_r3: 3,
}

const PLACEHOLDER_RE = /^(Winner|Runner-up|Loser|Best 3rd) /

function isPlaceholder(teamCode: string): boolean {
  return PLACEHOLDER_RE.test(teamCode) || teamCode.startsWith('TBD')
}

function statusToUi(s: ApiMatch['status']): Match['status'] {
  if (s === 'live') return 'playing'
  if (s === 'final') return 'played'
  return 'fixture'
}

function formatKickoff(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return { date: iso.slice(0, 10), time: '' }
  }
  // CT date (use America/Chicago to be safe across DST)
  const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  // en-CA gives YYYY-MM-DD
  const timeStr =
    d.toLocaleTimeString('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' CT'
  return { date: dateStr, time: timeStr }
}

function apiMatchToUi(m: ApiMatch): Match {
  const stage = ROUND_CODE_TO_STAGE[m.round_code] ?? 'group'
  const round = ROUND_CODE_TO_ROUND[m.round_code]
  const { date, time } = formatKickoff(m.kickoff_at)
  const homePh = isPlaceholder(m.home_team_code)
  const awayPh = isPlaceholder(m.away_team_code)
  return {
    num: m.match_num,
    stage,
    round,
    group: m.group_code ?? undefined,
    date,
    time,
    home: { name: m.home_team_code, placeholder: homePh },
    away: { name: m.away_team_code, placeholder: awayPh },
    venue: m.venue ?? '',
    score:
      m.home_score != null && m.away_score != null
        ? { home: m.home_score, away: m.away_score }
        : null,
    status: statusToUi(m.status),
    period: m.period,
    minute: m.minute,
    wentToPks: !!m.went_to_pks,
    pkWinner: m.pk_winner_team_code,
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

// ─── Stage config ─────────────────────────────────────────────────────────────
const STAGES: { id: Stage; label: string; rounds: string[] | null }[] = [
  { id: 'group', label: 'Group Stage',    rounds: ['Round 1', 'Round 2', 'Round 3'] },
  { id: 'r32',   label: 'Round of 32',   rounds: null },
  { id: 'r16',   label: 'Round of 16',   rounds: null },
  { id: 'qf',    label: 'Quarter-Finals', rounds: null },
  { id: 'sf',    label: 'Semi-Finals',   rounds: null },
  { id: 'final', label: 'Final',         rounds: null },
]

const GROUPS = ['All', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

// ─── Auto-detect current stage/round ─────────────────────────────────────────
function getDefaultNav(): { stage: Stage; round: number; group: string } {
  const now = new Date()
  const ct = new Date(now.getTime() - 5 * 60 * 60 * 1000)
  const y = ct.getUTCFullYear()
  const m = ct.getUTCMonth() + 1
  const d = ct.getUTCDate()

  const def = { stage: 'group' as Stage, round: 1, group: 'All' }

  if (y < 2026) return def
  if (y > 2026) return { stage: 'final', round: 1, group: 'All' }
  if (m < 6) return def
  if (m === 6) {
    if (d < 11) return def
    if (d <= 17) return { stage: 'group', round: 1, group: 'All' }
    if (d <= 23) return { stage: 'group', round: 2, group: 'All' }
    if (d <= 27) return { stage: 'group', round: 3, group: 'All' }
    return { stage: 'r32', round: 1, group: 'All' }
  }
  if (m === 7) {
    if (d <= 3)  return { stage: 'r32',   round: 1, group: 'All' }
    if (d <= 7)  return { stage: 'r16',   round: 1, group: 'All' }
    if (d <= 10) return { stage: 'qf',    round: 1, group: 'All' }
    if (d <= 15) return { stage: 'sf',    round: 1, group: 'All' }
    return { stage: 'final', round: 1, group: 'All' }
  }
  return def
}

function getStageBadge(match: Match): string {
  switch (match.stage) {
    case 'group': return `GROUP ${match.group ?? ''}`.trim()
    case 'r32':   return 'ROUND OF 32'
    case 'r16':   return 'ROUND OF 16'
    case 'qf':    return 'QUARTER-FINAL'
    case 'sf':    return 'SEMI-FINAL'
    case 'final': return match.num === 103 ? '3RD PLACE' : 'FINAL'
    default:      return ''
  }
}

// ─── Flag / placeholder avatar ────────────────────────────────────────────────
function TeamAvatar({ team }: { team: TeamSlot }) {
  if (team.placeholder) {
    return (
      <div style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        backgroundColor: '#1E3A6E',
        border: `2px solid #2A4A80`,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ color: '#4A6090', fontSize: '14px' }}>?</span>
      </div>
    )
  }
  return (
    <img
      src={flagUrl(team.name)}
      alt={team.name}
      style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        objectFit: 'cover',
        border: `2px solid ${C.border}`,
        backgroundColor: '#162040',
        flexShrink: 0,
      }}
      onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
    />
  )
}

// ─── Match card ───────────────────────────────────────────────────────────────
function MatchCard({ match }: { match: Match }) {
  const isLive   = match.status === 'playing'
  const isPlayed = match.status === 'played'

  const homeWon = isPlayed && match.score != null && match.score.home > match.score.away
  const awayWon = isPlayed && match.score != null && match.score.away > match.score.home

  const scoreDisplay = match.score != null
    ? `${match.score.home} – ${match.score.away}`
    : '— : —'

  // Live status label
  let liveLabel = 'LIVE'
  if (isLive && match.period) {
    if (match.period === 'HT') liveLabel = 'HALF-TIME'
    else if (match.period === 'ET') liveLabel = 'EXTRA TIME'
    else if (match.period === 'PEN') liveLabel = 'PENALTIES'
    else if (match.minute != null && match.minute > 0) liveLabel = `${match.minute}'`
    else liveLabel = match.period
  }

  return (
    <div style={{
      backgroundColor: C.card,
      border: `1px solid ${isLive ? C.green : C.border}`,
      borderRadius: '0.875rem',
      padding: '1.1rem 1.25rem 1rem',
      position: 'relative',
      transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{
          color: C.gold,
          fontSize: '0.62rem',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          {getStageBadge(match)}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isLive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{
                display: 'inline-block',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: C.red,
                boxShadow: `0 0 6px ${C.red}`,
                animation: 'pulse 1.4s ease-in-out infinite',
              }} />
              <span style={{ color: C.red, fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.06em' }}>
                {liveLabel}
              </span>
            </div>
          )}
          <span style={{ color: C.muted, fontSize: '0.62rem', fontWeight: 600, opacity: 0.7 }}>
            M{match.num}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.875rem' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
          <TeamAvatar team={match.home} />
          <span style={{
            color: homeWon ? C.gold : C.text,
            fontSize: '0.78rem',
            fontWeight: homeWon ? 700 : 500,
            textAlign: 'right',
            lineHeight: 1.3,
            fontStyle: match.home.placeholder ? 'italic' : 'normal',
            opacity: match.home.placeholder ? 0.65 : 1,
          }}>
            {match.home.name}
          </span>
        </div>

        <div style={{ textAlign: 'center', flexShrink: 0, minWidth: '62px' }}>
          <span style={{
            color: isPlayed || isLive ? C.gold : C.muted,
            fontSize: isPlayed || isLive ? '1.35rem' : '0.9rem',
            fontWeight: 900,
            letterSpacing: isPlayed || isLive ? '0.04em' : 0,
          }}>
            {scoreDisplay}
          </span>
          {match.wentToPks && match.pkWinner && (
            <div style={{ color: C.muted, fontSize: '0.62rem', fontWeight: 700, marginTop: '0.15rem' }}>
              {match.pkWinner} on pens
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.3rem' }}>
          <TeamAvatar team={match.away} />
          <span style={{
            color: awayWon ? C.gold : C.text,
            fontSize: '0.78rem',
            fontWeight: awayWon ? 700 : 500,
            lineHeight: 1.3,
            fontStyle: match.away.placeholder ? 'italic' : 'normal',
            opacity: match.away.placeholder ? 0.65 : 1,
          }}>
            {match.away.name}
          </span>
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        borderTop: `1px solid ${C.border}`,
        paddingTop: '0.65rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M3 17l9-14 9 14H3z" stroke={C.muted} strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M3 17h18" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M9 17v-4h6v4" stroke={C.muted} strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span style={{ color: C.muted, fontSize: '0.7rem' }}>{match.venue}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" stroke={C.muted} strokeWidth="1.5" />
            <path d="M12 7v5l3 3" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ color: C.muted, fontSize: '0.7rem' }}>{match.time}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ScoresPage() {
  const defaults = getDefaultNav()
  const [activeStage, setActiveStage]   = useState<Stage>(defaults.stage)
  const [activeRound, setActiveRound]   = useState<number>(defaults.round)
  const [activeGroup, setActiveGroup]   = useState<string>(defaults.group)
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null)

  // ── Fetch & polling ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null

    async function load() {
      try {
        const res = await fetch('/api/scores', { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setLoadError(`HTTP ${res.status}`)
          return
        }
        const json = await res.json()
        if (cancelled) return
        if (!json.ok) {
          setLoadError(json.error ?? 'unknown')
          return
        }
        const uiMatches = (json.matches as ApiMatch[]).map(apiMatchToUi)
        setMatches(uiMatches)
        setLastFetchedAt(json.fetched_at ?? null)
        setLoadError(null)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    async function loop() {
      await load()
      if (cancelled) return
      // Poll faster if anything is live; slower otherwise.
      const anyLive = matchesRef.current.some((m) => m.status === 'playing')
      const next = anyLive ? 30_000 : 120_000
      pollTimer = setTimeout(loop, next)
    }

    loop()
    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
    }
    // We deliberately want this to set up once and let the inner ref drive
    // the cadence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep a ref so the polling loop sees the latest matches state.
  const matchesRef = useMatchesRef(matches)

  const currentStageConfig = STAGES.find(s => s.id === activeStage)!

  const filtered = useMemo(() => {
    return matches.filter(m => {
      if (m.stage !== activeStage) return false
      if (activeStage === 'group') {
        if (m.round !== activeRound) return false
        if (activeGroup !== 'All' && m.group !== activeGroup) return false
      }
      return true
    })
  }, [matches, activeStage, activeRound, activeGroup])

  const dates = useMemo(
    () => Array.from(new Set(filtered.map(m => m.date))).sort(),
    [filtered]
  )

  const stageLabel = currentStageConfig.label
  const roundLabel = activeStage === 'group' ? ` · Round ${activeRound}` : ''
  const groupLabel = activeStage === 'group' && activeGroup !== 'All' ? ` · Group ${activeGroup}` : ''

  return (
    <div style={{
      minHeight: '100vh',
      color: C.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.8); }
        }
        select option { background-color: #0F1C4D; color: #F0F4FF; }
      `}</style>

      <AuthHeader />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem 1rem 5rem' }}>

        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ color: C.gold, fontWeight: 900, fontSize: '1.6rem', margin: '0 0 0.25rem' }}>
            📅 Match Schedule
          </h1>
          <p style={{ color: C.muted, fontSize: '0.82rem', margin: 0 }}>
            FIFA World Cup 2026 · {stageLabel}{roundLabel}{groupLabel}
          </p>
        </div>

        <div style={{
          display: 'flex',
          gap: '0.65rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: '2rem',
        }}>
          <div style={{ position: 'relative' }}>
            <select
              value={activeStage}
              onChange={e => {
                const val = e.target.value as Stage
                setActiveStage(val)
                setActiveRound(1)
                setActiveGroup('All')
              }}
              style={selectStyle}
            >
              {STAGES.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          {activeStage === 'group' && (
            <div style={{ position: 'relative' }}>
              <select
                value={activeRound}
                onChange={e => setActiveRound(Number(e.target.value))}
                style={selectStyle}
              >
                <option value={1}>Round 1</option>
                <option value={2}>Round 2</option>
                <option value={3}>Round 3</option>
              </select>
            </div>
          )}

          {activeStage === 'group' && (
            <div style={{ position: 'relative' }}>
              <select
                value={activeGroup}
                onChange={e => setActiveGroup(e.target.value)}
                style={selectStyle}
              >
                {GROUPS.map(g => (
                  <option key={g} value={g}>{g === 'All' ? 'All Groups' : `Group ${g}`}</option>
                ))}
              </select>
            </div>
          )}

          <span style={{
            color: C.muted,
            fontSize: '0.72rem',
            fontWeight: 600,
            marginLeft: 'auto',
            opacity: 0.75,
          }}>
            {filtered.length} match{filtered.length !== 1 ? 'es' : ''}
          </span>
        </div>

        <div style={{
          display: 'flex',
          gap: '0.4rem',
          overflowX: 'auto',
          paddingBottom: '0.25rem',
          marginBottom: '1.75rem',
          scrollbarWidth: 'none',
        }}>
          {STAGES.map(s => {
            const isActive = activeStage === s.id
            return (
              <button
                key={s.id}
                onClick={() => {
                  setActiveStage(s.id)
                  setActiveRound(1)
                  setActiveGroup('All')
                }}
                style={{
                  backgroundColor: isActive ? C.gold : C.card,
                  color: isActive ? '#0A0F2E' : C.muted,
                  border: `1px solid ${isActive ? C.gold : C.border}`,
                  borderRadius: '2rem',
                  padding: '0.35rem 0.9rem',
                  fontSize: '0.74rem',
                  fontWeight: isActive ? 800 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                  flexShrink: 0,
                }}
              >
                {s.label}
              </button>
            )
          })}
        </div>

        {/* Loading state */}
        {loading && matches.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p style={{ color: C.muted, fontSize: '0.9rem' }}>Loading fixtures…</p>
          </div>
        )}

        {/* Error banner */}
        {loadError && matches.length === 0 && (
          <div style={{
            backgroundColor: '#3A1E2A',
            border: `1px solid ${C.red}`,
            borderRadius: '0.75rem',
            padding: '0.875rem 1.25rem',
            marginBottom: '1.5rem',
          }}>
            <p style={{ color: C.red, fontSize: '0.8rem', margin: 0 }}>
              Failed to load fixtures: {loadError}
            </p>
          </div>
        )}

        {/* Matches grouped by date */}
        {dates.map(date => {
          const dayMatches = filtered.filter(m => m.date === date)
          return (
            <div key={date} style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ height: '1px', flex: 1, backgroundColor: C.border }} />
                <span style={{
                  color: C.muted,
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  {formatDate(date)}
                </span>
                <div style={{ height: '1px', flex: 1, backgroundColor: C.border }} />
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '1rem',
              }}>
                {dayMatches.map(match => (
                  <MatchCard key={match.num} match={match} />
                ))}
              </div>
            </div>
          )
        })}

        {dates.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p style={{ color: C.muted, fontSize: '0.9rem' }}>No matches for this selection.</p>
          </div>
        )}

        <div style={{
          marginTop: '2rem',
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '0.875rem',
          padding: '0.875rem 1.25rem',
          textAlign: 'center',
        }}>
          <p style={{ color: C.muted, fontSize: '0.75rem', margin: 0, lineHeight: 1.6 }}>
            {matches.length} match{matches.length !== 1 ? 'es' : ''} · All times Central (CT)
            {lastFetchedAt && (
              <>
                {' '}· Updated {new Date(lastFetchedAt).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZone: 'America/Chicago',
                })} CT
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

// Tiny helper: keep a ref tracking the latest matches array so the polling
// loop can read it without re-subscribing.
import { useRef } from 'react'
function useMatchesRef(matches: Match[]) {
  const ref = useRef<Match[]>(matches)
  ref.current = matches
  return ref
}
