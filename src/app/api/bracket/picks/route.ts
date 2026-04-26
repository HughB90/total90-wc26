import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { userId, phase, picks } = await request.json() as {
      userId: string
      phase: string
      picks: unknown
    }

    if (!userId || !phase || picks === undefined) {
      return NextResponse.json({ error: 'userId, phase, and picks required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Check if entry exists for this user + phase
    const { data: existing } = await supabase
      .from('bracket_entries')
      .select('id')
      .eq('user_id', userId)
      .eq('phase', phase)
      .single()

    if (existing) {
      const { error } = await supabase
        .from('bracket_entries')
        .update({ picks })
        .eq('id', existing.id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabase
        .from('bracket_entries')
        .insert({ user_id: userId, phase, picks, score: 0 })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await supabase
      .from('bracket_entries')
      .select('phase, picks, score')
      .eq('user_id', userId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, entries: data ?? [] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
