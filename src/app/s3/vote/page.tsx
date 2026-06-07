'use client'
import { useState, useEffect } from 'react'
import VotingCard from '../VotingCard'

export default function VotePage() {
  const [totalVoted, setTotalVoted] = useState(0)

  useEffect(() => {
    try {
      const seen = JSON.parse(sessionStorage.getItem('s3_seen') || '[]')
      setTotalVoted(Math.floor(seen.length / 3) * 3)
    } catch {}
  }, [])

  return (
    <div style={{ minHeight: '100vh', color: '#F0F4FF', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ color: '#FBBF24', fontWeight: 900, fontSize: '1.5rem', margin: '0 0 0.3rem' }}>S³ Vote Center</h1>
          <p style={{ color: '#8899CC', fontSize: '0.85rem', margin: '0 0 0.4rem' }}>
            Sign the most valuable · Sell the second · Sack the least
          </p>
          {totalVoted > 0 && (
            <p style={{ color: '#4A6080', fontSize: '0.75rem', margin: 0 }}>You&apos;ve rated {totalVoted} players this session</p>
          )}
        </div>

        {/* Voting Card — unlimited */}
        <div style={{ marginBottom: '1rem' }}>
          <VotingCard onVoted={(count) => setTotalVoted(v => v + count)} />
        </div>

        <p style={{ textAlign: 'center', color: '#4A6080', fontSize: '0.72rem' }}>
          Keep voting! Every submission helps shape the T90 community rankings.
        </p>
      </div>
    </div>
  )
}
