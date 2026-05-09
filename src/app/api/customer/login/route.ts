import { NextResponse } from 'next/server'
import { loginCustomer } from '@/lib/auth/customer'
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit'
import { validateEmail, validatePassword } from '@/lib/validate'

const CUSTOMER_SESSION_COOKIE = 'rr_customer_session'

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = rateLimit(`login:${ip}`, 5, 15 * 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter!)

    const body = await request.json()
    const { email, password } = body

    const validEmail = validateEmail(email)
    if (!validEmail) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
    }
    if (!password) {
      return NextResponse.json({ error: 'Password is required.' }, { status: 400 })
    }

    const ipAddress = ip
    const userAgent = request.headers.get('user-agent') || 'unknown'

    const { sessionToken, customerId, error } = await loginCustomer(validEmail, password, ipAddress, userAgent)

    if (error) {
      return NextResponse.json({ error }, { status: 401 })
    }

    if (!sessionToken || !customerId) {
      return NextResponse.json({ error: 'Login failed.' }, { status: 500 })
    }

    // Set session cookie
    const response = NextResponse.json(
      { customerId, message: 'Logged in successfully.' },
      { status: 200 }
    )

    response.cookies.set(CUSTOMER_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[customer-login]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
