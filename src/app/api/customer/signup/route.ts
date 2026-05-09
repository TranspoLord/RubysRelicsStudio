import { NextResponse } from 'next/server'
import { signUpCustomer, loginCustomer } from '@/lib/auth/customer'
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit'
import { validateEmail, validatePassword, sanitizeText } from '@/lib/validate'

const CUSTOMER_SESSION_COOKIE = 'rr_customer_session'

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = rateLimit(`signup:${ip}`, 3, 10 * 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter!)

    const body = await request.json()
    const { email, password, firstName, lastName, receivesNewsletter } = body

    const validEmail = validateEmail(email)
    if (!validEmail) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
    }
    const passwordError = validatePassword(password)
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 })
    }

    const cleanFirstName = sanitizeText(firstName, 60) || undefined
    const cleanLastName = sanitizeText(lastName, 60) || undefined

    const { customerId, error } = await signUpCustomer(validEmail, password, cleanFirstName, cleanLastName)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    if (!customerId) {
      return NextResponse.json({ error: 'Failed to create account.' }, { status: 500 })
    }

    // Log the customer in immediately (create session)
    const ipAddress = ip
    const userAgent = request.headers.get('user-agent') || 'unknown'

    const loginResult = await loginCustomer(validEmail, password, ipAddress, userAgent)

    if (!loginResult.sessionToken) {
      return NextResponse.json({ error: 'Account created but login failed.' }, { status: 500 })
    }

    // Set session cookie
    const response = NextResponse.json(
      { customerId, message: 'Account created successfully.' },
      { status: 201 }
    )

    response.cookies.set(CUSTOMER_SESSION_COOKIE, loginResult.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[customer-signup]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
