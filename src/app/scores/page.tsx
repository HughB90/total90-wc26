'use client'

import { useState } from 'react'

// ─── Color tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  gold: '#FBBF24',
  muted: '#8899CC',
  text: '#F0F4FF',
  green: '#00E676',
}

// ─── Country codes ────────────────────────────────────────────────────────────
const COUNTRY_CODES: Record<string, string> = {
  England: 'gb-eng',
  Scotland: 'gb-sct',
  France: 'fr',
  Spain: 'es',
  Germany: 'de',
  Brazil: 'br',
  Argentina: 'ar',
  Portugal: 'pt',
  Netherlands: 'nl',
  Belgium: 'be',
  Italy: 'it',
  Morocco: 'ma',
  USA: 'us',
  Mexico: 'mx',
  Japan: 'jp',
  Colombia: 'co',
  Uruguay: 'uy',
  Croatia: 'hr',
  Senegal: 'sn',
  Canada: 'ca',
  Switzerland: 'ch',
  Ecuador: 'ec',
  'South Korea': 'kr',
  Australia: 'au',
  Czechia: 'cz',
  'Saudi Arabia': 'sa',
  Paraguay: 'py',
  Algeria: 'dz',
  'New Zealand': 'nz',
  Panama: 'pa',
  Ghana: 'gh',
  Haiti: 'ht',
  Turkey: 'tr',
  Egypt: 'eg',
  'Ivory Coast': 'ci',
  Jordan: 'jo',
  Qatar: 'qa',
  Tunisia: 'tn',
  'South Africa': 'za',
  'Bosnia & Herzegovina': 'ba',
  'Bosnia and Herzegovina': 'ba',
  Sweden: 'se',
  Iraq: 'iq',
  'DR Congo': 'cd',
  'Curaçao': 'cw',
  Curacao: 'cw',
  'Cape Verde': 'cv',
  Uzbekistan: 'uz',
  Norway: 'no',
  Iran: 'ir',
  Austria: 'at',
  Nigeria: 'ng',
  Serbia: 'rs',
  Poland: 'pl',
}

function flagUrl(country: string) {
  const code = COUNTRY_CODES[country] ?? country.toLowerCase().replace(/\s+/g, '-')
  return `https://flagcdn.com/w160/${code}.png`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────
type MatchStatus = 'fixture' | 'playing' | 'played'
type Stage = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'final'

interface TeamSlot {
  name: string
  placeholder?: boolean
}

interface Match {
  num: number
  stage: Stage
  round?: 1 | 2 | 3
  group?: string
  date: string
  time: string
  home: TeamSlot
  away: TeamSlot
  venue: string
  score: { home: number; away: number } | null
  status: MatchStatus
}

const t = (name: string): TeamSlot => ({ name })
const p = (name: string): TeamSlot => ({ name, placeholder: true })

// ─── Complete 104-match schedule ──────────────────────────────────────────────
const MATCHES: Match[] = [
  // ── GROUP STAGE ROUND 1 ────────────────────────────────────────────────────
  { num: 1,  stage: 'group', round: 1, group: 'A', date: '2026-06-11', time: '2:00 PM CT',  home: t('Mexico'),              away: t('South Africa'),           venue: 'Estadio Azteca, Mexico City',             score: null, status: 'fixture' },
  { num: 2,  stage: 'group', round: 1, group: 'A', date: '2026-06-11', time: '9:00 PM CT',  home: t('South Korea'),         away: t('Czechia'),                 venue: 'Estadio Akron, Zapopan',                  score: null, status: 'fixture' },
  { num: 3,  stage: 'group', round: 1, group: 'B', date: '2026-06-12', time: '2:00 PM CT',  home: t('Canada'),              away: t('Bosnia & Herzegovina'),    venue: 'BMO Field, Toronto',                      score: null, status: 'fixture' },
  { num: 4,  stage: 'group', round: 1, group: 'D', date: '2026-06-12', time: '8:00 PM CT',  home: t('USA'),                 away: t('Paraguay'),                venue: 'SoFi Stadium, Los Angeles',               score: null, status: 'fixture' },
  { num: 5,  stage: 'group', round: 1, group: 'B', date: '2026-06-13', time: '2:00 PM CT',  home: t('Qatar'),               away: t('Switzerland'),             venue: "Levi's Stadium, Santa Clara",             score: null, status: 'fixture' },
  { num: 6,  stage: 'group', round: 1, group: 'C', date: '2026-06-13', time: '5:00 PM CT',  home: t('Brazil'),              away: t('Morocco'),                 venue: 'MetLife Stadium, New York',               score: null, status: 'fixture' },
  { num: 7,  stage: 'group', round: 1, group: 'C', date: '2026-06-13', time: '8:00 PM CT',  home: t('Haiti'),               away: t('Scotland'),                venue: 'Gillette Stadium, Boston',                score: null, status: 'fixture' },
  { num: 8,  stage: 'group', round: 1, group: 'D', date: '2026-06-13', time: '11:00 PM CT', home: t('Australia'),           away: t('Turkey'),                  venue: 'BC Place, Vancouver',                     score: null, status: 'fixture' },
  { num: 9,  stage: 'group', round: 1, group: 'E', date: '2026-06-14', time: '12:00 PM CT', home: t('Germany'),             away: t('Curaçao'),                 venue: 'NRG Stadium, Houston',                    score: null, status: 'fixture' },
  { num: 10, stage: 'group', round: 1, group: 'F', date: '2026-06-14', time: '3:00 PM CT',  home: t('Netherlands'),         away: t('Japan'),                   venue: 'AT&T Stadium, Arlington',                 score: null, status: 'fixture' },
  { num: 11, stage: 'group', round: 1, group: 'E', date: '2026-06-14', time: '6:00 PM CT',  home: t('Ivory Coast'),         away: t('Ecuador'),                 venue: 'Lincoln Financial Field, Philadelphia',   score: null, status: 'fixture' },
  { num: 12, stage: 'group', round: 1, group: 'F', date: '2026-06-14', time: '9:00 PM CT',  home: t('Sweden'),              away: t('Tunisia'),                 venue: 'Estadio BBVA, Monterrey',                 score: null, status: 'fixture' },
  { num: 13, stage: 'group', round: 1, group: 'H', date: '2026-06-15', time: '11:00 AM CT', home: t('Spain'),               away: t('Cape Verde'),              venue: 'Mercedes-Benz Stadium, Atlanta',          score: null, status: 'fixture' },
  { num: 14, stage: 'group', round: 1, group: 'G', date: '2026-06-15', time: '2:00 PM CT',  home: t('Belgium'),             away: t('Egypt'),                   venue: 'Lumen Field, Seattle',                    score: null, status: 'fixture' },
  { num: 15, stage: 'group', round: 1, group: 'H', date: '2026-06-15', time: '5:00 PM CT',  home: t('Saudi Arabia'),        away: t('Uruguay'),                 venue: 'Hard Rock Stadium, Miami',                score: null, status: 'fixture' },
  { num: 16, stage: 'group', round: 1, group: 'G', date: '2026-06-15', time: '8:00 PM CT',  home: t('Iran'),                away: t('New Zealand'),             venue: 'SoFi Stadium, Los Angeles',               score: null, status: 'fixture' },
  { num: 17, stage: 'group', round: 1, group: 'I', date: '2026-06-16', time: '2:00 PM CT',  home: t('France'),              away: t('Senegal'),                 venue: 'MetLife Stadium, New York',               score: null, status: 'fixture' },
  { num: 18, stage: 'group', round: 1, group: 'I', date: '2026-06-16', time: '5:00 PM CT',  home: t('Iraq'),                away: t('Norway'),                  venue: 'Gillette Stadium, Boston',                score: null, status: 'fixture' },
  { num: 19, stage: 'group', round: 1, group: 'J', date: '2026-06-16', time: '8:00 PM CT',  home: t('Argentina'),           away: t('Algeria'),                 venue: 'Arrowhead Stadium, Kansas City',          score: null, status: 'fixture' },
  { num: 20, stage: 'group', round: 1, group: 'J', date: '2026-06-16', time: '11:00 PM CT', home: t('Austria'),             away: t('Jordan'),                  venue: "Levi's Stadium, Santa Clara",             score: null, status: 'fixture' },
  { num: 21, stage: 'group', round: 1, group: 'K', date: '2026-06-17', time: '12:00 PM CT', home: t('Portugal'),            away: t('DR Congo'),                venue: 'NRG Stadium, Houston',                    score: null, status: 'fixture' },
  { num: 22, stage: 'group', round: 1, group: 'L', date: '2026-06-17', time: '3:00 PM CT',  home: t('England'),             away: t('Croatia'),                 venue: 'AT&T Stadium, Arlington',                 score: null, status: 'fixture' },
  { num: 23, stage: 'group', round: 1, group: 'L', date: '2026-06-17', time: '6:00 PM CT',  home: t('Ghana'),               away: t('Panama'),                  venue: 'BMO Field, Toronto',                      score: null, status: 'fixture' },
  { num: 24, stage: 'group', round: 1, group: 'K', date: '2026-06-17', time: '9:00 PM CT',  home: t('Uzbekistan'),          away: t('Colombia'),                venue: 'Estadio Azteca, Mexico City',             score: null, status: 'fixture' },

  // ── GROUP STAGE ROUND 2 ────────────────────────────────────────────────────
  { num: 25, stage: 'group', round: 2, group: 'A', date: '2026-06-18', time: '11:00 AM CT', home: t('Czechia'),             away: t('South Africa'),            venue: 'Mercedes-Benz Stadium, Atlanta',          score: null, status: 'fixture' },
  { num: 26, stage: 'group', round: 2, group: 'B', date: '2026-06-18', time: '2:00 PM CT',  home: t('Switzerland'),         away: t('Bosnia & Herzegovina'),    venue: 'SoFi Stadium, Los Angeles',               score: null, status: 'fixture' },
  { num: 27, stage: 'group', round: 2, group: 'B', date: '2026-06-18', time: '5:00 PM CT',  home: t('Canada'),              away: t('Qatar'),                   venue: 'BC Place, Vancouver',                     score: null, status: 'fixture' },
  { num: 28, stage: 'group', round: 2, group: 'A', date: '2026-06-18', time: '8:00 PM CT',  home: t('Mexico'),              away: t('South Korea'),             venue: 'Estadio Akron, Zapopan',                  score: null, status: 'fixture' },
  { num: 29, stage: 'group', round: 2, group: 'D', date: '2026-06-19', time: '2:00 PM CT',  home: t('USA'),                 away: t('Australia'),               venue: 'Lumen Field, Seattle',                    score: null, status: 'fixture' },
  { num: 30, stage: 'group', round: 2, group: 'C', date: '2026-06-19', time: '5:00 PM CT',  home: t('Scotland'),            away: t('Morocco'),                 venue: 'Gillette Stadium, Boston',                score: null, status: 'fixture' },
  { num: 31, stage: 'group', round: 2, group: 'C', date: '2026-06-19', time: '7:30 PM CT',  home: t('Brazil'),              away: t('Haiti'),                   venue: 'Lincoln Financial Field, Philadelphia',   score: null, status: 'fixture' },
  { num: 32, stage: 'group', round: 2, group: 'D', date: '2026-06-19', time: '10:00 PM CT', home: t('Turkey'),              away: t('Paraguay'),                venue: "Levi's Stadium, Santa Clara",             score: null, status: 'fixture' },
  { num: 33, stage: 'group', round: 2, group: 'F', date: '2026-06-20', time: '12:00 PM CT', home: t('Netherlands'),         away: t('Sweden'),                  venue: 'NRG Stadium, Houston',                    score: null, status: 'fixture' },
  { num: 34, stage: 'group', round: 2, group: 'E', date: '2026-06-20', time: '3:00 PM CT',  home: t('Germany'),             away: t('Ivory Coast'),             venue: 'BMO Field, Toronto',                      score: null, status: 'fixture' },
  { num: 35, stage: 'group', round: 2, group: 'E', date: '2026-06-20', time: '7:00 PM CT',  home: t('Ecuador'),             away: t('Curaçao'),                 venue: 'Arrowhead Stadium, Kansas City',          score: null, status: 'fixture' },
  { num: 36, stage: 'group', round: 2, group: 'F', date: '2026-06-20', time: '11:00 PM CT', home: t('Tunisia'),             away: t('Japan'),                   venue: 'Estadio BBVA, Monterrey',                 score: null, status: 'fixture' },
  { num: 37, stage: 'group', round: 2, group: 'H', date: '2026-06-21', time: '11:00 AM CT', home: t('Spain'),               away: t('Saudi Arabia'),            venue: 'Mercedes-Benz Stadium, Atlanta',          score: null, status: 'fixture' },
  { num: 38, stage: 'group', round: 2, group: 'G', date: '2026-06-21', time: '2:00 PM CT',  home: t('Belgium'),             away: t('Iran'),                    venue: 'SoFi Stadium, Los Angeles',               score: null, status: 'fixture' },
  { num: 39, stage: 'group', round: 2, group: 'H', date: '2026-06-21', time: '5:00 PM CT',  home: t('Uruguay'),             away: t('Cape Verde'),              venue: 'Hard Rock Stadium, Miami',                score: null, status: 'fixture' },
  { num: 40, stage: 'group', round: 2, group: 'G', date: '2026-06-21', time: '8:00 PM CT',  home: t('New Zealand'),         away: t('Egypt'),                   venue: 'BC Place, Vancouver',                     score: null, status: 'fixture' },
  { num: 41, stage: 'group', round: 2, group: 'J', date: '2026-06-22', time: '12:00 PM CT', home: t('Argentina'),           away: t('Austria'),                 venue: 'AT&T Stadium, Arlington',                 score: null, status: 'fixture' },
  { num: 42, stage: 'group', round: 2, group: 'I', date: '2026-06-22', time: '4:00 PM CT',  home: t('France'),              away: t('Iraq'),                    venue: 'Lincoln Financial Field, Philadelphia',   score: null, status: 'fixture' },
  { num: 43, stage: 'group', round: 2, group: 'I', date: '2026-06-22', time: '7:00 PM CT',  home: t('Norway'),              away: t('Senegal'),                 venue: 'MetLife Stadium, New York',               score: null, status: 'fixture' },
  { num: 44, stage: 'group', round: 2, group: 'J', date: '2026-06-22', time: '10:00 PM CT', home: t('Jordan'),              away: t('Algeria'),                 venue: "Levi's Stadium, Santa Clara",             score: null, status: 'fixture' },
  { num: 45, stage: 'group', round: 2, group: 'K', date: '2026-06-23', time: '12:00 PM CT', home: t('Portugal'),            away: t('Uzbekistan'),              venue: 'NRG Stadium, Houston',                    score: null, status: 'fixture' },
  { num: 46, stage: 'group', round: 2, group: 'L', date: '2026-06-23', time: '3:00 PM CT',  home: t('England'),             away: t('Ghana'),                   venue: 'Gillette Stadium, Boston',                score: null, status: 'fixture' },
  { num: 47, stage: 'group', round: 2, group: 'L', date: '2026-06-23', time: '6:00 PM CT',  home: t('Panama'),              away: t('Croatia'),                 venue: 'BMO Field, Toronto',                      score: null, status: 'fixture' },
  { num: 48, stage: 'group', round: 2, group: 'K', date: '2026-06-23', time: '9:00 PM CT',  home: t('Colombia'),            away: t('DR Congo'),                venue: 'Estadio Akron, Zapopan',                  score: null, status: 'fixture' },

  // ── GROUP STAGE ROUND 3 ────────────────────────────────────────────────────
  { num: 49, stage: 'group', round: 3, group: 'B', date: '2026-06-24', time: '2:00 PM CT',  home: t('Switzerland'),         away: t('Canada'),                  venue: 'BC Place, Vancouver',                     score: null, status: 'fixture' },
  { num: 50, stage: 'group', round: 3, group: 'B', date: '2026-06-24', time: '2:00 PM CT',  home: t('Bosnia & Herzegovina'),away: t('Qatar'),                   venue: 'Lumen Field, Seattle',                    score: null, status: 'fixture' },
  { num: 51, stage: 'group', round: 3, group: 'C', date: '2026-06-24', time: '5:00 PM CT',  home: t('Scotland'),            away: t('Brazil'),                  venue: 'Hard Rock Stadium, Miami',                score: null, status: 'fixture' },
  { num: 52, stage: 'group', round: 3, group: 'C', date: '2026-06-24', time: '5:00 PM CT',  home: t('Morocco'),             away: t('Haiti'),                   venue: 'Mercedes-Benz Stadium, Atlanta',          score: null, status: 'fixture' },
  { num: 53, stage: 'group', round: 3, group: 'A', date: '2026-06-24', time: '8:00 PM CT',  home: t('Czechia'),             away: t('Mexico'),                  venue: 'Estadio Azteca, Mexico City',             score: null, status: 'fixture' },
  { num: 54, stage: 'group', round: 3, group: 'A', date: '2026-06-24', time: '8:00 PM CT',  home: t('South Africa'),        away: t('South Korea'),             venue: 'Estadio BBVA, Monterrey',                 score: null, status: 'fixture' },
  { num: 55, stage: 'group', round: 3, group: 'E', date: '2026-06-25', time: '3:00 PM CT',  home: t('Curaçao'),             away: t('Ivory Coast'),             venue: 'Lincoln Financial Field, Philadelphia',   score: null, status: 'fixture' },
  { num: 56, stage: 'group', round: 3, group: 'E', date: '2026-06-25', time: '3:00 PM CT',  home: t('Ecuador'),             away: t('Germany'),                 venue: 'MetLife Stadium, New York',               score: null, status: 'fixture' },
  { num: 57, stage: 'group', round: 3, group: 'F', date: '2026-06-25', time: '6:00 PM CT',  home: t('Japan'),               away: t('Sweden'),                  venue: 'AT&T Stadium, Arlington',                 score: null, status: 'fixture' },
  { num: 58, stage: 'group', round: 3, group: 'F', date: '2026-06-25', time: '6:00 PM CT',  home: t('Tunisia'),             away: t('Netherlands'),             venue: 'Arrowhead Stadium, Kansas City',          score: null, status: 'fixture' },
  { num: 59, stage: 'group', round: 3, group: 'D', date: '2026-06-25', time: '9:00 PM CT',  home: t('Turkey'),              away: t('USA'),                     venue: 'SoFi Stadium, Los Angeles',               score: null, status: 'fixture' },
  { num: 60, stage: 'group', round: 3, group: 'D', date: '2026-06-25', time: '9:00 PM CT',  home: t('Paraguay'),            away: t('Australia'),               venue: "Levi's Stadium, Santa Clara",             score: null, status: 'fixture' },
  { num: 61, stage: 'group', round: 3, group: 'I', date: '2026-06-26', time: '2:00 PM CT',  home: t('Norway'),              away: t('France'),                  venue: 'Gillette Stadium, Boston',                score: null, status: 'fixture' },
  { num: 62, stage: 'group', round: 3, group: 'I', date: '2026-06-26', time: '2:00 PM CT',  home: t('Senegal'),             away: t('Iraq'),                    venue: 'BMO Field, Toronto',                      score: null, status: 'fixture' },
  { num: 63, stage: 'group', round: 3, group: 'H', date: '2026-06-26', time: '7:00 PM CT',  home: t('Cape Verde'),          away: t('Saudi Arabia'),            venue: 'NRG Stadium, Houston',                    score: null, status: 'fixture' },
  { num: 64, stage: 'group', round: 3, group: 'H', date: '2026-06-26', time: '7:00 PM CT',  home: t('Uruguay'),             away: t('Spain'),                   venue: 'Estadio Akron, Zapopan',                  score: null, status: 'fixture' },
  { num: 65, stage: 'group', round: 3, group: 'G', date: '2026-06-26', time: '10:00 PM CT', home: t('Egypt'),               away: t('Iran'),                    venue: 'Lumen Field, Seattle',                    score: null, status: 'fixture' },
  { num: 66, stage: 'group', round: 3, group: 'G', date: '2026-06-26', time: '10:00 PM CT', home: t('New Zealand'),         away: t('Belgium'),                 venue: 'BC Place, Vancouver',                     score: null, status: 'fixture' },
  { num: 67, stage: 'group', round: 3, group: 'L', date: '2026-06-27', time: '4:00 PM CT',  home: t('Panama'),              away: t('England'),                 venue: 'MetLife Stadium, New York',               score: null, status: 'fixture' },
  { num: 68, stage: 'group', round: 3, group: 'L', date: '2026-06-27', time: '4:00 PM CT',  home: t('Croatia'),             away: t('Ghana'),                   venue: 'Lincoln Financial Field, Philadelphia',   score: null, status: 'fixture' },
  { num: 69, stage: 'group', round: 3, group: 'K', date: '2026-06-27', time: '6:30 PM CT',  home: t('Colombia'),            away: t('Portugal'),                venue: 'Hard Rock Stadium, Miami',                score: null, status: 'fixture' },
  { num: 70, stage: 'group', round: 3, group: 'K', date: '2026-06-27', time: '6:30 PM CT',  home: t('DR Congo'),            away: t('Uzbekistan'),              venue: 'Mercedes-Benz Stadium, Atlanta',          score: null, status: 'fixture' },
  { num: 71, stage: 'group', round: 3, group: 'J', date: '2026-06-27', time: '9:00 PM CT',  home: t('Algeria'),             away: t('Austria'),                 venue: 'Arrowhead Stadium, Kansas City',          score: null, status: 'fixture' },
  { num: 72, stage: 'group', round: 3, group: 'J', date: '2026-06-27', time: '9:00 PM CT',  home: t('Jordan'),              away: t('Argentina'),               venue: 'AT&T Stadium, Arlington',                 score: null, status: 'fixture' },

  // ── ROUND OF 32 ───────────────────────────────────────────────────────────
  { num: 73,  stage: 'r32', date: '2026-06-28', time: '2:00 PM CT',   home: p('Runner-up A'),            away: p('Runner-up B'),              venue: 'SoFi Stadium, Los Angeles',              score: null, status: 'fixture' },
  { num: 74,  stage: 'r32', date: '2026-06-29', time: '12:30 PM CT',  home: p('Winner E'),               away: p('Best 3rd A/B/C/D/F'),       venue: 'Gillette Stadium, Boston',               score: null, status: 'fixture' },
  { num: 75,  stage: 'r32', date: '2026-06-29', time: '3:30 PM CT',   home: p('Winner F'),               away: p('Runner-up C'),              venue: 'Estadio BBVA, Monterrey',                score: null, status: 'fixture' },
  { num: 76,  stage: 'r32', date: '2026-06-29', time: '8:00 PM CT',   home: p('Winner C'),               away: p('Runner-up F'),              venue: 'NRG Stadium, Houston',                   score: null, status: 'fixture' },
  { num: 77,  stage: 'r32', date: '2026-06-30', time: '4:00 PM CT',   home: p('Winner I'),               away: p('Best 3rd C/D/F/G/H'),       venue: 'MetLife Stadium, New York',              score: null, status: 'fixture' },
  { num: 78,  stage: 'r32', date: '2026-06-30', time: '12:00 PM CT',  home: p('Runner-up E'),            away: p('Runner-up I'),              venue: 'AT&T Stadium, Arlington',                score: null, status: 'fixture' },
  { num: 79,  stage: 'r32', date: '2026-06-30', time: '8:00 PM CT',   home: p('Winner A'),               away: p('Best 3rd C/E/F/H/I'),       venue: 'Estadio Azteca, Mexico City',            score: null, status: 'fixture' },
  { num: 80,  stage: 'r32', date: '2026-07-01', time: '11:00 AM CT',  home: p('Winner L'),               away: p('Best 3rd E/H/I/J/K'),       venue: 'Mercedes-Benz Stadium, Atlanta',         score: null, status: 'fixture' },
  { num: 81,  stage: 'r32', date: '2026-07-01', time: '7:00 PM CT',   home: p('Winner D'),               away: p('Best 3rd B/E/F/I/J'),       venue: "Levi's Stadium, Santa Clara",            score: null, status: 'fixture' },
  { num: 82,  stage: 'r32', date: '2026-07-01', time: '3:00 PM CT',   home: p('Winner G'),               away: p('Best 3rd A/E/H/I/J'),       venue: 'Lumen Field, Seattle',                   score: null, status: 'fixture' },
  { num: 83,  stage: 'r32', date: '2026-07-02', time: '6:00 PM CT',   home: p('Runner-up K'),            away: p('Runner-up L'),              venue: 'BMO Field, Toronto',                     score: null, status: 'fixture' },
  { num: 84,  stage: 'r32', date: '2026-07-02', time: '2:00 PM CT',   home: p('Winner H'),               away: p('Runner-up J'),              venue: 'SoFi Stadium, Los Angeles',              score: null, status: 'fixture' },
  { num: 85,  stage: 'r32', date: '2026-07-02', time: '10:00 PM CT',  home: p('Winner B'),               away: p('Best 3rd E/F/G/I/J'),       venue: 'BC Place, Vancouver',                    score: null, status: 'fixture' },
  { num: 86,  stage: 'r32', date: '2026-07-03', time: '5:00 PM CT',   home: p('Winner J'),               away: p('Runner-up H'),              venue: 'Hard Rock Stadium, Miami',               score: null, status: 'fixture' },
  { num: 87,  stage: 'r32', date: '2026-07-03', time: '8:30 PM CT',   home: p('Winner K'),               away: p('Best 3rd D/E/I/J/L'),       venue: 'Arrowhead Stadium, Kansas City',         score: null, status: 'fixture' },
  { num: 88,  stage: 'r32', date: '2026-07-03', time: '1:00 PM CT',   home: p('Runner-up D'),            away: p('Runner-up G'),              venue: 'AT&T Stadium, Arlington',                score: null, status: 'fixture' },

  // ── ROUND OF 16 ───────────────────────────────────────────────────────────
  { num: 89,  stage: 'r16', date: '2026-07-04', time: '12:00 PM CT',  home: p('Winner M73'),             away: p('Winner M75'),               venue: 'NRG Stadium, Houston',                   score: null, status: 'fixture' },
  { num: 90,  stage: 'r16', date: '2026-07-04', time: '4:00 PM CT',   home: p('Winner M74'),             away: p('Winner M77'),               venue: 'Lincoln Financial Field, Philadelphia',  score: null, status: 'fixture' },
  { num: 91,  stage: 'r16', date: '2026-07-05', time: '3:00 PM CT',   home: p('Winner M76'),             away: p('Winner M78'),               venue: 'MetLife Stadium, New York',              score: null, status: 'fixture' },
  { num: 92,  stage: 'r16', date: '2026-07-05', time: '7:00 PM CT',   home: p('Winner M79'),             away: p('Winner M80'),               venue: 'Estadio Azteca, Mexico City',            score: null, status: 'fixture' },
  { num: 93,  stage: 'r16', date: '2026-07-06', time: '2:00 PM CT',   home: p('Winner M83'),             away: p('Winner M84'),               venue: 'AT&T Stadium, Arlington',                score: null, status: 'fixture' },
  { num: 94,  stage: 'r16', date: '2026-07-06', time: '7:00 PM CT',   home: p('Winner M81'),             away: p('Winner M82'),               venue: 'Lumen Field, Seattle',                   score: null, status: 'fixture' },
  { num: 95,  stage: 'r16', date: '2026-07-07', time: '11:00 AM CT',  home: p('Winner M86'),             away: p('Winner M88'),               venue: 'Mercedes-Benz Stadium, Atlanta',         score: null, status: 'fixture' },
  { num: 96,  stage: 'r16', date: '2026-07-07', time: '3:00 PM CT',   home: p('Winner M85'),             away: p('Winner M87'),               venue: 'BC Place, Vancouver',                    score: null, status: 'fixture' },

  // ── QUARTER-FINALS ────────────────────────────────────────────────────────
  { num: 97,  stage: 'qf',    date: '2026-07-09', time: '2:00 PM CT', home: p('Winner M89'),             away: p('Winner M90'),               venue: 'SoFi Stadium, Los Angeles',              score: null, status: 'fixture' },
  { num: 98,  stage: 'qf',    date: '2026-07-09', time: '6:00 PM CT', home: p('Winner M91'),             away: p('Winner M92'),               venue: 'MetLife Stadium, New York',              score: null, status: 'fixture' },
  { num: 99,  stage: 'qf',    date: '2026-07-10', time: '2:00 PM CT', home: p('Winner M93'),             away: p('Winner M94'),               venue: 'AT&T Stadium, Arlington',                score: null, status: 'fixture' },
  { num: 100, stage: 'qf',    date: '2026-07-10', time: '6:00 PM CT', home: p('Winner M95'),             away: p('Winner M96'),               venue: 'Estadio Azteca, Mexico City',            score: null, status: 'fixture' },

  // ── SEMI-FINALS ───────────────────────────────────────────────────────────
  { num: 101, stage: 'sf',    date: '2026-07-14', time: '2:00 PM CT', home: p('Winner M97'),             away: p('Winner M98'),               venue: 'MetLife Stadium, New York',              score: null, status: 'fixture' },
  { num: 102, stage: 'sf',    date: '2026-07-15', time: '2:00 PM CT', home: p('Winner M99'),             away: p('Winner M100'),              venue: 'AT&T Stadium, Arlington',                score: null, status: 'fixture' },

  // ── 3RD PLACE + FINAL ─────────────────────────────────────────────────────
  { num: 103, stage: 'final', date: '2026-07-18', time: '2:00 PM CT', home: p('Loser M101'),             away: p('Loser M102'),               venue: 'Hard Rock Stadium, Miami',               score: null, status: 'fixture' },
  { num: 104, stage: 'final', date: '2026-07-19', time: '2:00 PM CT', home: p('Winner M101'),            away: p('Winner M102'),              venue: 'MetLife Stadium, New York',              score: null, status: 'fixture' },
]

// ─── Stage config ─────────────────────────────────────────────────────────────
const STAGES: { id: Stage; label: string; rounds: string[] | null }[] = [
  { id: 'group', label: 'Group Stage',    rounds: ['Round 1', 'Round 2', 'Round 3'] },
  { id: 'r32',   label: 'Round of 32',   rounds: null },
  { id: 'r16',   label: 'Round of 16',   rounds: null },
  { id: 'qf',    label: 'Quarter-Finals', rounds: null },
  { id: 'sf',    label: 'Semi-Finals',   rounds: null },
  { id: 'final', label: 'Final',         rounds: null },
]

const GROUPS = ['All', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

// ─── Auto-detect current stage/round ─────────────────────────────────────────
function getDefaultNav(): { stage: Stage; round: number; group: string } {
  const now = new Date()
  // Use CDT offset: UTC-5 (CDT) — approximate for June/July
  const ct = new Date(now.getTime() - 5 * 60 * 60 * 1000)
  const y = ct.getUTCFullYear()
  const m = ct.getUTCMonth() + 1
  const d = ct.getUTCDate()

  const def = { stage: 'group' as Stage, round: 1, group: 'All' }

  if (y < 2026) return def
  if (y > 2026) return { stage: 'final', round: 1, group: 'All' }

  // 2026
  if (m < 6) return def
  if (m === 6) {
    if (d < 11) return def
    if (d <= 17) return { stage: 'group', round: 1, group: 'All' }
    if (d <= 23) return { stage: 'group', round: 2, group: 'All' }
    if (d <= 27) return { stage: 'group', round: 3, group: 'All' }
    return { stage: 'r32', round: 1, group: 'All' }
  }
  if (m === 7) {
    if (d <= 3)  return { stage: 'r32',   round: 1, group: 'All' }
    if (d <= 7)  return { stage: 'r16',   round: 1, group: 'All' }
    if (d <= 10) return { stage: 'qf',    round: 1, group: 'All' }
    if (d <= 15) return { stage: 'sf',    round: 1, group: 'All' }
    return { stage: 'final', round: 1, group: 'All' }
  }
  return def
}

// ─── Badge label per match ────────────────────────────────────────────────────
function getStageBadge(match: Match): string {
  switch (match.stage) {
    case 'group': return `GROUP ${match.group}`
    case 'r32':   return 'ROUND OF 32'
    case 'r16':   return 'ROUND OF 16'
    case 'qf':    return 'QUARTER-FINAL'
    case 'sf':    return 'SEMI-FINAL'
    case 'final': return match.num === 103 ? '3RD PLACE' : 'FINAL'
    default:      return ''
  }
}

// ─── Flag / placeholder avatar ────────────────────────────────────────────────
function TeamAvatar({ team }: { team: TeamSlot }) {
  if (team.placeholder) {
    return (
      <div style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        backgroundColor: '#1E3A6E',
        border: `2px solid #2A4A80`,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ color: '#4A6090', fontSize: '14px' }}>?</span>
      </div>
    )
  }
  return (
    <img
      src={flagUrl(team.name)}
      alt={team.name}
      style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        objectFit: 'cover',
        border: `2px solid ${C.border}`,
        backgroundColor: '#162040',
        flexShrink: 0,
      }}
      onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
    />
  )
}

// ─── Match card ───────────────────────────────────────────────────────────────
function MatchCard({ match }: { match: Match }) {
  const isLive   = match.status === 'playing'
  const isPlayed = match.status === 'played'

  const homeWon = isPlayed && match.score != null && match.score.home > match.score.away
  const awayWon = isPlayed && match.score != null && match.score.away > match.score.home

  const scoreDisplay = match.score != null
    ? `${match.score.home} – ${match.score.away}`
    : '— : —'

  return (
    <div style={{
      backgroundColor: C.card,
      border: `1px solid ${isLive ? C.green : C.border}`,
      borderRadius: '0.875rem',
      padding: '1.1rem 1.25rem 1rem',
      position: 'relative',
      transition: 'border-color 0.2s',
    }}>
      {/* Top row: stage badge + match number */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{
          color: C.gold,
          fontSize: '0.62rem',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          {getStageBadge(match)}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isLive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{
                display: 'inline-block',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: C.green,
                boxShadow: `0 0 5px ${C.green}`,
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
              <span style={{ color: C.green, fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.06em' }}>LIVE</span>
            </div>
          )}
          <span style={{ color: C.muted, fontSize: '0.62rem', fontWeight: 600, opacity: 0.7 }}>
            M{match.num}
          </span>
        </div>
      </div>

      {/* Score row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.875rem' }}>
        {/* Home team */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
          <TeamAvatar team={match.home} />
          <span style={{
            color: homeWon ? C.gold : C.text,
            fontSize: '0.78rem',
            fontWeight: homeWon ? 700 : 500,
            textAlign: 'right',
            lineHeight: 1.3,
            fontStyle: match.home.placeholder ? 'italic' : 'normal',
            opacity: match.home.placeholder ? 0.65 : 1,
          }}>
            {match.home.name}
          </span>
        </div>

        {/* Score */}
        <div style={{ textAlign: 'center', flexShrink: 0, minWidth: '62px' }}>
          <span style={{
            color: isPlayed || isLive ? C.gold : C.muted,
            fontSize: isPlayed || isLive ? '1.35rem' : '0.9rem',
            fontWeight: 900,
            letterSpacing: isPlayed || isLive ? '0.04em' : 0,
          }}>
            {scoreDisplay}
          </span>
        </div>

        {/* Away team */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.3rem' }}>
          <TeamAvatar team={match.away} />
          <span style={{
            color: awayWon ? C.gold : C.text,
            fontSize: '0.78rem',
            fontWeight: awayWon ? 700 : 500,
            lineHeight: 1.3,
            fontStyle: match.away.placeholder ? 'italic' : 'normal',
            opacity: match.away.placeholder ? 0.65 : 1,
          }}>
            {match.away.name}
          </span>
        </div>
      </div>

      {/* Venue + time */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        borderTop: `1px solid ${C.border}`,
        paddingTop: '0.65rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M3 17l9-14 9 14H3z" stroke={C.muted} strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M3 17h18" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M9 17v-4h6v4" stroke={C.muted} strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span style={{ color: C.muted, fontSize: '0.7rem' }}>{match.venue}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" stroke={C.muted} strokeWidth="1.5" />
            <path d="M12 7v5l3 3" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ color: C.muted, fontSize: '0.7rem' }}>{match.time}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Select style helper ──────────────────────────────────────────────────────
const selectStyle: React.CSSProperties = {
  backgroundColor: '#0F1C4D',
  color: C.text,
  border: `1px solid ${C.border}`,
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

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ScoresPage() {
  const defaults = getDefaultNav()
  const [activeStage, setActiveStage]   = useState<Stage>(defaults.stage)
  const [activeRound, setActiveRound]   = useState<number>(defaults.round)
  const [activeGroup, setActiveGroup]   = useState<string>(defaults.group)

  const currentStageConfig = STAGES.find(s => s.id === activeStage)!

  // Filter matches
  const filtered = MATCHES.filter(m => {
    if (m.stage !== activeStage) return false
    if (activeStage === 'group') {
      if (m.round !== activeRound) return false
      if (activeGroup !== 'All' && m.group !== activeGroup) return false
    }
    return true
  })

  const dates = Array.from(new Set(filtered.map(m => m.date))).sort()

  const stageLabel = STAGES.find(s => s.id === activeStage)?.label ?? ''
  const roundLabel = activeStage === 'group' ? ` · Round ${activeRound}` : ''
  const groupLabel = activeStage === 'group' && activeGroup !== 'All' ? ` · Group ${activeGroup}` : ''

  return (
    <div style={{
      backgroundColor: C.bg,
      minHeight: '100vh',
      color: C.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.8); }
        }
        select option { background-color: #0F1C4D; color: #F0F4FF; }
      `}</style>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem 1rem 5rem' }}>

        {/* Page header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ color: C.gold, fontWeight: 900, fontSize: '1.6rem', margin: '0 0 0.25rem' }}>
            📅 Match Schedule
          </h1>
          <p style={{ color: C.muted, fontSize: '0.82rem', margin: 0 }}>
            FIFA World Cup 2026 · {stageLabel}{roundLabel}{groupLabel}
          </p>
        </div>

        {/* Navigation */}
        <div style={{
          display: 'flex',
          gap: '0.65rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: '2rem',
        }}>
          {/* Stage selector */}
          <div style={{ position: 'relative' }}>
            <select
              value={activeStage}
              onChange={e => {
                const val = e.target.value as Stage
                setActiveStage(val)
                setActiveRound(1)
                setActiveGroup('All')
              }}
              style={selectStyle}
            >
              {STAGES.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Round selector (group stage only) */}
          {activeStage === 'group' && (
            <div style={{ position: 'relative' }}>
              <select
                value={activeRound}
                onChange={e => setActiveRound(Number(e.target.value))}
                style={selectStyle}
              >
                <option value={1}>Round 1</option>
                <option value={2}>Round 2</option>
                <option value={3}>Round 3</option>
              </select>
            </div>
          )}

          {/* Group filter (group stage only) */}
          {activeStage === 'group' && (
            <div style={{ position: 'relative' }}>
              <select
                value={activeGroup}
                onChange={e => setActiveGroup(e.target.value)}
                style={selectStyle}
              >
                {GROUPS.map(g => (
                  <option key={g} value={g}>{g === 'All' ? 'All Groups' : `Group ${g}`}</option>
                ))}
              </select>
            </div>
          )}

          {/* Match count badge */}
          <span style={{
            color: C.muted,
            fontSize: '0.72rem',
            fontWeight: 600,
            marginLeft: 'auto',
            opacity: 0.75,
          }}>
            {filtered.length} match{filtered.length !== 1 ? 'es' : ''}
          </span>
        </div>

        {/* Stage tab pills */}
        <div style={{
          display: 'flex',
          gap: '0.4rem',
          overflowX: 'auto',
          paddingBottom: '0.25rem',
          marginBottom: '1.75rem',
          scrollbarWidth: 'none',
        }}>
          {STAGES.map(s => {
            const isActive = activeStage === s.id
            return (
              <button
                key={s.id}
                onClick={() => {
                  setActiveStage(s.id)
                  setActiveRound(1)
                  setActiveGroup('All')
                }}
                style={{
                  backgroundColor: isActive ? C.gold : C.card,
                  color: isActive ? '#0A0F2E' : C.muted,
                  border: `1px solid ${isActive ? C.gold : C.border}`,
                  borderRadius: '2rem',
                  padding: '0.35rem 0.9rem',
                  fontSize: '0.74rem',
                  fontWeight: isActive ? 800 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                  flexShrink: 0,
                }}
              >
                {s.label}
              </button>
            )
          })}
        </div>

        {/* Matches grouped by date */}
        {dates.map(date => {
          const dayMatches = filtered.filter(m => m.date === date)
          return (
            <div key={date} style={{ marginBottom: '2rem' }}>
              {/* Date divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ height: '1px', flex: 1, backgroundColor: C.border }} />
                <span style={{
                  color: C.muted,
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  {formatDate(date)}
                </span>
                <div style={{ height: '1px', flex: 1, backgroundColor: C.border }} />
              </div>

              {/* Cards grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '1rem',
              }}>
                {dayMatches.map(match => (
                  <MatchCard key={match.num} match={match} />
                ))}
              </div>
            </div>
          )
        })}

        {/* Empty state */}
        {dates.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p style={{ color: C.muted, fontSize: '0.9rem' }}>No matches for this selection.</p>
          </div>
        )}

        {/* Footer note */}
        <div style={{
          marginTop: '2rem',
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '0.875rem',
          padding: '0.875rem 1.25rem',
          textAlign: 'center',
        }}>
          <p style={{ color: C.muted, fontSize: '0.75rem', margin: 0, lineHeight: 1.6 }}>
            104 matches · All times Central (CT) · World Cup 2026 opens June 11
          </p>
        </div>
      </div>
    </div>
  )
}
