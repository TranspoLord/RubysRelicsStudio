import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'

const DEFAULT_STRIPE_ENABLED = true

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('exp_storefront_settings')
      .select('setting_key, setting_value')
      .eq('setting_key', 'stripe_checkout_enabled')
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[storefront-config:get]', error.message)
    }

    const stripeCheckoutEnabled =
      typeof data?.setting_value?.enabled === 'boolean'
        ? data.setting_value.enabled
        : DEFAULT_STRIPE_ENABLED

    const stripeDisabledMessage =
      typeof data?.setting_value?.disabled_message === 'string'
        ? data.setting_value.disabled_message
        : 'Checkout is temporarily unavailable. Please submit a custom request.'

    return NextResponse.json(
      {
        stripeCheckoutEnabled,
        stripeDisabledMessage,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[storefront-config:get]', error)
    return NextResponse.json(
      {
        stripeCheckoutEnabled: DEFAULT_STRIPE_ENABLED,
        stripeDisabledMessage:
          'Checkout is temporarily unavailable. Please submit a custom request.',
      },
      { status: 200 }
    )
  }
}
