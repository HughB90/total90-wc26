/**
 * Email footer — appended to every outbound email by `sendEmail()`.
 *
 * Includes:
 *   - Type-scoped unsubscribe link  (?t=<token>&type=<type>)
 *   - All-Total90 unsubscribe link  (?t=<token>&all=1)
 *   - Mailing address (placeholder until Hugh provides)
 *   - Total90 logo + © line
 *
 * Color palette matches the existing welcome email and dark theme:
 *   bg #0A0F2E, gold #FBBF24, dim text #4A6080, body #8899CC
 */

const SITE = 'https://wc26.total90.com'

export function buildFooter(unsubToken: string, type: string): string {
  const safeType = encodeURIComponent(type)
  const safeToken = encodeURIComponent(unsubToken)

  const unsubTypeUrl = `${SITE}/account/unsubscribe?t=${safeToken}&type=${safeType}`
  const unsubAllUrl = `${SITE}/account/unsubscribe?t=${safeToken}&all=1`

  return `
    <div style="margin-top:2rem;padding:1.25rem 1rem 0.75rem;border-top:1px solid #1E3A6E;text-align:center;font-family:system-ui,sans-serif;color:#4A6080;font-size:0.75rem;line-height:1.6;">
      <img src="${SITE}/total90-logo-green.png" alt="Total90" style="width:32px;height:32px;display:block;margin:0 auto 0.75rem;opacity:0.8;" />
      <p style="margin:0 0 0.5rem;color:#8899CC;">
        You're getting this because you signed up for the Total90 World Cup 2026 hub.
      </p>
      <p style="margin:0 0 0.75rem;">
        <a href="${unsubTypeUrl}" style="color:#FBBF24;text-decoration:underline;">Unsubscribe from these emails</a>
        &nbsp;·&nbsp;
        <a href="${unsubAllUrl}" style="color:#FBBF24;text-decoration:underline;">Unsubscribe from all Total90 emails</a>
      </p>
      <p style="margin:0 0 0.25rem;color:#4A6080;">Total90 LLC · [ADDRESS TBD]</p>
      <p style="margin:0;color:#4A6080;">© ${new Date().getFullYear()} Total90 · wc26.total90.com</p>
    </div>
  `
}

/**
 * Wrap a body fragment in the dark themed container. Optional — most existing
 * emails already provide their own outer div. The footer alone is what's
 * mandatory.
 */
export function wrapDarkEmail(innerHtml: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;background:#0A0F2E;color:#F0F4FF;padding:2rem;border-radius:1rem;">
      ${innerHtml}
    </div>
  `
}
