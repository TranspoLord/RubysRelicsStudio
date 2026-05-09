import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from '@/lib/admin/session'

interface SettingsFormData {
  stripe_checkout_enabled: {
    enabled: boolean
    disabled_message: string
  }
  guest_order_tracking: {
    enabled: boolean
    notify_email: string
  }
}

function extractSessionToken(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined
  return cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.split('=')
    .slice(1)
    .join('=')
}

export async function GET(request: Request) {
  try {
    const adminKey = process.env.ADMIN_LOGIN_KEY
    if (!adminKey) {
      return NextResponse.json({ error: 'ADMIN_LOGIN_KEY is missing.' }, { status: 500 })
    }

    const sessionToken = extractSessionToken(request.headers.get('cookie'))
    if (!verifyAdminSessionToken(sessionToken, adminKey)) {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_storefront_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['stripe_checkout_enabled', 'guest_order_tracking'])

    if (error) {
      console.error('[admin:settings:get]', error.message)
      return NextResponse.json({ error: 'Could not load settings.' }, { status: 500 })
    }

    // Transform flat rows into nested object
    const settingsByKey = new Map<string, unknown>()
    for (const row of data ?? []) {
      settingsByKey.set(row.setting_key, row.setting_value)
    }

    const settings: SettingsFormData = {
      stripe_checkout_enabled: (settingsByKey.get('stripe_checkout_enabled') ?? {
        enabled: true,
        disabled_message: 'Checkout is temporarily unavailable.',
      }) as SettingsFormData['stripe_checkout_enabled'],
      guest_order_tracking: (settingsByKey.get('guest_order_tracking') ?? {
        enabled: true,
        notify_email: 'orders@rubysrelics.com',
      }) as SettingsFormData['guest_order_tracking'],
    }

    return NextResponse.json({ settings }, { status: 200 })
  } catch (error) {
    console.error('[admin:settings:get]', error)
    return NextResponse.json({ error: 'Could not load settings.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const adminKey = process.env.ADMIN_LOGIN_KEY
    if (!adminKey) {
      return NextResponse.json({ error: 'ADMIN_LOGIN_KEY is missing.' }, { status: 500 })
    }

    const sessionToken = extractSessionToken(request.headers.get('cookie'))
    if (!verifyAdminSessionToken(sessionToken, adminKey)) {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 })
    }

    const body = await request.json()
    const { settings } = body as { settings: SettingsFormData }

    if (!settings) {
      return NextResponse.json({ error: 'Missing settings in request body.' }, { status: 400 })
    }

    // Validate structure
    if (
      !settings.stripe_checkout_enabled ||
      !settings.guest_order_tracking ||
      typeof settings.stripe_checkout_enabled.enabled !== 'boolean' ||
      typeof settings.guest_order_tracking.enabled !== 'boolean'
    ) {
      return NextResponse.json({ error: 'Invalid settings structure.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Update stripe_checkout_enabled
    const stripeResult = await supabase
      .from('exp_storefront_settings')
      .update({
        setting_value: settings.stripe_checkout_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('setting_key', 'stripe_checkout_enabled')

    if (stripeResult.error) {
      console.error('[admin:settings:patch]', stripeResult.error.message)
      return NextResponse.json({ error: 'Could not update stripe settings.' }, { status: 500 })
    }

    // Update guest_order_tracking
    const trackingResult = await supabase
      .from('exp_storefront_settings')
      .update({
        setting_value: settings.guest_order_tracking,
        updated_at: new Date().toISOString(),
      })
      .eq('setting_key', 'guest_order_tracking')

    if (trackingResult.error) {
      console.error('[admin:settings:patch]', trackingResult.error.message)
      return NextResponse.json({ error: 'Could not update tracking settings.' }, { status: 500 })
    }

    return NextResponse.json({ settings, message: 'Settings updated successfully.' }, { status: 200 })
  } catch (error) {
    console.error('[admin:settings:patch]', error)
    return NextResponse.json({ error: 'Could not update settings.' }, { status: 500 })
  }
}
