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

    const today = new Date().toISOString().split('T')[0]
    const watchPlayers = `Jude Bellingham, Kylian Mbappé, Lamine Yamal, Florian Wirtz, Vinicius Junior, Bukayo Saka, Cole Palmer, Harry Kane, Julián Álvarez, Bruno Fernandes, Declan Rice, Rodrigo Hernandez (Rodri), Ousmane Dembélé, Theo Hernández, Joshua Kimmich, Lionel Messi, Alexis Mac Allister, Michael Olise, Dani Olmo, Pau Cubarsí, Enzo Fernández, Rodrigo De Paul, Eduardo Camavinga, Dayot Upamecano, João Neves, António Rüdiger, Jonathan Tah, Serge Gnabry, Estevão Willian, Nuno Mendes`
    
    const prompt = `You are a real-time soccer news monitor for the 2026 FIFA World Cup. Today is ${today}.

USE YOUR LIVE X (TWITTER) SEARCH to find breaking news from the last 48 hours. This is critical — do NOT generate news from memory or training data.

SPECIFICALLY SEARCH X FOR NEWS ABOUT THESE PLAYERS:
${watchPlayers}

PRIORITY STORY TYPES (search X for these):
- Injury confirmations, fitness updates, training concerns
- Players ruled out, doubtful, or returning from injury
- Suspension risks (yellow card accumulation)
- Late squad call-ups or dropouts
- Manager press conferences about squad availability
- Club vs country fitness disputes

RULES:
- ONLY report what you find on X from real accounts (journalists, clubs, national teams) in the last 48 hours
- Include WHO reported it (e.g. "Per Sky Sports Germany...", "The Athletic reports...", "@FabrizioRomano...")
- If you cannot find 5 recent confirmed stories, report fewer — do NOT make up news
- Set is_breaking: true only for injury/suspension news affecting WC2026 availability

Return as JSON array, no markdown:
[{"headline":"<max 80 chars>","summary":"<2-3 sentences with source context>","category":"injury|suspension|squad|transfer|form|general","players":["Full Name"],"teams":["Country"],"is_breaking":false}]
`
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
