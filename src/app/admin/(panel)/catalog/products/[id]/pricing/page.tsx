'use client'

import { use, useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

interface ProductPricing {
  id: string
  title: string
  slug: string
  category_key: string
  base_price: number
  sort_order: number
  production_estimate_band: string
  short_description: string
  description: string
  is_ready_made: boolean
  is_customizable: boolean
}

interface BulkDiscountRow {
  id: string
  min_qty: number
  max_qty: number | null
  discount_type: 'percent' | 'fixed_amount' | 'unit_price'
  discount_value: number
  label: string | null
  is_enabled: boolean
  sort_order: number
}

interface ProductVariantRow {
  id: string
  product_id: string
  label: string
  sku: string | null
  price_delta: number
  capacity_weight: number | null
  is_enabled: boolean
  sort_order: number
}

const DISCOUNT_TYPE_CHOICES: Array<BulkDiscountRow['discount_type']> = [
  'percent',
  'fixed_amount',
  'unit_price',
]

export default function ProductPricingEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: productId } = use(params)
  const [product, setProduct] = useState<ProductPricing | null>(null)
  const [basePrice, setBasePrice] = useState('0')
  const [discounts, setDiscounts] = useState<BulkDiscountRow[]>([])
  const [variants, setVariants] = useState<ProductVariantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [minQty, setMinQty] = useState('1')
  const [maxQty, setMaxQty] = useState('')
  const [discountType, setDiscountType] = useState<BulkDiscountRow['discount_type']>('percent')
  const [discountValue, setDiscountValue] = useState('10')
  const [label, setLabel] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [variantLabel, setVariantLabel] = useState('')
  const [variantSku, setVariantSku] = useState('')
  const [variantPriceDelta, setVariantPriceDelta] = useState('0')
  const [variantWeight, setVariantWeight] = useState('')
  const [variantSortOrder, setVariantSortOrder] = useState('0')
  const [variantEnabled, setVariantEnabled] = useState(true)
  const [variantBusyId, setVariantBusyId] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [productRes, discountsRes, variantsRes] = await Promise.all([
        fetch(`/api/admin/catalog/products/${productId}`, { cache: 'no-store' }),
        fetch(`/api/admin/catalog/discounts?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' }),
        fetch(`/api/admin/catalog/variants?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' }),
      ])

      const productPayload = await productRes.json().catch(() => ({}))
      const discountsPayload = await discountsRes.json().catch(() => ({}))
      const variantsPayload = await variantsRes.json().catch(() => ({}))

      if (!productRes.ok) {
        throw new Error(typeof productPayload?.error === 'string' ? productPayload.error : 'Failed to load product.')
      }
      if (!discountsRes.ok) {
        throw new Error(typeof discountsPayload?.error === 'string' ? discountsPayload.error : 'Failed to load discounts.')
      }
      if (!variantsRes.ok) {
        throw new Error(typeof variantsPayload?.error === 'string' ? variantsPayload.error : 'Failed to load variants.')
      }

      const nextProduct = productPayload.product as ProductPricing
      setProduct(nextProduct)
      setBasePrice(String(nextProduct.base_price ?? 0))
      setDiscounts(Array.isArray(discountsPayload.discounts) ? discountsPayload.discounts : [])
      setVariants(Array.isArray(variantsPayload.variants) ? variantsPayload.variants : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load pricing editor.')
      setProduct(null)
      setDiscounts([])
      setVariants([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [productId])

  async function saveBasePrice() {
    if (!product) return

    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/admin/catalog/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: product.title,
          slug: product.slug,
          category_key: product.category_key,
          base_price: Number(basePrice),
          sort_order: product.sort_order,
          production_estimate_band: product.production_estimate_band,
          short_description: product.short_description,
          description: product.description,
          is_ready_made: product.is_ready_made,
          is_customizable: product.is_customizable,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to update base price.')
      }

      const updated = payload.product as ProductPricing
      setProduct(updated)
      setBasePrice(String(updated.base_price ?? 0))
      setSuccess('Base price saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save base price.')
    } finally {
      setSaving(false)
    }
  }

  async function addDiscount() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/admin/catalog/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          min_qty: Number(minQty),
          max_qty: maxQty.trim().length > 0 ? Number(maxQty) : null,
          discount_type: discountType,
          discount_value: Number(discountValue),
          label,
          is_enabled: true,
          sort_order: Number(sortOrder),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to add discount tier.')
      }

      setSuccess('Discount tier added.')
      setMinQty('1')
      setMaxQty('')
      setDiscountType('percent')
      setDiscountValue('10')
      setLabel('')
      setSortOrder('0')
      await loadData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to add discount tier.')
    } finally {
      setSaving(false)
    }
  }

  async function addVariant() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/admin/catalog/variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          label: variantLabel,
          sku: variantSku,
          price_delta: Number(variantPriceDelta),
          capacity_weight: variantWeight.trim().length > 0 ? Number(variantWeight) : null,
          is_enabled: variantEnabled,
          sort_order: Number(variantSortOrder),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to add variant.')
      }

      setSuccess('Variant added.')
      setVariantLabel('')
      setVariantSku('')
      setVariantPriceDelta('0')
      setVariantWeight('')
      setVariantSortOrder('0')
      setVariantEnabled(true)
      await loadData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to add variant.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteVariant(variantId: string) {
    const confirmed = window.confirm('Delete this variant?')
    if (!confirmed) return

    setVariantBusyId(variantId)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/admin/catalog/variants', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantId,
          confirmAction: 'delete_variant',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete variant.')
      }

      setSuccess('Variant deleted.')
      await loadData()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete variant.')
    } finally {
      setVariantBusyId(null)
    }
  }

  if (loading) {
    return <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>Loading pricing editor...</Typography>
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.2 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Typography sx={{ color: alpha(brandTokens.parchment, 0.7) }}>
        {product ? `Editing pricing for ${product.title}` : 'Product unavailable'}
      </Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
        <TextField
          size="small"
          type="number"
          label="Base price"
          value={basePrice}
          onChange={(event) => setBasePrice(event.target.value)}
          sx={{ width: 220 }}
        />
        <Button variant="contained" disabled={saving || !product} onClick={() => void saveBasePrice()}>
          Save Base Price
        </Button>
      </Stack>

      <Box sx={{ borderTop: `1px solid ${alpha(brandTokens.parchment, 0.16)}`, pt: 1.2, display: 'grid', gap: 1 }}>
        <Typography variant="h6">Variants</Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField size="small" label="Label" value={variantLabel} onChange={(event) => setVariantLabel(event.target.value)} sx={{ minWidth: 220 }} />
          <TextField size="small" label="SKU" value={variantSku} onChange={(event) => setVariantSku(event.target.value)} sx={{ width: 170 }} />
          <TextField size="small" type="number" label="Price delta" value={variantPriceDelta} onChange={(event) => setVariantPriceDelta(event.target.value)} sx={{ width: 150 }} />
          <TextField size="small" type="number" label="Weight" value={variantWeight} onChange={(event) => setVariantWeight(event.target.value)} sx={{ width: 120 }} />
          <TextField size="small" type="number" label="Sort" value={variantSortOrder} onChange={(event) => setVariantSortOrder(event.target.value)} sx={{ width: 110 }} />
          <Select size="small" value={variantEnabled ? 'enabled' : 'disabled'} onChange={(event) => setVariantEnabled(event.target.value === 'enabled')} sx={{ minWidth: 120 }}>
            <MenuItem value="enabled">Enabled</MenuItem>
            <MenuItem value="disabled">Disabled</MenuItem>
          </Select>
          <Button variant="outlined" disabled={saving || !product} onClick={() => void addVariant()}>
            Add Variant
          </Button>
        </Stack>

        {variants.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>No variants yet.</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.7 }}>
            {variants.map((variant) => (
              <Box
                key={variant.id}
                sx={{
                  borderRadius: 1,
                  border: `1px solid ${alpha(brandTokens.parchment, 0.14)}`,
                  p: 0.8,
                  backgroundColor: alpha(brandTokens.bgSurface, 0.38),
                }}
              >
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                  <Typography sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.7) }}>
                    {variant.label} | SKU {variant.sku || 'n/a'} | delta {variant.price_delta} | sort {variant.sort_order} | {variant.is_enabled ? 'Enabled' : 'Disabled'}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    disabled={variantBusyId === variant.id}
                    onClick={() => void deleteVariant(variant.id)}
                  >
                    Delete
                  </Button>
                </Stack>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Box sx={{ borderTop: `1px solid ${alpha(brandTokens.parchment, 0.16)}`, pt: 1.2, display: 'grid', gap: 1 }}>
        <Typography variant="h6">Bulk Discount Tiers</Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField size="small" type="number" label="Min qty" value={minQty} onChange={(event) => setMinQty(event.target.value)} sx={{ width: 130 }} />
          <TextField size="small" type="number" label="Max qty" value={maxQty} onChange={(event) => setMaxQty(event.target.value)} sx={{ width: 130 }} />
          <Select size="small" value={discountType} onChange={(event) => setDiscountType(event.target.value as BulkDiscountRow['discount_type'])} sx={{ minWidth: 180 }}>
            {DISCOUNT_TYPE_CHOICES.map((kind) => (
              <MenuItem key={kind} value={kind}>{kind}</MenuItem>
            ))}
          </Select>
          <TextField size="small" type="number" label="Value" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} sx={{ width: 140 }} />
          <TextField size="small" label="Label" value={label} onChange={(event) => setLabel(event.target.value)} sx={{ minWidth: 200 }} />
          <TextField size="small" type="number" label="Sort" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} sx={{ width: 110 }} />
          <Button variant="outlined" disabled={saving || !product} onClick={() => void addDiscount()}>
            Add Tier
          </Button>
        </Stack>

        {discounts.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>No discount tiers yet.</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.7 }}>
            {discounts.map((tier) => (
              <Box
                key={tier.id}
                sx={{
                  borderRadius: 1,
                  border: `1px solid ${alpha(brandTokens.parchment, 0.14)}`,
                  p: 0.8,
                  backgroundColor: alpha(brandTokens.bgSurface, 0.38),
                }}
              >
                <Typography sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.7) }}>
                  Qty {tier.min_qty}{tier.max_qty ? ` - ${tier.max_qty}` : '+'} | {tier.discount_type} {tier.discount_value} | {tier.label || 'No label'} | {tier.is_enabled ? 'Enabled' : 'Disabled'}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}
