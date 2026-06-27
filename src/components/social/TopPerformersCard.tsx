/**
 * TopPerformersCard — TOTAL90-branded social ranked-list graphic.
 *
 * Renders at exact pixel dimensions (1080 × 1350 for IG feed, 1080 × 1920
 * for Stories/TikTok/Reels) so html-to-image can rasterize the DOM 1:1
 * to PNG. All sizes are inline px values — never rem/em — so the export
 * matches what's shown.
 *
 * Used by /admin/social/top-performers (admin tool).
 */

import * as React from 'react'

export type CardFormat = '1080x1350' | '1080x1920'
// Public-facing position codes (GK/DEF/MID/FWD). The card never sees the
// DB-internal GKP/FOR codes — those are normalized at the API boundary.
export type CardPosition = 'GK' | 'DEF' | 'MID' | 'FWD'

export interface PerformerRow {
  rank: number
  opta_player_id: string
  name: string
  first_name?: string | null
  last_name?: string | null
  team: string
  flag_code: string | null
  photo_url: string | null
  value: number
}

export interface MetricMeta {
  /** Display name shown in subtitle, e.g. "T90 Score", "Goals" */
  label: string
  /** Format value for display, e.g. "12", "87.5%" */
  format: (v: number) => string
}

export interface TopPerformersCardProps {
  format: CardFormat
  position: CardPosition
  roundLabel: string // e.g. "Matchday 1" or "All Rounds"
  metric: MetricMeta
  players: PerformerRow[] // up to 10
  background: 'stadium-1' | 'stadium-2'
}

const COLOR = {
  bgNavy: '#0A0F2E',
  navyDeep: '#0E1B2C',
  green: '#00E676',
  greenBright: '#27E83A',
  white: '#FFFFFF',
  rowDark: '#0E1B2C',
  border: 'rgba(0,230,118,0.18)',
}

// Position accent colors — match the player-card pills (GK red, DEF green,
// MID gold, FWD blue). Used to tint the position word in the subtitle.
const POSITION_COLOR: Record<CardPosition, string> = {
  GK: '#E63946',
  DEF: '#2ECC71',
  MID: '#F4C430',
  FWD: '#3D5AFE',
}

// Soft glow used on the white title text — keeps it readable on the navy bg
// and matches the gentle bloom on the player-card pills.
const WHITE_GLOW =
  '0 0 8px rgba(255,255,255,0.55), 0 0 18px rgba(255,255,255,0.35), 0 2px 0 rgba(0,0,0,0.45)'

const FALLBACK_AVATAR =
  'https://tituygkbondyjhzomwji.supabase.co/storage/v1/object/public/player-photos/players/default.png'

function flagSrc(code: string | null): string | null {
  if (!code) return null
  // Same-origin proxy (see /api/flag/[code]) — avoids cross-origin / CORS
  // races during html-to-image canvas export so all 10 flag cells render.
  return `/api/flag/${code}`
}

function displayName(p: PerformerRow): string {
  // Use Opta's short/display name (matchName) — e.g. "K. Mbappé", "Saka",
  // "Cristiano Ronaldo". Falls back to constructed "F. Lastname" only if
  // the display field is empty.
  if (p.name && p.name.trim()) return p.name.toUpperCase()
  if (p.last_name && p.first_name) {
    const fi = p.first_name.trim().charAt(0)
    return `${fi}. ${p.last_name}`.toUpperCase()
  }
  return (p.last_name || '').toUpperCase()
}

function positionLabel(p: CardPosition): string {
  switch (p) {
    case 'GK': return 'Goalkeepers'
    case 'DEF': return 'Defenders'
    case 'MID': return 'Midfielders'
    case 'FWD': return 'Forwards'
  }
}

// ID used by html-to-image to find the export node
export const TOP_PERFORMERS_CARD_ID = 'top-performers-card-export'

export function TopPerformersCard(props: TopPerformersCardProps) {
  const { format, position, roundLabel, metric, players, background } = props

  const width = 1080
  const height = format === '1080x1350' ? 1350 : 1920

  // Reserve a 12% header bar.
  const headerH = Math.round(height * 0.12)
  const bodyH = height - headerH

  // Row sizing — pack 10 rows comfortably into bodyH
  const rowCount = Math.max(players.length, 1)
  const rowGap = 12
  const sidePad = 36 // outside row container padding
  const listPaddingY = 40 // vertical padding inside body
  const usableListH = bodyH - listPaddingY * 2
  const rowH = Math.floor((usableListH - rowGap * (rowCount - 1)) / rowCount)

  // Photo pill size = full row height (per template)
  const photoSize = rowH

  // Rows always take full width (hero player removed per spec)
  const rowsContainerWidth = width - sidePad * 2

  const bgUrl = background === 'stadium-1' ? '/social-templates/stadium-1.jpg' : '/social-templates/stadium-2.jpg'

  return (
    <div
      id={TOP_PERFORMERS_CARD_ID}
      style={{
        position: 'relative',
        width: `${width}px`,
        height: `${height}px`,
        background: COLOR.bgNavy,
        overflow: 'hidden',
        fontFamily: '"Bebas Neue", "Oswald", "Impact", system-ui, sans-serif',
        color: COLOR.white,
        boxSizing: 'border-box',
      }}
    >
      {/* Stadium background w/ overlay — uses an <img> with object-fit:cover
          so the source image crops cleanly to either 1080x1350 or 1080x1920
          regardless of source aspect ratio. */}
      <div
        style={{
          position: 'absolute',
          top: `${headerH}px`,
          left: 0,
          width: `${width}px`,
          height: `${bodyH}px`,
          overflow: 'hidden',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bgUrl}
          alt=""
          crossOrigin="anonymous"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block',
          }}
        />
      </div>
      {/* Header bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${width}px`,
          height: `${headerH}px`,
          background: COLOR.navyDeep,
          borderBottom: `2px solid ${COLOR.green}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 32px',
          boxSizing: 'border-box',
        }}
      >
        {/* Left: Total90 logo */}
        <div style={{ width: 140, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/total90-logo-green.png"
            alt=""
            crossOrigin="anonymous"
            style={{ width: 110, height: 'auto', display: 'block' }}
          />
        </div>

        {/* Center: title */}
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            lineHeight: 1.0,
          }}
        >
          <div
            style={{
              color: COLOR.white,
              fontSize: 56,
              fontWeight: 900,
              fontStyle: 'italic',
              letterSpacing: '0.02em',
              textShadow: WHITE_GLOW,
            }}
          >
            TOTAL90 Fantasy
          </div>
          <div
            style={{
              color: COLOR.white,
              fontSize: 42,
              fontWeight: 800,
              fontStyle: 'italic',
              letterSpacing: '0.02em',
              marginTop: 6,
              textShadow: WHITE_GLOW,
            }}
          >
            Top 10{' '}
            <span
              style={{
                color: POSITION_COLOR[position],
                textShadow: `0 0 8px ${POSITION_COLOR[position]}AA, 0 0 18px ${POSITION_COLOR[position]}66, 0 2px 0 rgba(0,0,0,0.45)`,
              }}
            >
              {positionLabel(position)}
            </span>{' '}
            · {roundLabel}
          </div>
          <div
            style={{
              color: COLOR.white,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: '0.15em',
              marginTop: 8,
              opacity: 0.95,
              textShadow: '0 0 6px rgba(255,255,255,0.35), 0 2px 0 rgba(0,0,0,0.4)',
            }}
          >
            METRIC: <span style={{ color: COLOR.white, fontWeight: 800 }}>{metric.label.toUpperCase()}</span>
          </div>
        </div>

        {/* Right: WC26 mark — fallback to the same logo if we don't have a dedicated cup asset */}
        <div style={{ width: 140, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/total90-logo-green.png"
            alt=""
            crossOrigin="anonymous"
            style={{ width: 110, height: 'auto', display: 'block' }}
          />
        </div>
      </div>

      {/* Rows container */}
      <div
        style={{
          position: 'absolute',
          top: `${headerH + listPaddingY}px`,
          left: `${sidePad}px`,
          width: `${rowsContainerWidth}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: `${rowGap}px`,
          zIndex: 2,
        }}
      >
        {players.map((p) => {
          const isLeader = p.rank === 1
          const pillBg = isLeader ? COLOR.greenBright : COLOR.rowDark
          const textColor = isLeader ? COLOR.navyDeep : COLOR.green
          const rankFontSize = Math.round(rowH * 0.66)
          const nameFontSize = Math.round(rowH * 0.46)
          const valueFontSize = Math.round(rowH * 0.46)
          return (
            <div
              key={p.rank}
              style={{
                position: 'relative',
                height: `${rowH}px`,
                background: pillBg,
                borderRadius: `${rowH}px`,
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 24,
                paddingRight: 0,
                boxShadow: isLeader
                  ? '0 0 24px rgba(39,232,58,0.45), 0 6px 18px rgba(0,0,0,0.4)'
                  : '0 6px 18px rgba(0,0,0,0.55)',
                border: isLeader ? '2px solid #FFFFFF' : `1px solid rgba(0,230,118,0.18)`,
                boxSizing: 'border-box',
                overflow: 'hidden',
              }}
            >
              {/* Rank */}
              <div
                style={{
                  width: Math.round(rowH * 1.2),
                  flex: '0 0 auto',
                  fontFamily: '"Bebas Neue", "Oswald", "Impact", system-ui, sans-serif',
                  fontWeight: 900,
                  fontStyle: 'italic',
                  fontSize: rankFontSize,
                  color: textColor,
                  textAlign: 'left',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                {p.rank}.
              </div>

              {/* Flag */}
              <div
                style={{
                  width: Math.round(rowH * 1.05),
                  height: Math.round(rowH * 0.62),
                  flex: '0 0 auto',
                  marginRight: 18,
                  background: '#222',
                  borderRadius: 6,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                {flagSrc(p.flag_code) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={flagSrc(p.flag_code) as string}
                    alt=""
                    crossOrigin="anonymous"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                )}
              </div>

              {/* Name */}
              <div
                style={{
                  flex: 1,
                  fontFamily: '"Bebas Neue", "Oswald", "Impact", system-ui, sans-serif',
                  fontWeight: 800,
                  fontStyle: 'italic',
                  fontSize: nameFontSize,
                  color: textColor,
                  letterSpacing: '0.02em',
                  lineHeight: 1.05,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  paddingRight: 16,
                }}
              >
                {displayName(p)}
              </div>

              {/* Value badge */}
              <div
                style={{
                  flex: '0 0 auto',
                  paddingRight: 18,
                  fontFamily: '"Bebas Neue", "Oswald", "Impact", system-ui, sans-serif',
                  fontWeight: 900,
                  fontStyle: 'italic',
                  fontSize: valueFontSize,
                  color: textColor,
                  letterSpacing: '-0.01em',
                  textAlign: 'right',
                  minWidth: 90,
                }}
              >
                {metric.format(p.value)}
              </div>

              {/* Headshot pill on far right edge */}
              <div
                style={{
                  width: `${photoSize}px`,
                  height: `${photoSize}px`,
                  flex: '0 0 auto',
                  borderRadius: '50%',
                  background: '#162040',
                  border: isLeader ? `3px solid ${COLOR.navyDeep}` : `3px solid ${COLOR.green}`,
                  overflow: 'hidden',
                  marginLeft: 6,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.photo_url || FALLBACK_AVATAR}
                  alt=""
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer watermark */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 24,
          color: '#FFFFFF',
          opacity: 0.7,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textShadow: '0 2px 4px rgba(0,0,0,0.7)',
          zIndex: 3,
        }}
      >
        total90.com
      </div>
    </div>
  )
}

export default TopPerformersCard
