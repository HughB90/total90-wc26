'use client';

import { useState, useEffect, useMemo } from 'react';

const SUPABASE_URL = 'https://tituygkbondyjhzomwji.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_nYugb5FDdgYbKauTAmh0oQ_QtfOJjHI';

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
};

type Player = {
  id: string;
  name: string;
  short_name: string;
  nationality: string;
  position: string;
  s3_value: number;
  sign_count: number;
  sell_count: number;
  sack_count: number;
  vote_count: number;
  photo_url: string;
};

type SortOption = 'most_voted' | 'most_signed' | 'most_sold' | 'most_sacked' | 't90_score';

const PAGE_SIZE = 50;

function pct(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: '#1E3A6E',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${value}%`,
            height: '100%',
            background: color,
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: COLORS.muted, minWidth: 32, textAlign: 'right' }}>
        {value}%
      </span>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: '20px 24px',
        flex: 1,
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.gold }}>
        {value}
      </div>
    </div>
  );
}

export default function S3AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState('All');
  const [nationalityFilter, setNationalityFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('most_voted');
  const [page, setPage] = useState(0);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (password === 'total90admin2026') {
      setAuthed(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  }

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    setError(null);

    const fetchData = async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error: fetchError } = await supabase
        .from('s3_players')
        .select('id, name, short_name, nationality, position, s3_value, sign_count, sell_count, sack_count, vote_count, photo_url')
        .order('vote_count', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setPlayers(data || []);
      }
      setLoading(false);
    };

    fetchData();
  }, [authed]);

  const filtered = useMemo(() => {
    let result = [...players];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.short_name?.toLowerCase().includes(q)
      );
    }

    if (positionFilter !== 'All') {
      result = result.filter((p) => p.position === positionFilter);
    }

    if (nationalityFilter.trim()) {
      const nq = nationalityFilter.toLowerCase();
      result = result.filter((p) => p.nationality?.toLowerCase().includes(nq));
    }

    switch (sortBy) {
      case 'most_voted':
        result.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));
        break;
      case 'most_signed':
        result.sort((a, b) => (b.sign_count ?? 0) - (a.sign_count ?? 0));
        break;
      case 'most_sold':
        result.sort((a, b) => (b.sell_count ?? 0) - (a.sell_count ?? 0));
        break;
      case 'most_sacked':
        result.sort((a, b) => (b.sack_count ?? 0) - (a.sack_count ?? 0));
        break;
      case 't90_score':
        result.sort((a, b) => (b.s3_value ?? 0) - (a.s3_value ?? 0));
        break;
    }

    return result;
  }, [players, search, positionFilter, nationalityFilter, sortBy]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalPlayers = players.length;
  const playersVotedOn = players.filter((p) => p.vote_count > 0).length;
  const totalVotes = players.reduce((acc, p) => acc + (p.vote_count ?? 0), 0);
  const mostSigned = players.reduce(
    (best, p) => ((p.sign_count ?? 0) > (best?.sign_count ?? -1) ? p : best),
    players[0]
  );

  function exportCSV() {
    const headers = [
      'name', 'nationality', 'position', 's3_value',
      'sign_count', 'sell_count', 'sack_count', 'vote_count',
      'sign_pct', 'sell_pct', 'sack_pct',
    ];
    const rows = filtered.map((p) => [
      `"${p.name}"`,
      `"${p.nationality}"`,
      p.position,
      p.s3_value,
      p.sign_count,
      p.sell_count,
      p.sack_count,
      p.vote_count,
      pct(p.sign_count, p.vote_count),
      pct(p.sell_count, p.vote_count),
      pct(p.sack_count, p.vote_count),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 's3_players_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: COLORS.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
        }}
      >
        <div
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: '48px 40px',
            width: 360,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
          <h1 style={{ color: COLORS.gold, fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
            S³ Admin Panel
          </h1>
          <p style={{ color: COLORS.muted, fontSize: 13, marginBottom: 32 }}>
            Total90 — World Cup 2026
          </p>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: COLORS.bg,
                border: `1px solid ${passwordError ? COLORS.red : COLORS.border}`,
                borderRadius: 8,
                color: COLORS.text,
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: passwordError ? 8 : 16,
              }}
            />
            {passwordError && (
              <p style={{ color: COLORS.red, fontSize: 12, marginBottom: 12 }}>
                Incorrect password.
              </p>
            )}
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '12px',
                background: COLORS.gold,
                border: 'none',
                borderRadius: 8,
                color: '#0A0F2E',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Access Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ color: COLORS.gold, fontSize: 24, fontWeight: 800, margin: 0 }}>
            S³ Admin Panel
          </h1>
          <p style={{ color: COLORS.muted, fontSize: 13, margin: '4px 0 0' }}>
            Sign · Sell · Sack — World Cup 2026
          </p>
        </div>
        <button
          onClick={exportCSV}
          style={{
            padding: '10px 20px',
            background: COLORS.green,
            border: 'none',
            borderRadius: 8,
            color: '#0A0F2E',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
        <SummaryCard label="Total Players" value={totalPlayers.toLocaleString()} />
        <SummaryCard label="Players Voted On" value={playersVotedOn.toLocaleString()} />
        <SummaryCard label="Total Votes Cast" value={totalVotes.toLocaleString()} />
        <SummaryCard label="Most Signed" value={mostSigned?.name ?? '—'} />
      </div>

      {/* Filters */}
      <div
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 24,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          placeholder="Search player..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          style={{
            padding: '8px 12px',
            background: COLORS.bg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            color: COLORS.text,
            fontSize: 13,
            outline: 'none',
            minWidth: 180,
          }}
        />

        <select
          value={positionFilter}
          onChange={(e) => { setPositionFilter(e.target.value); setPage(0); }}
          style={{
            padding: '8px 12px',
            background: COLORS.bg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            color: COLORS.text,
            fontSize: 13,
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {['All', 'GK', 'DEF', 'MID', 'FWD'].map((pos) => (
            <option key={pos} value={pos}>{pos}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Nationality..."
          value={nationalityFilter}
          onChange={(e) => { setNationalityFilter(e.target.value); setPage(0); }}
          style={{
            padding: '8px 12px',
            background: COLORS.bg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            color: COLORS.text,
            fontSize: 13,
            outline: 'none',
            minWidth: 140,
          }}
        />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(
            [
              { key: 'most_voted', label: 'Most Voted' },
              { key: 'most_signed', label: 'Most Signed' },
              { key: 'most_sold', label: 'Most Sold' },
              { key: 'most_sacked', label: 'Most Sacked' },
              { key: 't90_score', label: 'T90 Score' },
            ] as { key: SortOption; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setSortBy(key); setPage(0); }}
              style={{
                padding: '6px 12px',
                background: sortBy === key ? COLORS.gold : 'transparent',
                border: `1px solid ${sortBy === key ? COLORS.gold : COLORS.border}`,
                borderRadius: 6,
                color: sortBy === key ? '#0A0F2E' : COLORS.muted,
                fontSize: 12,
                fontWeight: sortBy === key ? 700 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <span style={{ marginLeft: 'auto', color: COLORS.muted, fontSize: 12 }}>
          {filtered.length.toLocaleString()} players
        </span>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: COLORS.muted }}>
          Loading players…
        </div>
      )}
      {error && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: COLORS.red }}>
          Error: {error}
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0A1535', borderBottom: `1px solid ${COLORS.border}` }}>
                  {['#', 'Player', 'Nationality', 'Pos', 'S³ Score', 'Sign', 'Sell', 'Sack', 'Total Votes', 'Sign %', 'Sell %', 'Sack %'].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: '12px 14px',
                        textAlign: 'left',
                        color: COLORS.muted,
                        fontWeight: 600,
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((player, idx) => {
                  const globalIdx = page * PAGE_SIZE + idx + 1;
                  const signPct = pct(player.sign_count, player.vote_count);
                  const sellPct = pct(player.sell_count, player.vote_count);
                  const sackPct = pct(player.sack_count, player.vote_count);

                  return (
                    <tr
                      key={player.id}
                      style={{
                        borderBottom: `1px solid ${COLORS.border}`,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = '#111E52';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
                      }}
                    >
                      <td style={{ padding: '10px 14px', color: COLORS.muted, width: 40 }}>
                        {globalIdx}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {player.photo_url ? (
                            <img
                              src={player.photo_url}
                              alt={player.name}
                              width={32}
                              height={32}
                              style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                background: COLORS.border,
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 12,
                                color: COLORS.muted,
                              }}
                            >
                              {player.name?.[0] ?? '?'}
                            </div>
                          )}
                          <span style={{ fontWeight: 600, color: COLORS.text }}>
                            {player.name}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', color: COLORS.muted }}>
                        {player.nationality}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            background:
                              player.position === 'GK' ? '#4A1D96' :
                              player.position === 'DEF' ? '#1E40AF' :
                              player.position === 'MID' ? '#065F46' :
                              '#92400E',
                            color: '#fff',
                          }}
                        >
                          {player.position}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: COLORS.gold, fontWeight: 700 }}>
                        {player.s3_value ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: COLORS.green }}>
                        {player.sign_count ?? 0}
                      </td>
                      <td style={{ padding: '10px 14px', color: COLORS.yellow }}>
                        {player.sell_count ?? 0}
                      </td>
                      <td style={{ padding: '10px 14px', color: COLORS.red }}>
                        {player.sack_count ?? 0}
                      </td>
                      <td style={{ padding: '10px 14px', color: COLORS.text, fontWeight: 600 }}>
                        {player.vote_count ?? 0}
                      </td>
                      <td style={{ padding: '10px 14px', minWidth: 140 }}>
                        <ProgressBar value={signPct} color={COLORS.green} />
                      </td>
                      <td style={{ padding: '10px 14px', minWidth: 140 }}>
                        <ProgressBar value={sellPct} color={COLORS.yellow} />
                      </td>
                      <td style={{ padding: '10px 14px', minWidth: 140 }}>
                        <ProgressBar value={sackPct} color={COLORS.red} />
                      </td>
                    </tr>
                  );
                })}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: COLORS.muted }}>
                      No players match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderTop: `1px solid ${COLORS.border}`,
              }}
            >
              <span style={{ color: COLORS.muted, fontSize: 13 }}>
                Page {page + 1} of {totalPages} · {filtered.length} players
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{
                    padding: '8px 16px',
                    background: page === 0 ? 'transparent' : COLORS.card,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 6,
                    color: page === 0 ? COLORS.border : COLORS.text,
                    fontSize: 13,
                    cursor: page === 0 ? 'default' : 'pointer',
                  }}
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  style={{
                    padding: '8px 16px',
                    background: page === totalPages - 1 ? 'transparent' : COLORS.card,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 6,
                    color: page === totalPages - 1 ? COLORS.border : COLORS.text,
                    fontSize: 13,
                    cursor: page === totalPages - 1 ? 'default' : 'pointer',
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
