import { NextResponse } from 'next/server'
import { verifyCustomerSession } from '@/lib/auth/customer'
import { trackProductView, getRecentlyViewed } from '@/lib/recently-viewed'

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

// POST /api/recently-viewed/track - Track product view
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { productId } = body

    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 })
    }

    const customerId = await getCustomerIdFromSession(request)

    // Track if authenticated
    if (customerId) {
      await trackProductView(customerId, productId)
    }

    return NextResponse.json({ message: 'View tracked.' }, { status: 200 })
  } catch (error) {
    console.error('[track-view]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

// GET /api/recently-viewed - Get customer's recently viewed items
export async function GET(request: Request) {
  try {
    const customerId = await getCustomerIdFromSession(request)

    if (!customerId) {
      // Return empty list for guests
      return NextResponse.json({ items: [] }, { status: 200 })
    }

    const items = await getRecentlyViewed(customerId)

    return NextResponse.json({ items }, { status: 200 })
  } catch (error) {
    console.error('[get-recently-viewed]', error)
    return NextResponse.json({ items: [] }, { status: 200 })
  }
}
