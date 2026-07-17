import { NextResponse } from 'next/server'
import { validateAddress } from '@/lib/shippo/client'
import { getShippoSettings } from '@/lib/shippo/settings'

interface ValidateAddressRequest {
  address: {
    name?: string
    street1: string
    street2?: string
    city: string
    state: string
    zip: string
    country: string
  }
}

export async function POST(request: Request) {
  try {
    const settings = await getShippoSettings()
    
    if (!settings.enabled) {
      return NextResponse.json({ error: 'Shipping calculations are not enabled.' }, { status: 503 })
    }

    const body = (await request.json()) as ValidateAddressRequest
    const address = body.address

    if (!address?.street1 || !address?.city || !address?.state || !address?.zip || !address?.country) {
      return NextResponse.json({ error: 'Complete shipping address is required.' }, { status: 400 })
    }

    const validated = await validateAddress(address)

    return NextResponse.json({ 
      address: validated,
      isValid: validated.isValid 
    }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not validate address.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}