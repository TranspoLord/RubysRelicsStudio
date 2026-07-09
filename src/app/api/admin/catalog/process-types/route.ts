import { NextResponse } from 'next/server'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

/**
 * GET /api/admin/catalog/process-types?productId=<uuid>
 * Returns assigned process type keys for a product, and all available process types.
 */
export async function GET(request: Request) {
  const auth = await requireAdminApiSession(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('productId')
  if (!productId) {
    return NextResponse.json({ error: 'productId is required.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const [assignedResult, allResult] = await Promise.all([
    supabase
      .from('exp_product_process_types')
      .select('process_type_key')
      .eq('product_id', productId),

    supabase
      .from('exp_taxonomy')
      .select('key, display_name, emoji')
      .eq('type', 'process_type')
      .eq('visible', true)
      .order('sort_order', { ascending: true }),
  ])

  if (assignedResult.error) {
    console.error('[admin:catalog:process-types:get:assigned]', assignedResult.error.message)
    return NextResponse.json({ error: 'Could not load process type assignments.' }, { status: 500 })
  }

  if (allResult.error) {
    console.error('[admin:catalog:process-types:get:all]', allResult.error.message)
    return NextResponse.json({ error: 'Could not load process types.' }, { status: 500 })
  }

  return NextResponse.json({
    assigned: (assignedResult.data ?? []).map((r) => r.process_type_key),
    processTypes: allResult.data ?? [],
  })
}

/**
 * PUT /api/admin/catalog/process-types
 * Replaces the entire set of process type assignments for a product.
 * Body: { productId: string, processTypeKeys: string[] }
 */
export async function PUT(request: Request) {
  const auth = await requireAdminApiSession(request, {
    key: 'admin:catalog:process-types:put',
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 })
  }

  const { productId, processTypeKeys } = body as Record<string, unknown>

  if (typeof productId !== 'string' || !productId) {
    return NextResponse.json({ error: 'productId must be a non-empty string.' }, { status: 400 })
  }

  if (!Array.isArray(processTypeKeys) || processTypeKeys.some((k) => typeof k !== 'string')) {
    return NextResponse.json({ error: 'processTypeKeys must be an array of strings.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Verify product exists
  const { data: product, error: productError } = await supabase
    .from('exp_products')
    .select('id')
    .eq('id', productId)
    .maybeSingle()

  if (productError || !product) {
    return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
  }

  // Delete existing assignments then insert new set (upsert-style replace)
  const { error: deleteError } = await supabase
    .from('exp_product_process_types')
    .delete()
    .eq('product_id', productId)

  if (deleteError) {
    console.error('[admin:catalog:process-types:put:delete]', deleteError.message)
    await writeAdminAuditLog({
      action: 'product_process_types_update',
      entityType: 'product',
      entityId: productId,
      route: '/api/admin/catalog/process-types',
      request,
      status: 'failure',
      details: { error: deleteError.message },
    })
    return NextResponse.json({ error: 'Could not update process type assignments.' }, { status: 500 })
  }

  if (processTypeKeys.length > 0) {
    const rows = (processTypeKeys as string[]).map((key) => ({
      product_id: productId,
      process_type_key: key,
    }))

    const { error: insertError } = await supabase
      .from('exp_product_process_types')
      .insert(rows)

    if (insertError) {
      console.error('[admin:catalog:process-types:put:insert]', insertError.message)
      await writeAdminAuditLog({
        action: 'product_process_types_update',
        entityType: 'product',
        entityId: productId,
        route: '/api/admin/catalog/process-types',
        request,
        status: 'failure',
        details: { error: insertError.message },
      })
      return NextResponse.json({ error: 'Could not save process type assignments.' }, { status: 500 })
    }
  }

  await writeAdminAuditLog({
    action: 'product_process_types_update',
    entityType: 'product',
    entityId: productId,
    route: '/api/admin/catalog/process-types',
    request,
    status: 'success',
    details: { processTypeKeys },
  })

  return NextResponse.json({ ok: true, assigned: processTypeKeys })
}
