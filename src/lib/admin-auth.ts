/**
 * Admin auth — placeholder password gate matching `/s3/admin` client.
 * Yes, hardcoded. Yes, gross. Hugh's call to fix in a separate PR.
 *
 * Pattern: client sends `X-Admin-Password` header on every request; server
 * checks it against ADMIN_PASSWORD. Mirrors what `/s3/admin/page.tsx` already
 * stores in component state.
 */
import { NextResponse } from 'next/server';

const ADMIN_PASSWORD = 'Total90Ba!!';

export function checkAdminAuth(req: Request): NextResponse | null {
  const supplied = req.headers.get('x-admin-password') || '';
  if (supplied !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
