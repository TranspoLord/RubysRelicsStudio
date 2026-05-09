import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from '@/lib/admin/session'

export async function GET(request: Request) {
  try {
    const adminKey = process.env.ADMIN_LOGIN_KEY
    if (!adminKey) {
      return NextResponse.json({ error: 'ADMIN_LOGIN_KEY is missing.' }, { status: 500 })
    }

    const cookieHeader = request.headers.get('cookie') ?? ''
    const sessionToken = cookieHeader
      .split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${ADMIN_COOKIE_NAME}=`))
      ?.split('=')
      .slice(1)
      .join('=')

    if (!verifyAdminSessionToken(sessionToken, adminKey)) {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_custom_requests')
      .select('id, status, customer_email, item_type, quantity, quote_amount, stripe_payment_link_url, created_at')
      .order('created_at', { ascending: false })
      .limit(60)

    if (error) {
      console.error('[admin:custom-requests:get]', error.message)
      return NextResponse.json({ error: 'Could not load custom requests.' }, { status: 500 })
    }

    return NextResponse.json({ requests: data ?? [] }, { status: 200 })
  } catch (error) {
    console.error('[admin:custom-requests:get]', error)
    return NextResponse.json({ error: 'Could not load custom requests.' }, { status: 500 })
  }
}
