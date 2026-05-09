import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { verifyCustomerSession } from '@/lib/auth/customer'

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
    const { newsletter, orderUpdates, marketing } = body

    const supabase = getSupabaseAdmin()

    const { error } = await supabase
      .from('exp_customers')
      .update({
        receives_newsletter: newsletter,
        receives_order_updates: orderUpdates,
        receives_marketing: marketing,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId)

    if (error) {
      console.error('[customer-preferences:patch]', error.message)
      return NextResponse.json({ error: 'Failed to update preferences.' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Preferences updated successfully.' }, { status: 200 })
  } catch (error) {
    console.error('[customer-preferences:patch]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
