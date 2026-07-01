'use client'

import { useEffect, useState, useMemo } from 'react'
import { Activity } from 'lucide-react'
import { selectStyle } from '@/lib/select-style'

// ─── Types ────────────────────────────────────────────────────────────────────

type PosType = 'ALL' | 'GKP' | 'DEF' | 'MID' | 'FOR'

interface Player {
  opta_player_id: string
  name: string
  first_name?: string | null
  last_name?: string | null
  team: string
  position: string
  pos_type: PosType
  games_played: number
  mins_total: number
  fantasy_points_total: number
  fantasy_points_avg: number
  fantasy_points_per_90: number
  category_points?: {
    attacking: number
    playmaker: number
    passing: number
    defensive: number
    possession: number
    discipline: number
    goalkeepers: number
  }
  attacking: {
    goals: number
    assists: number
    sot: number
    sh: number
    kp: number
    bc: number
    touches_in_box?: number
    won_contest?: number
    was_fouled?: number
  }
  defensive: {
    tackles: number
    interceptions: number
    blocks: number
    clean_sheets: number
    aerial_won?: number
    duels_won?: number
  }
  discipline: {
    yc: number
    rc: number
    og: number
    off: number
    fouls?: number
    err_shot?: number
    err_goal?: number
  }
  passing: {
    pass_acc: number
    acc_long: number
    ppa: number
    ft3: number
    acc_crosses?: number
    acc_chipped?: number
  }
  playmaker: {
    kp: number
    bc: number
    through_balls: number
    touches_in_box: number
    winning_goals: number
    second_assists?: number
  }
  possession: {
    recoveries: number
    duels_won: number
    dispossessed: number
    poss_lost: number
    turnover?: number
  }
  gk?: {
    saves: number
    high_claims: number
    pen_saves: number
    diving_saves?: number
    punches?: number
    keeper_throws_acc?: number
  }
}

// StatView drives the PTS column + which stat columns render.
// 'overall' preserves the historical layout; every other value is a
// BreakdownCategory the /api/fantasy/players endpoint knows how to sort by.
type StatView =
  | 'overall'
  | 'attacking'
  | 'playmaker'
  | 'passing'
  | 'defensive'
  | 'possession'
  | 'discipline'
  | 'goalkeepers'

const STAT_VIEWS: Array<{ v: StatView; label: string }> = [
  { v: 'overall',     label: 'Overall' },
  { v: 'attacking',   label: 'Attacking' },
  { v: 'playmaker',   label: 'Playmaker' },
  { v: 'passing',     label: 'Passing' },
  { v: 'defensive',   label: 'Defensive' },
  { v: 'possession',  label: 'Possession' },
  { v: 'discipline',  label: 'Discipline' },
  { v: 'goalkeepers', label: 'Goalkeeping' },
]

// Pull the PTS number for a given stat view. Overall = total fantasy points;
// otherwise pull from the category_points map (falls back to 0 for older
// cached rows without category_points).
function viewTotal(p: Player, view: StatView): number {
  if (view === 'overall') return p.fantasy_points_total
  return p.category_points?.[view] ?? 0
}

// Per-90 for the current stat view: category pts * 90 / mins, or the aggregate
// fantasy_points_per_90 in overall mode.
function viewPer90(p: Player, view: StatView): number {
  if (view === 'overall') return p.fantasy_points_per_90
  if (p.mins_total <= 0) return 0
  return Math.round(((p.category_points?.[view] ?? 0) * 90 / p.mins_total) * 100) / 100
}

// Column set per stat view for the desktop StatsGrid. Kept lean (4–6 stat
// columns) so the grid stays readable without heavy horizontal scroll.
type StatColumn = {
  key: string
  label: string
  accessor: (p: Player) => number | string
  color?: string
}

function getStatColumns(view: StatView): StatColumn[] {
  switch (view) {
    case 'attacking':
      return [
        { key: 'g',   label: 'G',   accessor: p => p.attacking.goals || '-' },
        { key: 'sh',  label: 'Sh',  accessor: p => p.attacking.sh || '-' },
        { key: 'sot', label: 'SoT', accessor: p => p.attacking.sot || '-' },
        { key: 'tib', label: 'TiB', accessor: p => p.attacking.touches_in_box || '-' },
        { key: 'wc',  label: 'WC',  accessor: p => p.attacking.won_contest || '-' },
        { key: 'fd',  label: 'FD',  accessor: p => p.attacking.was_fouled || '-' },
      ]
    case 'playmaker':
      return [
        { key: 'a',   label: 'A',   accessor: p => p.attacking.assists || '-' },
        { key: 'kp',  label: 'KP',  accessor: p => p.playmaker.kp || '-' },
        { key: 'bc',  label: 'BC',  accessor: p => p.playmaker.bc || '-' },
        { key: 'tb',  label: 'TB',  accessor: p => p.playmaker.through_balls || '-' },
        { key: '2a',  label: '2A',  accessor: p => p.playmaker.second_assists || '-' },
        { key: 'tib', label: 'TiB', accessor: p => p.playmaker.touches_in_box || '-' },
      ]
    case 'passing':
      return [
        { key: 'acc',   label: 'Acc%',  accessor: p => p.passing.pass_acc ? `${p.passing.pass_acc}%` : '-' },
        { key: 'long',  label: 'Long',  accessor: p => p.passing.acc_long || '-' },
        { key: 'crs',   label: 'Cross', accessor: p => p.passing.acc_crosses || '-' },
        { key: 'f3',    label: 'F3',    accessor: p => p.passing.ft3 || '-' },
        { key: 'chip',  label: 'Chip',  accessor: p => p.passing.acc_chipped || '-' },
      ]
    case 'defensive':
      return [
        { key: 'tk',  label: 'Tk',   accessor: p => p.defensive.tackles || '-' },
        { key: 'int', label: 'Int',  accessor: p => p.defensive.interceptions || '-' },
        { key: 'bl',  label: 'Bl',   accessor: p => p.defensive.blocks || '-' },
        { key: 'aer', label: 'Aer',  accessor: p => p.defensive.aerial_won || '-' },
        { key: 'dw',  label: 'DW',   accessor: p => p.defensive.duels_won || '-' },
        { key: 'cs',  label: 'CS',   accessor: p => p.defensive.clean_sheets || '-' },
      ]
    case 'possession':
      return [
        { key: 'rec', label: 'Rec',  accessor: p => p.possession.recoveries || '-' },
        { key: 'dw',  label: 'DW',   accessor: p => p.possession.duels_won || '-' },
        { key: 'dis', label: 'Disp', accessor: p => p.possession.dispossessed || '-' },
        { key: 'pl',  label: 'PL',   accessor: p => p.possession.poss_lost || '-' },
        { key: 'to',  label: 'TO',   accessor: p => p.possession.turnover || '-' },
      ]
    case 'discipline':
      return [
        { key: 'f',   label: 'F',    accessor: p => p.discipline.fouls || '-' },
        { key: 'yc',  label: 'YC',   accessor: p => p.discipline.yc || '-' },
        { key: 'rc',  label: 'RC',   accessor: p => p.discipline.rc || '-' },
        { key: 'off', label: 'Off',  accessor: p => p.discipline.off || '-' },
        { key: 'es',  label: 'E→Sh', accessor: p => p.discipline.err_shot || '-' },
        { key: 'eg',  label: 'E→G',  accessor: p => p.discipline.err_goal || '-' },
      ]
    case 'goalkeepers':
      return [
        { key: 'sv',  label: 'Sv',    accessor: p => p.gk?.saves || '-' },
        { key: 'ds',  label: 'DSv',   accessor: p => p.gk?.diving_saves || '-' },
        { key: 'hc',  label: 'HC',    accessor: p => p.gk?.high_claims || '-' },
        { key: 'ps',  label: 'PSv',   accessor: p => p.gk?.pen_saves || '-' },
        { key: 'pun', label: 'Pun',   accessor: p => p.gk?.punches || '-' },
        { key: 'kt',  label: 'KT',    accessor: p => p.gk?.keeper_throws_acc || '-' },
      ]
    case 'overall':
    default:
      // Preserve the original overall column set exactly.
      return []
  }
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

interface PlayerMatch {
  date: string
  round: string
  opponent: string
  result: string
  mins: number
  fantasy_points: number
  breakdown: Record<string, number>
  raw_stats: Record<string, number>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Diacritic-insensitive lowercase trim. Strips combining marks via NFD so
// 'Díaz' → 'diaz', 'Mbappé' → 'mbappe', 'Müller' → 'muller'.
const normalize = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

// ─── Color tokens ─────────────────────────────────────────────────────────────

const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  gold: '#FBBF24',
  mint: '#00E676',
  muted: '#8899CC',
  text: '#F0F4FF',
  red: '#FF4D6D',
  accent: '#00E676',
}

// ─── Breakdown metadata ──────────────────────────────────────────────────────
// Maps the v1.4 scoring controller's breakdown keys (camelCase Opta names)
// to:
//   label    → human-friendly stat name shown in the drawer
//   category → one of the 7 v1.4 taxonomy groups
//
// The breakdown JSON from /api/fantasy/player/[opta_id] already uses Opta's
// canonical key names, so rawKey == breakdown key (identity lookup against
// raw_stats). Anything not in this map falls through to a sensible default.

type BreakdownCategory =
  | 'attacking'
  | 'defensive'
  | 'discipline'
  | 'passing'
  | 'possession'
  | 'playmaker'
  | 'goalkeepers'

const CATEGORY_LABEL: Record<BreakdownCategory, string> = {
  attacking: 'Attacking',
  defensive: 'Defensive',
  discipline: 'Discipline',
  passing: 'Passing',
  possession: 'Possession',
  playmaker: 'Playmaker',
  goalkeepers: 'Goalkeeping',
}

// Order matters only as a stable tiebreaker — the UI sorts categories by
// subtotal magnitude (descending) so the biggest contributors float to the top.
const CATEGORY_ORDER: BreakdownCategory[] = [
  'attacking',
  'playmaker',
  'passing',
  'possession',
  'defensive',
  'goalkeepers',
  'discipline',
]

const BREAKDOWN_META: Record<string, { label: string; category: BreakdownCategory }> = {
  // ─── Attacking ────────────────────────────────────────────────
  minsPlayed:                  { label: 'Minutes played',         category: 'attacking' },
  goals:                       { label: 'Goals',                  category: 'attacking' },
  attIboxGoal:                 { label: 'Goal (in the box)',      category: 'attacking' },
  attHdGoal:                   { label: 'Headed goal',            category: 'attacking' },
  attPenGoal:                  { label: 'Penalty scored',         category: 'attacking' },
  attGoalLowLeft:              { label: 'Goal — low left',        category: 'attacking' },
  attGoalLowRight:             { label: 'Goal — low right',       category: 'attacking' },
  totalScoringAtt:             { label: 'Shots',                  category: 'attacking' },
  ontargetAttAssist:           { label: 'Shot on target',         category: 'attacking' },
  offtargetAttAssist:          { label: 'Shot off target',        category: 'attacking' },
  postScoringAtt:              { label: 'Shot off post',          category: 'attacking' },
  attSvLowLeft:                { label: 'Shot saved — low left',  category: 'attacking' },
  attSvLowRight:               { label: 'Shot saved — low right', category: 'attacking' },
  attSvHighLeft:               { label: 'Shot saved — high left', category: 'attacking' },
  attSvHighRight:              { label: 'Shot saved — high right',category: 'attacking' },
  touchesInOppBox:             { label: 'Touches in opp box',     category: 'attacking' },
  wasFouled:                   { label: 'Fouls drawn',            category: 'attacking' },
  wonContest:                  { label: '1v1 won (dribble)',      category: 'attacking' },
  penAreaEntries:              { label: 'Penalty area entries',   category: 'attacking' },

  // ─── Playmaker ────────────────────────────────────────────────
  goalAssist:                  { label: 'Assist',                 category: 'playmaker' },
  goalAssistSetplay:           { label: 'Assist (set piece)',     category: 'playmaker' },
  secondGoalAssist:            { label: 'Second assist',          category: 'playmaker' },
  assistBlockedShot:           { label: 'Assist (blocked shot)',  category: 'playmaker' },
  assistHandballWon:           { label: 'Assist (handball won)',  category: 'playmaker' },
  assistOwnGoal:               { label: 'Assist (own goal)',      category: 'playmaker' },
  totalAttAssist:              { label: 'Key pass',               category: 'playmaker' },
  bigChanceCreated:            { label: 'Big chance created',     category: 'playmaker' },
  accurateThroughBall:         { label: 'Through balls (acc.)',   category: 'playmaker' },
  accuratePullBack:            { label: 'Pull-back (acc.)',       category: 'playmaker' },
  winningGoal:                 { label: 'Match-winning goal',     category: 'playmaker' },

  // ─── Passing ──────────────────────────────────────────────────
  accuratePass:                { label: 'Accurate passes',          category: 'passing' },
  accurateLongBalls:           { label: 'Accurate long balls',      category: 'passing' },
  accurateCrossNocorner:       { label: 'Accurate crosses (open)',  category: 'passing' },
  accurateChippedPass:         { label: 'Accurate chipped passes',  category: 'passing' },
  accurateFlickOn:             { label: 'Accurate flick-ons',       category: 'passing' },
  accurateLayoffs:             { label: 'Accurate lay-offs',        category: 'passing' },
  successfulFinalThirdPasses:  { label: 'Passes into final third',  category: 'passing' },

  // ─── Defensive ────────────────────────────────────────────────
  cleanSheet:                  { label: 'Clean sheet',             category: 'defensive' },
  goalsConceded:               { label: 'Goals conceded',          category: 'defensive' },
  totalTackle:                 { label: 'Tackles',                 category: 'defensive' },
  lastManTackle:               { label: 'Last-man tackle',         category: 'defensive' },
  outfielderBlock:             { label: 'Blocks',                  category: 'defensive' },
  sixYardBlock:                { label: 'Six-yard block',          category: 'defensive' },
  interceptionsInBox:          { label: 'Interceptions (in box)',  category: 'defensive' },
  offsideProvoked:             { label: 'Offsides provoked',       category: 'defensive' },
  aerialWon:                   { label: 'Aerial duels won',        category: 'defensive' },
  duelWon:                     { label: 'Duels won',               category: 'defensive' },

  // ─── Possession ───────────────────────────────────────────────
  ballRecovery:                { label: 'Ball recoveries',     category: 'possession' },
  dispossessed:                { label: 'Dispossessed',        category: 'possession' },
  possLostAll:                 { label: 'Possession lost',     category: 'possession' },
  turnover:                    { label: 'Turnover',            category: 'possession' },
  duelLost:                    { label: 'Duels lost',          category: 'possession' },

  // ─── Discipline ───────────────────────────────────────────────
  fouls:                       { label: 'Fouls committed',     category: 'discipline' },
  yellowCard:                  { label: 'Yellow card',         category: 'discipline' },
  totalOffside:                { label: 'Offside',             category: 'discipline' },
  errorLeadToShot:             { label: 'Error → shot',        category: 'discipline' },
  errorLeadToGoal:             { label: 'Error → goal',        category: 'discipline' },

  // ─── Goalkeeping ──────────────────────────────────────────────
  saves:                       { label: 'Saves',                  category: 'goalkeepers' },
  divingSave:                  { label: 'Diving saves',           category: 'goalkeepers' },
  savedObox:                   { label: 'Saves (outside box)',    category: 'goalkeepers' },
  punches:                     { label: 'Punches',                category: 'goalkeepers' },
  goodHighClaim:               { label: 'High claims',            category: 'goalkeepers' },
  accurateKeeperThrows:        { label: 'Keeper throws (acc.)',   category: 'goalkeepers' },
  accurateKeeperSweeper:       { label: 'Keeper sweeper (acc.)',  category: 'goalkeepers' },
  accurateGoalKicks:           { label: 'Goal kicks (acc.)',      category: 'goalkeepers' },
}

// Fallback category for any breakdown key we haven't explicitly mapped.
function categoryFor(key: string): BreakdownCategory {
  return BREAKDOWN_META[key]?.category ?? 'attacking'
}

function labelFor(key: string): string {
  return BREAKDOWN_META[key]?.label ?? key
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FantasyClient() {
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [selectedComp, setSelectedComp] = useState('WC2026')
  const [selectedRound, setSelectedRound] = useState('ALL')
  const [selectedPos, setSelectedPos] = useState<PosType>('ALL')
  const [selectedTeam, setSelectedTeam] = useState<string>('ALL')
  const [allTeams, setAllTeams] = useState<string[]>([])
  const [scoreMode, setScoreMode] = useState<'total' | 'per90'>('total')
  const [statView, setStatView] = useState<StatView>('overall')
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [drawerPlayer, setDrawerPlayer] = useState<Player | null>(null)
  const [drawerMatches, setDrawerMatches] = useState<PlayerMatch[]>([])
  const [drawerLoading, setDrawerLoading] = useState(false)

  // Fetch competitions on mount
  useEffect(() => {
    fetch('/api/fantasy/competitions')
      .then(r => r.json())
      .then(data => {
        setCompetitions(data)
      })
      .catch(console.error)
  }, [])

  // Fetch players when filters change
  useEffect(() => {
    setLoading(true)
    // Sort key varies by stat view. Overall keeps the historical fantasy_points
    // sort; category views use category:<cat> / category_per90:<cat> so the
    // server sorts by the selected category's subtotal instead of the total.
    let sortParam: string
    if (statView === 'overall') {
      sortParam = scoreMode === 'per90' ? 'fantasy_points_per_90:desc' : 'fantasy_points:desc'
    } else {
      sortParam = scoreMode === 'per90'
        ? `category_per90:${statView}:desc`
        : `category:${statView}:desc`
    }
    // When viewing Goalkeeping, force GKP filter server-side so we don't waste
    // rows on outfielders with 0 GK points.
    const effectivePos = statView === 'goalkeepers' ? 'GKP' : selectedPos
    const params = new URLSearchParams({
      competition: selectedComp,
      round: selectedRound,
      position: effectivePos,
      sort: sortParam,
      limit: '500',
    })
    // NOTE: `search` is intentionally NOT sent to the API. Server-side search
    // is a case-sensitive prefix-only ilike on `name`, which can't strip
    // diacritics. We do filtering client-side via `filteredPlayers` below so
    // 'Mbappe' finds 'K. Mbappé', etc.
    if (selectedTeam !== 'ALL') params.set('nation', selectedTeam)

    fetch(`/api/fantasy/players?${params}`)
      .then(r => r.json())
      .then(data => {
        setPlayers(data)
        setLoading(false)
        // Seed the team list from the first unfiltered fetch so the dropdown
        // always shows every nation, not just the currently filtered one.
        if (selectedTeam === 'ALL' && Array.isArray(data) && data.length > 0) {
          setAllTeams(prev => {
            if (prev.length > 0) return prev
            const teams = Array.from(new Set(data.map((p: Player) => p.team).filter(Boolean))).sort()
            return teams as string[]
          })
        }
      })
      .catch(e => {
        console.error(e)
        setLoading(false)
      })
  }, [selectedComp, selectedRound, selectedPos, selectedTeam, scoreMode, statView])

  // Client-side, diacritic-insensitive search.
  // Haystack = normalized display name (Opta matchName, e.g. 'L. Díaz'),
  // team, full first name, full last name, full name.
  // Multi-word queries split on whitespace and each token must appear somewhere
  // in the haystack. So 'Luis' finds 'L. Díaz', 'Luis Diaz' finds him too
  // (because 'luis' and 'diaz' both appear), and existing 'Diaz' still works.
  const filteredPlayers = useMemo(() => {
    const q = normalize(search)
    if (!q) return players
    const tokens = q.split(/\s+/).filter(Boolean)
    return players.filter(p => {
      const first = p.first_name || ''
      const last = p.last_name || ''
      const full = `${first} ${last}`.trim()
      const haystack = [
        normalize(p.name),
        normalize(p.team),
        normalize(first),
        normalize(last),
        normalize(full),
      ].join(' ')
      return tokens.every(t => haystack.includes(t))
    })
  }, [players, search])

  const currentComp = competitions.find(c => c.code === selectedComp)
  const rounds = currentComp?.rounds || []

  const handlePlayerClick = (player: Player) => {
    setDrawerPlayer(player)
    setDrawerLoading(true)
    fetch(`/api/fantasy/player/${player.opta_player_id}?competition=${selectedComp}`)
      .then(r => r.json())
      .then(data => {
        setDrawerMatches(data.matches || [])
        setDrawerLoading(false)
      })
      .catch(e => {
        console.error(e)
        setDrawerLoading(false)
      })
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem 1rem 5rem', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <Activity size={24} color={C.mint} />
            <h1 style={{ color: C.gold, fontWeight: 900, fontSize: '1.6rem', margin: 0 }}>
              Fantasy Stats
            </h1>
          </div>
          <p style={{ color: C.muted, fontSize: '0.82rem', margin: 0 }}>
            Live fantasy points · v1.4 scoring · All rounds
          </p>
        </div>
        <a
          href="/fantasy/social"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: C.mint,
            color: C.bg,
            fontWeight: 800,
            fontSize: '0.85rem',
            letterSpacing: '0.02em',
            padding: '0.55rem 1rem',
            borderRadius: 999,
            textDecoration: 'none',
            border: `1px solid ${C.mint}`,
          }}
          aria-label="Generate social graphic"
        >
          📸 Generate Social Graphic
        </a>
      </div>

      {/* Filters */}
      <div style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: '0.75rem',
        padding: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Competition dropdown */}
          <select
            value={selectedComp}
            onChange={e => {
              setSelectedComp(e.target.value)
              setSelectedRound('ALL')
            }}
            style={selectStyle}
          >
            {competitions.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>

          {/* Round dropdown */}
          <select
            value={selectedRound}
            onChange={e => setSelectedRound(e.target.value)}
            style={selectStyle}
          >
            <option value="ALL">All Rounds</option>
            {rounds.map(r => (
              <option key={r.code} value={r.code}>
                {r.name} ({r.playedCount}/{r.fixtureCount})
              </option>
            ))}
          </select>

          {/* Team dropdown */}
          <select
            value={selectedTeam}
            onChange={e => setSelectedTeam(e.target.value)}
            style={selectStyle}
          >
            <option value="ALL">All Teams</option>
            {allTeams.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="Find player"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: '0.5rem',
              padding: '0.5rem 0.75rem',
              color: C.text,
              fontSize: '0.85rem',
              fontFamily: 'inherit',
              outline: 'none',
              flex: '1 1 160px',
              minWidth: '120px',
            }}
          />
        </div>

        {/* Position chips */}
        <div style={{
          display: 'flex',
          gap: '0.4rem',
          marginTop: '0.75rem',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: '0.25rem',
        }}>
          {(['ALL', 'GKP', 'DEF', 'MID', 'FOR'] as PosType[]).map(pos => (
            <button
              key={pos}
              onClick={() => setSelectedPos(pos)}
              style={{
                backgroundColor: selectedPos === pos ? '#FFFFFF' : 'transparent',
                color: selectedPos === pos ? '#0A0F2E' : C.muted,
                border: `1px solid ${selectedPos === pos ? C.mint : C.border}`,
                borderRadius: '1.5rem',
                padding: '0.35rem 1rem',
                fontSize: '0.75rem',
                fontWeight: selectedPos === pos ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
                flex: '0 0 auto',
              }}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Score mode toggle: Total vs Per 90 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginTop: '0.75rem',
          fontSize: '0.7rem',
          color: C.muted,
        }}>
          <span style={{ letterSpacing: '0.05em', textTransform: 'uppercase' }}>Rank by</span>
          <div style={{
            display: 'inline-flex',
            backgroundColor: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: '1.5rem',
            padding: '0.15rem',
          }}>
            {([
              { v: 'total', label: 'Total' },
              { v: 'per90', label: 'Per 90' },
            ] as const).map(opt => (
              <button
                key={opt.v}
                onClick={() => setScoreMode(opt.v)}
                style={{
                  backgroundColor: scoreMode === opt.v ? C.mint : 'transparent',
                  color: scoreMode === opt.v ? '#0A0F2E' : C.muted,
                  border: 'none',
                  borderRadius: '1.25rem',
                  padding: '0.3rem 0.85rem',
                  fontSize: '0.7rem',
                  fontWeight: scoreMode === opt.v ? 700 : 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {scoreMode === 'per90' && (
            <span style={{ fontSize: '0.65rem', fontStyle: 'italic' }}>min 25’ played</span>
          )}

          {/* Stat View selector — pushes to the right on wider viewports */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginLeft: 'auto',
          }}>
            <span style={{ letterSpacing: '0.05em', textTransform: 'uppercase' }}>Stat View</span>
            <select
              value={statView}
              onChange={e => setStatView(e.target.value as StatView)}
              style={selectStyle}
              aria-label="Stat category view"
            >
              {STAT_VIEWS.map(sv => (
                <option key={sv.v} value={sv.v}>{sv.label}</option>
              ))}
            </select>
            {statView === 'goalkeepers' && (
              <span style={{ fontSize: '0.65rem', fontStyle: 'italic', color: C.gold }}>GKP only</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <p style={{ color: C.muted, fontSize: '0.9rem' }}>Loading players...</p>
        </div>
      ) : filteredPlayers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <p style={{ color: C.muted, fontSize: '0.9rem' }}>
            {search
              ? `No players match "${search}".`
              : 'No players found for this selection.'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile compact list (< 720px) */}
          <div className="fantasy-mobile-list">
            <MobileList players={filteredPlayers} onPlayerClick={handlePlayerClick} scoreMode={scoreMode} statView={statView} />
          </div>
          {/* Desktop wide grid (>= 720px) — horizontally scrolling */}
          <div className="fantasy-desktop-grid" style={{ overflowX: 'auto' }}>
            <StatsGrid players={filteredPlayers} onPlayerClick={handlePlayerClick} scoreMode={scoreMode} statView={statView} />
          </div>
          <style jsx global>{`
            .fantasy-mobile-list { display: block; }
            .fantasy-desktop-grid { display: none; }
            @media (min-width: 720px) {
              .fantasy-mobile-list { display: none; }
              .fantasy-desktop-grid { display: block; }
            }
          `}</style>
        </>
      )}

      {/* Drawer */}
      {drawerPlayer && (
        <PlayerDrawer
          player={drawerPlayer}
          matches={drawerMatches}
          loading={drawerLoading}
          onClose={() => setDrawerPlayer(null)}
        />
      )}
    </div>
  )
}

// ─── Stats Grid ───────────────────────────────────────────────────────────────

// ─── Mobile compact list (< 720px) ────────────────────────────────────────────
// One row per player: identity (left) + PTS / GP / AVG (right), tap to open drawer.
// No horizontal scroll, designed to fit on a 360px viewport without clipping.

function MobileList({
  players, onPlayerClick, scoreMode, statView,
}: {
  players: Player[]
  onPlayerClick: (p: Player) => void
  scoreMode: 'total' | 'per90'
  statView: StatView
}) {
  // Category views tint the PTS number mint so it's visually clear the number
  // is scoped to a subset, not the aggregate.
  const ptsColor = statView === 'overall' ? C.gold : C.mint
  return (
    <div style={{ fontSize: '0.85rem' }}>
      {/* Sub-header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 52px 36px 48px',
        gap: '0.4rem',
        backgroundColor: C.card,
        borderBottom: `2px solid ${C.border}`,
        padding: '0.6rem 0.75rem',
        fontWeight: 700,
        fontSize: '0.6rem',
        letterSpacing: '0.05em',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        borderRadius: '0.5rem 0.5rem 0 0',
      }}>
        <div style={{ color: C.text }}>PLAYER</div>
        <div style={{ color: C.mint, textAlign: 'right' }}>
          {scoreMode === 'per90' ? 'P/90' : 'PTS'}
        </div>
        <div style={{ color: C.muted, textAlign: 'right' }}>MIN</div>
        <div style={{ color: C.muted, textAlign: 'right' }}>
          {scoreMode === 'per90' ? 'TOT' : 'AVG'}
        </div>
      </div>
      {players.map(p => {
        const posColor = p.pos_type === 'GKP' ? C.gold : p.pos_type === 'DEF' ? '#5ec5ff' : p.pos_type === 'MID' ? C.mint : C.red
        const total = viewTotal(p, statView)
        const per90 = viewPer90(p, statView)
        return (
          <div
            key={p.opta_player_id}
            onClick={() => onPlayerClick(p)}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 52px 36px 48px',
              gap: '0.4rem',
              padding: '0.75rem',
              borderBottom: `1px solid ${C.border}`,
              cursor: 'pointer',
              alignItems: 'center',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontWeight: 700,
                color: C.text,
                marginBottom: '0.15rem',
                fontSize: '0.9rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>{p.name}</div>
              <div style={{ fontSize: '0.7rem', color: C.muted, display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '0.05rem 0.35rem',
                  borderRadius: '0.25rem',
                  backgroundColor: `${posColor}22`,
                  color: posColor,
                  fontWeight: 700,
                  fontSize: '0.62rem',
                }}>{p.pos_type}</span>
                <span style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>{p.team}</span>
              </div>
            </div>
            <div style={{
              textAlign: 'right',
              fontWeight: 800,
              color: ptsColor,
              fontSize: '1rem',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {scoreMode === 'per90'
                ? (p.mins_total >= 25 ? per90.toFixed(1) : '—')
                : total.toFixed(1)}
            </div>
            <div style={{
              textAlign: 'right',
              color: C.muted,
              fontVariantNumeric: 'tabular-nums',
              fontSize: '0.75rem',
            }}>{p.mins_total}</div>
            <div style={{
              textAlign: 'right',
              color: C.text,
              fontVariantNumeric: 'tabular-nums',
              fontSize: '0.8rem',
            }}>
              {scoreMode === 'per90'
                ? total.toFixed(1)
                : (p.games_played > 0 ? (total / p.games_played).toFixed(1) : '0.0')}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StatsGrid({
  players, onPlayerClick, scoreMode, statView,
}: {
  players: Player[]
  onPlayerClick: (p: Player) => void
  scoreMode: 'total' | 'per90'
  statView: StatView
}) {
  const hasGK = players.some(p => p.pos_type === 'GKP')

  // Overall view keeps its exact historical column set (no regression).
  // Category views derive columns from getStatColumns() so each mode gets
  // a tight, relevant slice of stats.
  const isOverall = statView === 'overall'
  const categoryCols = getStatColumns(statView)

  // 300px identity + PTS(80) + MIN(80) + AVG/TOT(80) + N x 60px stat cols
  const gridTemplateColumns = isOverall
    ? `300px repeat(3, 80px) repeat(5, 60px) repeat(4, 60px) repeat(3, 60px)` + (hasGK ? ' repeat(3, 60px)' : '')
    : `300px repeat(3, 80px) repeat(${categoryCols.length}, 68px)`

  const ptsColor = isOverall ? C.gold : C.mint

  return (
    <div style={{ minWidth: '100%', fontSize: '0.8rem' }}>
      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns,
        gap: '0.5rem',
        backgroundColor: C.card,
        borderBottom: `2px solid ${C.border}`,
        padding: '0.75rem 1rem',
        fontWeight: 700,
        fontSize: '0.7rem',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ color: C.text }}>PLAYER</div>
        <div style={{ color: C.mint, textAlign: 'center' }}>
          {scoreMode === 'per90' ? 'P/90' : 'PTS'}
        </div>
        <div style={{ color: C.mint, textAlign: 'center' }}>MIN</div>
        <div style={{ color: C.mint, textAlign: 'center' }}>
          {scoreMode === 'per90' ? 'TOT' : 'AVG'}
        </div>
        {isOverall ? (
          <>
            <div style={{ color: C.mint, textAlign: 'center' }}>G</div>
            <div style={{ color: C.mint, textAlign: 'center' }}>A</div>
            <div style={{ color: C.mint, textAlign: 'center' }}>SoT</div>
            <div style={{ color: C.mint, textAlign: 'center' }}>Sh</div>
            <div style={{ color: C.mint, textAlign: 'center' }}>KP</div>
            <div style={{ color: C.muted, textAlign: 'center' }}>Tk</div>
            <div style={{ color: C.muted, textAlign: 'center' }}>Int</div>
            <div style={{ color: C.muted, textAlign: 'center' }}>Bl</div>
            <div style={{ color: C.muted, textAlign: 'center' }}>CS</div>
            <div style={{ color: C.muted, textAlign: 'center' }}>YC</div>
            <div style={{ color: C.muted, textAlign: 'center' }}>RC</div>
            <div style={{ color: C.muted, textAlign: 'center' }}>OG</div>
            {hasGK && (
              <>
                <div style={{ color: C.gold, textAlign: 'center' }}>Sv</div>
                <div style={{ color: C.gold, textAlign: 'center' }}>HC</div>
                <div style={{ color: C.gold, textAlign: 'center' }}>PS</div>
              </>
            )}
          </>
        ) : (
          categoryCols.map(col => (
            <div key={col.key} style={{ color: C.mint, textAlign: 'center' }}>{col.label}</div>
          ))
        )}
      </div>

      {/* Rows */}
      {players.map(p => {
        const total = viewTotal(p, statView)
        const per90 = viewPer90(p, statView)
        return (
          <div
            key={p.opta_player_id}
            onClick={() => onPlayerClick(p)}
            style={{
              display: 'grid',
              gridTemplateColumns,
              gap: '0.5rem',
              padding: '0.75rem 1rem',
              borderBottom: `1px solid ${C.border}`,
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = C.card}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            {/* Player identity */}
            <div>
              <div style={{ fontWeight: 700, color: C.text, marginBottom: '0.2rem' }}>{p.name}</div>
              <div style={{ fontSize: '0.7rem', color: C.muted }}>
                {p.pos_type} · {p.team}
              </div>
            </div>

            {/* Fantasy */}
            <div style={{ textAlign: 'center', fontWeight: 700, color: ptsColor }}>
              {scoreMode === 'per90'
                ? (p.mins_total >= 25 ? per90.toFixed(1) : '—')
                : total.toFixed(1)}
            </div>
            <div style={{ textAlign: 'center' }}>{p.mins_total}</div>
            <div style={{ textAlign: 'center' }}>
              {scoreMode === 'per90'
                ? total.toFixed(1)
                : (p.games_played > 0 ? (total / p.games_played).toFixed(1) : '0.0')}
            </div>

            {isOverall ? (
              <>
                {/* Attacking */}
                <div style={{ textAlign: 'center' }}>{p.attacking.goals || '-'}</div>
                <div style={{ textAlign: 'center' }}>{p.attacking.assists || '-'}</div>
                <div style={{ textAlign: 'center' }}>{p.attacking.sot || '-'}</div>
                <div style={{ textAlign: 'center' }}>{p.attacking.sh || '-'}</div>
                <div style={{ textAlign: 'center' }}>{p.attacking.kp || '-'}</div>

                {/* Defensive */}
                <div style={{ textAlign: 'center' }}>{p.defensive.tackles || '-'}</div>
                <div style={{ textAlign: 'center' }}>{p.defensive.interceptions || '-'}</div>
                <div style={{ textAlign: 'center' }}>{p.defensive.blocks || '-'}</div>
                <div style={{ textAlign: 'center' }}>{p.defensive.clean_sheets || '-'}</div>

                {/* Discipline */}
                <div style={{ textAlign: 'center' }}>{p.discipline.yc || '-'}</div>
                <div style={{ textAlign: 'center' }}>{p.discipline.rc || '-'}</div>
                <div style={{ textAlign: 'center' }}>{p.discipline.og || '-'}</div>

                {/* GK stats */}
                {hasGK && (
                  <>
                    <div style={{ textAlign: 'center' }}>{p.gk?.saves || '-'}</div>
                    <div style={{ textAlign: 'center' }}>{p.gk?.high_claims || '-'}</div>
                    <div style={{ textAlign: 'center' }}>{p.gk?.pen_saves || '-'}</div>
                  </>
                )}
              </>
            ) : (
              categoryCols.map(col => (
                <div key={col.key} style={{ textAlign: 'center' }}>{col.accessor(p)}</div>
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}


// ─── Player Drawer ────────────────────────────────────────────────────────────

function PlayerDrawer({
  player,
  matches,
  loading,
  onClose,
}: {
  player: Player
  matches: PlayerMatch[]
  loading: boolean
  onClose: () => void
}) {
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null)
  // Per-category collapse state, keyed by `${matchIndex}:${category}`.
  // Default: empty object → all categories collapsed. Each toggles independently.
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})
  const toggleCategory = (matchIdx: number, cat: string) => {
    const k = `${matchIdx}:${cat}`
    setExpandedCategories(prev => ({ ...prev, [k]: !prev[k] }))
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 100,
        }}
      />

      {/* Drawer — desktop: right-side panel 500px; mobile: full-width bottom sheet */}
      <div className="fantasy-drawer" style={{
        position: 'fixed',
        backgroundColor: C.card,
        zIndex: 101,
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        WebkitOverflowScrolling: 'touch',
      }}>
        <style jsx>{`
          .fantasy-drawer {
            left: 0;
            right: 0;
            bottom: 0;
            top: 10vh;
            border-top: 1px solid ${C.border};
            border-top-left-radius: 1rem;
            border-top-right-radius: 1rem;
            padding: 1rem;
          }
          @media (min-width: 720px) {
            .fantasy-drawer {
              top: 0;
              left: auto;
              width: 500px;
              max-width: 100vw;
              border-top: none;
              border-left: 1px solid ${C.border};
              border-radius: 0;
              padding: 1.5rem;
            }
          }
        `}</style>
        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: C.text, margin: '0 0 0.25rem' }}>
                {player.name}
              </h2>
              <p style={{ fontSize: '0.85rem', color: C.muted, margin: 0 }}>
                {player.pos_type} · {player.team}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: C.muted,
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Matches */}
        {loading ? (
          <p style={{ color: C.muted, fontSize: '0.85rem' }}>Loading matches...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {matches.map((m, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  minWidth: 0,
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: C.text }}>
                      vs {m.opponent}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: C.muted }}>
                      {m.round} · {new Date(m.date).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: C.mint }}>
                      {m.fantasy_points.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: C.muted }}>
                      {m.mins}’ · {m.mins > 0 ? (m.fantasy_points * 90 / m.mins).toFixed(1) : '—'}/90
                    </div>
                  </div>
                </div>

                {/* Breakdown toggle */}
                <button
                  onClick={() => setExpandedMatch(expandedMatch === i ? null : i)}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.border}`,
                    borderRadius: '0.25rem',
                    color: C.muted,
                    fontSize: '0.7rem',
                    padding: '0.25rem 0.5rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {expandedMatch === i ? 'Hide' : 'Show'} breakdown
                </button>

                {expandedMatch === i && (() => {
                  // Group breakdown entries by 7-group category taxonomy.
                  // Each item: { key, label, count, points }
                  const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(2)
                  const groups = new Map<BreakdownCategory, {
                    items: Array<{ key: string; label: string; count: number; points: number }>
                    subtotal: number
                  }>()
                  for (const [key, valRaw] of Object.entries(m.breakdown)) {
                    const points = valRaw as number
                    if (points === 0) continue // hide zero-point lines to reduce noise
                    const cat = categoryFor(key)
                    const count = (m.raw_stats?.[key] ?? 0) as number
                    const label = labelFor(key)
                    const g = groups.get(cat) ?? { items: [], subtotal: 0 }
                    g.items.push({ key, label, count, points })
                    g.subtotal += points
                    groups.set(cat, g)
                  }
                  // Sort items inside each group by points descending (abs value).
                  for (const g of groups.values()) {
                    g.items.sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
                  }
                  // Sort categories by subtotal magnitude descending; ties broken
                  // by the canonical CATEGORY_ORDER list.
                  const sortedCats = Array.from(groups.entries()).sort((a, b) => {
                    const diff = Math.abs(b[1].subtotal) - Math.abs(a[1].subtotal)
                    if (diff !== 0) return diff
                    return CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0])
                  })

                  return (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.72rem' }}>
                      {sortedCats.map(([cat, group]) => {
                        const subtotalPos = group.subtotal >= 0
                        const isOpen = !!expandedCategories[`${i}:${cat}`]
                        return (
                          <div key={cat} style={{ marginBottom: '0.85rem' }}>
                            {/* Category header w/ subtotal — clickable to expand/collapse */}
                            <button
                              type="button"
                              onClick={() => toggleCategory(i, cat)}
                              aria-expanded={isOpen}
                              aria-controls={`cat-${i}-${cat}`}
                              style={{
                                display: 'flex',
                                width: '100%',
                                alignItems: 'baseline',
                                justifyContent: 'space-between',
                                gap: '0.5rem',
                                padding: '0.55rem 0 0.45rem',
                                borderBottom: `1px solid ${C.border}`,
                                marginBottom: isOpen ? '0.3rem' : 0,
                                background: 'transparent',
                                border: 'none',
                                borderBottomStyle: 'solid',
                                borderBottomWidth: '1px',
                                borderBottomColor: C.border,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                textAlign: 'left',
                                color: 'inherit',
                                minHeight: '40px', // mobile tap target
                                WebkitTapHighlightColor: 'transparent',
                              }}
                            >
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'baseline',
                                gap: '0.4rem',
                                color: C.gold,
                                fontWeight: 700,
                                fontSize: '0.78rem',
                                letterSpacing: '0.02em',
                              }}>
                                <span
                                  aria-hidden="true"
                                  style={{
                                    display: 'inline-block',
                                    width: '0.75rem',
                                    color: C.muted,
                                    fontSize: '0.7rem',
                                    transition: 'transform 120ms ease',
                                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                                  }}
                                >
                                  ▸
                                </span>
                                {CATEGORY_LABEL[cat]}
                              </span>
                              <span style={{
                                color: subtotalPos ? C.accent : '#ff5252',
                                fontWeight: 800,
                                fontSize: '0.95rem',
                                fontVariantNumeric: 'tabular-nums',
                              }}>
                                {subtotalPos ? '+' : ''}{fmt(group.subtotal)} pts
                              </span>
                            </button>
                            {/* Items — only rendered when category is expanded */}
                            {isOpen && (
                              <div id={`cat-${i}-${cat}`}>
                            {group.items.map(it => {
                              const pos = it.points >= 0
                              return (
                                <div
                                  key={it.key}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr auto',
                                    gap: '0.5rem',
                                    padding: '0.25rem 0',
                                    alignItems: 'baseline',
                                  }}
                                >
                                  <span style={{ color: C.text }}>
                                    {it.label}
                                    <span style={{ color: C.muted, marginLeft: '0.4rem', fontVariantNumeric: 'tabular-nums' }}>
                                      {fmt(it.count)}
                                    </span>
                                  </span>
                                  <span style={{
                                    color: pos ? C.accent : '#ff5252',
                                    fontWeight: 600,
                                    fontVariantNumeric: 'tabular-nums',
                                    whiteSpace: 'nowrap',
                                  }}>
                                    {pos ? '+' : ''}{fmt(it.points)} pts
                                  </span>
                                </div>
                              )
                            })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {/* Total */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        padding: '0.6rem 0 0.25rem',
                        marginTop: '0.25rem',
                        borderTop: `2px solid ${C.border}`,
                      }}>
                        <span style={{ color: C.text, fontWeight: 700, fontSize: '0.82rem' }}>Total</span>
                        <span style={{
                          color: C.accent,
                          fontWeight: 800,
                          fontSize: '1rem',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {fmt(m.fantasy_points)} pts
                        </span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
