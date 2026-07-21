import { NextResponse } from 'next/server'
import { calculateShippingRates } from '@/lib/shippo/client'
import { getShippoSettings } from '@/lib/shippo/settings'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'

interface RatesRequest {
  address: {
    name?: string
    street1: string
    street2?: string
    city: string
    state: string
    zip: string
    country: string
  }
  weight: number
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

export async function POST(request: Request) {
  try {
    // SEC-010: Rate limit Shippo rates endpoint — 20 requests/minute per IP
    const ip = getClientIp(request)
    const rl = await rateLimit(`shippo-rates:${ip}`, 20, 60_000)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter ?? 60)

    const settings = await getShippoSettings()
    
    if (!settings.enabled) {
      return NextResponse.json({ error: 'Shipping calculations are not enabled.' }, { status: 503 })
    }

    const body = (await request.json()) as RatesRequest
    const address = body.address

    if (!address?.street1 || !address?.city || !address?.state || !address?.zip || !address?.country) {
      return NextResponse.json({ error: 'Complete shipping address is required.' }, { status: 400 })
    }

    const weight = Number(body.weight)
    if (!weight || weight <= 0) {
      return NextResponse.json({ error: 'Valid package weight is required.' }, { status: 400 })
    }

    const rates = await calculateShippingRates({ address, weight })

    // Filter by enabled carriers
    const filteredRates = rates.filter(rate => {
      const carrierLower = rate.carrier.toLowerCase()
      if (carrierLower === 'usps' && !settings.carriers.usps) return false
      if (carrierLower === 'ups' && !settings.carriers.ups) return false
      if (carrierLower === 'fedex' && !settings.carriers.fedex) return false
      return true
    })

    return NextResponse.json({ rates: filteredRates }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not calculate shipping rates.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}