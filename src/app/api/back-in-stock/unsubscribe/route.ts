import { NextResponse } from 'next/server'

import { safeLogError } from '@/lib/security/logger'
import { unsubscribeBackInStockByToken } from '@/lib/back-in-stock'

function asString(value: string | null, maxLen: number): string {
  if (!value) return ''
  return value.trim().slice(0, maxLen)
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const token = asString(url.searchParams.get('token'), 1200)

    if (!token) {
      return NextResponse.json({ error: 'Unsubscribe token is required.' }, { status: 400 })
    }

    const result = await unsubscribeBackInStockByToken(token)
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? 'Could not unsubscribe alert.' }, { status: 400 })
    }

    return NextResponse.json({ message: 'You have been unsubscribed from this back-in-stock alert.' }, { status: 200 })
  } catch (error) {
    safeLogError('[back-in-stock:unsubscribe]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
