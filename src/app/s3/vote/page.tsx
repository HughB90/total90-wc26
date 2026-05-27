'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import VotingCard from '../VotingCard'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://tituygkbondyjhzomwji.supabase.co'
const SUPABASE_ANON = 'sb_publishable_nYugb5FDdgYbKauTAmh0oQ_QtfOJjHI'

type Player = { id: string; name: string; short_name: string; nationality: string; position: string; s3_value: number; sign_count: number; sell_count: number; sack_count: number; vote_count: number; photo_url: string | null }

const TIERS = [
  { min: 100, label: '🌟 World Class', color: '#FBBF24' },
  { min: 85,  label: '⭐ Elite',       color: '#60A5FA' },
  { min: 70,  label: '🔵 Premium',     color: '#00E676' },
  { min: 55,  label: '🟢 Solid',       color: '#8899CC' },
  { min: 0,   label: '⚪ Depth',       color: '#4A6080' },
]
const tier = (v: number) => TIERS.find(t => v >= t.min) ?? TIERS[TIERS.length - 1]

export default function VotePage() {
  const [topPlayers, setTopPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [totalVoted, setTotalVoted] = useState(0)

  useEffect(() => {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    ;(sb.from('s3_players' as never)
      .select('id, name, short_name, nationality, position, s3_value, sign_count, sell_count, sack_count, vote_count, photo_url')
      .order('s3_value', { ascending: false })
      .limit(10) as any)
      .then(({ data }: any) => { setTopPlayers(data ?? []); setLoading(false) })
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
          {[['News','/news'],['S³ Ratings','/s3'],['Bracket','/bracket'],['Scores','/scores']].map(([l,h]) => (
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

        {/* Top 10 Rankings */}
        <div style={{ backgroundColor: '#0F1C4D', border: '1px solid #1E3A6E', borderRadius: '1rem', padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
            <h2 style={{ color: '#F0F4FF', fontWeight: 800, fontSize: '0.95rem', margin: 0 }}>Top 10 by T90 Score</h2>
            <Link href="/s3" style={{ color: '#00E676', fontSize: '0.75rem', textDecoration: 'none', fontWeight: 600 }}>See all →</Link>
          </div>
          {loading ? (
            <p style={{ color: '#4A6080', fontSize: '0.82rem' }}>Loading...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {topPlayers.map((p, i) => {
                const t = tier(p.s3_value)
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.45rem 0.5rem', borderRadius: '0.5rem', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <span style={{ color: '#4A6080', fontSize: '0.68rem', fontWeight: 700, width: '18px', flexShrink: 0, textAlign: 'right' }}>{i+1}</span>
                    {p.photo_url ? (
                      <img src={p.photo_url} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #1E3A6E' }} onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3' }} />
                    ) : (
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#162040', border: '1px solid #1E3A6E', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A6080', fontSize: '0.7rem', fontWeight: 700 }}>{(p.short_name||p.name).charAt(0)}</div>
                    )}
                    <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: '#F0F4FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.short_name || p.name}</span>
                    <span style={{ fontSize: '0.65rem', color: t.color, fontWeight: 700, flexShrink: 0 }}>{p.s3_value}</span>
                  </div>
                )
              })}
            </div>
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
