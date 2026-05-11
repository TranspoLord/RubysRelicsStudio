import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { processBackInStockAlerts } from '@/lib/back-in-stock'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { evaluateInventoryState, type InventoryAvailabilityOverride } from '@/lib/inventory/state'
import { getSupabaseAdmin } from '@/lib/supabase/client'

type AdjustmentReasonCode =
  | 'initial_set'
  | 'manual_correction'
  | 'restock'
  | 'damaged'
  | 'bulk_update'

const REASON_CODES: AdjustmentReasonCode[] = [
  'initial_set',
  'manual_correction',
  'restock',
  'damaged',
  'bulk_update',
]

const OVERRIDES: InventoryAvailabilityOverride[] = ['inherit', 'force_in_stock', 'force_out_of_stock']

interface InventoryBody {
  productId?: unknown
  availableQty?: unknown
  lowStockThreshold?: unknown
  isTrackInventory?: unknown
  availabilityOverride?: unknown
  deltaQty?: unknown
  reasonCode?: unknown
  note?: unknown
  adjustments?: unknown
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function asNumber(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function isReasonCode(value: unknown): value is AdjustmentReasonCode {
  return typeof value === 'string' && REASON_CODES.includes(value as AdjustmentReasonCode)
}

function isOverride(value: unknown): value is InventoryAvailabilityOverride {
  return typeof value === 'string' && OVERRIDES.includes(value as InventoryAvailabilityOverride)
}

function statusForRow(row: {
  available_qty: number
  low_stock_threshold: number
  availability_override: string
  is_track_inventory: boolean
}) {
  return evaluateInventoryState({
    available_qty: row.available_qty,
    low_stock_threshold: row.low_stock_threshold,
    availability_override: row.availability_override as InventoryAvailabilityOverride,
    is_track_inventory: row.is_track_inventory,
  })
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const url = new URL(request.url)
    const query = asString(url.searchParams.get('q'), 120).toLowerCase()

    const [productsResult, categoriesResult, inventoryResult] = await Promise.all([
      supabase
        .from('exp_products')
        .select('id, title, slug, category_key, is_active, is_archived, is_ready_made, sort_order')
        .eq('is_ready_made', true)
        .order('sort_order', { ascending: true }),

      supabase
        .from('exp_taxonomy')
        .select('key, display_name')
        .eq('type', 'category'),

      supabase
        .from('exp_product_inventory')
        .select('product_id, available_qty, low_stock_threshold, availability_override, is_track_inventory, updated_at'),
    ])

    if (productsResult.error) {
      console.error('[admin:inventory:get:products]', productsResult.error.message)
      return NextResponse.json({ error: 'Could not load inventory products.' }, { status: 500 })
    }

    if (categoriesResult.error) {
      console.error('[admin:inventory:get:categories]', categoriesResult.error.message)
      return NextResponse.json({ error: 'Could not load category data.' }, { status: 500 })
    }

    if (inventoryResult.error) {
      console.error('[admin:inventory:get:inventory]', inventoryResult.error.message)
      return NextResponse.json({ error: 'Could not load inventory records.' }, { status: 500 })
    }

    const categoryMap = new Map((categoriesResult.data ?? []).map((row) => [row.key, row.display_name]))
    const inventoryMap = new Map((inventoryResult.data ?? []).map((row) => [row.product_id, row]))

    const rows = (productsResult.data ?? [])
      .map((product) => {
        const inv = inventoryMap.get(product.id)
        const inventory = {
          available_qty: Number(inv?.available_qty ?? 0),
          low_stock_threshold: Number(inv?.low_stock_threshold ?? 3),
          availability_override: (inv?.availability_override ?? 'inherit') as InventoryAvailabilityOverride,
          is_track_inventory: Boolean(inv?.is_track_inventory ?? false),
          updated_at: inv?.updated_at ?? null,
        }

        const state = statusForRow(inventory)

        return {
          id: product.id,
          title: product.title,
          slug: product.slug,
          category_key: product.category_key,
          category_display_name: categoryMap.get(product.category_key) ?? product.category_key,
          is_active: product.is_active,
          is_archived: product.is_archived,
          sort_order: product.sort_order,
          ...inventory,
          is_in_stock: state.isInStock,
          is_low_stock: state.isLowStock,
          stock_status: state.status,
        }
      })
      .filter((row) => {
        if (!query) return true
        return (
          row.title.toLowerCase().includes(query) ||
          row.slug.toLowerCase().includes(query) ||
          row.category_display_name.toLowerCase().includes(query)
        )
      })

    return NextResponse.json({ products: rows }, { status: 200 })
  } catch (error) {
    console.error('[admin:inventory:get]', error)
    return NextResponse.json({ error: 'Could not load inventory module.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-inventory-write',
      maxRequests: 80,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as InventoryBody
    const productId = asString(body.productId, 64)
    const availableQtyRaw = asNumber(body.availableQty)
    const thresholdRaw = asNumber(body.lowStockThreshold)
    const override = body.availabilityOverride
    const isTrackInventory = asBoolean(body.isTrackInventory, false)

    if (!productId) {
      return NextResponse.json({ error: 'Product id is required.' }, { status: 400 })
    }

    if (availableQtyRaw === null || availableQtyRaw < 0 || !Number.isInteger(availableQtyRaw)) {
      return NextResponse.json({ error: 'Available quantity must be a non-negative integer.' }, { status: 400 })
    }

    if (thresholdRaw === null || thresholdRaw < 0 || !Number.isInteger(thresholdRaw)) {
      return NextResponse.json({ error: 'Low-stock threshold must be a non-negative integer.' }, { status: 400 })
    }

    if (!isOverride(override)) {
      return NextResponse.json({ error: 'Invalid availability override value.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: existing } = await supabase
      .from('exp_product_inventory')
      .select('id, available_qty, low_stock_threshold, availability_override, is_track_inventory')
      .eq('product_id', productId)
      .maybeSingle()

    const { data, error } = await supabase
      .from('exp_product_inventory')
      .upsert({
        product_id: productId,
        available_qty: Math.trunc(availableQtyRaw),
        low_stock_threshold: Math.trunc(thresholdRaw),
        availability_override: override,
        is_track_inventory: isTrackInventory,
        last_adjusted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'product_id' })
      .select('id, product_id, available_qty, low_stock_threshold, availability_override, is_track_inventory, updated_at')
      .single()

    if (error || !data) {
      console.error('[admin:inventory:post]', error?.message)
      await writeAdminAuditLog({
        action: 'inventory.config.upsert',
        entityType: 'product_inventory',
        entityId: null,
        route: '/api/admin/inventory',
        request,
        status: 'failure',
        details: { productId, message: error?.message ?? null },
      })
      return NextResponse.json({ error: 'Could not save inventory configuration.' }, { status: 500 })
    }

    await supabase.from('exp_inventory_adjustments').insert({
      inventory_id: data.id,
      product_id: productId,
      change_qty: Math.trunc(data.available_qty - Number(existing?.available_qty ?? 0)),
      quantity_before: existing?.available_qty ?? null,
      quantity_after: data.available_qty,
      reason_code: 'initial_set',
      note: 'Inventory configuration saved from admin panel.',
      adjusted_by: 'admin',
    })

    const wasInStock = existing
      ? statusForRow({
          available_qty: Number(existing.available_qty ?? 0),
          low_stock_threshold: Number(existing.low_stock_threshold ?? 3),
          availability_override: (existing.availability_override ?? 'inherit') as string,
          is_track_inventory: Boolean(existing.is_track_inventory ?? false),
        }).isInStock
      : false

    const nowInStock = statusForRow({
      available_qty: Number(data.available_qty ?? 0),
      low_stock_threshold: Number(data.low_stock_threshold ?? 3),
      availability_override: (data.availability_override ?? 'inherit') as string,
      is_track_inventory: Boolean(data.is_track_inventory ?? false),
    }).isInStock

    if (!wasInStock && nowInStock) {
      await processBackInStockAlerts({ productIds: [productId], limit: 100 })
    }

    await writeAdminAuditLog({
      action: 'inventory.config.upsert',
      entityType: 'product_inventory',
      entityId: data.id,
      route: '/api/admin/inventory',
      request,
      status: 'success',
      details: {
        productId,
        available_qty: data.available_qty,
        low_stock_threshold: data.low_stock_threshold,
        availability_override: data.availability_override,
        is_track_inventory: data.is_track_inventory,
      },
    })

    return NextResponse.json({ inventory: data }, { status: 200 })
  } catch (error) {
    console.error('[admin:inventory:post]', error)
    return NextResponse.json({ error: 'Could not save inventory configuration.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-inventory-write',
      maxRequests: 80,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as InventoryBody
    const productId = asString(body.productId, 64)
    const deltaQtyRaw = asNumber(body.deltaQty)
    const reason = body.reasonCode
    const note = asString(body.note, 400)

    if (!productId) {
      return NextResponse.json({ error: 'Product id is required.' }, { status: 400 })
    }

    if (deltaQtyRaw === null || !Number.isInteger(deltaQtyRaw) || deltaQtyRaw === 0) {
      return NextResponse.json({ error: 'Delta quantity must be a non-zero integer.' }, { status: 400 })
    }

    if (!isReasonCode(reason) || reason === 'bulk_update') {
      return NextResponse.json({ error: 'Invalid reason code for single adjustment.' }, { status: 400 })
    }

    const deltaQty = Math.trunc(deltaQtyRaw)
    const supabase = getSupabaseAdmin()

    let { data: row, error: rowError } = await supabase
      .from('exp_product_inventory')
      .select('id, product_id, available_qty, low_stock_threshold, availability_override, is_track_inventory')
      .eq('product_id', productId)
      .maybeSingle()

    if (rowError) {
      console.error('[admin:inventory:put:load]', rowError.message)
      return NextResponse.json({ error: 'Could not load inventory row.' }, { status: 500 })
    }

    if (!row) {
      const { data: created, error: createError } = await supabase
        .from('exp_product_inventory')
        .insert({
          product_id: productId,
          available_qty: 0,
          low_stock_threshold: 3,
          availability_override: 'inherit',
          is_track_inventory: true,
          last_adjusted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id, product_id, available_qty, low_stock_threshold, availability_override, is_track_inventory')
        .single()

      if (createError || !created) {
        console.error('[admin:inventory:put:create]', createError?.message)
        return NextResponse.json({ error: 'Could not initialize inventory row.' }, { status: 500 })
      }

      row = created
    }

    const nextQty = row.available_qty + deltaQty
    if (nextQty < 0) {
      return NextResponse.json({ error: 'Adjustment would reduce available quantity below zero.' }, { status: 400 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('exp_product_inventory')
      .update({
        available_qty: nextQty,
        last_adjusted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select('id, product_id, available_qty, low_stock_threshold, availability_override, is_track_inventory, updated_at')
      .single()

    if (updateError || !updated) {
      console.error('[admin:inventory:put:update]', updateError?.message)
      return NextResponse.json({ error: 'Could not adjust inventory quantity.' }, { status: 500 })
    }

    await supabase.from('exp_inventory_adjustments').insert({
      inventory_id: row.id,
      product_id: productId,
      change_qty: deltaQty,
      quantity_before: row.available_qty,
      quantity_after: nextQty,
      reason_code: reason,
      note: note.length > 0 ? note : null,
      adjusted_by: 'admin',
    })

    const wasInStock = statusForRow({
      available_qty: Number(row.available_qty ?? 0),
      low_stock_threshold: Number(row.low_stock_threshold ?? 3),
      availability_override: (row.availability_override ?? 'inherit') as string,
      is_track_inventory: Boolean(row.is_track_inventory ?? false),
    }).isInStock

    const nowInStock = statusForRow({
      available_qty: Number(updated.available_qty ?? 0),
      low_stock_threshold: Number(updated.low_stock_threshold ?? 3),
      availability_override: (updated.availability_override ?? 'inherit') as string,
      is_track_inventory: Boolean(updated.is_track_inventory ?? false),
    }).isInStock

    if (!wasInStock && nowInStock) {
      await processBackInStockAlerts({ productIds: [productId], limit: 100 })
    }

    await writeAdminAuditLog({
      action: 'inventory.quantity.adjust',
      entityType: 'product_inventory',
      entityId: row.id,
      route: '/api/admin/inventory',
      request,
      status: 'success',
      details: { productId, delta_qty: deltaQty, quantity_before: row.available_qty, quantity_after: nextQty, reason },
    })

    return NextResponse.json({ inventory: updated }, { status: 200 })
  } catch (error) {
    console.error('[admin:inventory:put]', error)
    return NextResponse.json({ error: 'Could not adjust inventory quantity.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-inventory-write',
      maxRequests: 80,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as InventoryBody
    const reason = body.reasonCode
    const note = asString(body.note, 400)

    if (!isReasonCode(reason)) {
      return NextResponse.json({ error: 'Invalid reason code.' }, { status: 400 })
    }

    const adjustments = Array.isArray(body.adjustments)
      ? (body.adjustments as Array<{ productId?: unknown; deltaQty?: unknown }>)
          .map((row) => ({
            productId: asString(row.productId, 64),
            deltaQty: asNumber(row.deltaQty),
          }))
          .filter((row) => row.productId.length > 0 && row.deltaQty !== null && Number.isInteger(row.deltaQty))
      : []

    if (adjustments.length === 0) {
      return NextResponse.json({ error: 'At least one adjustment is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const results: Array<{ productId: string; ok: boolean; error?: string }> = []
    const restockedProductIds = new Set<string>()

    for (const item of adjustments) {
      const deltaQty = Math.trunc(Number(item.deltaQty))
      if (deltaQty === 0) {
        results.push({ productId: item.productId, ok: false, error: 'Delta must be non-zero.' })
        continue
      }

      let { data: row } = await supabase
        .from('exp_product_inventory')
        .select('id, available_qty, low_stock_threshold, availability_override, is_track_inventory')
        .eq('product_id', item.productId)
        .maybeSingle()

      if (!row) {
        const { data: created } = await supabase
          .from('exp_product_inventory')
          .insert({
            product_id: item.productId,
            available_qty: 0,
            low_stock_threshold: 3,
            availability_override: 'inherit',
            is_track_inventory: true,
            last_adjusted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id, available_qty, low_stock_threshold, availability_override, is_track_inventory')
          .single()
        row = created ?? null
      }

      if (!row) {
        results.push({ productId: item.productId, ok: false, error: 'Could not initialize row.' })
        continue
      }

      const nextQty = row.available_qty + deltaQty
      if (nextQty < 0) {
        results.push({ productId: item.productId, ok: false, error: 'Adjustment would go below zero.' })
        continue
      }

      const wasInStock = statusForRow({
        available_qty: Number(row.available_qty ?? 0),
        low_stock_threshold: Number(row.low_stock_threshold ?? 3),
        availability_override: (row.availability_override ?? 'inherit') as string,
        is_track_inventory: Boolean(row.is_track_inventory ?? false),
      }).isInStock

      const { error: updateError } = await supabase
        .from('exp_product_inventory')
        .update({
          available_qty: nextQty,
          last_adjusted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)

      if (updateError) {
        results.push({ productId: item.productId, ok: false, error: updateError.message })
        continue
      }

      await supabase.from('exp_inventory_adjustments').insert({
        inventory_id: row.id,
        product_id: item.productId,
        change_qty: deltaQty,
        quantity_before: row.available_qty,
        quantity_after: nextQty,
        reason_code: reason === 'bulk_update' ? reason : 'bulk_update',
        note: note.length > 0 ? note : null,
        adjusted_by: 'admin',
      })

      const nowInStock = statusForRow({
        available_qty: nextQty,
        low_stock_threshold: Number(row.low_stock_threshold ?? 3),
        availability_override: (row.availability_override ?? 'inherit') as string,
        is_track_inventory: Boolean(row.is_track_inventory ?? false),
      }).isInStock

      if (!wasInStock && nowInStock) {
        restockedProductIds.add(item.productId)
      }

      results.push({ productId: item.productId, ok: true })
    }

    if (restockedProductIds.size > 0) {
      await processBackInStockAlerts({ productIds: [...restockedProductIds], limit: 200 })
    }

    await writeAdminAuditLog({
      action: 'inventory.bulk.adjust',
      entityType: 'product_inventory',
      route: '/api/admin/inventory',
      request,
      status: results.every((r) => r.ok) ? 'success' : 'failure',
      details: { reason, total: results.length, ok: results.filter((r) => r.ok).length },
    })

    return NextResponse.json({ results }, { status: 200 })
  } catch (error) {
    console.error('[admin:inventory:patch]', error)
    return NextResponse.json({ error: 'Could not perform bulk adjustment.' }, { status: 500 })
  }
}
