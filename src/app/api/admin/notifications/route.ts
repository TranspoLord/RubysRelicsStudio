import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { getUnreadNotificationCount, syncOperationalNotifications } from '@/lib/admin/notifications'
import { getSupabaseAdmin } from '@/lib/supabase/client'

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

interface NotificationsPatchBody {
  action?: unknown
  notificationId?: unknown
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    await syncOperationalNotifications()

    const supabase = getSupabaseAdmin()
    const unreadCount = await getUnreadNotificationCount()

    const { data, error } = await supabase
      .from('exp_admin_notifications')
      .select('id, source_type, source_id, event_type, title, body, href, is_read, read_at, metadata, created_at, updated_at')
      .order('is_read', { ascending: true })
      .order('updated_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[admin:notifications:get]', error.message)
      return NextResponse.json({ error: 'Could not load notifications.' }, { status: 500 })
    }

    return NextResponse.json({ notifications: data ?? [], unreadCount }, { status: 200 })
  } catch (error) {
    console.error('[admin:notifications:get]', error)
    return NextResponse.json({ error: 'Could not load notifications.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-notifications-write',
      maxRequests: 120,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as NotificationsPatchBody
    const action = asString(body.action, 40)
    const notificationId = asString(body.notificationId, 64)

    const supabase = getSupabaseAdmin()

    if (action === 'mark_read') {
      if (!notificationId) {
        return NextResponse.json({ error: 'Notification id is required.' }, { status: 400 })
      }

      const { error } = await supabase
        .from('exp_admin_notifications')
        .update({ is_read: true, read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', notificationId)

      if (error) {
        console.error('[admin:notifications:mark-read]', error.message)
        return NextResponse.json({ error: 'Could not mark notification as read.' }, { status: 500 })
      }

      return NextResponse.json({ ok: true }, { status: 200 })
    }

    if (action === 'mark_all_read') {
      const { error } = await supabase
        .from('exp_admin_notifications')
        .update({ is_read: true, read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('is_read', false)

      if (error) {
        console.error('[admin:notifications:mark-all-read]', error.message)
        return NextResponse.json({ error: 'Could not mark all notifications as read.' }, { status: 500 })
      }

      return NextResponse.json({ ok: true }, { status: 200 })
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
  } catch (error) {
    console.error('[admin:notifications:patch]', error)
    return NextResponse.json({ error: 'Could not update notifications.' }, { status: 500 })
  }
}
