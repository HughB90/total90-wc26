'use client'

import { useState, useEffect, useCallback } from 'react'

interface VotingPlayer {
  id: string
  name: string
  short_name?: string
  nationality: string
  position: string
  s3_value: number
  age?: number
  photo_url?: string
  sign_count: number
  sell_count: number
  sack_count: number
  vote_count: number
}

type Vote = 'sign' | 'sell' | 'sack'

// Country → ISO 2-letter code for flagcdn
const COUNTRY_CODES: Record<string, string> = {
  'England': 'gb-eng', 'France': 'fr', 'Spain': 'es', 'Germany': 'de',
  'Brazil': 'br', 'Argentina': 'ar', 'Portugal': 'pt', 'Netherlands': 'nl',
  'Belgium': 'be', 'Italy': 'it', 'Morocco': 'ma', 'USA': 'us',
  'Mexico': 'mx', 'Japan': 'jp', 'Colombia': 'co', 'Uruguay': 'uy',
  'Croatia': 'hr', 'Senegal': 'sn', 'Canada': 'ca', 'Switzerland': 'ch',
  'Ecuador': 'ec', 'Denmark': 'dk', 'Wales': 'gb-wls', 'Australia': 'au',
  'Poland': 'pl', 'South Korea': 'kr', 'Serbia': 'rs', 'Cameroon': 'cm',
  'Ghana': 'gh', 'Iran': 'ir', 'Qatar': 'qa', 'Saudi Arabia': 'sa',
  'Tunisia': 'tn', 'Nigeria': 'ng', 'Chile': 'cl', 'Peru': 'pe',
  'Austria': 'at', 'Turkey': 'tr', 'Czechia': 'cz', 'Scotland': 'gb-sct',
  'Slovakia': 'sk', 'Hungary': 'hu', 'Greece': 'gr', 'Norway': 'no',
  'Sweden': 'se', 'Finland': 'fi', 'Romania': 'ro', 'Bosnia and Herzegovina': 'ba',
  "Côte d'Ivoire": 'ci', 'Egypt': 'eg', 'Algeria': 'dz', 'Mali': 'ml',
  'Paraguay': 'py', 'Bolivia': 'bo', 'Venezuela': 've', 'Honduras': 'hn',
  'Costa Rica': 'cr', 'Panama': 'pa', 'Jamaica': 'jm', 'Haiti': 'ht',
  'New Zealand': 'nz', 'Iraq': 'iq', 'UAE': 'ae', 'Palestine': 'ps',
  'Cabo Verde': 'cv', 'Burkina Faso': 'bf', 'Guinea': 'gn', 'Uganda': 'ug',
  'Zimbabwe': 'zw', 'Zambia': 'zm', 'South Africa': 'za', 'Ethiopia': 'et',
}

function getFlagUrl(nationality: string): string {
  const code = COUNTRY_CODES[nationality] || nationality.toLowerCase().replace(/\s+/g, '-')
  return `https://flagcdn.com/w40/${code}.png`
}

const posColors: Record<string, { bg: string; color: string }> = {
  FWD: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
  MID: { bg: 'rgba(96,165,250,0.15)', color: '#60A5FA' },
  DEF: { bg: 'rgba(0,230,118,0.15)', color: '#00E676' },
  GK:  { bg: 'rgba(251,191,36,0.15)', color: '#FBBF24' },
}

export default function VotingCard() {
  const [players, setPlayers] = useState<VotingPlayer[]>([])
  const [votes, setVotes] = useState<Record<string, Vote>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [totalVoted, setTotalVoted] = useState(0)

  // Track seen player IDs in sessionStorage to avoid repeats
  const getSeenIds = () => {
    try { return JSON.parse(sessionStorage.getItem('s3_seen') || '[]') } catch { return [] }
  }
  const addSeenIds = (ids: string[]) => {
    const seen = getSeenIds()
    const updated = [...new Set([...seen, ...ids])].slice(-200) // keep last 200
    sessionStorage.setItem('s3_seen', JSON.stringify(updated))
  }

  const loadPlayers = useCallback(async () => {
    setLoading(true)
    setVotes({})
    const seen = getSeenIds()
    const exclude = seen.join(',')
    const url = `/api/s3/players?mode=random${exclude ? `&exclude=${exclude}` : ''}`
    const r = await fetch(url)
    const data = await r.json()
    if (Array.isArray(data) && data.length > 0) {
      setPlayers(data)
    } else {
      // All players seen — reset
      sessionStorage.removeItem('s3_seen')
      const r2 = await fetch('/api/s3/players?mode=random')
      const d2 = await r2.json()
      if (Array.isArray(d2)) setPlayers(d2)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadPlayers() }, [loadPlayers])

  const setVote = (playerId: string, vote: Vote) => {
    setVotes(v => ({ ...v, [playerId]: vote }))
  }

  const allVoted = players.length === 3 && players.every(p => votes[p.id])

  const handleSubmit = async () => {
    if (!allVoted) return
    setSubmitting(true)
    addSeenIds(players.map(p => p.id))
    setTotalVoted(t => t + 3)

    await fetch('/api/s3/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        votes: players.map(p => ({ playerId: p.id, vote: votes[p.id] }))
      }),
    })
    await loadPlayers()
    setSubmitting(false)
  }

  const voteConfig = {
    sign: { label: 'SIGN', color: '#00E676', bg: 'rgba(0,230,118,0.15)', border: 'rgba(0,230,118,0.5)', arrow: '↑' },
    sell: { label: 'SELL', color: '#60A5FA', bg: 'rgba(96,165,250,0.15)', border: 'rgba(96,165,250,0.5)', arrow: '↔' },
    sack: { label: 'SACK', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.5)', arrow: '↓' },
  }

  return (
    <div style={{ backgroundColor: '#0A0F2E', padding: '2rem 1.5rem', borderBottom: '1px solid #1E3A6E' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
        <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 900, color: '#FBBF24', margin: '0 0 0.4rem', letterSpacing: '-0.02em' }}>
          Your Thoughts?
        </h2>
        <p style={{ color: '#8899CC', fontSize: '0.9rem', margin: '0 0 0.25rem' }}>
          T90 values are crowdsourced from WC2026 fans like you.
        </p>
        <p style={{ color: '#4A6080', fontSize: '0.8rem', margin: 0 }}>
          <span style={{ color: '#00E676' }}>Sign</span> the most valuable · <span style={{ color: '#60A5FA' }}>Sell</span> the second · <span style={{ color: '#ef4444' }}>Sack</span> the least valuable
        </p>
        {totalVoted > 0 && (
          <p style={{ color: '#4A6080', fontSize: '0.72rem', marginTop: '0.5rem' }}>
            You&apos;ve voted on {totalVoted} players this session
          </p>
        )}
      </div>

      {/* Player cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#4A6080' }}>Loading players...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', maxWidth: '800px', margin: '0 auto 1.5rem' }}>
            {players.map(p => {
              const selectedVote = votes[p.id]
              const posStyle = posColors[p.position] || posColors.MID
              return (
                <div key={p.id} style={{
                  backgroundColor: '#0F1C4D',
                  border: `1px solid ${selectedVote ? voteConfig[selectedVote].border : '#1E3A6E'}`,
                  borderRadius: '1rem',
                  padding: '1.25rem 1rem',
                  textAlign: 'center',
                  transition: 'border-color 0.2s',
                }}>
                  {/* Player photo */}
                  <div style={{ position: 'relative', display: 'inline-block', marginBottom: '0.75rem' }}>
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.short_name || p.name}
                        style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #1E3A6E', display: 'block' }} />
                    ) : (
                      <div style={{ width: '72px', height: '72px', borderRadius: '50%', backgroundColor: '#162040', border: '2px solid #1E3A6E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A6080', fontSize: '1.25rem', fontWeight: 700 }}>
                        {(p.short_name || p.name).charAt(0)}
                      </div>
                    )}
                    {/* Flag overlay */}
                    <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '26px', height: '26px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #0A0F2E' }}>
                      <img src={getFlagUrl(p.nationality)} alt={p.nationality}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    </div>
                  </div>

                  {/* Name + details */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#F0F4FF', marginBottom: '0.25rem' }}>
                      {p.short_name || p.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '0.4rem', backgroundColor: posStyle.bg, color: posStyle.color }}>
                        {p.position}
                      </span>
                      <span style={{ color: '#8899CC', fontSize: '0.72rem' }}>•</span>
                      <span style={{ color: '#8899CC', fontSize: '0.72rem' }}>{p.nationality}</span>
                      {p.age && (
                        <>
                          <span style={{ color: '#4A6080', fontSize: '0.72rem' }}>•</span>
                          <span style={{ color: '#4A6080', fontSize: '0.72rem' }}>{p.age} y.o.</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Vote buttons */}
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {(['sign', 'sell', 'sack'] as Vote[]).map(v => {
                      const cfg = voteConfig[v]
                      const isSelected = selectedVote === v
                      return (
                        <button key={v} onClick={() => setVote(p.id, v)} style={{
                          flex: 1,
                          padding: '0.5rem 0.25rem',
                          borderRadius: '0.5rem',
                          border: `1px solid ${isSelected ? cfg.border : '#1E3A6E'}`,
                          backgroundColor: isSelected ? cfg.bg : 'transparent',
                          color: isSelected ? cfg.color : '#4A6080',
                          cursor: 'pointer',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          fontFamily: 'inherit',
                          letterSpacing: '0.04em',
                          transition: 'all 0.15s',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '0.1rem',
                        }}>
                          <span style={{ fontSize: '0.9rem' }}>{cfg.arrow}</span>
                          <span>{cfg.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Submit + skip */}
          <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
            <button
              onClick={handleSubmit}
              disabled={!allVoted || submitting}
              style={{
                width: '100%',
                maxWidth: '400px',
                padding: '0.875rem',
                borderRadius: '0.875rem',
                border: 'none',
                backgroundColor: allVoted && !submitting ? '#00E676' : '#162040',
                color: allVoted && !submitting ? '#0A0F2E' : '#4A6080',
                fontWeight: 800,
                fontSize: '1rem',
                cursor: allVoted && !submitting ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                marginBottom: '0.875rem',
                transition: 'all 0.2s',
              }}
            >
              {submitting ? 'Submitting...' : allVoted ? 'Submit Votes →' : `Select all ${3 - Object.keys(votes).length} remaining`}
            </button>
            <div>
              <button onClick={() => { addSeenIds(players.map(p => p.id)); loadPlayers() }}
                style={{ background: 'none', border: 'none', color: '#4A6080', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                I don&apos;t know all of these players
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
