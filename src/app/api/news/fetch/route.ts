import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const xaiKey = process.env.XAI_API_KEY
    if (!xaiKey) return NextResponse.json({ error: 'XAI_API_KEY not set' }, { status: 500 })

    const prompt = `You are a soccer news aggregator for a World Cup 2026 fantasy app.
Search X and the web for breaking soccer news from the LAST 2 HOURS.
Focus on: injuries, suspensions, team selection, transfers, fitness, match results — World Cup 2026 players and teams.

Return EXACTLY 5 news items as a pure JSON array (no markdown):
[{"headline":"Short headline max 80 chars","summary":"2-3 sentence summary","category":"injury|transfer|form|suspension|result|general","players":["Name"],"teams":["Team"],"is_breaking":true}]

If nothing breaking, return general World Cup 2026 news.`

    const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${xaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-3',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.3,
      }),
    })

    const grokData = await grokRes.json()
    const content = grokData.choices?.[0]?.message?.content
    if (!content) return NextResponse.json({ error: 'No content from Grok' }, { status: 500 })

    let articles: Record<string, unknown>[]
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('No JSON array')
      articles = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Parse failed', content }, { status: 500 })
    }

    const now = new Date().toISOString()
    const rows = articles.map((a: Record<string, unknown>) => ({
      headline: a.headline,
      summary: a.summary,
      category: a.category || 'general',
      players: a.players || [],
      teams: a.teams || [],
      is_breaking: a.is_breaking || false,
      source: 'Total90 Intelligence',
      fetched_at: now,
      published_at: now,
    }))

    await (supabase.from('news_articles' as never) as never as { insert: (r: unknown) => Promise<unknown> }).insert(rows)
    await (supabase.from('news_articles' as never) as never as { delete: () => { lt: (col: string, val: string) => Promise<unknown> } })
      .delete()
      .lt('published_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())

    return NextResponse.json({ ok: true, inserted: rows.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const read = url.searchParams.get('read')

  if (read === 'true') {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      const { data } = await (supabase.from('news_articles' as never) as never as {
        select: (cols: string) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: unknown[] | null }>
          }
        }
      })
        .select('id, headline, summary, category, players, teams, is_breaking, published_at, source')
        .order('published_at', { ascending: false })
        .limit(20)
      return NextResponse.json(data ?? [])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  return POST()
}
