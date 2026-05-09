import { NextResponse } from 'next/server'
import { updateCustomerProfile, verifyCustomerSession } from '@/lib/auth/customer'
import { sanitizeText, sanitizePhone } from '@/lib/validate'

const CUSTOMER_SESSION_COOKIE = 'rr_customer_session'

async function getCustomerIdFromSession(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const sessionToken = cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${CUSTOMER_SESSION_COOKIE}=`))
    ?.split('=')
    .slice(1)
    .join('=')

  if (!sessionToken) {
    return null
  }

  return await verifyCustomerSession(sessionToken)
}

export async function PATCH(request: Request) {
  try {
    const customerId = await getCustomerIdFromSession(request)

    if (!customerId) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }

    const body = await request.json()
    const { firstName, lastName, phone } = body

    const { error } = await updateCustomerProfile(customerId, {
      firstName: sanitizeText(firstName, 60) || undefined,
      lastName: sanitizeText(lastName, 60) || undefined,
      phone: sanitizePhone(phone) ?? undefined,
    })

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ message: 'Profile updated successfully.' }, { status: 200 })
  } catch (error) {
    console.error('[customer-profile:patch]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
