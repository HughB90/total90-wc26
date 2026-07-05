/**
 * Pull WC 2026 R16 fixtures from Opta to determine the real bracket pairings.
 * Just prints them, no writes.
 */
import crypto from 'node:crypto'
import https from 'node:https'
import qs from 'node:querystring'
import fs from 'node:fs'
import path from 'node:path'

const optaKey = JSON.parse(fs.readFileSync(path.resolve(process.env.HOME || '', '.openclaw/workspace/keys/opta-api.json'), 'utf8'))
const OUTLET_KEY = optaKey.outletApiKey
const SECRET_KEY = optaKey.secretKey1
const TMCL = '873cbl9cd9butm4air0mugxzo'

function token(): Promise<string> {
  const ts = Date.now().toString()
  const hash = crypto.createHash('sha512').update(OUTLET_KEY + ts + SECRET_KEY).digest('hex')
  const postData = qs.stringify({ grant_type: 'client_credentials', scope: 'b2b-feeds-auth' })
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth.performgroup.com',
      path: '/oauth/token/' + OUTLET_KEY + '?_fmt=json&_rt=b',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': postData.length, Timestamp: ts, Authorization: 'Basic ' + hash },
    }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { const j = JSON.parse(d); j.access_token ? resolve(j.access_token) : reject(new Error(d)) } catch(e) { reject(e) } })
    })
    req.on('error', reject); req.write(postData); req.end()
  })
}
function get(tok: string, p: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get({ hostname: 'api.performfeeds.com', path: p, headers: { Authorization: 'Bearer ' + tok } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)) } catch(e) { reject(e) } })
    }).on('error', reject)
  })
}

;(async () => {
  const tok = await token()
  // matchInfo.week or round hint  — pull all match schedules for the tournament
  const j = await get(tok, `/soccerdata/match/${OUTLET_KEY}?tmcl=${TMCL}&_rt=b&_fmt=json&_pgSz=200`)
  const matches = j.match || j.matchInfo || j.matches || []
  console.log(`total matches: ${matches.length}`)
  const r16Guesses: any[] = []
  for (const m of matches) {
    // Some feeds nest matchInfo.week, some flatten
    const mi = m.matchInfo || m
    const dateStr = mi.date || ''
    const week = mi.week
    // R16 is July 4-7
    if (!dateStr.startsWith('2026-07-')) continue
    const day = +dateStr.slice(8, 10)
    if (day < 4 || day > 7) continue
    const c = mi.contestant || []
    console.log(`${dateStr} ${mi.time || ''}  week=${week}  ${c.map((x: any) => `${x.position}=${x.name}`).join('  ')}  fixtureId=${mi.id}`)
    r16Guesses.push({ date: dateStr, contestants: c.map((x: any) => x.name), id: mi.id })
  }
})().catch(e => { console.error(e); process.exit(1) })
