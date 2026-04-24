'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Article {
  id: string
  headline: string
  summary: string
  category: string
  players: string[]
  teams: string[]
  is_breaking: boolean
  published_at: string
  source: string
}

const categoryColors: Record<string, { bg: string; color: string; label: string }> = {
  injury:     { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444', label: '🤕 Injury' },
  transfer:   { bg: 'rgba(96,165,250,0.12)',  color: '#60A5FA', label: '🔄 Transfer' },
  form:       { bg: 'rgba(0,230,118,0.12)',   color: '#00E676', label: '📈 Form' },
  suspension: { bg: 'rgba(251,191,36,0.12)',  color: '#FBBF24', label: '🟨 Suspension' },
  result:     { bg: 'rgba(168,85,247,0.12)',  color: '#A855F7', label: '⚽ Result' },
  general:    { bg: 'rgba(136,153,204,0.1)',  color: '#8899CC', label: '📰 News' },
}

export default function NewsPage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [lastFetch, setLastFetch] = useState<string | null>(null)

  const loadArticles = async () => {
    try {
      const res = await fetch('/api/news/fetch?read=true')
      const data = await res.json()
      if (Array.isArray(data)) {
        setArticles(data)
        if (data.length > 0) setLastFetch(data[0].published_at)
      }
    } catch {
      // silent
    }
    setLoading(false)
  }

  const triggerFetch = async () => {
    setFetching(true)
    try {
      await fetch('/api/news/fetch', { method: 'POST' })
      await loadArticles()
    } catch {
      // silent
    }
    setFetching(false)
  }

  useEffect(() => { loadArticles() }, [])

  return (
    <div style={{ backgroundColor: '#0A0F2E', minHeight: '100vh', color: '#F0F4FF', fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <nav style={{ borderBottom: '1px solid #1E3A6E', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '800px', margin: '0 auto' }}>
        <Link href="/" style={{ color: '#00E676', fontWeight: 800, textDecoration: 'none', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          TOTAL90 <span style={{ color: '#FBBF24' }}>WC26</span>
          <span style={{ color: '#8899CC', fontWeight: 400, fontSize: '0.8rem' }}>/ News</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {lastFetch && (
            <span style={{ color: '#4A6080', fontSize: '0.75rem' }}>
              Updated {new Date(lastFetch).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={triggerFetch}
            disabled={fetching}
            style={{
              backgroundColor: fetching ? '#162040' : '#00E676',
              color: fetching ? '#8899CC' : '#0A0F2E',
              fontWeight: 700,
              fontSize: '0.8rem',
              padding: '0.4rem 1rem',
              borderRadius: '0.75rem',
              border: 'none',
              cursor: fetching ? 'not-allowed' : 'pointer',
            }}
          >
            {fetching ? '⌛ Fetching...' : '🔄 Refresh'}
          </button>
        </div>
      </nav>

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.25rem' }}>
            ⚽ World Cup 2026 Intelligence
          </h1>
          <p style={{ color: '#8899CC', fontSize: '0.85rem', margin: 0 }}>
            Powered by Grok · Updates every 2 hours · {articles.length} articles
          </p>
        </div>

        {loading ? (
          <p style={{ color: '#8899CC', textAlign: 'center', padding: '3rem 0' }}>Loading…</p>
        ) : articles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0' }}>
            <p style={{ color: '#8899CC', marginBottom: '1rem' }}>No articles yet. Click Refresh to fetch from Grok.</p>
            <button
              onClick={triggerFetch}
              disabled={fetching}
              style={{
                backgroundColor: '#00E676',
                color: '#0A0F2E',
                fontWeight: 700,
                padding: '0.75rem 1.5rem',
                borderRadius: '0.875rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.95rem',
              }}
            >
              {fetching ? 'Fetching from Grok...' : '🤖 Fetch News Now'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {articles.map(a => {
              const cat = categoryColors[a.category] || categoryColors.general
              return (
                <div
                  key={a.id}
                  style={{
                    backgroundColor: '#0F1C4D',
                    border: `1px solid ${a.is_breaking ? 'rgba(239,68,68,0.4)' : '#1E3A6E'}`,
                    borderRadius: '1rem',
                    padding: '1.25rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '1rem', backgroundColor: cat.bg, color: cat.color }}>
                      {cat.label}
                    </span>
                    {a.is_breaking && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '1rem', backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                        🔴 BREAKING
                      </span>
                    )}
                    <span style={{ color: '#4A6080', fontSize: '0.72rem', marginLeft: 'auto' }}>
                      {new Date(a.published_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <p style={{ color: '#F0F4FF', fontWeight: 700, fontSize: '0.95rem', margin: '0 0 0.5rem', lineHeight: 1.4 }}>{a.headline}</p>
                  <p style={{ color: '#8899CC', fontSize: '0.85rem', margin: '0 0 0.75rem', lineHeight: 1.5 }}>{a.summary}</p>
                  {(a.players.length > 0 || a.teams.length > 0) && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {a.players.slice(0, 3).map(p => (
                        <span key={p} style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '0.5rem', backgroundColor: '#162040', color: '#8899CC' }}>👤 {p}</span>
                      ))}
                      {a.teams.slice(0, 2).map(t => (
                        <span key={t} style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '0.5rem', backgroundColor: '#162040', color: '#8899CC' }}>🏴 {t}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
