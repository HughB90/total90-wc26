'use client'

/**
 * /fantasy/social  \u2014  TOTAL90 Top Performers social-graphic generator.
 *
 * PUBLIC page (no auth). Lets anyone build a TOTAL90-branded ranked-list
 * PNG suitable for Instagram Feed (1080\u00d71350) or Stories/TikTok/Reels/
 * Shorts (1080\u00d71920). Discoverable but unlinked from main nav \u2014 Hugh
 * surfaces it via the button on /fantasy.
 *
 * Picks driven by /api/social/top-performers. PNG export via html-to-image
 * (lighter than html2canvas, handles modern CSS).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import TopPerformersCard, {
  TOP_PERFORMERS_CARD_ID,
  type CardFormat,
  type CardPosition,
  type PerformerRow,
} from '@/components/social/TopPerformersCard'

const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  green: '#00E676',
  text: '#F0F4FF',
  muted: '#8899CC',
  red: '#FF5252',
}

interface Competition {
  code: string
  name: string
  season: string
  rounds: Array<{
    code: string
    name: string
    playedCount: number
    fixtureCount: number
  }>
}

const POSITIONS: { value: CardPosition; label: string }[] = [
  { value: 'GK', label: 'GK' },
  { value: 'DEF', label: 'DEF' },
  { value: 'MID', label: 'MID' },
  { value: 'FWD', label: 'FWD' },
]

interface MetricOption {
  value: string
  label: string
  /** If set, this metric is only valid for these positions. */
  positions?: CardPosition[]
  format: (v: number) => string
}

// Display formatters
const fmtNum = (v: number) => `${Math.round(v * 10) / 10}`
const fmtInt = (v: number) => `${Math.round(v)}`
const fmtPct = (v: number) => `${Math.round(v * 10) / 10}%`

const ALL_METRICS: MetricOption[] = [
  { value: 'fantasy_points', label: 'Fantasy Points', format: fmtNum },
  { value: 'cat_attacking', label: 'Attacking (category total)', format: fmtNum },
  { value: 'cat_playmaker', label: 'Playmaker (category total)', format: fmtNum },
  { value: 'cat_passing', label: 'Passing (category total)', format: fmtNum },
  { value: 'cat_possession', label: 'Possession (category total)', format: fmtNum },
  { value: 'cat_defensive', label: 'Defensive (category total)', format: fmtNum },
  { value: 'cat_discipline', label: 'Discipline (category total)', format: fmtNum },
  { value: 'cat_goalkeeping', label: 'Goalkeeping (category total)', positions: ['GK'], format: fmtNum },
  { value: 'goals', label: 'Goals', format: fmtInt },
  { value: 'assists', label: 'Assists', format: fmtInt },
  { value: 'g_a', label: 'Goals + Assists', format: fmtInt },
  { value: 'shots', label: 'Shots', format: fmtInt },
  { value: 'pass_acc', label: 'Pass %', format: fmtPct },
  { value: 'tackles', label: 'Tackles', format: fmtInt },
  { value: 'interceptions', label: 'Interceptions', format: fmtInt },
  { value: 'clean_sheets', label: 'Clean Sheets', positions: ['GK'], format: fmtInt },
  { value: 'saves', label: 'Saves', positions: ['GK'], format: fmtInt },
]

const FORMATS: { value: CardFormat; label: string }[] = [
  { value: '1080x1350', label: 'Instagram Feed \u2014 1080\u00d71350' },
  { value: '1080x1920', label: 'Instagram Stories / TikTok / Reels / YouTube Shorts \u2014 1080\u00d71920' },
]

// ──────────────────────────────────────────────────────────────────────────────

export default function FantasySocialPage() {
  // Controls
  const [position, setPosition] = useState<CardPosition>('FWD')
  const [round, setRound] = useState<string>('ALL')
  const [metric, setMetric] = useState<string>('fantasy_points')
  const [format, setFormat] = useState<CardFormat>('1080x1350')
  const [background, setBackground] = useState<'stadium-1' | 'stadium-2'>('stadium-1')
  const [heroOverride, setHeroOverride] = useState<string>('') // '' = default to top photo

  // Data
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [players, setPlayers] = useState<PerformerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  const previewRef = useRef<HTMLDivElement | null>(null)

  // Filter metrics by current position
  const metricOptions = useMemo(
    () => ALL_METRICS.filter((m) => !m.positions || m.positions.includes(position)),
    [position],
  )

  // If the active metric is no longer valid (e.g. switched away from GK), reset to fantasy_points
  useEffect(() => {
    if (!metricOptions.find((m) => m.value === metric)) {
      setMetric('fantasy_points')
    }
  }, [metricOptions, metric])

  const activeMetric = useMemo(
    () => metricOptions.find((m) => m.value === metric) ?? ALL_METRICS[0],
    [metricOptions, metric],
  )

  // Load competitions/rounds on mount
  useEffect(() => {
    fetch('/api/fantasy/competitions')
      .then((r) => r.json())
      .then((data: Competition[]) => setCompetitions(data || []))
      .catch((e) => console.error('[fantasy/social] competitions:', e))
  }, [])

  const rounds = useMemo(() => {
    const wc = competitions.find((c) => c.code === 'WC2026')
    return wc?.rounds ?? []
  }, [competitions])

  // Fetch ranked players
  const loadPlayers = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const params = new URLSearchParams({
        competition: 'WC2026',
        round,
        position,
        metric,
        limit: '10',
      })
      const res = await fetch(`/api/social/top-performers?${params.toString()}`, {
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        setErr(body.error || `Request failed (${res.status})`)
        setPlayers([])
        return
      }
      setPlayers((body.players || []) as PerformerRow[])
      setHasLoadedOnce(true)
      // Reset hero override when data changes \u2014 default to first player with photo
      setHeroOverride('')
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setErr(`Couldn't load players: ${m}`)
      setPlayers([])
    } finally {
      setLoading(false)
    }
  }, [position, round, metric])

  // Auto-load on first render so the preview isn't empty
  useEffect(() => {
    loadPlayers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Map opta_id -> player for hero override lookup
  const heroLookup = useMemo(() => {
    const m = new Map<string, PerformerRow>()
    for (const p of players) m.set(p.opta_player_id, p)
    return m
  }, [players])

  // ────────── PNG download ──────────
  const onDownload = useCallback(async () => {
    const node = document.getElementById(TOP_PERFORMERS_CARD_ID) as HTMLElement | null
    if (!node) {
      setErr('Preview not mounted yet \u2014 try Generate first.')
      return
    }
    setExporting(true)
    setErr(null)
    try {
      const width = 1080
      const height = format === '1080x1350' ? 1350 : 1920
      const dataUrl = await toPng(node, {
        width,
        height,
        canvasWidth: width,
        canvasHeight: height,
        pixelRatio: 1,
        cacheBust: true,
        backgroundColor: '#0A0F2E',
      })
      const a = document.createElement('a')
      const safeMetric = metric.replace(/_/g, '-')
      const safeRound = round.replace(/[^a-zA-Z0-9-]/g, '')
      a.href = dataUrl
      a.download = `total90-top10-${position.toLowerCase()}-${safeRound || 'all'}-${safeMetric}-${width}x${height}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setErr(`PNG export failed: ${m}`)
    } finally {
      setExporting(false)
    }
  }, [format, metric, position, round])

  // ────────── Styles ──────────
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem 0.75rem',
    background: C.bg,
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    fontSize: '0.95rem',
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: C.muted,
    fontSize: '0.78rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 6,
  }

  const cardStyle: React.CSSProperties = {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: '1rem 1.1rem',
    marginBottom: '1rem',
  }

  const previewWidth = 1080
  const previewHeight = format === '1080x1350' ? 1350 : 1920
  // Scale the preview to fit roughly 480px wide (~44.4% scale)
  const previewScale = 480 / previewWidth

  return (
    <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '1.5rem' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, letterSpacing: '0.02em' }}>
              <span style={{ color: C.green }}>TOTAL90</span> · Top Performers Social Graphic
            </h1>
            <p style={{ margin: '0.35rem 0 0', color: C.muted, fontSize: '0.9rem' }}>
              Build a 1080\u00d71350 (IG Feed) or 1080\u00d71920 (Stories / TikTok / Reels / Shorts) ranked-list PNG.
            </p>
          </div>
          <a
            href="/fantasy"
            style={{
              color: C.green,
              fontWeight: 700,
              textDecoration: 'none',
              border: `1px solid ${C.green}`,
              padding: '0.55rem 0.95rem',
              borderRadius: 999,
              fontSize: '0.85rem',
            }}
          >
            \u2190 Back to /fantasy
          </a>
        </div>

        {err && (
          <div style={{ ...cardStyle, borderColor: C.red, color: C.red, fontWeight: 600 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: '1.25rem', alignItems: 'flex-start' }}>
          {/* ── Controls ── */}
          <div>
            {/* Position */}
            <div style={cardStyle}>
              <label style={labelStyle}>Position</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {POSITIONS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPosition(p.value)}
                    style={{
                      flex: 1,
                      padding: '0.55rem 0',
                      borderRadius: 8,
                      border: `1px solid ${position === p.value ? C.green : C.border}`,
                      background: position === p.value ? C.green : 'transparent',
                      color: position === p.value ? C.bg : C.text,
                      fontWeight: 800,
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Round */}
            <div style={cardStyle}>
              <label style={labelStyle}>Round</label>
              <select value={round} onChange={(e) => setRound(e.target.value)} style={inputStyle}>
                <option value="ALL">All Rounds (aggregate)</option>
                {rounds.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name} ({r.playedCount}/{r.fixtureCount})
                  </option>
                ))}
              </select>
            </div>

            {/* Metric */}
            <div style={cardStyle}>
              <label style={labelStyle}>Metric</label>
              <select value={metric} onChange={(e) => setMetric(e.target.value)} style={inputStyle}>
                {metricOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Format */}
            <div style={cardStyle}>
              <label style={labelStyle}>Output size</label>
              <select value={format} onChange={(e) => setFormat(e.target.value as CardFormat)} style={inputStyle}>
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Background */}
            <div style={cardStyle}>
              <label style={labelStyle}>Background</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['stadium-1', 'stadium-2'] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => setBackground(b)}
                    style={{
                      flex: 1,
                      padding: '0.55rem 0',
                      borderRadius: 8,
                      border: `1px solid ${background === b ? C.green : C.border}`,
                      background: background === b ? C.green : 'transparent',
                      color: background === b ? C.bg : C.text,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.88rem',
                    }}
                  >
                    {b === 'stadium-1' ? 'Stadium 1 (night)' : 'Stadium 2 (lit)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Hero player override */}
            <div style={cardStyle}>
              <label style={labelStyle}>Hero player (right-side image)</label>
              <select
                value={heroOverride}
                onChange={(e) => setHeroOverride(e.target.value)}
                style={inputStyle}
                disabled={players.length === 0}
              >
                <option value="">Default \u2014 top-ranked with photo</option>
                {players.map((p) => (
                  <option key={p.opta_player_id} value={p.opta_player_id} disabled={!p.photo_url}>
                    #{p.rank} {p.name} ({p.team}){p.photo_url ? '' : ' \u2014 no photo'}
                  </option>
                ))}
              </select>
            </div>

            {/* Action buttons */}
            <div style={cardStyle}>
              <button
                onClick={loadPlayers}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  borderRadius: 10,
                  border: 'none',
                  background: C.green,
                  color: C.bg,
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: loading ? 'wait' : 'pointer',
                  marginBottom: 10,
                  opacity: loading ? 0.65 : 1,
                }}
              >
                {loading ? 'Loading\u2026' : hasLoadedOnce ? 'Regenerate from current settings' : 'Generate'}
              </button>
              <button
                onClick={onDownload}
                disabled={exporting || players.length === 0}
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  borderRadius: 10,
                  border: `1px solid ${C.green}`,
                  background: 'transparent',
                  color: C.green,
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: exporting ? 'wait' : 'pointer',
                  opacity: exporting || players.length === 0 ? 0.6 : 1,
                }}
              >
                {exporting ? 'Exporting PNG\u2026' : `\u2b07 Download PNG (${format})`}
              </button>
            </div>
          </div>

          {/* ── Preview ── */}
          <div>
            <div style={{ ...cardStyle, padding: '0.85rem 1rem', marginBottom: '0.6rem' }}>
              <div style={{ color: C.muted, fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Live preview \u00b7 scaled to {(previewScale * 100).toFixed(0)}% \u00b7 exports at {previewWidth}\u00d7{previewHeight}
              </div>
            </div>

            <div
              ref={previewRef}
              style={{
                width: previewWidth * previewScale,
                height: previewHeight * previewScale,
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: '#000',
              }}
            >
              <div
                style={{
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                  width: previewWidth,
                  height: previewHeight,
                }}
              >
                <TopPerformersCard
                  format={format}
                  position={position}
                  roundLabel={round === 'ALL' ? 'All Rounds' : (rounds.find((r) => r.code === round)?.name ?? round)}
                  metric={{ label: activeMetric.label, format: activeMetric.format }}
                  players={players}
                  background={background}
                  heroOverrideOptaId={heroOverride || null}
                  heroOptaLookup={heroLookup}
                />
              </div>
            </div>

            {players.length === 0 && !loading && hasLoadedOnce && (
              <div style={{ ...cardStyle, marginTop: '0.75rem', color: C.muted }}>
                No players returned for that combination. Try a different round, position, or metric \u2014 the round may not be played yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
