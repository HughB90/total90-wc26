'use client'

/**
 * PlayerDetailModal — the row-tap modal on /s3.
 *
 * Refactored 2026-06-06 into 3 tabs:
 *   - Profile (default) — T90, FIFA bars, club, age, group, app CTA
 *   - S³ Votes — community vote breakdown
 *   - Fantasy — round-by-round match scores from /api/admin/wc26-matches
 *
 * Mobile-friendly: same 420px modal as before, tab bar fits the existing
 * navy + gold palette. No new dependencies.
 *
 * Note: we deliberately stop reading s3_value here — tier band derives from
 * t90_score (with s3_value as final fallback only).
 */
import { useEffect, useState } from 'react'

export type Vote = 'sign' | 'sell' | 'sack'

export interface PlayerLite {
  id: string
  name: string
  short_name?: string
  nationality: string
  position: string
  s3_value: number
  age?: number
  photo_url?: string
  opta_id?: string
  sign_count?: number
  sell_count?: number
  sack_count?: number
  vote_count?: number
  market_value?: number
  club?: string
  ea_overall?: number
  ea_attacking?: number
  ea_passing?: number
  ea_physical?: number
  ea_mental?: number
  ea_defending?: number
  t90_score?: number | null
  cat_score?: number | null
  tenk_score?: number | null
  starting_xi?: number | null
  t90_rank?: number | null
}

type MatchScore = {
  id: string
  round: string
  opponent: string
  minutes_played: number
  goals: number
  assists: number
  key_passes: number
  tackles: number
  interceptions: number
  clean_sheet: boolean
  yellow_cards: number
  red_cards: number
  fantasy_pts: number
  breakdown: Record<string, number> | null
  played_at: string | null
}

const ROUND_LABEL: Record<string, string> = {
  group_md1: 'Group MD1', group_md2: 'Group MD2', group_md3: 'Group MD3',
  r32: 'Round of 32', r16: 'Round of 16',
  qf: 'Quarterfinal', sf: 'Semifinal',
  final3rd: '3rd Place', final: 'Final',
}

const posColors: Record<string, { bg: string; color: string }> = {
  FWD: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
  MID: { bg: 'rgba(96,165,250,0.15)', color: '#60A5FA' },
  DEF: { bg: 'rgba(0,230,118,0.15)', color: '#00E676' },
  GK:  { bg: 'rgba(251,191,36,0.15)', color: '#FBBF24' },
}

const voteConfig = {
  sign: { barColor: '#00E676' },
  sell: { barColor: '#60A5FA' },
  sack: { barColor: '#ef4444' },
} as const

// Reuse the same tier function as /s3 page (kept in sync — 5 bands).
function t90Tier(score: number | null | undefined) {
  const s = typeof score === 'number' ? score : 0
  if (s >= 100) return { label: 'Elite',       color: '#FFD700' }
  if (s >= 85)  return { label: 'World Class', color: '#C084FC' }
  if (s >= 70)  return { label: 'Top Tier',    color: '#60A5FA' }
  if (s >= 55)  return { label: 'Quality',     color: '#00E676' }
  return              { label: 'Solid',        color: '#8899CC' }
}

const COUNTRY_CODES: Record<string, string> = {
  'England': 'gb-eng', 'France': 'fr', 'Spain': 'es', 'Germany': 'de',
  'Brazil': 'br', 'Argentina': 'ar', 'Portugal': 'pt', 'Netherlands': 'nl',
  'Belgium': 'be', 'Italy': 'it', 'Morocco': 'ma', 'USA': 'us',
  'Mexico': 'mx', 'Japan': 'jp', 'Colombia': 'co', 'Uruguay': 'uy',
  'Croatia': 'hr', 'Senegal': 'sn', 'Canada': 'ca', 'Switzerland': 'ch',
  'Ecuador': 'ec', 'Denmark': 'dk', 'Australia': 'au', 'Poland': 'pl',
  'South Korea': 'kr', 'Serbia': 'rs', 'Austria': 'at', 'Turkey': 'tr', 'Türkiye': 'tr',
  'Czechia': 'cz', 'Scotland': 'gb-sct', "Côte d'Ivoire": 'ci',
  'Nigeria': 'ng', 'Chile': 'cl', 'Peru': 'pe', 'Paraguay': 'py',
  'Costa Rica': 'cr', 'Jamaica': 'jm', 'New Zealand': 'nz', 'Iraq': 'iq',
  'Cabo Verde': 'cv', 'Sweden': 'se', 'Norway': 'no', 'Romania': 'ro',
}
function getFlagUrl(nationality: string) {
  const code = COUNTRY_CODES[nationality] ?? nationality.toLowerCase().replace(/\s+/g, '-')
  return `https://flagcdn.com/w160/${code}.png`
}

const WC_GROUPS: Record<string, string[]> = {
  A: ['Mexico', 'South Korea', 'South Africa', 'Czech Republic'],
  B: ['Canada', 'Switzerland', 'Qatar', 'Bosnia and Herzegovina'],
  C: ['Brazil', 'Morocco', 'Scotland', 'Haiti'],
  D: ['USA', 'Australia', 'Paraguay', 'Turkey'],
  E: ['Germany', 'Ecuador', 'Ivory Coast', 'Curacao'],
  F: ['Netherlands', 'Japan', 'Tunisia', 'Sweden'],
  G: ['Belgium', 'Iran', 'Egypt', 'New Zealand'],
  H: ['Spain', 'Uruguay', 'Saudi Arabia', 'Cape Verde'],
  I: ['France', 'Senegal', 'Norway', 'Iraq'],
  J: ['Argentina', 'Austria', 'Algeria', 'Jordan'],
  K: ['Portugal', 'Colombia', 'Uzbekistan', 'DR Congo'],
  L: ['England', 'Croatia', 'Panama', 'Ghana'],
}
const NATIONALITY_TO_WC: Record<string, string> = {
  "Côte d'Ivoire": 'Ivory Coast',
  'Türkiye': 'Turkey',
  'Czechia': 'Czech Republic',
  'Cabo Verde': 'Cape Verde',
}
function getWCGroup(nationality: string) {
  const lookup = NATIONALITY_TO_WC[nationality] ?? nationality
  for (const [letter, teams] of Object.entries(WC_GROUPS)) {
    if (teams.includes(lookup)) return { letter, teams }
  }
  return null
}

function formatMarketValue(v?: number | null): string | null {
  if (v == null || v === 0) return null
  if (v >= 1_000_000_000) return `€${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000) return `€${Math.round(v / 1_000_000)}M`
  return `€${v.toLocaleString()}`
}

type CardTab = 'profile' | 'votes' | 'fantasy'

export default function PlayerDetailModal({
  player: p, onClose, detailVotes,
}: { player: PlayerLite; onClose: () => void; detailVotes: Record<string, Vote> }) {
  const [tab, setTab] = useState<CardTab>('profile')
  const [matches, setMatches] = useState<MatchScore[]>([])
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null)

  const vc = p.vote_count ?? 0
  const sc = p.sign_count ?? 0
  const slc = p.sell_count ?? 0
  const sack = p.sack_count ?? 0
  // FIX 2026-06-06: tier from T90 score, not s3_value.
  const t90Display = p.t90_score != null
    ? Number(p.t90_score)
    : (typeof p.s3_value === 'number' ? p.s3_value : 0)
  const tier = t90Tier(t90Display)
  const mv = formatMarketValue(p.market_value)
  const signPct = vc > 0 ? Math.round((sc / vc) * 100) : 0
  const sellPct = vc > 0 ? Math.round((slc / vc) * 100) : 0
  const sackPct = vc > 0 ? Math.round((sack / vc) * 100) : 0

  // Lazy-load fantasy matches first time tab is opened.
  useEffect(() => {
    if (tab !== 'fantasy') return
    if (matches.length > 0 || matchesLoading) return
    const optaId = p.opta_id
    if (!optaId) { setMatches([]); return }
    setMatchesLoading(true)
    fetch(`/api/admin/wc26-matches?opta_id=${encodeURIComponent(optaId)}`)
      .then(r => r.json())
      .then(j => setMatches(j.rows ?? []))
      .catch(() => setMatches([]))
      .finally(() => setMatchesLoading(false))
  }, [tab, p.opta_id, matches.length, matchesLoading])

  const totalFantasy = matches.reduce((s, m) => s + (m.fantasy_pts ?? 0), 0)

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeIn 0.2s ease' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ backgroundColor: '#0A0F2E', border: '1px solid #1E3A6E', borderRadius: '1.25rem', padding: '1.25rem', width: '100%', maxWidth: '420px', maxHeight: '90vh', overflowY: 'auto', animation: 'slideUp 0.25s ease' }}>
        {/* Close */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #1E3A6E', color: '#8899CC', cursor: 'pointer', borderRadius: '0.5rem', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontFamily: 'inherit' }} aria-label="Close">×</button>
        </div>

        {/* Player header */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', paddingBottom: '0.875rem', borderBottom: '1px solid #1E3A6E', marginBottom: '0.75rem' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {p.photo_url ? (
              <img src={p.photo_url} alt={p.short_name || p.name} referrerPolicy="no-referrer" style={{ width: '88px', height: '88px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #1E3A6E', backgroundColor: '#162040', display: 'block' }} onError={e => { (e.target as HTMLImageElement).src = 'https://tituygkbondyjhzomwji.supabase.co/storage/v1/object/public/player-photos/players/default.png' }} />
            ) : (
              <div style={{ width: '88px', height: '88px', borderRadius: '50%', backgroundColor: '#162040', border: '2px solid #1E3A6E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', color: '#4A6080', fontWeight: 700 }}>{(p.short_name || p.name).charAt(0)}</div>
            )}
            <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '26px', height: '26px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #0A0F2E' }}>
              <img src={getFlagUrl(p.nationality)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: '1.25rem', color: '#F0F4FF', marginBottom: '0.25rem', lineHeight: 1.2 }}>{p.short_name || p.name}</div>
            <div style={{ color: '#8899CC', fontSize: '0.82rem', marginBottom: '0.2rem' }}>
              {p.nationality}{' · '}
              <span style={{ color: posColors[p.position]?.color ?? '#8899CC', fontWeight: 700 }}>{p.position}</span>
            </div>
            {p.club && <div style={{ color: '#F0F4FF', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.15rem' }}>{p.club}</div>}
            {p.age && <div style={{ color: '#8899CC', fontSize: '0.75rem' }}>Age {p.age}</div>}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.875rem', borderBottom: '1px solid #1E3A6E' }}>
          {([
            { key: 'profile', label: 'Profile' },
            { key: 'votes',   label: 'S³ Votes' },
            { key: 'fantasy', label: 'Fantasy' },
          ] as { key: CardTab; label: string }[]).map(({ key, label }) => (
            <button
              key={key} onClick={() => setTab(key)}
              style={{
                flex: 1, padding: '0.55rem 0.5rem', background: 'none',
                border: 'none', borderBottom: tab === key ? '2px solid #FBBF24' : '2px solid transparent',
                color: tab === key ? '#FBBF24' : '#8899CC',
                fontWeight: tab === key ? 800 : 600, fontSize: '0.85rem',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── PROFILE TAB ────────────────────────────────────────── */}
        {tab === 'profile' && (
          <>
            {/* T90 Score */}
            <div style={{ paddingBottom: '1rem', borderBottom: '1px solid #1E3A6E', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ color: '#8899CC', fontSize: '0.78rem', fontWeight: 600 }}>T90 Score</span>
                <span style={{ color: tier.color, fontWeight: 800, fontSize: '1.05rem' }}>{Math.round(t90Display * 10) / 10} · {tier.label}</span>
              </div>
              <div style={{ height: '8px', backgroundColor: '#1E3A6E', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (t90Display / 130) * 100)}%`, backgroundColor: tier.color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
              </div>
            </div>

            {/* EA Stat Bars */}
            {p.ea_overall != null && p.ea_overall > 0 && (
              <div style={{ backgroundColor: '#0F1C4D', border: '1px solid #1E3A6E', borderRadius: '0.875rem', padding: '0.875rem 1rem', marginBottom: '0.75rem' }}>
                <div style={{ borderBottom: '1px solid #1E3A6E', paddingBottom: '0.5rem', marginBottom: '0.625rem' }}>
                  <span style={{ color: '#8899CC', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>EA FC Attributes</span>
                </div>
                {([
                  ['Attacking', p.ea_attacking], ['Passing', p.ea_passing], ['Physical', p.ea_physical], ['Mental', p.ea_mental], ['Defending', p.ea_defending],
                ] as [string, number | undefined][]).filter(([, v]) => v != null).map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem' }}>
                    <span style={{ color: '#8899CC', fontSize: '0.72rem', width: '68px', flexShrink: 0 }}>{label}</span>
                    <div style={{ flex: 1, height: '6px', backgroundColor: '#1E3A6E', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${val}%`, backgroundColor: '#00E676', borderRadius: '3px' }} />
                    </div>
                    <span style={{ color: '#F0F4FF', fontSize: '0.72rem', fontWeight: 700, width: '24px', textAlign: 'right' as const }}>{val}</span>
                  </div>
                ))}
              </div>
            )}

            {mv && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ color: '#8899CC', fontSize: '0.78rem' }}>Market Value</span>
                <span style={{ color: '#FBBF24', fontWeight: 700, fontSize: '0.9rem' }}>{mv}</span>
              </div>
            )}

            {(() => {
              const wcGroup = getWCGroup(p.nationality)
              if (!wcGroup) return null
              const otherTeams = wcGroup.teams.filter(t => {
                const wc = NATIONALITY_TO_WC[p.nationality] ?? p.nationality
                return t !== wc
              })
              return (
                <div style={{ paddingTop: '0.5rem', paddingBottom: '1rem', borderBottom: '1px solid #1E3A6E', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' as const }}>
                    <span style={{ color: '#FBBF24', fontWeight: 700, fontSize: '0.78rem', flexShrink: 0 }}>🌍 WC Group {wcGroup.letter}</span>
                    <span style={{ color: '#4A6080', fontSize: '0.72rem' }}>·</span>
                    <span style={{ color: '#8899CC', fontSize: '0.72rem' }}>
                      <strong style={{ color: '#F0F4FF' }}>{p.nationality}</strong>{' vs '}{otherTeams.join(', ')}
                    </span>
                  </div>
                </div>
              )
            })()}

            {/* App CTA */}
            <div style={{ backgroundColor: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '0.875rem', padding: '1rem', textAlign: 'center' as const, marginTop: '0.75rem' }}>
              <p style={{ color: '#FBBF24', fontWeight: 800, fontSize: '1rem', margin: '0 0 0.35rem' }}>📱 Total90 Fantasy App</p>
              <p style={{ color: '#8899CC', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>S³ ratings, trade calculator & more</p>
              <p style={{ color: '#FBBF24', fontWeight: 700, fontSize: '0.85rem', margin: '0 0 0.75rem' }}>Out now on iOS</p>
              <a href="https://apps.apple.com/us/app/total90/id6749282785" target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-block', backgroundColor: '#00E676', color: '#0A0F2E', fontWeight: 800, fontSize: '0.9rem', padding: '0.65rem 1.5rem', borderRadius: '0.75rem', textDecoration: 'none' }}>
                Download Free on iOS →
              </a>
            </div>
          </>
        )}

        {/* ── S³ VOTES TAB ───────────────────────────────────────── */}
        {tab === 'votes' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ color: '#8899CC', fontSize: '0.78rem', fontWeight: 600 }}>Community Votes</span>
              <span style={{ color: '#4A6080', fontSize: '0.72rem' }}>{vc.toLocaleString()} total</span>
            </div>
            {vc === 0 ? (
              <div style={{ textAlign: 'center', color: '#4A6080', fontSize: '0.85rem', padding: '1.5rem 0' }}>
                Be the first to vote!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {([['sign', signPct], ['sell', sellPct], ['sack', sackPct]] as [Vote, number][]).map(([v, pctVal]) => (
                  <div key={v} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: voteConfig[v].barColor, fontWeight: 700, fontSize: '0.75rem', width: '40px', textAlign: 'right', textTransform: 'uppercase' }}>{v}</span>
                    <div style={{ flex: 1, height: '8px', backgroundColor: '#1E3A6E', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pctVal}%`, backgroundColor: voteConfig[v].barColor, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                    </div>
                    <span style={{ color: '#F0F4FF', fontSize: '0.78rem', fontWeight: 700, width: '36px', textAlign: 'right' as const }}>{pctVal}%</span>
                  </div>
                ))}
              </div>
            )}
            {detailVotes[p.id] && (
              <div style={{ marginTop: '1rem', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', backgroundColor: voteConfig[detailVotes[p.id]].barColor + '15', border: `1px solid ${voteConfig[detailVotes[p.id]].barColor}55`, color: voteConfig[detailVotes[p.id]].barColor, fontSize: '0.78rem', fontWeight: 600, textAlign: 'center' as const }}>
                You voted: <strong style={{ textTransform: 'uppercase' as const }}>{detailVotes[p.id]}</strong>
              </div>
            )}
          </div>
        )}

        {/* ── FANTASY TAB ────────────────────────────────────────── */}
        {tab === 'fantasy' && (
          <div>
            {/* Tournament total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem', paddingBottom: '0.65rem', borderBottom: '1px solid #1E3A6E' }}>
              <span style={{ color: '#8899CC', fontSize: '0.78rem', fontWeight: 600 }}>Tournament Fantasy Pts</span>
              <span style={{ color: '#FBBF24', fontSize: '1.5rem', fontWeight: 900 }}>{totalFantasy.toFixed(1)}</span>
            </div>

            {matchesLoading ? (
              <div style={{ textAlign: 'center', color: '#8899CC', padding: '1.5rem 0' }}>Loading…</div>
            ) : matches.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#8899CC', padding: '1.5rem 0', fontSize: '0.85rem', lineHeight: 1.5 }}>
                🏆 Tournament starts June 11.<br />
                Fantasy scores will appear here after each match.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {matches.map(m => {
                  const open = expandedMatch === m.id
                  const statLine = [
                    `${m.minutes_played}'`,
                    m.goals ? `${m.goals}G` : null,
                    m.assists ? `${m.assists}A` : null,
                    m.key_passes ? `${m.key_passes}KP` : null,
                    m.tackles ? `${m.tackles}T` : null,
                  ].filter(Boolean).join(' · ')
                  return (
                    <div key={m.id}
                      onClick={() => setExpandedMatch(open ? null : m.id)}
                      style={{ backgroundColor: '#0F1C4D', border: '1px solid #1E3A6E', borderRadius: '0.75rem', padding: '0.65rem 0.85rem', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#F0F4FF' }}>{ROUND_LABEL[m.round] ?? m.round}</div>
                          <div style={{ color: '#8899CC', fontSize: '0.72rem' }}>vs {m.opponent}</div>
                          <div style={{ color: '#4A6080', fontSize: '0.7rem', marginTop: '0.15rem' }}>{statLine}</div>
                        </div>
                        <div style={{ color: '#FFD740', fontWeight: 900, fontSize: '1.25rem', flexShrink: 0 }}>{Number(m.fantasy_pts ?? 0).toFixed(1)}</div>
                      </div>
                      {open && m.breakdown && (
                        <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid #1E3A6E', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.35rem' }}>
                          {Object.entries(m.breakdown).map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.7rem' }}>
                              <span style={{ color: '#8899CC' }}>{k}</span>
                              <span style={{ color: '#F0F4FF', fontWeight: 600 }}>{Number(v).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
