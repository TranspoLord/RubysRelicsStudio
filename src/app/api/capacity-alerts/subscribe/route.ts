import { NextResponse } from 'next/server'

import { subscribeCapacityAlert } from '@/lib/capacity-alerts'

interface SubscribeBody {
  categoryKey?: unknown
  email?: unknown
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SubscribeBody
    const categoryKey = asString(body.categoryKey, 120)
    const email = asString(body.email, 200).toLowerCase()

    const result = await subscribeCapacityAlert({ categoryKey, email })

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? 'Could not subscribe.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[capacity-alerts:subscribe]', error)
    return NextResponse.json({ error: 'Could not subscribe to capacity alerts.' }, { status: 500 })
  }
}
