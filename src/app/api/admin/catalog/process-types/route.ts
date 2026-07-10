import { NextResponse } from 'next/server'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

interface ProcessTypeEntry {
  key: string
  display_name: string
  emoji: string | null
}

interface ProcessPricingEntry {
  id: string
  process_type_key: string
  price_delta: number
  is_enabled: boolean
}

interface ComboDiscountEntry {
  id: string
  min_processes: number
  discount_type: string
  discount_value: number | null
  label: string | null
  is_enabled: boolean
}

/**
 * GET /api/admin/catalog/process-types?productId=<uuid>
 * Returns all available process types, assigned process pricing, and combo discounts.
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

  const [allResult, pricingResult, comboResult, oldAssignedResult] = await Promise.all([
    // All available process types from taxonomy
    supabase
      .from('exp_taxonomy')
      .select('key, display_name, emoji')
      .eq('type', 'process_type')
      .eq('visible', true)
      .order('sort_order', { ascending: true }),

    // Pricing from new table
    supabase
      .from('exp_product_process_pricing')
      .select('id, process_type_key, price_delta, is_enabled')
      .eq('product_id', productId),

    // Combo discounts from new table
    supabase
      .from('exp_product_combo_discounts')
      .select('id, min_processes, discount_type, discount_value, label, is_enabled')
      .eq('product_id', productId)
      .order('min_processes', { ascending: true }),

    // Old join table for backward compat (so we can still show which are assigned)
    supabase
      .from('exp_product_process_types')
      .select('process_type_key')
      .eq('product_id', productId),
  ])

  if (allResult.error) {
    console.error('[admin:catalog:process-types:get:all]', allResult.error.message)
    return NextResponse.json({ error: 'Could not load process types.' }, { status: 500 })
  }

  if (pricingResult.error) {
    console.error('[admin:catalog:process-types:get:pricing]', pricingResult.error.message)
    return NextResponse.json({ error: 'Could not load process pricing.' }, { status: 500 })
  }

  if (comboResult.error) {
    console.error('[admin:catalog:process-types:get:combo]', comboResult.error.message)
    return NextResponse.json({ error: 'Could not load combo discounts.' }, { status: 500 })
  }

  if (oldAssignedResult.error) {
    console.error('[admin:catalog:process-types:get:assigned]', oldAssignedResult.error.message)
    return NextResponse.json({ error: 'Could not load process type assignments.' }, { status: 500 })
  }

  // Merge: build a map of pricing by process_type_key from the new table
  const pricingMap = new Map<string, ProcessPricingEntry>()
  for (const p of (pricingResult.data ?? []) as ProcessPricingEntry[]) {
    pricingMap.set(p.process_type_key, p)
  }

  // Build the full response with pricing info merged into each process type
  const processTypesWithPricing = (allResult.data ?? [] as ProcessTypeEntry[]).map((pt) => {
    const existingPricing = pricingMap.get(pt.key)
    return {
      key: pt.key,
      display_name: pt.display_name,
      emoji: pt.emoji,
      price_delta: existingPricing?.price_delta ?? 0,
      is_enabled: existingPricing?.is_enabled ?? false,
      pricing_id: existingPricing?.id ?? null,
    }
  })

  // Assigned keys (from old table for backward compat, but also from new pricing where is_enabled)
  const newAssignedKeys = (pricingResult.data ?? [] as ProcessPricingEntry[])
    .filter((p) => p.is_enabled)
    .map((p) => p.process_type_key)
  const oldAssignedKeys = (oldAssignedResult.data ?? []).map((r) => r.process_type_key)
  // Merge both - if it's in either, consider it assigned
  const mergedAssigned = [...new Set([...newAssignedKeys, ...oldAssignedKeys])]

  return NextResponse.json({
    assigned: mergedAssigned,
    processTypes: processTypesWithPricing,
    comboDiscounts: comboResult.data ?? [],
  })
}

/**
 * PUT /api/admin/catalog/process-types
 * Replaces the entire set of process type assignments, pricing, and combo discounts.
 * Body: {
 *   productId: string,
 *   processTypes: Array<{ key: string; price_delta: number; is_enabled: boolean }>,
 *   comboDiscounts: Array<{ min_processes: number; discount_type: string; discount_value: number | null; label: string | null }>
 * }
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

  const { productId, processTypes, comboDiscounts } = body as Record<string, unknown>

  if (typeof productId !== 'string' || !productId) {
    return NextResponse.json({ error: 'productId must be a non-empty string.' }, { status: 400 })
  }

  if (!Array.isArray(processTypes)) {
    return NextResponse.json({ error: 'processTypes must be an array.' }, { status: 400 })
  }

  for (const pt of processTypes) {
    if (typeof pt.key !== 'string') {
      return NextResponse.json({ error: 'Each processTypes entry must have a key string.' }, { status: 400 })
    }
  }

  if (comboDiscounts !== undefined && !Array.isArray(comboDiscounts)) {
    return NextResponse.json({ error: 'comboDiscounts must be an array.' }, { status: 400 })
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

  // ── Step 1: Update the old join table for backward compat ──
  const enabledKeys = (processTypes as Array<{ key: string; price_delta: number; is_enabled: boolean }>)
    .filter((pt) => pt.is_enabled)
    .map((pt) => ({ product_id: productId, process_type_key: pt.key }))

  const { error: deleteOldError } = await supabase
    .from('exp_product_process_types')
    .delete()
    .eq('product_id', productId)

  if (deleteOldError) {
    console.error('[admin:catalog:process-types:put:deleteOld]', deleteOldError.message)
    await writeAdminAuditLog({
      action: 'product_process_types_update',
      entityType: 'product',
      entityId: productId,
      route: '/api/admin/catalog/process-types',
      request,
      status: 'failure',
      details: { error: deleteOldError.message },
    })
    return NextResponse.json({ error: 'Could not update process type assignments.' }, { status: 500 })
  }

  if (enabledKeys.length > 0) {
    const { error: insertOldError } = await supabase
      .from('exp_product_process_types')
      .insert(enabledKeys)

    if (insertOldError) {
      console.error('[admin:catalog:process-types:put:insertOld]', insertOldError.message)
      await writeAdminAuditLog({
        action: 'product_process_types_update',
        entityType: 'product',
        entityId: productId,
        route: '/api/admin/catalog/process-types',
        request,
        status: 'failure',
        details: { error: insertOldError.message },
      })
      return NextResponse.json({ error: 'Could not save process type assignments.' }, { status: 500 })
    }
  }

  // ── Step 2: Upsert pricing into new table ──
  // Delete existing pricing rows for this product
  const { error: deletePricingError } = await supabase
    .from('exp_product_process_pricing')
    .delete()
    .eq('product_id', productId)

  if (deletePricingError) {
    console.error('[admin:catalog:process-types:put:deletePricing]', deletePricingError.message)
    await writeAdminAuditLog({
      action: 'product_process_pricing_update',
      entityType: 'product',
      entityId: productId,
      route: '/api/admin/catalog/process-types',
      request,
      status: 'failure',
      details: { error: deletePricingError.message },
    })
    return NextResponse.json({ error: 'Could not update process pricing.' }, { status: 500 })
  }

  // Insert new pricing rows (even disabled ones so we preserve the price_delta)
  const pricingRows = (processTypes as Array<{ key: string; price_delta: number; is_enabled: boolean }>).map((pt) => ({
    product_id: productId,
    process_type_key: pt.key,
    price_delta: pt.price_delta,
    is_enabled: pt.is_enabled,
  }))

  if (pricingRows.length > 0) {
    const { error: insertPricingError } = await supabase
      .from('exp_product_process_pricing')
      .insert(pricingRows)

    if (insertPricingError) {
      console.error('[admin:catalog:process-types:put:insertPricing]', insertPricingError.message)
      await writeAdminAuditLog({
        action: 'product_process_pricing_update',
        entityType: 'product',
        entityId: productId,
        route: '/api/admin/catalog/process-types',
        request,
        status: 'failure',
        details: { error: insertPricingError.message },
      })
      return NextResponse.json({ error: 'Could not save process pricing.' }, { status: 500 })
    }
  }

  // ── Step 3: Upsert combo discounts ──
  const comboList = (comboDiscounts as Array<{
    id?: string | null
    min_processes: number
    discount_type: string
    discount_value: number | null
    label: string | null
  }> | undefined) ?? []

  // Delete existing combo discounts for this product
  const { error: deleteComboError } = await supabase
    .from('exp_product_combo_discounts')
    .delete()
    .eq('product_id', productId)

  if (deleteComboError) {
    console.error('[admin:catalog:process-types:put:deleteCombo]', deleteComboError.message)
    await writeAdminAuditLog({
      action: 'product_combo_discounts_update',
      entityType: 'product',
      entityId: productId,
      route: '/api/admin/catalog/process-types',
      request,
      status: 'failure',
      details: { error: deleteComboError.message },
    })
    return NextResponse.json({ error: 'Could not update combo discounts.' }, { status: 500 })
  }

  if (comboList.length > 0) {
    const comboRows = comboList.map((c) => ({
      product_id: productId,
      min_processes: c.min_processes,
      discount_type: c.discount_type,
      discount_value: c.discount_value ?? null,
      label: c.label ?? null,
      is_enabled: true,
    }))

    const { error: insertComboError } = await supabase
      .from('exp_product_combo_discounts')
      .insert(comboRows)

    if (insertComboError) {
      console.error('[admin:catalog:process-types:put:insertCombo]', insertComboError.message)
      await writeAdminAuditLog({
        action: 'product_combo_discounts_update',
        entityType: 'product',
        entityId: productId,
        route: '/api/admin/catalog/process-types',
        request,
        status: 'failure',
        details: { error: insertComboError.message },
      })
      return NextResponse.json({ error: 'Could not save combo discounts.' }, { status: 500 })
    }
  }

  await writeAdminAuditLog({
    action: 'product_process_types_update',
    entityType: 'product',
    entityId: productId,
    route: '/api/admin/catalog/process-types',
    request,
    status: 'success',
    details: { processTypes, comboDiscounts: comboList },
  })

  return NextResponse.json({
    ok: true,
    assigned: enabledKeys.map((r) => r.process_type_key),
  })
}