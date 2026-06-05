'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AuthHeader from '@/components/AuthHeader'

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

type FilterKind = 'all' | 'breaking' | 'category' | 'player' | 'team'
interface ActiveFilter { kind: FilterKind; value: string }
const ALL: ActiveFilter = { kind: 'all', value: '' }

export default function NewsPage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState<string | null>(null)
  const [filter, setFilter] = useState<ActiveFilter>(ALL)

  const loadArticles = async () => {
    try {
      const res = await fetch('/api/news?limit=50')
      const data = await res.json()
      const list: Article[] = Array.isArray(data?.articles) ? data.articles : []
      setArticles(list)
      if (list.length > 0) setLastFetch(list[0].published_at)
    } catch {
      // silent
    }
    setLoading(false)
  }

  useEffect(() => { loadArticles() }, [])

  // Build chip lists from currently-loaded articles
  const catCounts: Record<string, number> = {}
  const playerCounts: Record<string, number> = {}
  const teamCounts: Record<string, number> = {}
  let breakingCount = 0
  for (const a of articles) {
    catCounts[a.category] = (catCounts[a.category] || 0) + 1
    if (a.is_breaking) breakingCount++
    for (const p of a.players || []) playerCounts[p] = (playerCounts[p] || 0) + 1
    for (const t of a.teams || []) teamCounts[t] = (teamCounts[t] || 0) + 1
  }
  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1])
  const topPlayers = Object.entries(playerCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const topTeams = Object.entries(teamCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)

  // Apply active filter
  const visible = articles.filter(a => {
    if (filter.kind === 'all') return true
    if (filter.kind === 'breaking') return a.is_breaking
    if (filter.kind === 'category') return a.category === filter.value
    if (filter.kind === 'player') return (a.players || []).includes(filter.value)
    if (filter.kind === 'team') return (a.teams || []).includes(filter.value)
    return true
  })

  const toggleFilter = (next: ActiveFilter) => {
    if (filter.kind === next.kind && filter.value === next.value) setFilter(ALL)
    else setFilter(next)
  }

  const chipBase = {
    fontSize: '0.72rem',
    fontWeight: 600 as const,
    padding: '0.3rem 0.7rem',
    borderRadius: '1rem',
    border: '1px solid #1E3A6E',
    backgroundColor: '#0F1C4D',
    color: '#8899CC',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  }
  const chipActive = { ...chipBase, backgroundColor: '#00E676', color: '#0A0F2E', borderColor: '#00E676' }
  const isActive = (kind: FilterKind, value = '') => filter.kind === kind && filter.value === value

  return (
    <div style={{ minHeight: '100vh', color: '#F0F4FF', fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <AuthHeader />
      <nav style={{ borderBottom: '1px solid #1E3A6E', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '800px', margin: '0 auto' }}>
        <Link href="/" style={{ color: '#00E676', fontWeight: 800, textDecoration: 'none', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          TOTAL90 <span style={{ color: '#FBBF24' }}>WC26</span>
          <span style={{ color: '#8899CC', fontWeight: 400, fontSize: '0.8rem' }}>/ News</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {lastFetch && (
            <span style={{ color: '#4A6080', fontSize: '0.75rem' }}>
              Updated {new Date(lastFetch).toLocaleDateString("en-US", {month:"short",day:"numeric"})} at {new Date(lastFetch).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}
            </span>
          )}
        </div>
      </nav>

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.25rem' }}>
            ⚽ World Cup 2026 Intelligence
          </h1>
          <p style={{ color: '#8899CC', fontSize: '0.85rem', margin: 0 }}>
            {articles.length} {articles.length === 1 ? 'article' : 'articles'} · Morning &amp; afternoon updates
            {lastFetch && (
              <> · Last updated {new Date(lastFetch).toLocaleDateString("en-US", {month:"short",day:"numeric"})} at {new Date(lastFetch).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}</>
            )}
          </p>
        </div>

        {/* Filter chips */}
        {!loading && articles.length > 0 && (
          <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button style={isActive('all') ? chipActive : chipBase} onClick={() => setFilter(ALL)}>All · {articles.length}</button>
              {breakingCount > 0 && (
                <button style={isActive('breaking') ? chipActive : chipBase} onClick={() => toggleFilter({ kind: 'breaking', value: '' })}>
                  🔴 Breaking · {breakingCount}
                </button>
              )}
              {sortedCats.map(([cat, n]) => {
                const meta = categoryColors[cat] || categoryColors.general
                const active = isActive('category', cat)
                return (
                  <button
                    key={cat}
                    style={active ? chipActive : { ...chipBase, color: meta.color, borderColor: meta.color }}
                    onClick={() => toggleFilter({ kind: 'category', value: cat })}
                  >
                    {meta.label} · {n}
                  </button>
                )
              })}
            </div>
            {(topPlayers.length > 0 || topTeams.length > 0) && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {topPlayers.map(([p, n]) => (
                  <button key={p} style={isActive('player', p) ? chipActive : chipBase} onClick={() => toggleFilter({ kind: 'player', value: p })}>
                    👤 {p} · {n}
                  </button>
                ))}
                {topTeams.map(([t, n]) => (
                  <button key={t} style={isActive('team', t) ? chipActive : chipBase} onClick={() => toggleFilter({ kind: 'team', value: t })}>
                    🏴 {t} · {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <p style={{ color: '#8899CC', textAlign: 'center', padding: '3rem 0' }}>Loading…</p>
        ) : articles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0' }}>
            <p style={{ color: '#8899CC', marginBottom: '1rem' }}>No articles yet — next update lands this morning or afternoon.</p>
          </div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0' }}>
            <p style={{ color: '#8899CC', marginBottom: '1rem' }}>No articles match this filter.</p>
            <button style={chipBase} onClick={() => setFilter(ALL)}>Clear filter</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {visible.map(a => {
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
                      {new Date(a.published_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"})} {new Date(a.published_at).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}
                    </span>
                  </div>
                  <p style={{ color: '#F0F4FF', fontWeight: 700, fontSize: '0.95rem', margin: '0 0 0.5rem', lineHeight: 1.4 }}>{a.headline}</p>
                  <p style={{ color: '#8899CC', fontSize: '0.85rem', margin: '0 0 0.75rem', lineHeight: 1.5 }}>{a.summary}</p>
                  {(a.players.length > 0 || a.teams.length > 0) && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {a.players.slice(0, 3).map(p => (
                        <button
                          key={p}
                          onClick={(e) => { e.stopPropagation(); toggleFilter({ kind: 'player', value: p }) }}
                          style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '0.5rem', backgroundColor: '#162040', color: '#8899CC', border: 'none', cursor: 'pointer' }}
                        >👤 {p}</button>
                      ))}
                      {a.teams.slice(0, 2).map(t => (
                        <button
                          key={t}
                          onClick={(e) => { e.stopPropagation(); toggleFilter({ kind: 'team', value: t }) }}
                          style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '0.5rem', backgroundColor: '#162040', color: '#8899CC', border: 'none', cursor: 'pointer' }}
                        >🏴 {t}</button>
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
