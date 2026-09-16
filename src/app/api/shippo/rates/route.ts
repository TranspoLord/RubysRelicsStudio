import { NextResponse } from 'next/server'
import { calculateShippingRates } from '@/lib/shippo/client'
import { getShippoSettings } from '@/lib/shippo/settings'
import { clampPackageWeight, derivePackageWeight } from '@/lib/shippo/weight'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { requireCsrfOriginOnly } from '@/lib/security/csrf'
import { parseJsonBodyOrError } from '@/lib/security/body'
import { safeLogError } from '@/lib/security/logger'

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
  items?: Array<{
    productId: string
    variantId?: string | null
    quantity: number
  }>
  weight?: number
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

export async function POST(request: Request) {
  try {
    const csrfResponse = requireCsrfOriginOnly(request)
    if (csrfResponse) return csrfResponse

    // SEC-010: Rate limit Shippo rates endpoint — 20 requests/minute per IP
    const ip = getClientIp(request)
    const rl = await rateLimit(`shippo-rates:${ip}`, 20, 60_000)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter ?? 60)

    const settings = await getShippoSettings()
    
    if (!settings.enabled) {
      return NextResponse.json({ error: 'Shipping calculations are not enabled.' }, { status: 503 })
    }

    const parsed = await parseJsonBodyOrError<RatesRequest>(request)
    if (!parsed.ok) return parsed.response

    const body = parsed.body
    const address = body.address

    if (!address?.street1 || !address?.city || !address?.state || !address?.zip || !address?.country) {
      return NextResponse.json({ error: 'Complete shipping address is required.' }, { status: 400 })
    }

    // SEC-047: Derive package weight from catalog items when available.
    // Never trust the client-supplied weight for a paid-rate lookup.
    let weight: number
    if (Array.isArray(body.items) && body.items.length > 0) {
      const derived = await derivePackageWeight(body.items)
      if (!derived) {
        return NextResponse.json({ error: 'Unable to calculate package weight from items.' }, { status: 400 })
      }
      weight = derived.weight
    } else {
      weight = clampPackageWeight(body.weight)
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
    safeLogError('[shippo:rates]', { message })
    return NextResponse.json({ error: 'Could not calculate shipping rates. Please try again.' }, { status: 500 })
  }
}