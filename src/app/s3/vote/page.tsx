'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
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
      {/* Nav */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: 'rgba(10,15,46,0.97)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #1E3A6E', padding: '0.6rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
            <img src="/total90-logo-green.png" alt="Total90" style={{ width: '26px', height: '26px', objectFit: 'contain' }} />
            <span style={{ color: '#00E676', fontWeight: 900, fontSize: '1rem' }}>TOTAL90</span>
            <span style={{ color: '#FBBF24', fontWeight: 700, fontSize: '0.9rem' }}>WC26</span>
          </Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          {[['News','/news'],['Players','/s3'],['Bracket','/bracket'],['Scores','/scores']].map(([l,h]) => (
            <Link key={h} href={h} style={{ color: '#8899CC', fontSize: '0.78rem', fontWeight: 500, textDecoration: 'none' }}>{l}</Link>
          ))}
        </div>
      </nav>

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
