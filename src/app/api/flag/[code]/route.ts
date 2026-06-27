/**
 * GET /api/flag/[code]
 *
 * Same-origin proxy for flag images. Fetches the PNG from flagcdn.com
 * server-side and pipes the bytes back, so the social-graphic generator
 * (and any other client surface) can <img src="/api/flag/de"> without
 * cross-origin / CORS issues during html-to-image canvas export.
 *
 * Why this exists:
 *   - html-to-image needs `crossOrigin="anonymous"` to rasterize images,
 *     and flagcdn occasionally fails or throttles when 10 flags load in
 *     parallel for the top-10 graphic — leaving blank cells in the PNG.
 *   - Proxying through our origin makes the load deterministic, caches
 *     the bytes on Vercel's edge, and removes the CORS variable entirely.
 *
 * Validates the code (ISO-style: 2 letters or 5-char hyphenated like
 * gb-eng / gb-sct / gb-wls / gb-nir) to avoid open-proxy abuse.
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

const VALID_CODE = /^[a-z]{2}(-[a-z]{3})?$/

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await params
  const code = (rawCode || '').toLowerCase()

  if (!VALID_CODE.test(code)) {
    return new NextResponse('invalid code', { status: 400 })
  }

  const upstream = `https://flagcdn.com/w160/${code}.png`
  const res = await fetch(upstream, { cache: 'force-cache' })
  if (!res.ok) {
    return new NextResponse('upstream failed', { status: 502 })
  }

  const buf = await res.arrayBuffer()
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      // 30 days at the edge; flag images are effectively immutable
      'Cache-Control': 'public, max-age=2592000, s-maxage=2592000, immutable',
    },
  })
}
