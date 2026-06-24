/**
 * sendEmail() — single entry point for outbound transactional email.
 *
 * Responsibilities:
 *   1. Look up the recipient's email_prefs (by accountId).
 *   2. Honor unsubscribes:
 *        - `unsub_all=true` blocks EVERYTHING (incl. welcome/marketing) except
 *          explicitly `transactional: true` sends (magic links, password
 *          reset). CAN-SPAM allows transactional regardless of unsub.
 *        - per-type pref flag blocks the matching category.
 *   3. Append the auto-footer (unsubscribe links + address + © line) before
 *      delivery — unless `transactional: true` (magic links keep minimal
 *      surface).
 *   4. Send via the nodemailer transport singleton (Gmail SMTP).
 *   5. Log a row to `email_sends` with status sent/failed/skipped_unsub.
 *
 * Returns: { ok, skipped, error }
 *   - ok=true → delivered
 *   - skipped=true → suppressed by prefs (no send attempted)
 *   - error → string if delivery failed
 */

import { getTransport, getFromHeader } from './transport'
import { canEmail, getPrefsByAccountId } from './prefs'
import { buildFooter } from './footer'
import { createAdminSupabase } from '@/lib/supabase-server'

export type SendEmailArgs = {
  to: string
  /** Account UUID for prefs lookup. Pass null if the recipient has no account on file. */
  accountId?: string | null
  /** e.g. 'round_reminder:group_r3', 'welcome', 'bracket_magic_link', 'marketing:launch'. */
  type: string
  subject: string
  html: string
  /**
   * Transactional sends bypass the per-type pref flag (and unsub_all). Use for
   * magic links, password resets, booking confirmations. Footer is still added
   * unless `skipFooter: true`.
   */
  transactional?: boolean
  /** Skip the auto-footer (rare — magic links may want this). */
  skipFooter?: boolean
}

export type SendEmailResult = {
  ok: boolean
  skipped: boolean
  error?: string
}

async function logSend(
  accountId: string | null | undefined,
  email: string,
  type: string,
  status: 'sent' | 'failed' | 'skipped_unsub',
  error?: string
): Promise<void> {
  try {
    const admin = createAdminSupabase()
    await admin.from('email_sends').insert({
      account_id: accountId ?? null,
      email,
      email_type: type,
      status,
      error: error ?? null,
    })
  } catch {
    // Audit log failure must not break the send.
  }
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const { to, accountId, type, subject, html, transactional, skipFooter } = args

  // 1. Resolve prefs / gate.
  let unsubToken: string | null = null
  let skip = false
  let skipReason = ''

  if (accountId) {
    if (transactional) {
      // Transactional sends bypass prefs but we still need the unsub token for
      // the footer (if shown).
      const prefs = await getPrefsByAccountId(accountId)
      unsubToken = prefs?.unsub_token ?? null
    } else {
      const gate = await canEmail(accountId, type)
      if (!gate.allowed) {
        skip = true
        skipReason = gate.reason ?? 'blocked'
      }
      unsubToken = gate.prefs?.unsub_token ?? null
    }
  }

  if (skip) {
    await logSend(accountId, to, type, 'skipped_unsub', skipReason)
    return { ok: false, skipped: true }
  }

  // 2. Append footer.
  let finalHtml = html
  if (!skipFooter && unsubToken) {
    finalHtml = `${html}${buildFooter(unsubToken, type)}`
  } else if (!skipFooter && !unsubToken) {
    // No token (e.g. raw recipient without an account). Show a minimal address
    // line so we stay CAN-SPAM compliant.
    finalHtml = `${html}
      <div style="margin-top:2rem;padding-top:1rem;border-top:1px solid #1E3A6E;text-align:center;font-family:system-ui,sans-serif;color:#4A6080;font-size:0.75rem;line-height:1.6;">
        <p style="margin:0 0 0.25rem;">Total90 LLC · [ADDRESS TBD]</p>
        <p style="margin:0;">© ${new Date().getFullYear()} Total90 · wc26.total90.com</p>
      </div>`
  }

  // 3. Deliver.
  try {
    const transport = getTransport()
    await transport.sendMail({
      from: getFromHeader(),
      to,
      subject,
      html: finalHtml,
    })
    await logSend(accountId, to, type, 'sent')
    return { ok: true, skipped: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown SMTP error'
    await logSend(accountId, to, type, 'failed', message)
    return { ok: false, skipped: false, error: message }
  }
}
