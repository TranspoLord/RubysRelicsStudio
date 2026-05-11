import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import {
  computeCanonicalLine,
  findMatchingBulkTier,
  type PricingContext,
  type PricingSelectedOption,
} from '@/lib/pricing/engine'

interface PricingPreviewBody {
  productId?: unknown
  quantity?: unknown
  variantId?: unknown
  options?: unknown
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function asNullableString(value: unknown, maxLen: number): string | null {
  const s = asString(value, maxLen)
  return s.length > 0 ? s : null
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as PricingPreviewBody
    const productId = asString(body.productId, 64)
    const variantId = asNullableString(body.variantId, 64)
    const quantityRaw = Number(body.quantity)
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.trunc(quantityRaw) : 1

    const rawOptions = Array.isArray(body.options)
      ? (body.options as Array<{ key?: unknown; value?: unknown }>)
          .map((opt) => ({
            key: asString(opt.key, 80),
            value: asString(opt.value, 160),
          }))
          .filter((opt): opt is PricingSelectedOption => opt.key.length > 0 && opt.value.length > 0)
      : []

    if (!productId) {
      return NextResponse.json({ error: 'Product id is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const [productResult, variantResult, optionResult, bulkResult] = await Promise.all([
      supabase
        .from('exp_products')
        .select('id, title, is_active, is_archived, base_price')
        .eq('id', productId)
        .single(),

      supabase
        .from('exp_product_variants')
        .select('id, label, price_delta, is_enabled')
        .eq('product_id', productId),

      supabase
        .from('exp_product_options')
        .select(`
          option_key, label, option_type, is_required,
          values:exp_product_option_values (label, value, price_delta, is_enabled)
        `)
        .eq('product_id', productId),

      supabase
        .from('exp_product_bulk_discounts')
        .select('min_qty, max_qty, discount_type, discount_value, label, sort_order, is_enabled')
        .eq('product_id', productId),
    ])

    if (productResult.error || !productResult.data) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
    }

    const context: PricingContext = {
      ...productResult.data,
      variants: variantResult.data ?? [],
      options: (optionResult.data ?? []).map((opt) => ({
        ...opt,
        values: (opt.values ?? []).filter((v) => v.is_enabled),
      })),
      bulk_discounts: bulkResult.data ?? [],
    }

    const result = computeCanonicalLine(context, quantity, variantId, rawOptions)

    if (!result) {
      return NextResponse.json(
        {
          error:
            'Pricing could not be computed. The product may be inactive, the variant invalid, or a required option is missing.',
        },
        { status: 422 }
      )
    }

    const allTiers = context.bulk_discounts
      .filter((t) => t.is_enabled)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((tier) => ({
        ...tier,
        matches: findMatchingBulkTier([tier], quantity) !== null,
        previewDiscount: (() => {
          const sub = result.unitPriceBeforeDiscount * quantity
          if (tier.discount_type === 'percent') return sub * (tier.discount_value / 100)
          if (tier.discount_type === 'fixed_amount') return tier.discount_value * quantity
          if (tier.discount_type === 'unit_price')
            return Math.max(0, (result.unitPriceBeforeDiscount - tier.discount_value) * quantity)
          return 0
        })(),
      }))

    return NextResponse.json(
      {
        productId: result.productId,
        name: result.name,
        quantity,
        variantId: result.variantId,
        variantLabel: result.variantLabel,
        selectedOptions: result.selectedOptions,
        unitPriceBeforeDiscount: result.unitPriceBeforeDiscount,
        lineSubtotal: result.lineSubtotal,
        lineDiscount: result.lineDiscount,
        lineTotal: result.lineTotal,
        unitAmountCents: result.unitAmountCents,
        appliedTierLabel: result.appliedTier?.label ?? null,
        appliedTierType: result.appliedTier?.discount_type ?? null,
        appliedTierValue: result.appliedTier?.discount_value ?? null,
        description: result.description,
        allTiers,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[admin:catalog:pricing-preview:post]', error)
    return NextResponse.json({ error: 'Could not compute pricing preview.' }, { status: 500 })
  }
}
