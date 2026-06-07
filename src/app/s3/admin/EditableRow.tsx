'use client';

import { useState } from 'react';

const COLORS = {
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
  nationality: string;
  position: string;
  starting_xi: number | null;
  t90_score: number | null;
  cat_score: number | null;
  tenk_score: number | null;
  s3_value: number;
  sign_count: number;
  sell_count: number;
  sack_count: number;
  vote_count: number;
  photo_url: string;
  club: string | null;
  t90_rank: number | null;
  admin_override_cat?: boolean;
  admin_override_t90?: boolean;
  admin_override_xi?: boolean;
};

type EditableRowProps = {
  player: Player;
  globalIdx: number;
  adminPassword: string;
  onUpdate: (id: string) => void;
};

export function EditableRow({ player, globalIdx, adminPassword, onUpdate }: EditableRowProps) {
  const [editing, setEditing] = useState<'cat' | 't90' | 'xi' | null>(null);
  const [editedCat, setEditedCat] = useState(player.cat_score?.toString() ?? '');
  const [editedT90, setEditedT90] = useState(player.t90_score?.toString() ?? '');
  const [editedXi, setEditedXi] = useState(player.starting_xi?.toString() ?? '1');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);

  const hasOverrides = player.admin_override_cat || player.admin_override_t90 || player.admin_override_xi;
  const isDirty =
    (editing === 'cat' && editedCat !== (player.cat_score?.toString() ?? '')) ||
    (editing === 't90' && editedT90 !== (player.t90_score?.toString() ?? '')) ||
    (editing === 'xi' && editedXi !== (player.starting_xi?.toString() ?? '1'));

  async function handleSave() {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      const body: any = {};
      if (editing === 'cat') body.cat_score = parseFloat(editedCat);
      if (editing === 't90') body.t90_score = parseFloat(editedT90);
      if (editing === 'xi') body.starting_xi = parseInt(editedXi) as 1 | 2 | 3;

      const res = await fetch(`/api/admin/s3-players/${player.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminPassword}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(await res.text());

      setSaved(true);
      setTimeout(() => setSaved(false), 1000);
      setEditing(null);
      onUpdate(player.id);
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm(`Clear all admin overrides for ${player.name}? Next sync will restore sheet values.`)) return;
    setResetting(true);
    try {
      const res = await fetch(`/api/admin/s3-players/${player.id}/override`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminPassword}`,
        },
      });

      if (!res.ok) throw new Error(await res.text());

      setSaved(true);
      setTimeout(() => setSaved(false), 1000);
      onUpdate(player.id);
    } catch (err: any) {
      alert('Reset failed: ' + err.message);
    } finally {
      setResetting(false);
    }
  }

  function pct(count: number, total: number): number {
    if (!total) return 0;
    return Math.round((count / total) * 100);
  }

  const signPct = pct(player.sign_count, player.vote_count);
  const sellPct = pct(player.sell_count, player.vote_count);
  const sackPct = pct(player.sack_count, player.vote_count);

  return (
    <tr
      style={{
        borderBottom: `1px solid ${COLORS.border}`,
        borderLeft: isDirty ? `3px solid ${COLORS.yellow}` : saved ? `3px solid ${COLORS.green}` : 'none',
        transition: 'all 0.15s',
        background: saved ? 'rgba(0, 230, 118, 0.1)' : 'transparent',
      }}
    >
      <td style={{ padding: '10px 14px', color: COLORS.muted, width: 40 }}>{globalIdx}</td>
      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {player.photo_url ? (
            <img
              src={player.photo_url}
              alt={player.name}
              width={32}
              height={32}
              style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
              onError={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'}
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
          <span style={{ fontWeight: 600, color: COLORS.text }}>{player.name}</span>
        </div>
      </td>
      <td style={{ padding: '10px 14px', color: COLORS.muted }}>{player.nationality}</td>
      <td style={{ padding: '10px 14px' }}>
        {editing === 'xi' ? (
          <select
            value={editedXi}
            onChange={(e) => setEditedXi(e.target.value)}
            style={{
              padding: '4px 8px',
              background: '#0A0F2E',
              border: `1px solid ${COLORS.gold}`,
              borderRadius: 4,
              color: COLORS.text,
              fontSize: 12,
            }}
          >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {player.starting_xi != null ? (
              <span
                style={{
                  display: 'inline-block',
                  minWidth: 22,
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  background:
                    player.starting_xi === 1 ? '#15803D' : player.starting_xi === 2 ? '#A16207' : '#7F1D1D',
                  color: '#fff',
                }}
              >
                {player.starting_xi}
              </span>
            ) : (
              <span style={{ color: COLORS.muted }}>—</span>
            )}
            {player.admin_override_xi && <span style={{ fontSize: 10, color: COLORS.yellow }}>⚠</span>}
            <button
              onClick={() => setEditing('xi')}
              style={{
                background: 'transparent',
                border: 'none',
                color: COLORS.muted,
                cursor: 'pointer',
                fontSize: 12,
              }}
              title="Edit XI"
            >
              ✏️
            </button>
          </div>
        )}
      </td>
      <td style={{ padding: '10px 14px' }}>
        {editing === 't90' ? (
          <input
            type="number"
            step="0.1"
            value={editedT90}
            onChange={(e) => setEditedT90(e.target.value)}
            style={{
              width: 70,
              padding: '4px 8px',
              background: '#0A0F2E',
              border: `1px solid ${COLORS.gold}`,
              borderRadius: 4,
              color: COLORS.text,
              fontSize: 13,
            }}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: COLORS.text, fontWeight: 600 }}>
              {player.t90_score != null ? Number(player.t90_score).toFixed(1) : '—'}
            </span>
            {player.admin_override_t90 && <span style={{ fontSize: 10, color: COLORS.yellow }}>⚠</span>}
            <button
              onClick={() => setEditing('t90')}
              style={{
                background: 'transparent',
                border: 'none',
                color: COLORS.muted,
                cursor: 'pointer',
                fontSize: 12,
              }}
              title="Edit T90"
            >
              ✏️
            </button>
          </div>
        )}
      </td>
      <td style={{ padding: '10px 14px' }}>
        {editing === 'cat' ? (
          <input
            type="number"
            step="0.1"
            min="60"
            max="99"
            value={editedCat}
            onChange={(e) => setEditedCat(e.target.value)}
            style={{
              width: 70,
              padding: '4px 8px',
              background: '#0A0F2E',
              border: `1px solid ${COLORS.gold}`,
              borderRadius: 4,
              color: COLORS.text,
              fontSize: 13,
            }}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: COLORS.muted }}>
              {player.cat_score != null ? Number(player.cat_score).toFixed(1) : '—'}
            </span>
            {player.admin_override_cat && <span style={{ fontSize: 10, color: COLORS.yellow }}>⚠</span>}
            <button
              onClick={() => setEditing('cat')}
              style={{
                background: 'transparent',
                border: 'none',
                color: COLORS.muted,
                cursor: 'pointer',
                fontSize: 12,
              }}
              title="Edit Cat"
            >
              ✏️
            </button>
          </div>
        )}
      </td>
      <td style={{ padding: '10px 14px', color: COLORS.muted }}>
        {player.tenk_score != null ? player.tenk_score.toLocaleString() : '—'}
      </td>
      <td style={{ padding: '10px 14px', color: COLORS.gold, fontWeight: 700 }}>{player.s3_value ?? '—'}</td>
      <td style={{ padding: '10px 14px', color: COLORS.green }}>{player.sign_count ?? 0}</td>
      <td style={{ padding: '10px 14px', color: COLORS.yellow }}>{player.sell_count ?? 0}</td>
      <td style={{ padding: '10px 14px', color: COLORS.red }}>{player.sack_count ?? 0}</td>
      <td style={{ padding: '10px 14px', color: COLORS.text, fontWeight: 600 }}>{player.vote_count ?? 0}</td>
      <td style={{ padding: '10px 14px' }}>
        {editing && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              style={{
                padding: '4px 12px',
                background: isDirty ? COLORS.green : COLORS.border,
                border: 'none',
                borderRadius: 4,
                color: '#0A0F2E',
                fontSize: 11,
                fontWeight: 700,
                cursor: isDirty ? 'pointer' : 'not-allowed',
              }}
            >
              {saving ? '...' : '💾 Save'}
            </button>
            <button
              onClick={() => setEditing(null)}
              style={{
                padding: '4px 12px',
                background: COLORS.red,
                border: 'none',
                borderRadius: 4,
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ✖
            </button>
          </div>
        )}
        {hasOverrides && !editing && (
          <button
            onClick={handleReset}
            disabled={resetting}
            style={{
              padding: '4px 12px',
              background: COLORS.yellow,
              border: 'none',
              borderRadius: 4,
              color: '#0A0F2E',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
            title="Clear all admin overrides"
          >
            {resetting ? '...' : '↺ Reset'}
          </button>
        )}
      </td>
    </tr>
  );
}
