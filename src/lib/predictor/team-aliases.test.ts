import { describe, it, expect } from 'vitest'
import { resolveTeamAliases } from './team-aliases'

describe('resolveTeamAliases', () => {
  it('returns [USA, United States, ...] for both shorthands', () => {
    expect(resolveTeamAliases('USA')).toContain('United States')
    expect(resolveTeamAliases('USA')).toContain('USA')
    expect(resolveTeamAliases('United States')).toContain('USA')
    expect(resolveTeamAliases('United States')).toContain('United States')
  })

  it('covers Ivory Coast / Côte d\'Ivoire variants', () => {
    const a = resolveTeamAliases("Côte d'Ivoire")
    expect(a).toContain('Ivory Coast')
    expect(a).toContain("Côte d'Ivoire")
    expect(resolveTeamAliases('Ivory Coast')).toContain("Côte d'Ivoire")
  })

  it('is identity for unknown countries', () => {
    expect(resolveTeamAliases('France')).toEqual(['France'])
    expect(resolveTeamAliases('Argentina')).toEqual(['Argentina'])
  })

  it('trims whitespace', () => {
    expect(resolveTeamAliases('  USA  ')).toContain('United States')
  })
})
