// ─── USPS REST API v3 client (server-only) ────────────────────────────────────
// Docs: https://developer.usps.com/
// Uses OAuth 2.0 client credentials flow.

const USPS_BASE_URL = 'https://api.usps.com'

interface USPSTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface USPSAddress {
  streetAddress: string
  city: string
  state: string
  ZIPCode: string
  ZIPPlus4?: string
}

interface USPSShippingRate {
  SKU: string
  description: string
  priceType: string
  price: number
  weight: number
  dimWeight: number
  fees: Array<{ name: string; SKU: string; price: number }>
  startDate: string
  endDate: string
  mailClass: string
  zone?: string
}

// ─── Token cache (module-level, server process lifetime) ─────────────────────
let cachedToken: string | null = null
let tokenExpiresAt = 0

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && now < tokenExpiresAt - 30_000) {
    return cachedToken
  }

  const consumerKey = process.env.USPS_CONSUMER_KEY
  const consumerSecret = process.env.USPS_CONSUMER_SECRET
  if (!consumerKey || !consumerSecret) {
    throw new Error('[USPS] USPS_CONSUMER_KEY and USPS_CONSUMER_SECRET must be set.')
  }

  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

  const res = await fetch(`${USPS_BASE_URL}/oauth2/v3/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[USPS] Token request failed: ${res.status} ${text}`)
  }

  const data = (await res.json()) as USPSTokenResponse
  cachedToken = data.access_token
  tokenExpiresAt = now + data.expires_in * 1000
  return cachedToken
}

// ─── Address validation ───────────────────────────────────────────────────────
export async function validateAddress(
  address: USPSAddress,
): Promise<USPSAddress & { addressAdditionalInfo?: Record<string, string> }> {
  const token = await getAccessToken()
  const params = new URLSearchParams({
    streetAddress: address.streetAddress,
    city: address.city,
    state: address.state,
    ZIPCode: address.ZIPCode,
  })

  const res = await fetch(`${USPS_BASE_URL}/addresses/v3/address?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[USPS] Address validation failed: ${res.status} ${text}`)
  }

  return res.json()
}

// ─── Shipping rates ───────────────────────────────────────────────────────────
export interface ShippingRateRequest {
  originZip: string
  destinationZip: string
  weightOunces: number
  lengthIn: number
  widthIn: number
  heightIn: number
  mailClass?: string
}

export async function getShippingRates(
  request: ShippingRateRequest,
): Promise<USPSShippingRate[]> {
  const token = await getAccessToken()

  const body = {
    originZIPCode: request.originZip,
    destinationZIPCode: request.destinationZip,
    weight: request.weightOunces / 16, // USPS v3 takes pounds
    length: request.lengthIn,
    width: request.widthIn,
    height: request.heightIn,
    mailClass: request.mailClass ?? 'ALL',
    processingCategory: 'NON_MACHINABLE',
    destinationEntryFacilityType: 'NONE',
    priceType: 'RETAIL',
  }

  const res = await fetch(`${USPS_BASE_URL}/prices/v3/base-rates/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[USPS] Rates request failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  return (data.rates ?? []) as USPSShippingRate[]
}

// ─── Tracking ────────────────────────────────────────────────────────────────
export async function getTrackingInfo(trackingNumber: string): Promise<Record<string, unknown>> {
  const token = await getAccessToken()

  const res = await fetch(
    `${USPS_BASE_URL}/tracking/v3/tracking/${encodeURIComponent(trackingNumber)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[USPS] Tracking request failed: ${res.status} ${text}`)
  }

  return res.json()
}
