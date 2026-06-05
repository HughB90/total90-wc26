/**
 * Nation-name → ISO-3166-1 alpha-2 / flag-icons subdivision code.
 *
 * Covers all 48 WC2026 teams (canonical names match
 * src/data/opta-power-ratings-2026-06-05.ts → OPTA_POWER_RATINGS) plus a
 * handful of legacy aliases that show up in s3_players.nationality.
 *
 * Used with the flag-icons npm package:
 *   <span className={`fi fi-${nationToIso(player.nationality)}`} />
 *
 * Unknown nations fall back to a neutral grey "?" placeholder in the UI —
 * keep this map up to date if Opta adds a team.
 */

const NATION_TO_ISO: Record<string, string> = {
  // ── Group A ───────────────────────────────────────────────────────
  'Mexico':                'mx',
  'Korea Republic':        'kr',
  'South Korea':           'kr', // alias
  'Czechia':               'cz',
  'Czech Republic':        'cz', // alias
  'South Africa':          'za',

  // ── Group B ───────────────────────────────────────────────────────
  'Switzerland':           'ch',
  'Canada':                'ca',
  'Bosnia-Herzegovina':    'ba',
  'Bosnia and Herzegovina':'ba', // alias
  'Qatar':                 'qa',

  // ── Group C ───────────────────────────────────────────────────────
  'Brazil':                'br',
  'Morocco':               'ma',
  'Scotland':              'gb-sct',
  'Haiti':                 'ht',

  // ── Group D ───────────────────────────────────────────────────────
  'Türkiye':               'tr',
  'Turkey':                'tr', // alias
  'Paraguay':              'py',
  'Australia':             'au',
  'United States':         'us',
  'USA':                   'us', // alias

  // ── Group E ───────────────────────────────────────────────────────
  'Germany':               'de',
  'Ecuador':               'ec',
  "Côte d'Ivoire":         'ci',
  'Ivory Coast':           'ci', // alias
  'Curaçao':               'cw',
  'Curacao':               'cw', // alias

  // ── Group F ───────────────────────────────────────────────────────
  'Netherlands':           'nl',
  'Japan':                 'jp',
  'Sweden':                'se',
  'Tunisia':               'tn',

  // ── Group G ───────────────────────────────────────────────────────
  'Belgium':               'be',
  'IR Iran':               'ir',
  'Iran':                  'ir', // alias
  'Egypt':                 'eg',
  'New Zealand':           'nz',

  // ── Group H ───────────────────────────────────────────────────────
  'Spain':                 'es',
  'Uruguay':               'uy',
  'Saudi Arabia':          'sa',
  'Cabo Verde':            'cv',
  'Cape Verde':            'cv', // alias

  // ── Group I ───────────────────────────────────────────────────────
  'France':                'fr',
  'Senegal':               'sn',
  'Norway':                'no',
  'Iraq':                  'iq',

  // ── Group J ───────────────────────────────────────────────────────
  'Argentina':             'ar',
  'Austria':               'at',
  'Algeria':               'dz',
  'Jordan':                'jo',

  // ── Group K ───────────────────────────────────────────────────────
  'Portugal':              'pt',
  'Colombia':              'co',
  'Uzbekistan':            'uz',
  'Congo DR':              'cd',
  'DR Congo':              'cd', // alias

  // ── Group L ───────────────────────────────────────────────────────
  'England':               'gb-eng',
  'Croatia':               'hr',
  'Panama':                'pa',
  'Ghana':                 'gh',
}

export function nationToIso(nation: string | null | undefined): string | null {
  if (!nation) return null
  return NATION_TO_ISO[nation] ?? null
}

export function allKnownNations(): string[] {
  return Object.keys(NATION_TO_ISO)
}
