#!/usr/bin/env node
/**
 * email-round-reminder.mjs
 *
 * One-off blast to remind predictor players a round is starting.
 *
 * Usage:
 *   node scripts/email-round-reminder.mjs --round group_r3 --test nolateltrab@gmail.com
 *   node scripts/email-round-reminder.mjs --round group_r3 --live --confirm
 *
 * Flags:
 *   --round <code>     Required. e.g. group_r3, r32, r16
 *   --test <email>     Send ONE test email to this address only. No DB audit gating.
 *   --live             Send to all 234 accounts (subject to email_prefs).
 *   --confirm          Required alongside --live (safety belt).
 *   --batch <n>        Sends per second (default 8). Gmail SMTP ~100/day on free, ~2000/day on paid.
 *
 * Reads SMTP creds from keys/smtp-gmail.json. Reads Supabase service_role from
 * the Supabase Management API.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nodemailer from 'nodemailer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(repoRoot, '..')

// ---------- args ----------
const args = process.argv.slice(2)
function arg(name, def = null) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return def
  const v = args[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const ROUND = arg('round')
const TEST_TO = arg('test')
const LIVE = !!arg('live')
const CONFIRM = !!arg('confirm')
const BATCH = parseInt(arg('batch', '8'), 10)
const PICKERS_ONLY = !!arg('pickers-only')
const SKIP_ALREADY_SENT = !!arg('skip-already-sent')

if (!ROUND) {
  console.error('Missing --round <code>')
  process.exit(1)
}
if (!TEST_TO && !LIVE) {
  console.error('Specify either --test <email> or --live --confirm')
  process.exit(1)
}
if (LIVE && !CONFIRM) {
  console.error('--live requires --confirm')
  process.exit(1)
}

// ---------- creds ----------
const smtp = JSON.parse(
  readFileSync(path.join(workspaceRoot, 'keys', 'smtp-gmail.json'), 'utf8')
)
const supaToken = JSON.parse(
  readFileSync(path.join(workspaceRoot, 'keys', 'supabase-token.json'), 'utf8')
).token

const PROJECT_REF = 'tituygkbondyjhzomwji'
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`

// Fetch service_role key from management API.
const keysRes = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`,
  { headers: { Authorization: `Bearer ${supaToken}` } }
)
const keys = await keysRes.json()
const SERVICE_ROLE = keys.find((k) => k.name === 'service_role').api_key

// ---------- supabase REST helpers ----------
async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Supabase ${res.status} ${path}: ${t}`)
  }
  return res.json()
}

// ---------- look up round metadata ----------
const matches = await sb(
  `/rest/v1/predictor_matches?round_code=eq.${ROUND}&select=home_team_code,away_team_code,kickoff_at&order=kickoff_at.asc`
)
if (!matches.length) {
  console.error(`No matches found for round_code=${ROUND}`)
  process.exit(1)
}

const firstKickoff = new Date(matches[0].kickoff_at)
const lastKickoff = new Date(matches[matches.length - 1].kickoff_at)

const ROUND_LABELS = {
  group_r1: 'Round 1 — Group Stage 1',
  group_r2: 'Round 2 — Group Stage 2',
  group_r3: 'Round 3 — Group Stage 3',
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter-Finals',
  sf: 'Semi-Finals',
  final: 'Final',
}
const ROUND_LABEL = ROUND_LABELS[ROUND] ?? ROUND

const fmt = (d) =>
  d.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })

console.log(`Round: ${ROUND_LABEL}`)
console.log(`Matches: ${matches.length}`)
console.log(`First kickoff: ${fmt(firstKickoff)}`)
console.log(`Last kickoff:  ${fmt(lastKickoff)}`)

// ---------- email template ----------
const FIRST_KICK_STR = fmt(firstKickoff)
const LAST_KICK_STR = fmt(lastKickoff)

// Round-specific copy.
const ROUND_COPY = {
  group_r1: { headline: 'Round 1 starts today ⚽',  subhead: 'Group Stage · Matchday 1',                 lastLabel: 'Last MD1 kickoff',   button: 'Set My Round 1 Picks →', shortName: 'Round 1' },
  group_r2: { headline: 'Round 2 starts today ⚽',  subhead: 'Group Stage · Matchday 2',                 lastLabel: 'Last MD2 kickoff',   button: 'Set My Round 2 Picks →', shortName: 'Round 2' },
  group_r3: { headline: 'Round 3 starts today ⚽',  subhead: 'Group Stage · Matchday 3',                 lastLabel: 'Last MD3 kickoff',   button: 'Set My Round 3 Picks →', shortName: 'Round 3' },
  r32:      { headline: 'Round 4 starts today ⚽',  subhead: 'Round of 32 · Knockouts begin',            lastLabel: 'Last R32 kickoff',   button: 'Set My R32 Picks →',     shortName: 'R32' },
  r16:      { headline: 'Round 5 starts today ⚽',  subhead: 'Round of 16 · Knockouts begin',            lastLabel: 'Last R16 kickoff',   button: 'Set My R16 Picks →',     shortName: 'R16' },
  qf:       { headline: 'Round 6 starts today ⚽',  subhead: 'Quarter-Finals · Eight left, four to go',  lastLabel: 'Last QF kickoff',    button: 'Set My QF Picks →',      shortName: 'QF' },
  sf:       { headline: 'Round 7 starts today ⚽',  subhead: 'Semi-Finals · One step from the final',    lastLabel: 'Last SF kickoff',    button: 'Set My SF Picks →',      shortName: 'SF' },
  final:    { headline: 'The Final is here 🏆',     subhead: 'World Cup Final · Last picks of the run',  lastLabel: 'Kickoff',            button: 'Set My Final Pick →',    shortName: 'Final' },
}
const COPY = ROUND_COPY[ROUND] ?? { headline: `${ROUND_LABEL} starts today ⚽`, subhead: ROUND_LABEL, lastLabel: 'Last kickoff', button: `Set My ${ROUND_LABEL} Picks →`, shortName: ROUND_LABEL }
const URL_SLUG = ROUND
const IS_KNOCKOUT_FIRST = ROUND === 'r32' // "new this round: goalscorer" only fires when goalscorer picking is first introduced

function buildHtml({ unsubToken, firstName }) {
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,'
  const unsubBase = 'https://wc26.total90.com/account/unsubscribe'
  const unsubTypeUrl = `${unsubBase}?t=${unsubToken}&type=round_reminders`
  const unsubAllUrl = `${unsubBase}?t=${unsubToken}&all=1`

  // Round-varying body blocks.
  const INTRO_BY_ROUND = {
    r32: "The knockouts are here. One loss and you're out — and so are your picks if you don't lock them in.",
    r16: "The knockouts are here. One loss and you're out — and so are your picks if you don't lock them in.",
    qf:  "Down to eight. Four matches, four survivors — lock in your picks before the first kickoff.",
    sf:  "Down to four. Two matches decide who plays for the trophy. Don't blink.",
    final: "This is it. One match. One winner. Lock your final pick.",
  }
  const introText = INTRO_BY_ROUND[ROUND] || 'A new matchday drops today. Lock in your picks before kickoff.'
  const knockoutIntro = `<p style="margin:0 0 1rem;font-size:1rem;line-height:1.5;">${introText}</p>`

  const goalscorerCallout = IS_KNOCKOUT_FIRST
    ? `<p style="margin:0 0 1rem;font-size:1rem;line-height:1.5;"><strong style="color:#FBBF24;">New this round:</strong> pick an <strong>anytime goalscorer</strong> for each match. Nail it and rack up bonus points on top of your winner.</p>`
    : (ROUND === 'r16' || ROUND === 'qf' || ROUND === 'sf' || ROUND === 'final')
    ? `<p style="margin:0 0 1rem;font-size:1rem;line-height:1.5;"><strong style="color:#FBBF24;">Reminder:</strong> pick an <strong>anytime goalscorer</strong> for each match. Bonus points stack on top of your winner.</p>`
    : ''

  const raw = `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;background:#0A0F2E;color:#F0F4FF;padding:2rem 1.5rem;border-radius:1rem;">
  <img src="https://wc26.total90.com/total90-logo-green.png" alt="Total90" style="width:48px;height:48px;display:block;margin:0 auto 1rem;" />

  <h1 style="color:#FBBF24;text-align:center;font-size:1.5rem;margin:0 0 0.25rem;">${COPY.headline}</h1>
  <p style="text-align:center;color:#8899CC;margin:0 0 1.75rem;font-size:0.9rem;">${COPY.subhead}</p>

  <p style="margin:0 0 1rem;font-size:1rem;line-height:1.5;">${greeting}</p>
  ${knockoutIntro}
  ${goalscorerCallout}

  <div style="background:#0F1C4D;border:1px solid #1E3A6E;border-radius:0.875rem;padding:1.25rem;margin:1.5rem 0 1rem;">
    <p style="margin:0 0 0.5rem;color:#8899CC;font-size:0.8rem;letter-spacing:0.05em;">FIRST MATCH</p>
    <p style="margin:0 0 0.75rem;font-size:1.05rem;font-weight:700;color:#FBBF24;">${FIRST_KICK_STR}</p>
    <p style="margin:0;color:#8899CC;font-size:0.85rem;">${COPY.lastLabel}: ${LAST_KICK_STR}</p>
  </div>

  <div style="background:rgba(0,230,118,0.08);border:1px solid rgba(0,230,118,0.25);border-radius:0.75rem;padding:0.875rem 1rem;margin:0 0 1.25rem;">
    <p style="margin:0;color:#A8E6C5;font-size:0.85rem;line-height:1.5;">
      <strong style="color:#00E676;">Reading this late?</strong> No problem — you can still make picks for any ${COPY.shortName} match that hasn't kicked off yet. Only matches already started or finished are locked.
    </p>
  </div>

  <a href="https://wc26.total90.com/predictor/round/${URL_SLUG}" style="display:block;background:#FBBF24;color:#0A0F2E;text-align:center;font-weight:800;font-size:1rem;padding:1rem;border-radius:0.875rem;text-decoration:none;margin:0 0 1rem;">
    ${COPY.button}
  </a>

  <p style="text-align:center;color:#8899CC;font-size:0.85rem;margin:0 0 0.5rem;">
    Each match locks at its own kickoff. Don't sleep on the late ones.
  </p>

  <hr style="border:0;border-top:1px solid #1E3A6E;margin:1.5rem 0;" />

  <p style="text-align:center;color:#4A6080;font-size:0.75rem;margin:0;">
    Questions? Reply to this email.<br/>
    Total90 · wc26.total90.com
  </p>

  <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid #1E3A6E;text-align:center;color:#4A6080;font-size:0.7rem;line-height:1.6;">
    <p style="margin:0 0 0.25rem;">You signed up for the Total90 WC26 Predictor.</p>
    <p style="margin:0 0 0.5rem;">
      <a href="${unsubTypeUrl}" style="color:#8899CC;">Unsubscribe from round reminders</a>
      &nbsp;·&nbsp;
      <a href="${unsubAllUrl}" style="color:#8899CC;">Unsubscribe from all emails</a>
    </p>
    <p style="margin:0 0 0.25rem;">Total90 LLC · 6230 Waldo Drive, New Orleans, LA 70122</p>
    <p style="margin:0;">© ${new Date().getFullYear()} Total90</p>
  </div>
</div>
`
  // Strip leading whitespace + newlines so Gmail doesn't clip / treat as quoted.
  return raw.replace(/\n\s+/g, '').replace(/>\s+</g, '><').trim()
}

// ---------- transporter ----------
const port = parseInt(smtp.smtp_port, 10)
const transport = nodemailer.createTransport({
  host: smtp.smtp_host,
  port,
  secure: port === 465,
  auth: { user: smtp.smtp_user, pass: smtp.smtp_pass },
  // Reuse a single auth session across all sends (Gmail rate-limits per-login).
  pool: true,
  maxConnections: 1,
  maxMessages: Infinity,
  rateDelta: 1000,
  rateLimit: BATCH,
})

await transport.verify()
console.log('SMTP transport verified ✓')

const ROUND_SUBJECTS = {
  group_r1: 'Round 1 is here — pick your Matchday 1 winners ⚽',
  group_r2: 'Round 2 is here — pick your Matchday 2 winners ⚽',
  group_r3: 'Round 3 is here — pick your Matchday 3 winners ⚽',
  r32:      'Round 4 is here — pick your R32 winners + goalscorers ⚽',
  r16:      'Round 5 is here — pick your Round of 16 winners + goalscorers ⚽',
  qf:       'Round 6 is here — pick your Quarter-Final winners + goalscorers ⚽',
  sf:       'Round 7 is here — pick your Semi-Final winners + goalscorers ⚽',
  final:    'The Final is here — lock your pick for the World Cup 🏆',
}
const SUBJECT = ROUND_SUBJECTS[ROUND] ?? `${ROUND_LABEL} is here — lock your picks ⚽`
const FROM = smtp.from || `Total90 <${smtp.smtp_user}>`
const EMAIL_TYPE = `round_reminder:${ROUND}`

// ---------- TEST MODE ----------
if (TEST_TO) {
  // Look up a token to make the unsub link real (use Hugh's account if it exists).
  // Otherwise generate a fake-looking placeholder so the link is shown but inert.
  const prefs = await sb(
    `/rest/v1/email_prefs?select=unsub_token,account_id&limit=1`
  )
  const sampleToken = prefs[0]?.unsub_token || '00000000-0000-0000-0000-000000000000'

  const html = buildHtml({
    unsubToken: sampleToken,
    firstName: 'Hugh',
  })

  await transport.sendMail({
    from: FROM,
    to: TEST_TO,
    subject: `[TEST] ${SUBJECT}`,
    html,
  })
  console.log(`✓ Test email sent to ${TEST_TO}`)
  process.exit(0)
}

// ---------- LIVE MODE ----------
// Fetch all accounts with email + prefs joined.
// auth.users is not exposed via PostgREST directly. We use the admin API.
const usersRes = await fetch(
  `${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`,
  {
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
  }
)
const usersJson = await usersRes.json()
const users = usersJson.users || usersJson || []
console.log(`Loaded ${users.length} auth users`)

// Fetch all email_prefs.
const allPrefs = await sb(`/rest/v1/email_prefs?select=account_id,unsub_token,unsub_all,round_reminders`)
const prefsByAccount = new Map(allPrefs.map((p) => [p.account_id, p]))

// Optional gate: only accounts with >=1 pick on predictor_picks.
let pickerSet = null
if (PICKERS_ONLY) {
  const pickers = await sb(
    `/rest/v1/rpc/list_picker_accounts`,
    { method: 'POST', body: '{}' }
  ).catch(async () => {
    // Fallback to direct query via mgmt API if RPC doesn't exist.
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `select distinct pr.account_id from predictor_picks pp join profiles pr on pr.id = pp.profile_id where pr.account_id is not null`,
        }),
      }
    )
    return res.json()
  })
  pickerSet = new Set(pickers.map((p) => p.account_id))
  console.log(`Pickers-only mode: ${pickerSet.size} accounts have ≥1 pick`)
}

// Optional gate: exclude accounts already sent this email type successfully.
let alreadySentSet = new Set()
if (SKIP_ALREADY_SENT) {
  const sent = await sb(
    `/rest/v1/email_sends?email_type=eq.${EMAIL_TYPE}&status=eq.sent&select=account_id`
  )
  alreadySentSet = new Set(sent.map((s) => s.account_id).filter(Boolean))
  console.log(`Skip-already-sent mode: ${alreadySentSet.size} accounts already received this email`)
}

// Filter sendable recipients.
const recipients = []
let skippedUnsub = 0
let skippedNoEmail = 0
let skippedNotPicker = 0
let skippedAlreadySent = 0
for (const u of users) {
  if (!u.email) {
    skippedNoEmail++
    continue
  }
  const p = prefsByAccount.get(u.id)
  if (!p) {
    skippedNoEmail++
    continue
  }
  if (p.unsub_all || p.round_reminders === false) {
    skippedUnsub++
    continue
  }
  if (pickerSet && !pickerSet.has(u.id)) {
    skippedNotPicker++
    continue
  }
  if (alreadySentSet.has(u.id)) {
    skippedAlreadySent++
    continue
  }
  recipients.push({
    accountId: u.id,
    email: u.email,
    unsubToken: p.unsub_token,
    firstName: u.user_metadata?.first_name || null,
  })
}

console.log(`Recipients: ${recipients.length}`)
console.log(`Skipped (unsubscribed): ${skippedUnsub}`)
console.log(`Skipped (no email/prefs): ${skippedNoEmail}`)
if (pickerSet) console.log(`Skipped (no picks): ${skippedNotPicker}`)
if (SKIP_ALREADY_SENT) console.log(`Skipped (already sent): ${skippedAlreadySent}`)

// Pull profile first_names from `profiles` to personalize.
const accountIds = recipients.map((r) => r.accountId)
if (accountIds.length) {
  const idsCsv = accountIds.map((id) => `"${id}"`).join(',')
  const profiles = await sb(
    `/rest/v1/profiles?account_id=in.(${accountIds.join(',')})&is_owner=eq.true&select=account_id,first_name`
  )
  const fnByAccount = new Map(profiles.map((p) => [p.account_id, p.first_name]))
  for (const r of recipients) {
    if (!r.firstName) r.firstName = fnByAccount.get(r.accountId) || null
  }
}

// Send loop with rate limiting + audit logging.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let sent = 0
let failed = 0
const startTs = Date.now()

for (const r of recipients) {
  const html = buildHtml({ unsubToken: r.unsubToken, firstName: r.firstName })
  let status = 'sent'
  let errMsg = null
  try {
    await transport.sendMail({
      from: FROM,
      to: r.email,
      subject: SUBJECT,
      html,
    })
    sent++
  } catch (e) {
    status = 'failed'
    errMsg = e.message
    failed++
    console.error(`✗ ${r.email}: ${e.message}`)
  }

  // Audit log.
  await sb('/rest/v1/email_sends', {
    method: 'POST',
    body: JSON.stringify({
      account_id: r.accountId,
      email: r.email,
      email_type: EMAIL_TYPE,
      status,
      error: errMsg,
    }),
  }).catch(() => {})

  if (sent % 25 === 0 && sent > 0) console.log(`  …${sent} sent`)
  await sleep(1000 / BATCH)
}

const elapsed = Math.round((Date.now() - startTs) / 1000)
console.log(`\n✓ Done in ${elapsed}s — sent: ${sent}, failed: ${failed}, skipped_unsub: ${skippedUnsub}, skipped_no_email: ${skippedNoEmail}`)
