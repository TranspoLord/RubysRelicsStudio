import { NextResponse } from 'next/server'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import {
  DEFAULT_FROM_EMAIL,
  DEFAULT_FROM_NAME,
  DEFAULT_SUPPORT_EMAIL,
} from '@/lib/storefront-settings'

interface SettingsFormData {
  stripe_checkout_enabled: {
    enabled: boolean
    disabled_message: string
  }
  guest_order_tracking: {
    enabled: boolean
    notify_email: string
  }
  contact: {
    support_email: string
    from_email: string
    from_name: string
  }
  operational_notifications: {
    custom_request_notify_email: string
  }
  admin_session: {
    ttl_hours: number
  }
  recommendations: {
    enabled: boolean
    pinned_global: string[]
    pinned_by_category: Record<string, string[]>
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) {
      return auth.response
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_storefront_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['stripe_checkout_enabled', 'guest_order_tracking', 'contact', 'operational_notifications', 'admin_session', 'recommendations'])

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
        notify_email: DEFAULT_SUPPORT_EMAIL,
      }) as SettingsFormData['guest_order_tracking'],
      contact: (settingsByKey.get('contact') ?? {
        support_email: DEFAULT_SUPPORT_EMAIL,
        from_email: DEFAULT_FROM_EMAIL,
        from_name: DEFAULT_FROM_NAME,
      }) as SettingsFormData['contact'],
      operational_notifications: (settingsByKey.get('operational_notifications') ?? {
        custom_request_notify_email: DEFAULT_SUPPORT_EMAIL,
      }) as SettingsFormData['operational_notifications'],
      admin_session: (settingsByKey.get('admin_session') ?? {
        ttl_hours: 12,
      }) as SettingsFormData['admin_session'],
      recommendations: (settingsByKey.get('recommendations') ?? {
        enabled: true,
        pinned_global: [],
        pinned_by_category: {},
      }) as SettingsFormData['recommendations'],
    }

    return NextResponse.json({ settings }, { status: 200 })
  } catch (error) {
    console.error('[admin:settings:get]', error)
    return NextResponse.json({ error: 'Could not load settings.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-settings-write',
      maxRequests: 20,
      windowMs: 5 * 60 * 1000,
    })
    if (!auth.ok) {
      return auth.response
    }

    const body = await request.json()
    const { settings } = body as { settings: SettingsFormData }

    if (!settings) {
      await writeAdminAuditLog({ action: 'settings.update', entityType: 'storefront_settings', route: '/api/admin/settings', request, status: 'failure', details: { reason: 'missing_settings_body' } })
      return NextResponse.json({ error: 'Missing settings in request body.' }, { status: 400 })
    }

    // Validate structure
    if (
      !settings.stripe_checkout_enabled ||
      !settings.guest_order_tracking ||
      !settings.contact ||
      !settings.operational_notifications ||
      !settings.admin_session ||
      !settings.recommendations ||
      typeof settings.stripe_checkout_enabled.enabled !== 'boolean' ||
      typeof settings.guest_order_tracking.enabled !== 'boolean' ||
      typeof settings.operational_notifications.custom_request_notify_email !== 'string' ||
      typeof settings.admin_session.ttl_hours !== 'number' ||
      typeof settings.recommendations.enabled !== 'boolean' ||
      !Array.isArray(settings.recommendations.pinned_global) ||
      typeof settings.recommendations.pinned_by_category !== 'object'
    ) {
      await writeAdminAuditLog({ action: 'settings.update', entityType: 'storefront_settings', route: '/api/admin/settings', request, status: 'failure', details: { reason: 'invalid_settings_structure' } })
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
      await writeAdminAuditLog({ action: 'settings.update', entityType: 'storefront_settings', route: '/api/admin/settings', request, status: 'failure', details: { reason: 'stripe_update_failed', message: stripeResult.error.message } })
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
      await writeAdminAuditLog({ action: 'settings.update', entityType: 'storefront_settings', route: '/api/admin/settings', request, status: 'failure', details: { reason: 'tracking_update_failed', message: trackingResult.error.message } })
      return NextResponse.json({ error: 'Could not update tracking settings.' }, { status: 500 })
    }

    const contactResult = await supabase
      .from('exp_storefront_settings')
      .update({
        setting_value: settings.contact,
        updated_at: new Date().toISOString(),
      })
      .eq('setting_key', 'contact')

    if (contactResult.error) {
      console.error('[admin:settings:patch]', contactResult.error.message)
      await writeAdminAuditLog({ action: 'settings.update', entityType: 'storefront_settings', route: '/api/admin/settings', request, status: 'failure', details: { reason: 'contact_update_failed', message: contactResult.error.message } })
      return NextResponse.json({ error: 'Could not update contact settings.' }, { status: 500 })
    }

    const operationalNotificationResult = await supabase
      .from('exp_storefront_settings')
      .update({
        setting_value: settings.operational_notifications,
        updated_at: new Date().toISOString(),
      })
      .eq('setting_key', 'operational_notifications')

    if (operationalNotificationResult.error) {
      console.error('[admin:settings:patch]', operationalNotificationResult.error.message)
      await writeAdminAuditLog({ action: 'settings.update', entityType: 'storefront_settings', route: '/api/admin/settings', request, status: 'failure', details: { reason: 'operational_notification_update_failed', message: operationalNotificationResult.error.message } })
      return NextResponse.json({ error: 'Could not update operational notification settings.' }, { status: 500 })
    }

    const adminSessionResult = await supabase
      .from('exp_storefront_settings')
      .update({
        setting_value: settings.admin_session,
        updated_at: new Date().toISOString(),
      })
      .eq('setting_key', 'admin_session')

    if (adminSessionResult.error) {
      console.error('[admin:settings:patch]', adminSessionResult.error.message)
      await writeAdminAuditLog({ action: 'settings.update', entityType: 'storefront_settings', route: '/api/admin/settings', request, status: 'failure', details: { reason: 'admin_session_update_failed', message: adminSessionResult.error.message } })
      return NextResponse.json({ error: 'Could not update admin session settings.' }, { status: 500 })
    }

    const recommendationsResult = await supabase
      .from('exp_storefront_settings')
      .upsert({
        setting_key: 'recommendations',
        setting_value: settings.recommendations,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'setting_key' })

    if (recommendationsResult.error) {
      console.error('[admin:settings:patch]', recommendationsResult.error.message)
      await writeAdminAuditLog({ action: 'settings.update', entityType: 'storefront_settings', route: '/api/admin/settings', request, status: 'failure', details: { reason: 'recommendations_update_failed', message: recommendationsResult.error.message } })
      return NextResponse.json({ error: 'Could not update recommendation settings.' }, { status: 500 })
    }

    await writeAdminAuditLog({ action: 'settings.update', entityType: 'storefront_settings', route: '/api/admin/settings', request, status: 'success', details: { keys: ['stripe_checkout_enabled', 'guest_order_tracking', 'contact', 'operational_notifications', 'admin_session', 'recommendations'] } })

    return NextResponse.json({ settings, message: 'Settings updated successfully.' }, { status: 200 })
  } catch (error) {
    console.error('[admin:settings:patch]', error)
    await writeAdminAuditLog({ action: 'settings.update', entityType: 'storefront_settings', route: '/api/admin/settings', request, status: 'failure', details: { reason: 'unexpected_error' } })
    return NextResponse.json({ error: 'Could not update settings.' }, { status: 500 })
  }
}
