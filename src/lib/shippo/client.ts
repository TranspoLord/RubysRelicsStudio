// Shippo API client utilities
// Requires SHIPPO_API_TOKEN and optional SHIPPO_TEST_MODE env vars

const SHIPPO_API_TOKEN = process.env.SHIPPO_API_TOKEN
const SHIPPO_TEST_MODE = process.env.SHIPPO_TEST_MODE === 'true'

// Shippo uses the same endpoint - test tokens are prefixed with 'shippo_test_'
const SHIPPO_API_BASE = 'https://api.goshippo.com'

// Default package dimensions for all shipments (in inches)
export const DEFAULT_PACKAGE_DIMENSIONS = {
  length: 8,
  width: 6,
  height: 2,
  distance_unit: 'in' as const,
}

// North America country codes
export const NORTH_AMERICA_COUNTRIES = ['US', 'CA', 'MX']

interface ShippoAddress {
  name?: string
  company?: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
  phone?: string
  email?: string
}

interface ShippoParcel {
  length: number
  width: number
  height: number
  distance_unit: 'in' | 'cm'
  weight: number
  mass_unit: 'lb' | 'kg' | 'oz' | 'g'
}

interface ShippoRate {
  object_id: string
  servicelevel: {
    name: string
    token: string
    carrier: string
  }
  estimated_days: number | null
  estimated_delivery_date: string | null
  amount: string
  currency: string
  provider: string
  provider_image_75: string
  duration_terms?: string
}

interface ShippoRateResponse {
  rates: ShippoRate[]
}

interface ShippoValidationError {
  messages: Array<{
    source: string
    code: string
    text: string
  }>
}

interface ShippoAddressValidationResponse {
  valid: boolean
  street1: string
  city: string
  state: string
  zip: string
  country: string
  messages: ShippoValidationError['messages']
}

export interface ShippingRate {
  id: string
  carrier: string
  service: string
  name: string
  estimatedDays: number | null
  amount: number
  currency: string
  providerImage: string
  rateToken: string
}

export interface ValidatedAddress extends ShippoAddress {
  isValid: boolean
}

function getHeaders() {
  return {
    'Authorization': `ShippoToken ${SHIPPO_API_TOKEN}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

export async function calculateShippingRates(params: {
  address: ShippoAddress
  weight: number // in pounds
}): Promise<ShippingRate[]> {
  if (!SHIPPO_API_TOKEN) {
    throw new Error('Shippo API token not configured.')
  }

  // Filter to North America only
  if (!NORTH_AMERICA_COUNTRIES.includes(params.address.country)) {
    throw new Error('Shipping is currently limited to North America (US, CA, MX).')
  }

  const parcel: ShippoParcel = {
    ...DEFAULT_PACKAGE_DIMENSIONS,
    weight: params.weight,
    mass_unit: 'lb',
  }

  const response = await fetch(`${SHIPPO_API_BASE}/shipments`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      address_from: {
        name: 'Ruby\'s Relics Studio',
        street1: process.env.SHIPPO_FROM_STREET || '123 Main St',
        city: process.env.SHIPPO_FROM_CITY || 'Anytown',
        state: process.env.SHIPPO_FROM_STATE || 'CA',
        zip: process.env.SHIPPO_FROM_ZIP || '90210',
        country: 'US',
        company: 'Ruby\'s Relics Studio',
      },
      address_to: params.address,
      parcels: [parcel],
      async: false,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('[shippo:rate]', error)
    throw new Error(`Failed to calculate shipping rates: ${error}`)
  }

  const data = (await response.json()) as ShippoRateResponse
  const rates = data.rates || []

  // Filter to major carriers and sort by price
  const filteredRates = rates
    .filter(rate => ['usps', 'ups', 'fedex'].includes(rate.provider.toLowerCase()))
    .map(rate => ({
      id: rate.object_id,
      carrier: rate.servicelevel.carrier,
      service: rate.servicelevel.token,
      name: rate.servicelevel.name,
      estimatedDays: rate.estimated_days,
      amount: parseFloat(rate.amount),
      currency: rate.currency,
      providerImage: rate.provider_image_75,
      rateToken: rate.object_id,
    }))
    .sort((a, b) => a.amount - b.amount)

  return filteredRates
}

export async function validateAddress(address: ShippoAddress): Promise<ValidatedAddress> {
  if (!SHIPPO_API_TOKEN) {
    throw new Error('Shippo API token not configured.')
  }

  const response = await fetch(`${SHIPPO_API_BASE}/addresses`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      ...address,
      validate: true,
      verification: 'validate',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('[shippo:validate]', error)
    throw new Error(`Failed to validate address: ${error}`)
  }

  const data = (await response.json()) as ShippoAddressValidationResponse

  return {
    ...address,
    isValid: data.valid,
  }
}

export async function getTrackingInfo(trackingNumber: string, carrier: string): Promise<{
  trackingStatus: {
    status: string
    statusDetails: string
    estimatedDeliveryDate: string | null
    trackingEvents: Array<{
      date: string
      status: string
      details: string
    }>
  }
}> {
  if (!SHIPPO_API_TOKEN) {
    throw new Error('Shippo API token not configured.')
  }

  const response = await fetch(
    `${SHIPPO_API_BASE}/tracks/${carrier}/${trackingNumber}`,
    {
      method: 'GET',
      headers: getHeaders(),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error('[shippo:tracking]', error)
    throw new Error(`Failed to get tracking info: ${error}`)
  }

  const data = await response.json()

  return {
    trackingStatus: {
      status: data.tracking_status?.status || 'UNKNOWN',
      statusDetails: data.tracking_status?.status_details || '',
      estimatedDeliveryDate: data.estimated_delivery_date || null,
      trackingEvents: (data.tracking_history || []).map((event: {
        date: string
        status: string
        status_details: string
      }) => ({
        date: event.date,
        status: event.status,
        details: event.status_details,
      })),
    },
  }
}