import { NextResponse } from 'next/server'
import { logoutCustomer } from '@/lib/auth/customer'

const CUSTOMER_SESSION_COOKIE = 'rr_customer_session'

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie') ?? ''
    const sessionToken = cookieHeader
      .split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${CUSTOMER_SESSION_COOKIE}=`))
      ?.split('=')
      .slice(1)
      .join('=')

    if (sessionToken) {
      await logoutCustomer(sessionToken)
    }

    const response = NextResponse.json({ message: 'Logged out successfully.' }, { status: 200 })

    response.cookies.delete(CUSTOMER_SESSION_COOKIE)

    return response
  } catch (error) {
    console.error('[customer-logout]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
