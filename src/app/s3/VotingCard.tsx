'use client'

import { useState, useCallback, useEffect } from 'react'

interface VotingPlayer {
  id: string
  name: string
  short_name?: string
  nationality: string
  position: string
  s3_value: number
  age?: number
  photo_url?: string
}

type Vote = 'sign' | 'sell' | 'sack'

const COUNTRY_CODES: Record<string, string> = {
  'England': 'gb-eng', 'France': 'fr', 'Spain': 'es', 'Germany': 'de',
  'Brazil': 'br', 'Argentina': 'ar', 'Portugal': 'pt', 'Netherlands': 'nl',
  'Belgium': 'be', 'Italy': 'it', 'Morocco': 'ma', 'USA': 'us',
  'Mexico': 'mx', 'Japan': 'jp', 'Colombia': 'co', 'Uruguay': 'uy',
  'Croatia': 'hr', 'Senegal': 'sn', 'Canada': 'ca', 'Switzerland': 'ch',
  'Ecuador': 'ec', 'Denmark': 'dk', 'Australia': 'au', 'Poland': 'pl',
  'South Korea': 'kr', 'Serbia': 'rs', 'Austria': 'at', 'Turkey': 'tr',
  'Czechia': 'cz', 'Scotland': 'gb-sct', "Côte d'Ivoire": 'ci',
  'Nigeria': 'ng', 'Chile': 'cl', 'Peru': 'pe', 'Paraguay': 'py',
  'Costa Rica': 'cr', 'Jamaica': 'jm', 'New Zealand': 'nz', 'Iraq': 'iq',
  'Cabo Verde': 'cv', 'Sweden': 'se', 'Norway': 'no', 'Romania': 'ro',
}

function getFlagUrl(n: string) {
  const code = COUNTRY_CODES[n] ?? n.toLowerCase().replace(/\s+/g, '-')
  return `https://flagcdn.com/w40/${code}.png`
}

const posColors: Record<string, { color: string }> = {
  FWD: { color: '#ef4444' },
  MID: { color: '#60A5FA' },
  DEF: { color: '#00E676' },
  GK:  { color: '#FBBF24' },
}

const voteConfig = {
  sign: { label: 'SIGN', color: '#00E676', dimColor: '#1a3a2a', textDim: '#2d6b46', arrow: '↑' },
  sell: { label: 'SELL', color: '#60A5FA', dimColor: '#1a2a3a', textDim: '#2d4a6b', arrow: '↔' },
  sack: { label: 'SACK', color: '#ef4444', dimColor: '#3a1a1a', textDim: '#6b2d2d', arrow: '↓' },
}

export default function VotingCard() {
  const [players, setPlayers] = useState<VotingPlayer[]>([])
  const [votes, setVotes] = useState<Record<string, Vote>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [totalVoted, setTotalVoted] = useState(0)

  const getSeenIds = () => {
    try { return JSON.parse(sessionStorage.getItem('s3_seen') || '[]') } catch { return [] }
  }
  const addSeenIds = (ids: string[]) => {
    const seen = getSeenIds()
    const updated = [...new Set([...seen, ...ids])].slice(-300)
    sessionStorage.setItem('s3_seen', JSON.stringify(updated))
  }

  const loadPlayers = useCallback(async () => {
    setLoading(true)
    setVotes({})
    const seen = getSeenIds()
    const url = `/api/s3/players?mode=random${seen.length ? `&exclude=${seen.join(',')}` : ''}`
    let data = await fetch(url).then(r => r.json()).catch(() => [])
    if (!Array.isArray(data) || data.length === 0) {
      sessionStorage.removeItem('s3_seen')
      data = await fetch('/api/s3/players?mode=random').then(r => r.json()).catch(() => [])
    }
    if (Array.isArray(data)) setPlayers(data)
    setLoading(false)
  }, [])



  useEffect(() => { loadPlayers() }, [loadPlayers])

  const allVoted = players.length > 0 && players.every(p => votes[p.id])

  const handleSubmit = async () => {
    if (!allVoted || submitting) return
    setSubmitting(true)
    addSeenIds(players.map(p => p.id))
    setTotalVoted(t => t + players.length)
    await fetch('/api/s3/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ votes: players.map(p => ({ playerId: p.id, vote: votes[p.id] })) }),
    }).catch(() => {})
    await loadPlayers()
    setSubmitting(false)
  }

  return (
    <div style={{ padding: '1rem 1rem 0.75rem', borderBottom: '2px solid #1E3A6E', maxWidth: '480px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#FBBF24', margin: '0 0 0.35rem', letterSpacing: '-0.02em' }}>
          Your Thoughts?
        </h2>
        <p style={{ color: '#8899CC', fontSize: '0.78rem', margin: '0 0 0.2rem', lineHeight: 1.4 }}>
          T90 values are crowdsourced from WC2026 fans like you.
        </p>
        <p style={{ color: '#8899CC', fontSize: '0.76rem', margin: 0, lineHeight: 1.4 }}>
          Rank the three players below.{' '}
          <span style={{ color: '#00E676', fontWeight: 600 }}>Sign</span> the most valuable,{' '}
          <span style={{ color: '#60A5FA', fontWeight: 600 }}>Sell</span> the second,{' '}
          <span style={{ color: '#ef4444', fontWeight: 600 }}>Sack</span> the least.
        </p>
        {totalVoted > 0 && <p style={{ color: '#4A6080', fontSize: '0.72rem', marginTop: '0.4rem', marginBottom: 0 }}>You&apos;ve voted on {totalVoted} players this session</p>}
      </div>

      {/* Player rows — vertical KTC style */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2.5rem', color: '#4A6080' }}>Loading players...</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {players.map(p => {
              const selected = votes[p.id]
              const posColor = posColors[p.position]?.color ?? '#8899CC'
              return (
                <div key={p.id} style={{
                  backgroundColor: '#0F1C4D',
                  border: `1px solid ${selected ? voteConfig[selected].color + '60' : '#1E3A6E'}`,
                  borderRadius: '0.875rem',
                  overflow: 'hidden',
                  transition: 'border-color 0.15s',
                }}>
                  {/* Player info row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.6rem 0.875rem' }}>
                    {/* Photo */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {p.photo_url ? (
                        <img src={p.photo_url} alt="" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #1E3A6E', display: 'block' }} />
                      ) : (
                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#162040', border: '2px solid #1E3A6E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A6080', fontWeight: 700, fontSize: '1.1rem' }}>
                          {(p.short_name || p.name).charAt(0)}
                        </div>
                      )}
                      {/* Flag */}
                      <div style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '17px', height: '17px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #0A0F2E' }}>
                        <img src={getFlagUrl(p.nationality)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      </div>
                    </div>
                    {/* Text */}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#F0F4FF', marginBottom: '0.2rem' }}>
                        {p.short_name || p.name}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#8899CC' }}>
                        <span style={{ color: posColor, fontWeight: 600 }}>{p.position}</span>
                        {' · '}{p.nationality}
                        {p.age ? ` · ${p.age} y.o.` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Vote buttons row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '1px solid #1E3A6E' }}>
                    {(['sign', 'sell', 'sack'] as Vote[]).map((v, i) => {
                      const cfg = voteConfig[v]
                      const isSelected = selected === v
                      const isUsedByOther = Object.entries(votes).some(([pid, pv]) => pv === v && pid !== p.id)
                      return (
                        <button key={v} onClick={() => {
                          // Each vote type (sign/sell/sack) can only be used once
                          const alreadyUsed = Object.entries(votes).some(([pid, pv]) => pv === v && pid !== p.id)
                          if (!alreadyUsed) setVotes(prev => ({ ...prev, [p.id]: v }))
                        }} style={{
                          padding: '0.55rem 0.25rem',
                          border: 'none',
                          borderRight: i < 2 ? '1px solid #1E3A6E' : 'none',
                          backgroundColor: isSelected ? cfg.dimColor : 'transparent',
                          color: isSelected ? cfg.color : '#4A6080',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          letterSpacing: '0.05em',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '0.2rem',
                          transition: 'background-color 0.15s, color 0.15s',
                        }}>
                          <span style={{ fontSize: '1rem', fontWeight: 400 }}>{cfg.arrow}</span>
                          <span>{cfg.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Submit */}
          <button onClick={handleSubmit} disabled={!allVoted || submitting} style={{
            width: '100%', padding: '0.75rem', borderRadius: '0.875rem', border: 'none',
            backgroundColor: allVoted && !submitting ? '#00E676' : '#162040',
            color: allVoted && !submitting ? '#0A0F2E' : '#4A6080',
            fontWeight: 800, fontSize: '1rem', cursor: allVoted && !submitting ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', marginBottom: '0.875rem', transition: 'all 0.2s',
          }}>
            {submitting ? 'Submitting...' : allVoted ? 'Submit Votes →' : `Select all ${players.filter(p => !votes[p.id]).length} remaining`}
          </button>

          <div style={{ textAlign: 'center' }}>
            <button onClick={() => { addSeenIds(players.map(p => p.id)); loadPlayers() }}
              style={{ background: 'none', border: 'none', color: '#4A6080', fontSize: '0.82rem', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
              I don&apos;t know all of these players
            </button>
          </div>
        </>
      )}
    </div>
  )
}
