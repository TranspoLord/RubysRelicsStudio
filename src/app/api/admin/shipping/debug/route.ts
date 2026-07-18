import { NextResponse } from 'next/server'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { calculateShippingRates, validateAddress } from '@/lib/shippo/client'

// Admin-protected shipping debug endpoint
// GET /api/admin/shipping/debug?street1=...&city=...&state=...&zip=...&country=US&weight=1

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const url = new URL(request.url)
    const address = {
      street1: url.searchParams.get('street1') || '',
      street2: url.searchParams.get('street2') || undefined,
      city: url.searchParams.get('city') || '',
      state: url.searchParams.get('state') || '',
      zip: url.searchParams.get('zip') || '',
      country: url.searchParams.get('country') || 'US',
    }
    const weight = Number(url.searchParams.get('weight') || '1')

    if (!address.street1 || !address.city || !address.state || !address.zip) {
      return NextResponse.json({ 
        error: 'Missing required address fields. Provide street1, city, state, zip, country, weight as query params.' 
      }, { status: 400 })
    }

    // First validate address
    const validationResult = await validateAddress(address).catch(() => ({
      ...address,
      isValid: false,
    }))

    // Then get rates
    const rates = await calculateShippingRates({ address, weight })

    return NextResponse.json({
      validation: validationResult,
      rates,
      environment: {
        hasToken: !!process.env.SHIPPO_API_TOKEN,
        testMode: process.env.SHIPPO_TEST_MODE === 'true',
      },
    })
  } catch (error) {
    console.error('[admin:shipping:debug]', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}