import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { sanitizeSearchQuery } from '@/lib/validate'

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const url = new URL(request.url)
    const q = sanitizeSearchQuery(asString(url.searchParams.get('q'), 120)) ?? ''

    if (q.length < 2) {
      return NextResponse.json({ results: [] }, { status: 200 })
    }

    const supabase = getSupabaseAdmin()

    const [ordersResult, productsResult, requestsResult] = await Promise.all([
      supabase
        .from('exp_orders')
        .select('id, status, payment_status, order_total, created_at')
        .or(`id.ilike.%${q}%,status.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(12),

      supabase
        .from('exp_products')
        .select('id, title, slug, category_key, is_active, is_archived, updated_at')
        .or(`title.ilike.%${q}%,slug.ilike.%${q}%,category_key.ilike.%${q}%`)
        .order('updated_at', { ascending: false })
        .limit(12),

      supabase
        .from('exp_custom_requests')
        .select('id, status, customer_name, customer_email, item_type, updated_at')
        .or(`id.ilike.%${q}%,customer_email.ilike.%${q}%,customer_name.ilike.%${q}%,item_type.ilike.%${q}%`)
        .order('updated_at', { ascending: false })
        .limit(12),
    ])

    if (ordersResult.error) {
      console.error('[admin:search:orders]', ordersResult.error.message)
    }
    if (productsResult.error) {
      console.error('[admin:search:products]', productsResult.error.message)
    }
    if (requestsResult.error) {
      console.error('[admin:search:custom-requests]', requestsResult.error.message)
    }

    const orderResults = (ordersResult.data ?? []).map((order) => ({
      type: 'order',
      id: order.id,
      title: `Order ${order.id.slice(0, 8)}`,
      subtitle: `${order.status} · payment ${order.payment_status} · $${Number(order.order_total ?? 0).toFixed(2)}`,
      href: '/admin/orders',
    }))

    const productResults = (productsResult.data ?? []).map((product) => ({
      type: 'product',
      id: product.id,
      title: product.title,
      subtitle: `${product.slug} · ${product.category_key} · ${product.is_active ? 'published' : 'draft'}${product.is_archived ? ' · archived' : ''}`,
      href: '/admin/catalog',
    }))

    const requestResults = (requestsResult.data ?? []).map((req) => ({
      type: 'custom_request',
      id: req.id,
      title: `Custom ${req.id.slice(0, 8)}`,
      subtitle: `${req.status} · ${req.customer_name} · ${req.customer_email}`,
      href: '/admin/custom-requests',
    }))

    const results = [...orderResults, ...productResults, ...requestResults].slice(0, 30)

    return NextResponse.json({ results }, { status: 200 })
  } catch (error) {
    console.error('[admin:search:get]', error)
    return NextResponse.json({ error: 'Could not run admin search.' }, { status: 500 })
  }
}
