import { NextResponse } from 'next/server'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { getShippoSettings, ShippoSettings } from '@/lib/shippo/settings'

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const settings = await getShippoSettings()
    const webhookUrl = process.env.APP_URL 
      ? `${process.env.APP_URL.replace(/\/$/, '')}/api/shippo/webhook`
      : '/api/shippo/webhook'

    return NextResponse.json({ 
      settings, 
      webhookUrl,
      isTestMode: process.env.SHIPPO_TEST_MODE === 'true'
    }, { status: 200 })
  } catch (error) {
    console.error('[admin:shipping:get]', error)
    return NextResponse.json({ error: 'Could not load shipping settings.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-shipping-write',
      maxRequests: 30,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as { settings: ShippoSettings }
    const { settings } = body

    if (!settings) {
      return NextResponse.json({ error: 'Settings object is required.' }, { status: 400 })
    }

    // Validate settings structure
    if (
      typeof settings.enabled !== 'boolean' ||
      typeof settings.carriers !== 'object' ||
      typeof settings.carriers.usps !== 'boolean' ||
      typeof settings.carriers.ups !== 'boolean' ||
      typeof settings.carriers.fedex !== 'boolean'
    ) {
      return NextResponse.json({ error: 'Invalid settings structure.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Upsert Shippo settings
    const { error } = await supabase
      .from('exp_storefront_settings')
      .upsert({
        setting_key: 'shippo',
        setting_value: settings,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'setting_key' })

    if (error) {
      console.error('[admin:shipping:patch]', error.message)
      await writeAdminAuditLog({
        action: 'shipping.settings.update',
        entityType: 'storefront_settings',
        route: '/api/admin/shipping',
        request,
        status: 'failure',
        details: { message: error.message },
      })
      return NextResponse.json({ error: 'Could not update shipping settings.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'shipping.settings.update',
      entityType: 'storefront_settings',
      route: '/api/admin/shipping',
      request,
      status: 'success',
      details: { 
        enabled: settings.enabled, 
        carriers: Object.entries(settings.carriers)
          .filter(([, enabled]) => enabled)
          .map(([carrier]) => carrier) 
      },
    })

    return NextResponse.json({ settings }, { status: 200 })
  } catch (error) {
    console.error('[admin:shipping:patch]', error)
    return NextResponse.json({ error: 'Could not update shipping settings.' }, { status: 500 })
  }
}