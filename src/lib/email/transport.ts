/**
 * Nodemailer Gmail SMTP transporter (singleton).
 *
 * Reads SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS from env. Defaults
 * match the Total90 Gmail Workspace App Password setup documented in
 * workspace/TOOLS.md ("SMTP (Gmail Workspace)" section).
 *
 * - Port 465 → implicit TLS (secure=true).
 * - Port 587 → STARTTLS (secure=false).
 *
 * Defaults to 465 since that's the spec from the task brief.
 */

import nodemailer, { type Transporter } from 'nodemailer'

let cached: Transporter | null = null

export function getTransport(): Transporter {
  if (cached) return cached

  const host = process.env.SMTP_HOST ?? 'smtp.gmail.com'
  const port = Number(process.env.SMTP_PORT ?? 465)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!user || !pass) {
    throw new Error('SMTP credentials missing: SMTP_USER and SMTP_PASS must be set')
  }

  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  return cached
}

/** From header used by all outbound mail. */
export function getFromHeader(): string {
  return process.env.SMTP_FROM ?? 'Total90 <hugh@total90.com>'
}
