import { NextResponse } from 'next/server'

export async function GET() {
  // Square checkout is now the primary payment method
  // All products with is_square_enabled will use Square
  return NextResponse.json(
    {
      paymentProvider: 'square',
    },
    { status: 200 }
  )
}