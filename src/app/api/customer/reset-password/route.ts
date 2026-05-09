import { NextResponse } from 'next/server'
import { resetPasswordWithToken } from '@/lib/auth/customer'
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit'
import { validatePassword } from '@/lib/validate'

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = rateLimit(`reset-pw:${ip}`, 5, 15 * 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter!)

    const body = await request.json()
    const { token, password } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required.' }, { status: 400 })
    }
    const passwordError = validatePassword(password)
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 })
    }

    const { error } = await resetPasswordWithToken(token, password)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ message: 'Password reset successfully.' }, { status: 200 })
  } catch (error) {
    console.error('[reset-password]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
