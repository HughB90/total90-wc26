import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)
    const category = searchParams.get('category') // injury | squad | transfer | form | general
    const breaking = searchParams.get('breaking') // 'true' to filter breaking only

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    let query = (supabase
      .from('news_articles' as never)
      .select('id, headline, summary, category, players, teams, is_breaking, published_at, source')
      .order('published_at', { ascending: false })
      .limit(limit) as any)

    if (category) query = query.eq('category', category)
    if (breaking === 'true') query = query.eq('is_breaking', true)

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      articles: data ?? [],
      count: (data ?? []).length,
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
