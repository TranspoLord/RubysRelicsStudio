import { NextResponse } from 'next/server'
import { validateAddress } from '@/lib/shippo/client'
import { getShippoSettings } from '@/lib/shippo/settings'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { requireCsrfOriginOnly } from '@/lib/security/csrf'

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
    const csrfResponse = requireCsrfOriginOnly(request)
    if (csrfResponse) return csrfResponse

    // SEC-010: Rate limit Shippo validate-address endpoint — 20 requests/minute per IP
    const ip = getClientIp(request)
    const rl = await rateLimit(`shippo-validate:${ip}`, 20, 60_000)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter ?? 60)

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