/**
 * Shared helpers for the predictor leagues API + pages.
 *
 * Mirrors the bracket-league code-generation pattern in
 * `src/app/api/bracket/league/route.ts` (no I/O/0/1 chars to avoid confusion
 * when read aloud or shared via WhatsApp).
 */

const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1

export function randomInviteCode(length = 6): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)]
  }
  return code
}
