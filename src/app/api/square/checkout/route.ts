import { NextResponse } from 'next/server'
import { createSquareCheckout } from '@/lib/square/client'

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

    // Create checkout with Square
    const checkoutResponse = await createSquareCheckout({
      lineItems,
      idempotencyKey: `${body.items.map(i => i.productId).join('-')}-${Date.now()}`,
      note: 'Order from Ruby\'s Relics Studio',
      metadata: {
        ...(body.buyerEmail && { buyer_email: body.buyerEmail }),
        ...(body.buyerPhone && { buyer_phone: body.buyerPhone }),
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