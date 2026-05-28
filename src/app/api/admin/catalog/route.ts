import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import {
  getCategoryOptionTemplate,
  normalizeOptionKey,
  type OptionBlueprint,
  type ProductOptionType,
} from '@/lib/catalog/option-templates'
import { getSupabaseAdmin } from '@/lib/supabase/client'

type CatalogAction = 'archive' | 'restore' | 'publish' | 'deactivate'

interface CatalogActionBody {
  productId?: unknown
  action?: unknown
  confirmAction?: unknown
}

interface CatalogUpsertBody {
  productId?: unknown
  title?: unknown
  slug?: unknown
  category_key?: unknown
  base_price?: unknown
  sort_order?: unknown
  production_estimate_band?: unknown
  short_description?: unknown
  description?: unknown
  is_ready_made?: unknown
  is_customizable?: unknown
  apply_category_template?: unknown
  option_blueprint?: unknown
}

interface OptionValueInsert {
  label: string
  value: string
  price_delta: number
  is_enabled: boolean
  sort_order: number
}

interface OptionInsert {
  option_key: string
  label: string
  option_type: ProductOptionType
  placeholder: string | null
  help_text: string | null
  is_required: boolean
  sort_order: number
  values: OptionValueInsert[]
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function isCatalogAction(value: string): value is CatalogAction {
  return value === 'archive' || value === 'restore' || value === 'publish' || value === 'deactivate'
}

function normalizeStatusFilter(value: string): 'all' | 'active' | 'inactive' | 'archived' {
  if (value === 'active' || value === 'inactive' || value === 'archived') return value
  return 'all'
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

function asNumber(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n
}

function asOptionalString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, maxLen)
  return trimmed.length > 0 ? trimmed : null
}

function isOptionType(value: unknown): value is ProductOptionType {
  return value === 'select' || value === 'text' || value === 'textarea' || value === 'file' || value === 'checkbox' || value === 'number'
}

function parseOptionBlueprint(input: unknown): OptionInsert[] {
  if (!Array.isArray(input)) return []

  const parsed: OptionInsert[] = []

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as OptionBlueprint
    const optionType = isOptionType(row.option_type) ? row.option_type : null
    const optionKey = normalizeOptionKey(asString(row.option_key, 80))
    const label = asString(row.label, 120)
    const sortOrder = asNumber(row.sort_order)

    if (!optionType || optionKey.length < 2 || label.length < 2) continue

    const values: OptionValueInsert[] = Array.isArray(row.values)
      ? row.values
          .map((value, index) => {
            const valueLabel = asString(value?.label, 120)
            const valueRaw = asString(value?.value, 120)
            const valueSort = asNumber(value?.sort_order)
            const valueDelta = asNumber(value?.price_delta)
            if (!valueLabel || !valueRaw) return null
            return {
              label: valueLabel,
              value: valueRaw,
              sort_order: valueSort === null ? index + 1 : Math.trunc(valueSort),
              price_delta: valueDelta === null ? 0 : Math.round(valueDelta * 100) / 100,
              is_enabled: asBoolean(value?.is_enabled, true),
            }
          })
          .filter((value): value is OptionValueInsert => value !== null)
      : []

    parsed.push({
      option_key: optionKey,
      label,
      option_type: optionType,
      placeholder: optionType === 'select' || optionType === 'checkbox' ? null : asOptionalString(row.placeholder, 180),
      help_text: asOptionalString(row.help_text, 500),
      is_required: asBoolean(row.is_required, false),
      sort_order: sortOrder === null ? parsed.length + 1 : Math.trunc(sortOrder),
      values,
    })
  }

  return parsed
}

function mergeOptionBlueprints(template: OptionInsert[], custom: OptionInsert[]): OptionInsert[] {
  const byKey = new Map<string, OptionInsert>()

  for (const option of template) {
    byKey.set(option.option_key, option)
  }

  for (const option of custom) {
    byKey.set(option.option_key, option)
  }

  return Array.from(byKey.values()).sort((a, b) => a.sort_order - b.sort_order)
}

function isValidSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
}

async function validatePublishChecklist(productId: string): Promise<{ ok: boolean; errors: string[] }> {
  const supabase = getSupabaseAdmin()
  const errors: string[] = []

  const { data: product, error: productError } = await supabase
    .from('exp_products')
    .select(
      'id, title, slug, category_key, base_price, production_estimate_band, is_ready_made, is_customizable'
    )
    .eq('id', productId)
    .single()

  if (productError || !product) {
    return { ok: false, errors: ['Product could not be found for publish validation.'] }
  }

  if (!product.title || product.title.trim().length < 2) {
    errors.push('Product title must be at least 2 characters.')
  }

  if (!product.slug || !isValidSlug(product.slug)) {
    errors.push('Product slug must be lowercase-hyphen format.')
  }

  if (!product.category_key) {
    errors.push('Product category is required.')
  }

  if (typeof product.base_price !== 'number' || product.base_price < 0) {
    errors.push('Product base price must be zero or higher.')
  }

  if (!product.production_estimate_band || product.production_estimate_band.trim().length < 3) {
    errors.push('Production estimate band is required.')
  }

  const { data: mediaRows, error: mediaError } = await supabase
    .from('exp_product_media')
    .select('id, is_featured')
    .eq('product_id', productId)

  if (mediaError) {
    errors.push('Product media could not be validated.')
  } else {
    const mediaCount = (mediaRows ?? []).length
    const featuredCount = (mediaRows ?? []).filter((row) => row.is_featured).length

    if (mediaCount < 1) {
      errors.push('At least one media item is required before publishing.')
    }
    if (featuredCount < 1) {
      errors.push('At least one featured media item is required before publishing.')
    }
  }

  if (product.is_ready_made) {
    const { data: enabledVariants, error: variantError } = await supabase
      .from('exp_product_variants')
      .select('id')
      .eq('product_id', productId)
      .eq('is_enabled', true)
      .limit(1)

    if (variantError) {
      errors.push('Product variants could not be validated.')
    } else if ((enabledVariants ?? []).length < 1) {
      errors.push('Ready-made products require at least one enabled variant before publishing.')
    }
  }

  if (product.is_customizable) {
    const { data: optionRows, error: optionError } = await supabase
      .from('exp_product_options')
      .select('id, option_type')
      .eq('product_id', productId)

    if (optionError) {
      errors.push('Product options could not be validated.')
    } else {
      if ((optionRows ?? []).length < 1) {
        errors.push('Customizable products require at least one product option before publishing.')
      }

      const selectOptionIds = (optionRows ?? [])
        .filter((row) => row.option_type === 'select')
        .map((row) => row.id)

      if (selectOptionIds.length > 0) {
        const { data: valueRows, error: valueError } = await supabase
          .from('exp_product_option_values')
          .select('id, option_id, is_enabled')
          .in('option_id', selectOptionIds)

        if (valueError) {
          errors.push('Select option values could not be validated.')
        } else {
          const enabledCounts = new Map<string, number>()
          for (const value of valueRows ?? []) {
            if (!value.is_enabled) continue
            enabledCounts.set(value.option_id, (enabledCounts.get(value.option_id) ?? 0) + 1)
          }

          for (const optionId of selectOptionIds) {
            if ((enabledCounts.get(optionId) ?? 0) < 1) {
              errors.push('Every select option must have at least one enabled option value before publishing.')
              break
            }
          }
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const url = new URL(request.url)
    const query = asString(url.searchParams.get('q'), 80)
    const status = normalizeStatusFilter(asString(url.searchParams.get('status'), 20))
    const categoryKey = asString(url.searchParams.get('category'), 120)

    const supabase = getSupabaseAdmin()
    const { data: categoryRows, error: categoryError } = await supabase
      .from('exp_taxonomy')
      .select('key, display_name')
      .eq('type', 'category')
      .order('sort_order', { ascending: true })

    if (categoryError) {
      console.error('[admin:catalog:get:categories]', categoryError.message)
    }

    let builder = supabase
      .from('exp_products')
      .select(
        `
          id,
          title,
          slug,
          short_description,
          description,
          category_key,
          base_price,
          is_ready_made,
          is_customizable,
          is_active,
          is_archived,
          sort_order,
          production_estimate_band,
          updated_at,
          exp_taxonomy!category_key (display_name, slug)
        `
      )
      .order('updated_at', { ascending: false })
      .limit(120)

    if (query.length > 0) {
      builder = builder.or(`title.ilike.%${query}%,slug.ilike.%${query}%`)
    }

    if (status === 'active') {
      builder = builder.eq('is_archived', false).eq('is_active', true)
    } else if (status === 'inactive') {
      builder = builder.eq('is_archived', false).eq('is_active', false)
    } else if (status === 'archived') {
      builder = builder.eq('is_archived', true)
    }

    if (categoryKey.length > 0) {
      builder = builder.eq('category_key', categoryKey)
    }

    const { data, error } = await builder

    if (error) {
      console.error('[admin:catalog:get]', error.message)
      return NextResponse.json({ error: 'Could not load catalog products.' }, { status: 500 })
    }

    const products = (data ?? []).map((row) => {
      const category = Array.isArray(row.exp_taxonomy) ? row.exp_taxonomy[0] : row.exp_taxonomy
      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        short_description: row.short_description,
        description: row.description,
        category_key: row.category_key,
        category_display_name: category?.display_name ?? row.category_key,
        base_price: row.base_price,
        is_ready_made: row.is_ready_made,
        is_customizable: row.is_customizable,
        is_active: row.is_active,
        is_archived: row.is_archived,
        sort_order: row.sort_order,
        production_estimate_band: row.production_estimate_band,
        updated_at: row.updated_at,
      }
    })

    const categories = (categoryRows ?? []).map((row) => ({
      key: row.key,
      display_name: row.display_name,
    }))

    return NextResponse.json({ products, categories }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:get]', error)
    return NextResponse.json({ error: 'Could not load catalog products.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-write',
      maxRequests: 40,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as CatalogActionBody
    const productId = asString(body.productId, 64)
    const action = asString(body.action, 40)
    const confirmAction = asString(body.confirmAction, 40)

    if (!productId || !isCatalogAction(action)) {
      await writeAdminAuditLog({
        action: 'catalog.update',
        entityType: 'product',
        entityId: productId || null,
        route: '/api/admin/catalog',
        request,
        status: 'failure',
        details: { reason: 'invalid_payload' },
      })
      return NextResponse.json({ error: 'Invalid catalog action payload.' }, { status: 400 })
    }

    if (action === 'archive' && confirmAction !== 'archive') {
      await writeAdminAuditLog({
        action: 'catalog.archive',
        entityType: 'product',
        entityId: productId,
        route: '/api/admin/catalog',
        request,
        status: 'failure',
        details: { reason: 'missing_confirmation_contract' },
      })
      return NextResponse.json({ error: 'Missing destructive action confirmation.' }, { status: 400 })
    }

    if (action === 'publish') {
      const checklist = await validatePublishChecklist(productId)
      if (!checklist.ok) {
        await writeAdminAuditLog({
          action: 'catalog.publish',
          entityType: 'product',
          entityId: productId,
          route: '/api/admin/catalog',
          request,
          status: 'failure',
          details: {
            reason: 'publish_checklist_failed',
            checklistErrors: checklist.errors,
          },
        })
        return NextResponse.json(
          {
            error: 'Publish checklist failed. Resolve required product configuration before publishing.',
            checklistErrors: checklist.errors,
          },
          { status: 400 }
        )
      }
    }

    const supabase = getSupabaseAdmin()
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (action === 'archive') {
      update.is_archived = true
      update.is_active = false
    } else if (action === 'restore') {
      update.is_archived = false
      update.is_active = false
    } else if (action === 'publish') {
      update.is_archived = false
      update.is_active = true
    } else if (action === 'deactivate') {
      update.is_active = false
      update.is_archived = false
    }

    const { data, error } = await supabase
      .from('exp_products')
      .update(update)
      .eq('id', productId)
      .select('id, title, slug, is_active, is_archived, updated_at')
      .single()

    if (error || !data) {
      console.error('[admin:catalog:patch]', error?.message)
      await writeAdminAuditLog({
        action: `catalog.${action}`,
        entityType: 'product',
        entityId: productId,
        route: '/api/admin/catalog',
        request,
        status: 'failure',
        details: { reason: 'update_failed', message: error?.message ?? null },
      })
      return NextResponse.json({ error: 'Could not update product state.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: `catalog.${action}`,
      entityType: 'product',
      entityId: productId,
      route: '/api/admin/catalog',
      request,
      status: 'success',
      details: {
        productSlug: data.slug,
        is_active: data.is_active,
        is_archived: data.is_archived,
      },
    })

    return NextResponse.json({ product: data }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:patch]', error)
    await writeAdminAuditLog({
      action: 'catalog.update',
      entityType: 'product',
      route: '/api/admin/catalog',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not update product state.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-write',
      maxRequests: 40,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as CatalogUpsertBody
    const title = asString(body.title, 180)
    const slugInput = asString(body.slug, 180)
    const slug = toSlug(slugInput)
    const categoryKey = asString(body.category_key, 120)
    const basePriceRaw = asNumber(body.base_price)
    const sortOrderRaw = asNumber(body.sort_order)
    const productionEstimateBand = asString(body.production_estimate_band, 120)
    const shortDescription = asString(body.short_description, 300)
    const description = asString(body.description, 6000)
    const isReadyMade = asBoolean(body.is_ready_made, false)
    const isCustomizable = asBoolean(body.is_customizable, true)
    const applyCategoryTemplate = asBoolean(body.apply_category_template, true)

    if (!title || title.length < 2) {
      return NextResponse.json({ error: 'Product title must be at least 2 characters.' }, { status: 400 })
    }

    if (!slug || !isValidSlug(slug)) {
      return NextResponse.json({ error: 'Slug must contain lowercase letters, numbers, and hyphens only.' }, { status: 400 })
    }

    if (!categoryKey) {
      return NextResponse.json({ error: 'Category is required.' }, { status: 400 })
    }

    if (basePriceRaw === null || basePriceRaw < 0 || basePriceRaw > 1000000) {
      return NextResponse.json({ error: 'Base price must be between 0 and 1,000,000.' }, { status: 400 })
    }

    if (sortOrderRaw === null || sortOrderRaw < -10000 || sortOrderRaw > 10000) {
      return NextResponse.json({ error: 'Sort order must be between -10000 and 10000.' }, { status: 400 })
    }

    if (!productionEstimateBand || productionEstimateBand.length < 3) {
      return NextResponse.json({ error: 'Production estimate band is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: categoryRow, error: categoryError } = await supabase
      .from('exp_taxonomy')
      .select('key')
      .eq('key', categoryKey)
      .eq('type', 'category')
      .single()

    if (categoryError || !categoryRow) {
      return NextResponse.json({ error: 'Selected category is not valid.' }, { status: 400 })
    }

    const { data: duplicateSlug, error: duplicateSlugError } = await supabase
      .from('exp_products')
      .select('id')
      .eq('slug', slug)
      .single()

    if (duplicateSlugError && duplicateSlugError.code !== 'PGRST116') {
      console.error('[admin:catalog:post:slug-check]', duplicateSlugError.message)
      return NextResponse.json({ error: 'Could not validate product slug.' }, { status: 500 })
    }

    if (duplicateSlug) {
      return NextResponse.json({ error: 'Slug is already in use by another product.' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('exp_products')
      .insert({
        title,
        slug,
        short_description: shortDescription,
        description,
        category_key: categoryKey,
        base_price: Math.round(basePriceRaw * 100) / 100,
        sort_order: Math.trunc(sortOrderRaw),
        production_estimate_band: productionEstimateBand,
        is_ready_made: isReadyMade,
        is_customizable: isCustomizable,
        is_active: false,
        is_archived: false,
        updated_at: new Date().toISOString(),
      })
      .select('id, title, slug, is_active, is_archived')
      .single()

    if (error || !data) {
      console.error('[admin:catalog:post]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.create',
        entityType: 'product',
        route: '/api/admin/catalog',
        request,
        status: 'failure',
        details: { reason: 'insert_failed', message: error?.message ?? null },
      })
      return NextResponse.json({ error: 'Could not create product.' }, { status: 500 })
    }

    const templateOptions = applyCategoryTemplate
      ? parseOptionBlueprint(getCategoryOptionTemplate(categoryKey))
      : []
    const customOptions = parseOptionBlueprint(body.option_blueprint)
    const optionRows = mergeOptionBlueprints(templateOptions, customOptions)

    if (optionRows.length > 0) {
      const optionPayload = optionRows.map((option) => ({
        product_id: data.id,
        option_key: option.option_key,
        label: option.label,
        option_type: option.option_type,
        placeholder: option.placeholder,
        help_text: option.help_text,
        is_required: option.is_required,
        sort_order: option.sort_order,
      }))

      const { data: insertedOptions, error: optionError } = await supabase
        .from('exp_product_options')
        .insert(optionPayload)
        .select('id, option_key')

      if (optionError || !insertedOptions) {
        console.error('[admin:catalog:post:options]', optionError?.message)
        await supabase.from('exp_products').delete().eq('id', data.id)
        return NextResponse.json({ error: 'Product was created but add-ons failed. Please retry.' }, { status: 500 })
      }

      const optionIdByKey = new Map(insertedOptions.map((option) => [option.option_key, option.id]))
      const valuePayload = optionRows.flatMap((option) => {
        const optionId = optionIdByKey.get(option.option_key)
        if (!optionId || option.values.length === 0) return []
        return option.values.map((value) => ({
          option_id: optionId,
          label: value.label,
          value: value.value,
          price_delta: value.price_delta,
          is_enabled: value.is_enabled,
          sort_order: value.sort_order,
        }))
      })

      if (valuePayload.length > 0) {
        const { error: valueError } = await supabase
          .from('exp_product_option_values')
          .insert(valuePayload)

        if (valueError) {
          console.error('[admin:catalog:post:option-values]', valueError.message)
          await supabase.from('exp_products').delete().eq('id', data.id)
          return NextResponse.json({ error: 'Product add-on values failed to save. Please retry.' }, { status: 500 })
        }
      }
    }

    await writeAdminAuditLog({
      action: 'catalog.create',
      entityType: 'product',
      entityId: data.id,
      route: '/api/admin/catalog',
      request,
      status: 'success',
      details: {
        slug: data.slug,
        is_active: data.is_active,
        applied_category_template: applyCategoryTemplate,
        option_count: optionRows.length,
      },
    })

    return NextResponse.json({ product: data }, { status: 201 })
  } catch (error) {
    console.error('[admin:catalog:post]', error)
    await writeAdminAuditLog({
      action: 'catalog.create',
      entityType: 'product',
      route: '/api/admin/catalog',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not create product.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-write',
      maxRequests: 40,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as CatalogUpsertBody
    const productId = asString(body.productId, 64)
    const title = asString(body.title, 180)
    const slugInput = asString(body.slug, 180)
    const slug = toSlug(slugInput)
    const categoryKey = asString(body.category_key, 120)
    const basePriceRaw = asNumber(body.base_price)
    const sortOrderRaw = asNumber(body.sort_order)
    const productionEstimateBand = asString(body.production_estimate_band, 120)
    const shortDescription = asString(body.short_description, 300)
    const description = asString(body.description, 6000)
    const isReadyMade = asBoolean(body.is_ready_made, false)
    const isCustomizable = asBoolean(body.is_customizable, true)

    if (!productId) {
      return NextResponse.json({ error: 'Product id is required for update.' }, { status: 400 })
    }

    if (!title || title.length < 2) {
      return NextResponse.json({ error: 'Product title must be at least 2 characters.' }, { status: 400 })
    }

    if (!slug || !isValidSlug(slug)) {
      return NextResponse.json({ error: 'Slug must contain lowercase letters, numbers, and hyphens only.' }, { status: 400 })
    }

    if (!categoryKey) {
      return NextResponse.json({ error: 'Category is required.' }, { status: 400 })
    }

    if (basePriceRaw === null || basePriceRaw < 0 || basePriceRaw > 1000000) {
      return NextResponse.json({ error: 'Base price must be between 0 and 1,000,000.' }, { status: 400 })
    }

    if (sortOrderRaw === null || sortOrderRaw < -10000 || sortOrderRaw > 10000) {
      return NextResponse.json({ error: 'Sort order must be between -10000 and 10000.' }, { status: 400 })
    }

    if (!productionEstimateBand || productionEstimateBand.length < 3) {
      return NextResponse.json({ error: 'Production estimate band is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: categoryRow, error: categoryError } = await supabase
      .from('exp_taxonomy')
      .select('key')
      .eq('key', categoryKey)
      .eq('type', 'category')
      .single()

    if (categoryError || !categoryRow) {
      return NextResponse.json({ error: 'Selected category is not valid.' }, { status: 400 })
    }

    const { data: duplicateSlugRows, error: duplicateSlugError } = await supabase
      .from('exp_products')
      .select('id')
      .eq('slug', slug)
      .neq('id', productId)
      .limit(1)

    if (duplicateSlugError) {
      console.error('[admin:catalog:put:slug-check]', duplicateSlugError.message)
      return NextResponse.json({ error: 'Could not validate product slug.' }, { status: 500 })
    }

    if ((duplicateSlugRows ?? []).length > 0) {
      return NextResponse.json({ error: 'Slug is already in use by another product.' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('exp_products')
      .update({
        title,
        slug,
        short_description: shortDescription,
        description,
        category_key: categoryKey,
        base_price: Math.round(basePriceRaw * 100) / 100,
        sort_order: Math.trunc(sortOrderRaw),
        production_estimate_band: productionEstimateBand,
        is_ready_made: isReadyMade,
        is_customizable: isCustomizable,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId)
      .select('id, title, slug, is_active, is_archived')
      .single()

    if (error || !data) {
      console.error('[admin:catalog:put]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.edit',
        entityType: 'product',
        entityId: productId,
        route: '/api/admin/catalog',
        request,
        status: 'failure',
        details: { reason: 'update_failed', message: error?.message ?? null },
      })
      return NextResponse.json({ error: 'Could not update product.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.edit',
      entityType: 'product',
      entityId: productId,
      route: '/api/admin/catalog',
      request,
      status: 'success',
      details: { slug: data.slug, is_active: data.is_active, is_archived: data.is_archived },
    })

    return NextResponse.json({ product: data }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:put]', error)
    await writeAdminAuditLog({
      action: 'catalog.edit',
      entityType: 'product',
      route: '/api/admin/catalog',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not update product.' }, { status: 500 })
  }
}