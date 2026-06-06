'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

/**
 * S³ Admin v2 — 3 tabs.
 *
 * Tab 1: Players       (identity)
 * Tab 2: Intelligence  (Total90 scoring + inline XI edit)
 * Tab 3: WC 2026 Matches (fantasy pts per round)
 *
 * Reads from `/api/admin/*` routes which internally try the new `players` /
 * `player_intelligence` / `wc26_matches` schema and fall back to legacy
 * `s3_players` when the new tables aren't there yet.
 *
 * Auth: same `Total90Ba!!` gate as v1. Password held in component state and
 * sent as `X-Admin-Password` on every fetch.
 */

const COLORS = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  gold: '#FBBF24',
  green: '#00E676',
  muted: '#8899CC',
  text: '#F0F4FF',
  red: '#FF5252',
  yellow: '#FFD740',
  flash: '#FFD740',
};

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
};
const NATIONALITY_TO_WC: Record<string, string> = {
  "Côte d'Ivoire": 'Ivory Coast',
  'Türkiye': 'Turkey',
  'Czechia': 'Czech Republic',
  'Cabo Verde': 'Cape Verde',
};
function groupOf(nationality: string): string | null {
  const lookup = NATIONALITY_TO_WC[nationality] ?? nationality;
  for (const [letter, teams] of Object.entries(WC_GROUPS)) {
    if (teams.includes(lookup)) return letter;
  }
  return null;
}

const ROUND_OPTIONS = [
  { value: 'group_md1', label: 'Group MD1' },
  { value: 'group_md2', label: 'Group MD2' },
  { value: 'group_md3', label: 'Group MD3' },
  { value: 'r32', label: 'Round of 32' },
  { value: 'r16', label: 'Round of 16' },
  { value: 'qf', label: 'Quarterfinal' },
  { value: 'sf', label: 'Semifinal' },
  { value: 'final3rd', label: '3rd Place' },
  { value: 'final', label: 'Final' },
];
function roundLabel(v: string): string {
  return ROUND_OPTIONS.find((r) => r.value === v)?.label ?? v;
}

type Tab = 'players' | 'intelligence' | 'matches';

type PlayerRow = {
  id: string;
  opta_id: string;
  full_name: string;
  short_name: string;
  nationality: string;
  pos_short: string;
  position: string;
  club: string | null;
  age: number | null;
  wc_age: number | null;
  wc_group: string | null;
  wc_active: boolean;
  photo_url: string | null;
  updated_at: string | null;
};

type IntelRow = {
  opta_id: string;
  short_name: string;
  nationality: string;
  pos_short: string;
  photo_url: string | null;
  starting_xi: 1 | 2 | 3 | null;
  t90_score: number | null;
  cat_score: number | null;
  tenk_score: number | null;
  fifa_overall: number | null;
  fifa_potential: number | null;
  vote_count: number | null;
  sign_count: number | null;
  sell_count: number | null;
  sack_count: number | null;
  t90_rank: number | null;
  updated_at: string | null;
};

type MatchRow = {
  id: string;
  opta_id: string;
  short_name: string;
  nationality: string;
  pos_short: string;
  photo_url: string | null;
  round: string;
  opponent: string;
  minutes_played: number;
  goals: number;
  assists: number;
  key_passes: number;
  tackles: number;
  interceptions: number;
  clean_sheet: boolean;
  yellow_cards: number;
  red_cards: number;
  fantasy_pts: number;
  breakdown: Record<string, number> | null;
  played_at: string | null;
};

function pct(n: number, d: number): number {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function S3AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  const [tab, setTab] = useState<Tab>('players');

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (password === 'Total90Ba!!') {
      setAuthed(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  }

  if (!authed) {
    return (
      <LoginScreen
        password={password}
        onChange={setPassword}
        error={passwordError}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        padding: '32px 24px',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: COLORS.gold, fontSize: 24, fontWeight: 800, margin: 0 }}>
            S³ Admin Panel <span style={{ color: COLORS.muted, fontSize: 14, fontWeight: 500 }}>v2</span>
          </h1>
          <p style={{ color: COLORS.muted, fontSize: 13, margin: '4px 0 0' }}>
            Players · Intelligence · WC 2026 Matches
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 24 }}>
        {(
          [
            { key: 'players', label: 'Players' },
            { key: 'intelligence', label: 'Intelligence' },
            { key: 'matches', label: 'WC 2026 Matches' },
          ] as { key: Tab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 16px',
              background: tab === key ? COLORS.card : 'transparent',
              border: `1px solid ${tab === key ? COLORS.gold : 'transparent'}`,
              borderBottom: tab === key ? `2px solid ${COLORS.gold}` : 'none',
              color: tab === key ? COLORS.gold : COLORS.muted,
              fontSize: 13,
              fontWeight: tab === key ? 700 : 500,
              cursor: 'pointer',
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'players' && <PlayersTab password={password} />}
      {tab === 'intelligence' && <IntelligenceTab password={password} />}
      {tab === 'matches' && <MatchesTab password={password} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────────
function LoginScreen({
  password, onChange, error, onSubmit,
}: { password: string; onChange: (v: string) => void; error: boolean; onSubmit: (e: React.FormEvent) => void }) {
  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: '48px 40px', width: 360, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
        <h1 style={{ color: COLORS.gold, fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>S³ Admin Panel</h1>
        <p style={{ color: COLORS.muted, fontSize: 13, marginBottom: 32 }}>Total90 — World Cup 2026</p>
        <form onSubmit={onSubmit}>
          <input
            type="password" placeholder="Enter admin password" value={password}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: '100%', padding: '12px 16px', background: COLORS.bg, border: `1px solid ${error ? COLORS.red : COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: error ? 8 : 16 }}
          />
          {error && <p style={{ color: COLORS.red, fontSize: 12, marginBottom: 12 }}>Incorrect password.</p>}
          <button type="submit" style={{ width: '100%', padding: '12px', background: COLORS.gold, border: 'none', borderRadius: 8, color: '#0A0F2E', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Access Dashboard
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function adminFetch(url: string, password: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': password,
      ...(init?.headers ?? {}),
    },
  });
}

function PhotoCell({ url, name }: { url: string | null | undefined; name: string }) {
  if (url) {
    return (
      <img
        src={url} alt={name} width={32} height={32}
        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        referrerPolicy="no-referrer"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: COLORS.border, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: COLORS.muted }}>
      {name?.[0] ?? '?'}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1: Players
// ─────────────────────────────────────────────────────────────────────────────
function PlayersTab({ password }: { password: string }) {
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('All');
  const [nationalityFilter, setNationalityFilter] = useState('');
  const [editing, setEditing] = useState<Record<string, Partial<PlayerRow>>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    adminFetch('/api/admin/players', password)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        setRows(j.rows ?? []);
        setSource(j.source ?? '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [password]);

  const filtered = useMemo(() => {
    let r = [...rows];
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((p) => p.full_name?.toLowerCase().includes(q) || p.short_name?.toLowerCase().includes(q));
    }
    if (groupFilter !== 'All') {
      r = r.filter((p) => (p.wc_group ?? groupOf(p.nationality)) === groupFilter);
    }
    if (nationalityFilter.trim()) {
      const nq = nationalityFilter.toLowerCase();
      r = r.filter((p) => p.nationality?.toLowerCase().includes(nq));
    }
    return r;
  }, [rows, search, groupFilter, nationalityFilter]);

  const setEdit = (opta_id: string, patch: Partial<PlayerRow>) => {
    setEditing((prev) => ({ ...prev, [opta_id]: { ...(prev[opta_id] ?? {}), ...patch } }));
  };

  const save = async (opta_id: string) => {
    const patch = editing[opta_id];
    if (!patch) return;
    setSavingIds((s) => new Set(s).add(opta_id));
    try {
      const res = await adminFetch(`/api/admin/players/${encodeURIComponent(opta_id)}`, password, {
        method: 'PATCH', body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows((prev) => prev.map((r) => (r.opta_id === opta_id ? { ...r, ...patch } : r)));
      setEditing((prev) => { const n = { ...prev }; delete n[opta_id]; return n; });
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`);
    } finally {
      setSavingIds((s) => { const n = new Set(s); n.delete(opta_id); return n; });
    }
  };

  return (
    <div>
      <FiltersBar>
        <input type="text" placeholder="Search name…" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} />
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} style={inputStyle}>
          <option value="All">All Groups</option>
          {['A','B','C','D','E','F','G','H','I','J','K','L'].map((g) => <option key={g} value={g}>Group {g}</option>)}
        </select>
        <input type="text" placeholder="Nationality…" value={nationalityFilter} onChange={(e) => setNationalityFilter(e.target.value)} style={inputStyle} />
        <span style={{ marginLeft: 'auto', color: COLORS.muted, fontSize: 12 }}>
          {filtered.length.toLocaleString()} / {rows.length.toLocaleString()} · source: <code style={{ color: COLORS.gold }}>{source}</code>
        </span>
      </FiltersBar>

      {loading && <Status text="Loading players…" />}
      {error && <Status text={`Error: ${error}`} color={COLORS.red} />}

      {!loading && !error && (
        <div style={tableCardStyle}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0A1535', borderBottom: `1px solid ${COLORS.border}` }}>
                  {['Photo','Full Name','Short','Nationality','Pos','Club','Age','WC Age','Group','Active','Updated','Save'].map((c) => (
                    <th key={c} style={thStyle}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const e = editing[p.opta_id] ?? {};
                  const dirty = Object.keys(e).length > 0;
                  const fullName = (e.full_name ?? p.full_name) ?? '';
                  const shortName = (e.short_name ?? p.short_name) ?? '';
                  const club = (e.club ?? p.club) ?? '';
                  const wcGroup = (e.wc_group ?? p.wc_group ?? groupOf(p.nationality)) ?? '';
                  const wcActive = e.wc_active ?? p.wc_active;
                  return (
                    <tr key={p.opta_id} style={rowStyle}>
                      <td style={tdStyle}><PhotoCell url={p.photo_url} name={fullName} /></td>
                      <td style={tdStyle}>
                        <input value={fullName} onChange={(ev) => setEdit(p.opta_id, { full_name: ev.target.value })} style={inlineInput} />
                      </td>
                      <td style={tdStyle}>
                        <input value={shortName} onChange={(ev) => setEdit(p.opta_id, { short_name: ev.target.value })} style={{ ...inlineInput, width: 90 }} />
                      </td>
                      <td style={{ ...tdStyle, color: COLORS.muted }}>{p.nationality}</td>
                      <td style={tdStyle}>{p.pos_short ?? p.position}</td>
                      <td style={tdStyle}>
                        <input value={club} onChange={(ev) => setEdit(p.opta_id, { club: ev.target.value })} style={{ ...inlineInput, width: 140 }} />
                      </td>
                      <td style={{ ...tdStyle, color: COLORS.muted }}>{p.age ?? '—'}</td>
                      <td style={{ ...tdStyle, color: COLORS.muted }}>{p.wc_age ?? '—'}</td>
                      <td style={tdStyle}>
                        <select value={wcGroup} onChange={(ev) => setEdit(p.opta_id, { wc_group: ev.target.value })} style={{ ...inlineInput, width: 70 }}>
                          <option value="">—</option>
                          {['A','B','C','D','E','F','G','H','I','J','K','L'].map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </td>
                      <td style={tdStyle}>
                        <input type="checkbox" checked={!!wcActive} onChange={(ev) => setEdit(p.opta_id, { wc_active: ev.target.checked })} />
                      </td>
                      <td style={{ ...tdStyle, color: COLORS.muted, fontSize: 11 }}>
                        {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={tdStyle}>
                        <button
                          disabled={!dirty || savingIds.has(p.opta_id)}
                          onClick={() => save(p.opta_id)}
                          style={{
                            padding: '4px 10px', borderRadius: 6, border: 'none',
                            background: dirty ? COLORS.green : COLORS.border,
                            color: dirty ? '#0A0F2E' : COLORS.muted,
                            fontSize: 11, fontWeight: 700, cursor: dirty ? 'pointer' : 'default',
                          }}
                        >{savingIds.has(p.opta_id) ? '…' : 'Save'}</button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={12} style={emptyStyle}>No players match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2: Intelligence
// ─────────────────────────────────────────────────────────────────────────────
function IntelligenceTab({ password }: { password: string }) {
  const [rows, setRows] = useState<IntelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('All');
  const [nationalityFilter, setNationalityFilter] = useState('');
  const [t90Min, setT90Min] = useState<string>('');
  const [t90Max, setT90Max] = useState<string>('');
  const [votedOnly, setVotedOnly] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    adminFetch('/api/admin/intelligence', password)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        setRows(j.rows ?? []);
        setSource(j.source ?? '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [password]);

  const filtered = useMemo(() => {
    let r = [...rows];
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((p) => p.short_name?.toLowerCase().includes(q));
    }
    if (posFilter !== 'All') r = r.filter((p) => p.pos_short === posFilter);
    if (nationalityFilter.trim()) {
      const nq = nationalityFilter.toLowerCase();
      r = r.filter((p) => p.nationality?.toLowerCase().includes(nq));
    }
    if (t90Min) r = r.filter((p) => (p.t90_score ?? 0) >= parseFloat(t90Min));
    if (t90Max) r = r.filter((p) => (p.t90_score ?? 0) <= parseFloat(t90Max));
    if (votedOnly) r = r.filter((p) => (p.vote_count ?? 0) > 0);
    r.sort((a, b) => (b.t90_score ?? 0) - (a.t90_score ?? 0));
    return r;
  }, [rows, search, posFilter, nationalityFilter, t90Min, t90Max, votedOnly]);

  const setXi = useCallback(async (opta_id: string, xi: 1 | 2 | 3 | null) => {
    setSavingIds((s) => new Set(s).add(opta_id));
    try {
      const res = await adminFetch(`/api/admin/intelligence/${encodeURIComponent(opta_id)}`, password, {
        method: 'PATCH', body: JSON.stringify({ starting_xi: xi }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setRows((prev) => prev.map((r) =>
        r.opta_id === opta_id
          ? { ...r, starting_xi: xi, t90_score: j.t90_score, tenk_score: j.tenk_score, updated_at: j.updated_at }
          : r
      ));
      // Flash highlight
      setFlashIds((s) => new Set(s).add(opta_id));
      setTimeout(() => setFlashIds((s) => { const n = new Set(s); n.delete(opta_id); return n; }), 1500);
    } catch (e) {
      alert(`XI update failed: ${(e as Error).message}`);
    } finally {
      setSavingIds((s) => { const n = new Set(s); n.delete(opta_id); return n; });
    }
  }, [password]);

  return (
    <div>
      <FiltersBar>
        <input type="text" placeholder="Search name…" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} />
        <select value={posFilter} onChange={(e) => setPosFilter(e.target.value)} style={inputStyle}>
          {['All','GK','DEF','MID','FWD'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input type="text" placeholder="Nationality…" value={nationalityFilter} onChange={(e) => setNationalityFilter(e.target.value)} style={inputStyle} />
        <input type="number" placeholder="T90 min" value={t90Min} onChange={(e) => setT90Min(e.target.value)} style={{ ...inputStyle, width: 90 }} />
        <input type="number" placeholder="T90 max" value={t90Max} onChange={(e) => setT90Max(e.target.value)} style={{ ...inputStyle, width: 90 }} />
        <label style={{ color: COLORS.muted, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={votedOnly} onChange={(e) => setVotedOnly(e.target.checked)} /> Voted only
        </label>
        <span style={{ marginLeft: 'auto', color: COLORS.muted, fontSize: 12 }}>
          {filtered.length.toLocaleString()} / {rows.length.toLocaleString()} · <code style={{ color: COLORS.gold }}>{source}</code>
        </span>
      </FiltersBar>

      {loading && <Status text="Loading intelligence…" />}
      {error && <Status text={`Error: ${error}`} color={COLORS.red} />}

      {!loading && !error && (
        <div style={tableCardStyle}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0A1535', borderBottom: `1px solid ${COLORS.border}` }}>
                  {['Photo','Short','Nation','Pos','XI','T90','CAT','10k','OVR','POT','Votes','Sign%','Sell%','Sack%','Rank','Updated'].map((c) => (
                    <th key={c} style={thStyle}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const flash = flashIds.has(r.opta_id);
                  const vc = r.vote_count ?? 0;
                  return (
                    <tr key={r.opta_id} style={{
                      ...rowStyle,
                      background: flash ? 'rgba(255,215,64,0.15)' : 'transparent',
                      transition: 'background 0.4s ease',
                    }}>
                      <td style={tdStyle}><PhotoCell url={r.photo_url} name={r.short_name} /></td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{r.short_name}</td>
                      <td style={{ ...tdStyle, color: COLORS.muted }}>{r.nationality}</td>
                      <td style={tdStyle}>{r.pos_short ?? '—'}</td>
                      <td style={tdStyle}>
                        <select
                          value={r.starting_xi ?? ''}
                          disabled={savingIds.has(r.opta_id)}
                          onChange={(e) => {
                            const v = e.target.value;
                            const xi = v === '' ? null : (parseInt(v, 10) as 1 | 2 | 3);
                            setXi(r.opta_id, xi);
                          }}
                          style={{
                            padding: '3px 6px', borderRadius: 4,
                            background: r.starting_xi === 1 ? '#15803D' : r.starting_xi === 2 ? '#A16207' : r.starting_xi === 3 ? '#7F1D1D' : COLORS.bg,
                            color: r.starting_xi ? '#fff' : COLORS.muted,
                            border: `1px solid ${COLORS.border}`, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          }}
                        >
                          <option value="">—</option>
                          <option value="1">1 (Start)</option>
                          <option value="2">2 (Rot)</option>
                          <option value="3">3 (Depth)</option>
                        </select>
                      </td>
                      <td style={{ ...tdStyle, color: COLORS.gold, fontWeight: 700 }}>
                        {r.t90_score != null ? Number(r.t90_score).toFixed(1) : '—'}
                      </td>
                      <td style={{ ...tdStyle, color: COLORS.muted }}>{r.cat_score != null ? Number(r.cat_score).toFixed(1) : '—'}</td>
                      <td style={{ ...tdStyle, color: COLORS.muted }}>{r.tenk_score?.toLocaleString() ?? '—'}</td>
                      <td style={tdStyle}>{r.fifa_overall ?? '—'}</td>
                      <td style={tdStyle}>{r.fifa_potential ?? '—'}</td>
                      <td style={{ ...tdStyle, color: COLORS.text }}>{vc}</td>
                      <td style={{ ...tdStyle, color: COLORS.green }}>{pct(r.sign_count ?? 0, vc)}%</td>
                      <td style={{ ...tdStyle, color: COLORS.yellow }}>{pct(r.sell_count ?? 0, vc)}%</td>
                      <td style={{ ...tdStyle, color: COLORS.red }}>{pct(r.sack_count ?? 0, vc)}%</td>
                      <td style={{ ...tdStyle, color: COLORS.muted }}>{r.t90_rank ?? '—'}</td>
                      <td style={{ ...tdStyle, color: COLORS.muted, fontSize: 11 }}>
                        {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={16} style={emptyStyle}>No players match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 3: WC 2026 Matches
// ─────────────────────────────────────────────────────────────────────────────
function MatchesTab({ password }: { password: string }) {
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roundFilter, setRoundFilter] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState<string>('All');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [posFilter, setPosFilter] = useState('All');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [note, setNote] = useState<string>('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (roundFilter.length) params.set('round', roundFilter.join(','));
    if (teamFilter) params.set('team', teamFilter);
    if (posFilter !== 'All') params.set('position', posFilter);
    return params.toString();
  }, [roundFilter, teamFilter, posFilter]);

  useEffect(() => {
    setLoading(true);
    adminFetch(`/api/admin/wc26-matches${queryString ? `?${queryString}` : ''}`, password)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        setRows(j.rows ?? []);
        setNote(j.note ?? '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [password, queryString]);

  const filtered = useMemo(() => {
    let r = [...rows];
    if (groupFilter !== 'All') {
      r = r.filter((p) => groupOf(p.nationality) === groupFilter);
    }
    r.sort((a, b) => (b.fantasy_pts ?? 0) - (a.fantasy_pts ?? 0));
    return r;
  }, [rows, groupFilter]);

  const toggleRound = (v: string) => {
    setRoundFilter((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  };

  return (
    <div>
      {/* Sticky filters */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: COLORS.bg, padding: '8px 0', marginBottom: 8,
      }}>
        <FiltersBar>
          <span style={{ color: COLORS.muted, fontSize: 12 }}>Rounds:</span>
          {ROUND_OPTIONS.map((r) => (
            <button
              key={r.value}
              onClick={() => toggleRound(r.value)}
              style={{
                padding: '4px 10px', borderRadius: 6,
                background: roundFilter.includes(r.value) ? COLORS.gold : 'transparent',
                color: roundFilter.includes(r.value) ? '#0A0F2E' : COLORS.muted,
                border: `1px solid ${roundFilter.includes(r.value) ? COLORS.gold : COLORS.border}`,
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >{r.label}</button>
          ))}
        </FiltersBar>
        <FiltersBar>
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} style={inputStyle}>
            <option value="All">All Groups</option>
            {['A','B','C','D','E','F','G','H','I','J','K','L'].map((g) => <option key={g} value={g}>Group {g}</option>)}
          </select>
          <input type="text" placeholder="Team (nationality)…" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={inputStyle} />
          <select value={posFilter} onChange={(e) => setPosFilter(e.target.value)} style={inputStyle}>
            {['All','GK','DEF','MID','FWD'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <span style={{ marginLeft: 'auto', color: COLORS.muted, fontSize: 12 }}>
            {filtered.length.toLocaleString()} rows
          </span>
        </FiltersBar>
      </div>

      {loading && <Status text="Loading matches…" />}
      {error && <Status text={`Error: ${error}`} color={COLORS.red} />}
      {note && <Status text={note} color={COLORS.muted} />}

      {!loading && !error && (
        <div style={tableCardStyle}>
          {filtered.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: COLORS.muted }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>No match data yet.</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Tournament kicks off June 11, 2026. Fantasy scores populate after each match plays.
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#0A1535', borderBottom: `1px solid ${COLORS.border}` }}>
                    {['Photo','Short','Nation','Pos','Round','Opponent','Min','G','A','KP','T','INT','CS','YC','RC','Fantasy Pts','Played At'].map((c) => (
                      <th key={c} style={thStyle}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const open = expanded === m.id;
                    return (
                      <>
                        <tr
                          key={m.id} style={{ ...rowStyle, cursor: 'pointer' }}
                          onClick={() => setExpanded(open ? null : m.id)}
                        >
                          <td style={tdStyle}><PhotoCell url={m.photo_url} name={m.short_name} /></td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{m.short_name}</td>
                          <td style={{ ...tdStyle, color: COLORS.muted }}>{m.nationality}</td>
                          <td style={tdStyle}>{m.pos_short}</td>
                          <td style={tdStyle}>{roundLabel(m.round)}</td>
                          <td style={{ ...tdStyle, color: COLORS.muted }}>{m.opponent}</td>
                          <td style={tdStyle}>{m.minutes_played}</td>
                          <td style={{ ...tdStyle, color: COLORS.green, fontWeight: 700 }}>{m.goals}</td>
                          <td style={{ ...tdStyle, color: COLORS.green }}>{m.assists}</td>
                          <td style={tdStyle}>{m.key_passes}</td>
                          <td style={tdStyle}>{m.tackles}</td>
                          <td style={tdStyle}>{m.interceptions}</td>
                          <td style={tdStyle}>{m.clean_sheet ? '✓' : '—'}</td>
                          <td style={{ ...tdStyle, color: COLORS.yellow }}>{m.yellow_cards}</td>
                          <td style={{ ...tdStyle, color: COLORS.red }}>{m.red_cards}</td>
                          <td style={{ ...tdStyle, color: COLORS.flash, fontWeight: 800, fontSize: 14 }}>
                            {Number(m.fantasy_pts ?? 0).toFixed(1)}
                          </td>
                          <td style={{ ...tdStyle, color: COLORS.muted, fontSize: 11 }}>
                            {m.played_at ? new Date(m.played_at).toLocaleString() : '—'}
                          </td>
                        </tr>
                        {open && m.breakdown && (
                          <tr key={`${m.id}-bd`}>
                            <td colSpan={17} style={{ padding: '12px 20px', background: '#080D26', borderBottom: `1px solid ${COLORS.border}` }}>
                              <div style={{ color: COLORS.muted, fontSize: 11, marginBottom: 8 }}>Stat breakdown</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                                {Object.entries(m.breakdown).map(([k, v]) => (
                                  <div key={k} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '6px 10px' }}>
                                    <div style={{ fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</div>
                                    <div style={{ fontSize: 14, color: COLORS.text, fontWeight: 700 }}>{Number(v).toFixed(2)}</div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared little components & styles
// ─────────────────────────────────────────────────────────────────────────────
function FiltersBar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {children}
    </div>
  );
}
function Status({ text, color = COLORS.muted }: { text: string; color?: string }) {
  return <div style={{ textAlign: 'center', padding: '24px 0', color }}>{text}</div>;
}
const inputStyle: React.CSSProperties = {
  padding: '8px 12px', background: COLORS.bg, border: `1px solid ${COLORS.border}`,
  borderRadius: 8, color: COLORS.text, fontSize: 13, outline: 'none', minWidth: 140,
};
const inlineInput: React.CSSProperties = {
  padding: '4px 8px', background: COLORS.bg, border: `1px solid ${COLORS.border}`,
  borderRadius: 4, color: COLORS.text, fontSize: 12, outline: 'none', width: 140,
};
const tableCardStyle: React.CSSProperties = {
  background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: 'hidden',
};
const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', color: COLORS.muted, fontWeight: 600,
  fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = { padding: '8px 12px', whiteSpace: 'nowrap' };
const rowStyle: React.CSSProperties = { borderBottom: `1px solid ${COLORS.border}` };
const emptyStyle: React.CSSProperties = { padding: '40px', textAlign: 'center', color: COLORS.muted };
