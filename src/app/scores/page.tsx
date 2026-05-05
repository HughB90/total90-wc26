'use client'

import { useState } from 'react'

// ─── Color tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  gold: '#FBBF24',
  muted: '#8899CC',
  text: '#F0F4FF',
  green: '#00E676',
}

// ─── Country codes (from bracket page) ───────────────────────────────────────
const COUNTRY_CODES: Record<string, string> = {
  England: 'gb-eng', Scotland: 'gb-sct', France: 'fr', Spain: 'es', Germany: 'de',
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
  Honduras: 'hn', Chile: 'cl', Peru: 'pe', Qatar: 'qa', Tunisia: 'tn',
  'South Africa': 'za', 'Czech Republic': 'cz', 'Bosnia and Herzegovina': 'ba',
  Sweden: 'se', Iraq: 'iq', 'DR Congo': 'cd', 'Curaçao': 'cw', Curacao: 'cw',
  'Cape Verde': 'cv', Uzbekistan: 'uz', Norway: 'no', Iran: 'ir', Austria: 'at',
  Nigeria: 'ng', Mali: 'ml', Tanzania: 'tz', Ethiopia: 'et', Zimbabwe: 'zw',
}

function flagUrl(country: string) {
  const code = COUNTRY_CODES[country] ?? country.toLowerCase().replace(/\s+/g, '-')
  return `https://flagcdn.com/w40/${code}.png`
}

// ─── Match data ───────────────────────────────────────────────────────────────
type MatchStatus = 'fixture' | 'playing' | 'played'

interface Match {
  id: string
  group: string
  date: string
  time: string
  home: string
  away: string
  venue: string
  score: { home: number; away: number } | null
  status: MatchStatus
}

const MATCHES: Match[] = [
  { id: 'GA1', group: 'A', date: '2026-06-11', time: 'TBD CT', home: 'Mexico', away: 'Ecuador', venue: 'SoFi Stadium, Los Angeles', score: null, status: 'fixture' },
  { id: 'GA2', group: 'A', date: '2026-06-11', time: 'TBD CT', home: 'Uruguay', away: 'Bolivia', venue: 'Gillette Stadium, Boston', score: null, status: 'fixture' },
  { id: 'GB1', group: 'B', date: '2026-06-12', time: 'TBD CT', home: 'Canada', away: 'Bosnia and Herzegovina', venue: 'MetLife Stadium, New York', score: null, status: 'fixture' },
  { id: 'GB2', group: 'B', date: '2026-06-12', time: 'TBD CT', home: 'Switzerland', away: 'Qatar', venue: 'AT&T Stadium, Dallas', score: null, status: 'fixture' },
  { id: 'GC1', group: 'C', date: '2026-06-13', time: 'TBD CT', home: 'Brazil', away: 'Haiti', venue: 'Hard Rock Stadium, Miami', score: null, status: 'fixture' },
  { id: 'GC2', group: 'C', date: '2026-06-13', time: 'TBD CT', home: 'Morocco', away: 'Scotland', venue: "Levi's Stadium, San Francisco", score: null, status: 'fixture' },
  { id: 'GD1', group: 'D', date: '2026-06-14', time: 'TBD CT', home: 'USA', away: 'Turkey', venue: 'Mercedes-Benz Stadium, Atlanta', score: null, status: 'fixture' },
  { id: 'GD2', group: 'D', date: '2026-06-14', time: 'TBD CT', home: 'Australia', away: 'Paraguay', venue: 'Lumen Field, Seattle', score: null, status: 'fixture' },
]

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

// ─── Flag avatar ──────────────────────────────────────────────────────────────
function Flag({ country }: { country: string }) {
  return (
    <img
      src={flagUrl(country)}
      alt={country}
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
  const isLive = match.status === 'playing'
  const isPlayed = match.status === 'played'

  const homeWon = isPlayed && match.score && match.score.home > match.score.away
  const awayWon = isPlayed && match.score && match.score.away > match.score.home

  const scoreDisplay = match.score != null
    ? `${match.score.home} - ${match.score.away}`
    : 'vs'

  return (
    <div style={{
      backgroundColor: C.card,
      border: `1px solid ${isLive ? C.green : C.border}`,
      borderRadius: '0.875rem',
      padding: '1.25rem',
      position: 'relative',
      transition: 'border-color 0.2s',
    }}>
      {/* Group badge + Live indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
        <span style={{
          color: C.gold,
          fontSize: '0.65rem',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          GROUP {match.group}
        </span>
        {isLive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: C.green,
              boxShadow: `0 0 6px ${C.green}`,
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
            <span style={{ color: C.green, fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.06em' }}>LIVE</span>
          </div>
        )}
      </div>

      {/* Score row: Home | Score | Away */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        {/* Home team */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.375rem' }}>
          <Flag country={match.home} />
          <span style={{
            color: homeWon ? C.gold : C.text,
            fontSize: '0.82rem',
            fontWeight: homeWon ? 700 : 500,
            textAlign: 'right',
            lineHeight: 1.3,
          }}>
            {match.home}
          </span>
        </div>

        {/* Score center */}
        <div style={{ textAlign: 'center', flexShrink: 0, minWidth: '60px' }}>
          <span style={{
            color: C.gold,
            fontSize: isPlayed || isLive ? '1.4rem' : '1rem',
            fontWeight: 900,
            letterSpacing: isPlayed || isLive ? '0.05em' : 0,
          }}>
            {scoreDisplay}
          </span>
        </div>

        {/* Away team */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.375rem' }}>
          <Flag country={match.away} />
          <span style={{
            color: awayWon ? C.gold : C.text,
            fontSize: '0.82rem',
            fontWeight: awayWon ? 700 : 500,
            lineHeight: 1.3,
          }}>
            {match.away}
          </span>
        </div>
      </div>

      {/* Venue + time */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', borderTop: `1px solid ${C.border}`, paddingTop: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {/* Stadium icon */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M3 17l9-14 9 14H3z" stroke={C.muted} strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M3 17h18" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M9 17v-4h6v4" stroke={C.muted} strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
          <span style={{ color: C.muted, fontSize: '0.72rem' }}>{match.venue}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {/* Clock icon */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" stroke={C.muted} strokeWidth="1.5"/>
            <path d="M12 7v5l3 3" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ color: C.muted, fontSize: '0.72rem' }}>{match.time}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
const GROUP_FILTERS = ['All Groups', 'Group A', 'Group B', 'Group C', 'Group D']

export default function ScoresPage() {
  const [activeFilter, setActiveFilter] = useState('All Groups')

  // Group dates by unique date strings
  const filtered = activeFilter === 'All Groups'
    ? MATCHES
    : MATCHES.filter(m => `Group ${m.group}` === activeFilter)

  const dates = Array.from(new Set(filtered.map(m => m.date))).sort()

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', color: C.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Pulse animation style */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>

      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '1.5rem 1rem 5rem' }}>

        {/* Page header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ color: C.gold, fontWeight: 900, fontSize: '1.6rem', margin: '0 0 0.25rem' }}>
            📅 Match Calendar
          </h1>
          <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0 }}>
            World Cup 2026 · Group Stage · Round 1
          </p>
        </div>

        {/* Filter tabs */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto',
          paddingBottom: '0.25rem',
          marginBottom: '1.75rem',
          scrollbarWidth: 'none',
        }}>
          {GROUP_FILTERS.map(filter => {
            const isActive = activeFilter === filter
            return (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                style={{
                  backgroundColor: isActive ? C.gold : C.card,
                  color: isActive ? '#0A0F2E' : C.muted,
                  border: `1px solid ${isActive ? C.gold : C.border}`,
                  borderRadius: '2rem',
                  padding: '0.4rem 1rem',
                  fontSize: '0.78rem',
                  fontWeight: isActive ? 800 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                  flexShrink: 0,
                }}
              >
                {filter}
              </button>
            )
          })}
        </div>

        {/* Matches grouped by date */}
        {dates.map(date => {
          const dayMatches = filtered.filter(m => m.date === date)
          return (
            <div key={date} style={{ marginBottom: '2rem' }}>
              {/* Date divider */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}>
                <div style={{ height: '1px', flex: 1, backgroundColor: C.border }} />
                <span style={{
                  color: C.muted,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  {formatDate(date)}
                </span>
                <div style={{ height: '1px', flex: 1, backgroundColor: C.border }} />
              </div>

              {/* Cards grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '1rem',
              }}>
                {dayMatches.map(match => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          )
        })}

        {/* Empty state */}
        {dates.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p style={{ color: C.muted, fontSize: '0.9rem' }}>No matches found for this filter.</p>
          </div>
        )}

        {/* Coming soon footer note */}
        <div style={{
          marginTop: '2rem',
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '0.875rem',
          padding: '1rem 1.25rem',
          textAlign: 'center',
        }}>
          <p style={{ color: C.muted, fontSize: '0.78rem', margin: 0, lineHeight: 1.6 }}>
            Full schedule with all 104 matches loading as the tournament approaches.{' '}
            <span style={{ color: '#4A6080' }}>Powered by Opta.</span>
          </p>
        </div>
      </div>
    </div>
  )
}
