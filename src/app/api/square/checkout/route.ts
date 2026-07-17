import { NextResponse } from 'next/server'
import { createSquareCheckout } from '@/lib/square/client'
import { ShippingRate } from '@/lib/shippo/client'

interface CartItemForSquare {
  productId: string
  title: string
  quantity: number
  unitPrice: number  // in dollars
  selectedProcessKeys?: string[]
}

interface SquareCheckoutRequest {
  items: CartItemForSquare[]
  buyerEmail?: string
  buyerPhone?: string
  shippingAddress?: {
    name?: string
    street1: string
    street2?: string
    city: string
    state: string
    zip: string
    country: string
  }
  shippingRate?: ShippingRate
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SquareCheckoutRequest

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'No items provided for checkout.' }, { status: 400 })
    }

    // Check if Square is configured
    if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
      return NextResponse.json({ error: 'Square checkout not configured.' }, { status: 503 })
    }

    // Create line items for Square
    const lineItems = body.items.map((item) => ({
      name: item.selectedProcessKeys?.length
        ? `${item.title} (+ ${item.selectedProcessKeys.join(', ')})`
        : item.title,
      quantity: String(item.quantity),
      base_price_money: {
        amount: Math.round(item.unitPrice * 100),  // Convert to cents
        currency: 'USD',
      },
    }))

    // Add shipping line item if rate is selected
    if (body.shippingRate) {
      lineItems.push({
        name: `Shipping: ${body.shippingRate.name}`,
        quantity: '1',
        base_price_money: {
          amount: Math.round(body.shippingRate.amount * 100),  // Convert to cents
          currency: 'USD',
        },
      })
    }

    // Build shipping address note for reference
    const shippingNote = body.shippingAddress
      ? `Ship to: ${body.shippingAddress.street1}${body.shippingAddress.street2 ? ', ' + body.shippingAddress.street2 : ''}, ${body.shippingAddress.city}, ${body.shippingAddress.state} ${body.shippingAddress.zip}, ${body.shippingAddress.country}`
      : ''

    // Create checkout with Square
    const checkoutResponse = await createSquareCheckout({
      lineItems,
      idempotencyKey: `${body.items.map(i => i.productId).join('-')}-${Date.now()}`,
      note: shippingNote || 'Order from Ruby\'s Relics Studio',
      metadata: {
        ...(body.buyerEmail && { buyer_email: body.buyerEmail }),
        ...(body.buyerPhone && { buyer_phone: body.buyerPhone }),
        ...(body.shippingRate && {
          shipping_carrier: body.shippingRate.carrier,
          shipping_service: body.shippingRate.service,
          shipping_amount: String(body.shippingRate.amount),
        }),
        ...(body.shippingAddress && {
          shipping_country: body.shippingAddress.country,
          shipping_zip: body.shippingAddress.zip,
        }),
      },
    })

    return NextResponse.json({
      checkoutUrl: checkoutResponse.payment_link.url,
      checkoutId: checkoutResponse.payment_link.id,
    })
  } catch (error) {
    console.error('[square:checkout]', error)
    const message = error instanceof Error ? error.message : 'Could not create checkout.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}