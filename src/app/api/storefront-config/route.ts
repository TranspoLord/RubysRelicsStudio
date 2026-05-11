import { NextResponse } from 'next/server'
import { getStripeCheckoutSettings } from '@/lib/storefront-settings'

export async function GET() {
  try {
    const settings = await getStripeCheckoutSettings()

    return NextResponse.json(
      {
        stripeCheckoutEnabled: settings.enabled,
        stripeDisabledMessage: settings.disabled_message,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[storefront-config:get]', error)
    const settings = await getStripeCheckoutSettings()
    return NextResponse.json(
      {
        stripeCheckoutEnabled: settings.enabled,
        stripeDisabledMessage: settings.disabled_message,
      },
      { status: 200 }
    )
  }
}
