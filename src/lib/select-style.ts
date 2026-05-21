/**
 * Shared dropdown / select styling so the predictor round-nav matches the
 * /scores stage/round picker exactly. Hoisted out of `src/app/scores/page.tsx`
 * so we don't duplicate the SVG arrow + colors across pages.
 *
 * Always pair with the `<style>` snippet returned by `selectOptionStyle()`
 * so the dropdown options have a dark background (Chrome/Firefox default
 * to white otherwise).
 */

import type { CSSProperties } from 'react'

export const selectStyle: CSSProperties = {
  backgroundColor: '#0F1C4D',
  color: '#F0F4FF',
  border: '1px solid #1E3A6E',
  borderRadius: '0.5rem',
  padding: '0.45rem 2rem 0.45rem 0.75rem',
  fontSize: '0.82rem',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M6 9l6 6 6-6' stroke='%238899CC' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.6rem center',
  outline: 'none',
}

// Drop this into a `<style>` tag in the same page once.
export const SELECT_OPTION_CSS = `select option { background-color: #0F1C4D; color: #F0F4FF; }`

export const PREDICTOR_ROUND_OPTIONS: { code: string; label: string }[] = [
  { code: 'group_r1', label: 'Round 1 (GS #1)' },
  { code: 'group_r2', label: 'Round 2 (GS #2)' },
  { code: 'group_r3', label: 'Round 3 (GS #3)' },
  { code: 'r32',      label: 'Round 4 (R32)' },
  { code: 'r16',      label: 'Round 5 (R16)' },
  { code: 'qf',       label: 'Round 6 (QF)' },
  { code: 'sf',       label: 'Round 7 (SF)' },
  { code: 'final',    label: 'Round 8 (F & 3rd)' },
]
