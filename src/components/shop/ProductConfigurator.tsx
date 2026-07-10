'use client'

import { useState, useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import FormLabel from '@mui/material/FormLabel'
import FormHelperText from '@mui/material/FormHelperText'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'
import { useCart } from '@/components/cart/CartProvider'
import type {
  DbProductDetail,
  DbProductVariant,
  DbProductOption,
  DbProductBulkDiscount,
  DbProductProcessPricing,
  DbProductComboDiscount,
} from '@/lib/supabase/queries/products'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConfiguratorState {
  variantId: string | null
  optionValues: Record<string, string>
  selectedProcessKeys: string[]
  quantity: number
}

interface ProductConfiguratorProps {
  product: DbProductDetail
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductConfigurator({ product }: ProductConfiguratorProps) {
  const { variants, options, process_pricing, combo_discounts } = product
  const { addItem } = useCart()

  const [state, setState] = useState<ConfiguratorState>({
    variantId: variants[0]?.id ?? null,
    optionValues: {},
    selectedProcessKeys: [],
    quantity: 1,
  })
  const [addedToCart, setAddedToCart] = useState(false)

  const isReadyMade = product.is_ready_made
  const maxPurchasable =
    isReadyMade && product.is_track_inventory
      ? Math.max(0, Number(product.inventory_qty ?? 0))
      : null
  const isOutOfStock = isReadyMade && product.is_in_stock === false

  // ── Computed price ──────────────────────────────────────────────────────────
  const pricing = useMemo(() => {
    let unitPrice = product.base_price

    // Add variant delta
    const selectedVariant = variants.find((v) => v.id === state.variantId)
    if (selectedVariant) unitPrice += selectedVariant.price_delta

    // Add option value deltas
    for (const opt of options) {
      const selectedVal = state.optionValues[opt.option_key]
      if (!selectedVal) continue
      const matchingValue = opt.values?.find((v) => v.value === selectedVal)
      if (matchingValue) unitPrice += matchingValue.price_delta
    }

    // Add process price deltas
    for (const processKey of state.selectedProcessKeys) {
      const process = process_pricing.find((p) => p.process_type_key === processKey)
      if (process) unitPrice += process.price_delta
    }

    // Apply combo discount if applicable
    let processDiscount = 0
    const activeComboDiscount = findMatchingComboDiscount(
      combo_discounts,
      state.selectedProcessKeys.length
    )
    if (activeComboDiscount) {
      const processTotal = state.selectedProcessKeys.reduce((sum, key) => {
        const p = process_pricing.find((pp) => pp.process_type_key === key)
        return sum + (p?.price_delta ?? 0)
      }, 0)

      if (activeComboDiscount.discount_type === 'percent') {
        processDiscount = processTotal * (activeComboDiscount.discount_value! / 100)
      } else if (activeComboDiscount.discount_type === 'fixed_amount') {
        processDiscount = activeComboDiscount.discount_value!
      } else if (activeComboDiscount.discount_type === 'cheapest_free') {
        const cheapestProcess = state.selectedProcessKeys.reduce((min, key) => {
          const p = process_pricing.find((pp) => pp.process_type_key === key)
          const delta = p?.price_delta ?? 0
          return delta < min ? delta : min
        }, Number.POSITIVE_INFINITY)
        processDiscount = cheapestProcess
      }
    }

    const subtotal = unitPrice * state.quantity
    const activeBulkTier = findMatchingBulkTier(product.bulk_discounts ?? [], state.quantity)

    let discount = processDiscount * state.quantity
    if (activeBulkTier) {
      if (activeBulkTier.discount_type === 'percent') {
        discount += subtotal * (activeBulkTier.discount_value / 100)
      } else if (activeBulkTier.discount_type === 'fixed_amount') {
        discount += activeBulkTier.discount_value * state.quantity
      } else if (activeBulkTier.discount_type === 'unit_price') {
        discount += Math.max(0, (unitPrice - activeBulkTier.discount_value) * state.quantity)
      }
    }

    const total = Math.max(0, subtotal - discount)

    return {
      unitPrice,
      subtotal,
      discount,
      processDiscount,
      total,
      activeBulkTier,
      activeComboDiscount,
    }
  }, [product.base_price, product.bulk_discounts, process_pricing, combo_discounts, variants, options, state])

  // ── Validation ──────────────────────────────────────────────────────────────
  const requiredOptions = options.filter((o) => o.is_required)
  const isValid =
    (variants.length === 0 || state.variantId !== null) &&
    requiredOptions.every((o) => {
      const val = state.optionValues[o.option_key]
      return val !== undefined && val.trim().length > 0
    }) &&
    !isOutOfStock

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleVariantChange = (variantId: string) =>
    setState((prev) => ({ ...prev, variantId }))

  const handleOptionChange = (key: string, value: string) =>
    setState((prev) => ({
      ...prev,
      optionValues: { ...prev.optionValues, [key]: value },
    }))

  const handleProcessToggle = (processKey: string) => {
    setState((prev) => {
      const isSelected = prev.selectedProcessKeys.includes(processKey)
      return {
        ...prev,
        selectedProcessKeys: isSelected
          ? prev.selectedProcessKeys.filter((k) => k !== processKey)
          : [...prev.selectedProcessKeys, processKey],
      }
    })
  }

  const handleQuantityChange = (delta: number) =>
    setState((prev) => {
      const next = Math.max(1, prev.quantity + delta)
      if (typeof maxPurchasable === 'number') {
        return { ...prev, quantity: Math.min(next, Math.max(1, maxPurchasable)) }
      }
      return { ...prev, quantity: next }
    })

  const handleAddToCart = () => {
    const selectedVariant = variants.find((v) => v.id === state.variantId)
    const selectedOptions = options
      .map((opt) => {
        const selectedVal = state.optionValues[opt.option_key]
        if (!selectedVal) return null
        const selectedValueMeta = opt.values?.find((v) => v.value === selectedVal)
        return {
          key: opt.option_key,
          label: opt.label,
          value: selectedVal,
          valueLabel: selectedValueMeta?.label ?? selectedVal,
        }
      })
      .filter((entry): entry is { key: string; label: string; value: string; valueLabel: string } => entry !== null)

    const cartKey = buildCartKey(product.id, state.variantId, selectedOptions, state.selectedProcessKeys)

    addItem({
      key: cartKey,
      productId: product.id,
      productSlug: product.slug,
      categorySlug: product.category_slug,
      title: product.title,
      quantity: state.quantity,
      variantId: state.variantId,
      variantLabel: selectedVariant?.label ?? null,
      options: selectedOptions,
      selectedProcessKeys: state.selectedProcessKeys,
      unitPrice: pricing.unitPrice,
      lineSubtotal: pricing.subtotal,
      lineDiscount: pricing.discount,
      lineTotal: pricing.total,
      imageUrl: product.featured_media?.url ?? null,
      imageEmoji: product.featured_media?.emoji ?? product.category_emoji ?? null,
    })

    setAddedToCart(true)
    setTimeout(() => setAddedToCart(false), 2000)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ── Variant selector ─────────────────────────────────────────── */}
      {variants.length > 0 && (
        <Box>
          <FormLabel
            sx={{
              display: 'block',
              mb: 1.25,
              fontWeight: 600,
              fontSize: '0.875rem',
              color: brandTokens.parchment,
            }}
          >
            Size / Type
          </FormLabel>
          <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
            {variants.map((v) => (
              <VariantPill
                key={v.id}
                variant={v}
                selected={state.variantId === v.id}
                onClick={() => handleVariantChange(v.id)}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* ── Product options ───────────────────────────────────────────── */}
      {options.map((opt) => (
        <OptionField
          key={opt.id}
          option={opt}
          value={state.optionValues[opt.option_key] ?? ''}
          onChange={(val) => handleOptionChange(opt.option_key, val)}
        />
      ))}

      <Divider sx={{ borderColor: alpha(brandTokens.parchment, 0.08) }} />

      {/* ── Quantity + price ──────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.55), mr: 1 }}>
            Qty
          </Typography>
          <Box
            component="button"
            onClick={() => handleQuantityChange(-1)}
            disabled={state.quantity <= 1}
            aria-label="Decrease quantity"
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              border: `1px solid ${alpha(brandTokens.parchment, 0.18)}`,
              background: 'none',
              color: brandTokens.parchment,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
              '&:disabled': { opacity: 0.35, cursor: 'not-allowed' },
              '&:hover:not(:disabled)': { backgroundColor: alpha(brandTokens.parchment, 0.07) },
            }}
          >
            −
          </Box>
          <Typography sx={{ minWidth: 28, textAlign: 'center', fontWeight: 600 }}>
            {state.quantity}
          </Typography>
          <Box
            component="button"
            onClick={() => handleQuantityChange(1)}
            aria-label="Increase quantity"
            disabled={typeof maxPurchasable === 'number' && state.quantity >= Math.max(1, maxPurchasable)}
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              border: `1px solid ${alpha(brandTokens.parchment, 0.18)}`,
              background: 'none',
              color: brandTokens.parchment,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
              '&:disabled': { opacity: 0.35, cursor: 'not-allowed' },
              '&:hover:not(:disabled)': { backgroundColor: alpha(brandTokens.parchment, 0.07) },
            }}
          >
            +
          </Box>
        </Box>

        <Typography
          sx={{
            fontFamily: 'var(--font-cinzel, serif)',
            fontWeight: 700,
            fontSize: '1.75rem',
            color: brandTokens.parchment,
          }}
        >
          ${pricing.total.toFixed(2)}
        </Typography>
      </Box>

      {pricing.activeBulkTier && (
        <Box
          sx={{
            mt: -1,
            p: 1.25,
            borderRadius: 1,
            border: `1px solid ${alpha(brandTokens.forgeGold, 0.32)}`,
            backgroundColor: alpha(brandTokens.forgeGold, 0.1),
          }}
        >
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: brandTokens.forgeGold, mb: 0.35 }}>
            Bulk Tier Applied
          </Typography>
          <Typography sx={{ fontSize: '0.76rem', color: alpha(brandTokens.parchment, 0.72) }}>
            {formatBulkTierLabel(pricing.activeBulkTier)}
            {' · '}
            You save ${pricing.discount.toFixed(2)} on this quantity.
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: alpha(brandTokens.parchment, 0.55), mt: 0.35 }}>
            Subtotal ${pricing.subtotal.toFixed(2)} → Total ${pricing.total.toFixed(2)}
          </Typography>
        </Box>
      )}

      {isReadyMade && (
        <Box
          sx={{
            mt: -0.5,
            p: 1,
            borderRadius: 1,
            border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`,
            backgroundColor: alpha(brandTokens.bgSurface, 0.52),
          }}
        >
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
            Inventory: {
              product.inventory_status === 'forced_out_of_stock'
                ? 'Out of stock (manual override)'
                : product.inventory_status === 'forced_in_stock'
                    ? 'In stock (manual override)'
                    : product.inventory_status === 'low_stock'
                      ? `Low stock (${product.inventory_qty ?? 0} left)`
                      : product.inventory_status === 'out_of_stock'
                        ? 'Out of stock'
                        : product.inventory_status === 'untracked'
                          ? 'In stock (not tracked)'
                          : `In stock${typeof product.inventory_qty === 'number' ? ` (${product.inventory_qty} left)` : ''}`
            }
          </Typography>
        </Box>
      )}

      {(product.bulk_discounts?.length ?? 0) > 0 && (
        <Box sx={{ mt: -0.5 }}>
          <Typography sx={{ fontSize: '0.72rem', color: alpha(brandTokens.parchment, 0.46), mb: 0.55 }}>
            Volume pricing
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.65 }}>
            {(product.bulk_discounts ?? []).map((tier) => (
              <Box
                key={tier.id}
                sx={{
                  px: 0.75,
                  py: 0.35,
                  borderRadius: 1,
                  border: `1px solid ${alpha(brandTokens.parchment, 0.15)}`,
                  color: alpha(brandTokens.parchment, 0.6),
                  fontSize: '0.66rem',
                }}
              >
                {formatBulkTierLabel(tier)}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* ── Process selector ─────────────────────────────────────────── */}
      {process_pricing.length > 0 && (
        <Box>
          <FormLabel
            sx={{
              display: 'block',
              mb: 1.25,
              fontWeight: 600,
              fontSize: '0.875rem',
              color: brandTokens.parchment,
            }}
          >
            Choose Your Process
            {combo_discounts.length > 0 && (
              <Typography component="span" sx={{ color: alpha(brandTokens.parchment, 0.5), fontSize: '0.75rem', ml: 1 }}>
                (Select one or more)
              </Typography>
            )}
          </FormLabel>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {process_pricing.map((process) => {
              const isSelected = state.selectedProcessKeys.includes(process.process_type_key)
              return (
                <ProcessPill
                  key={process.process_type_key}
                  processTypeKey={process.process_type_key}
                  label={process.process_type_key.replace(/_/g, ' ')}
                  priceDelta={process.price_delta}
                  selected={isSelected}
                  onClick={() => handleProcessToggle(process.process_type_key)}
                />
              )
            })}
          </Box>

          {pricing.activeComboDiscount && (
            <Box
              sx={{
                mt: 1.5,
                p: 1.25,
                borderRadius: 1,
                border: `1px solid ${alpha(brandTokens.forgeGold, 0.32)}`,
                backgroundColor: alpha(brandTokens.forgeGold, 0.1),
              }}
            >
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: brandTokens.forgeGold, mb: 0.35 }}>
                Process Combo Discount Applied
              </Typography>
              <Typography sx={{ fontSize: '0.76rem', color: alpha(brandTokens.parchment, 0.72) }}>
                {formatComboDiscountLabel(pricing.activeComboDiscount)} — You save ${pricing.processDiscount.toFixed(2)}.
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* ── Add to cart ───────────────────────────────────────────────── */}
      <Button
        variant="contained"
        size="large"
        fullWidth
        startIcon={<AddShoppingCartIcon />}
        onClick={handleAddToCart}
        disabled={!isValid}
        sx={{
          py: 1.75,
          fontSize: '1rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          backgroundColor: isValid ? brandTokens.forgeGold : undefined,
          color: isValid ? brandTokens.bgVoid : undefined,
          '&:hover': {
            backgroundColor: isValid ? '#E8B84A' : undefined,
          },
        }}
      >
        {isOutOfStock ? 'Out of Stock' : addedToCart ? '✓ Added to Cart' : 'Add to Cart'}
      </Button>

      {!isValid && requiredOptions.length > 0 && (
        <Typography
          variant="caption"
          sx={{
            textAlign: 'center',
            color: alpha(brandTokens.parchment, 0.4),
            mt: -1,
          }}
        >
          Please fill in all required fields above
        </Typography>
      )}
    </Box>
  )
}

function findMatchingBulkTier(
  tiers: DbProductBulkDiscount[],
  quantity: number
): DbProductBulkDiscount | null {
  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty)
  return (
    sorted.find((tier) => {
      const max = tier.max_qty ?? Number.POSITIVE_INFINITY
      return quantity >= tier.min_qty && quantity <= max
    }) ?? null
  )
}

function formatBulkTierLabel(tier: DbProductBulkDiscount): string {
  const range = tier.max_qty
    ? `${tier.min_qty}-${tier.max_qty}`
    : `${tier.min_qty}+`

  if (tier.label) {
    return `${range}: ${tier.label}`
  }

  if (tier.discount_type === 'percent') {
    return `${range}: ${tier.discount_value}% off`
  }
  if (tier.discount_type === 'fixed_amount') {
    return `${range}: -$${tier.discount_value.toFixed(2)} each`
  }
  return `${range}: $${tier.discount_value.toFixed(2)} each`
}

function buildCartKey(
  productId: string,
  variantId: string | null,
  options: Array<{ key: string; value: string }>,
  processKeys: string[]
): string {
  const sorted = [...options].sort((a, b) => a.key.localeCompare(b.key))
  const sortedProcesses = [...processKeys].sort()
  return `${productId}::${variantId ?? 'no_variant'}::${JSON.stringify(sorted)}::processes:${JSON.stringify(sortedProcesses)}`
}

function findMatchingComboDiscount(
  tiers: DbProductComboDiscount[],
  selectedCount: number
): DbProductComboDiscount | null {
  if (selectedCount < 2) return null
  // Sort descending by min_processes, pick the first one that matches
  const sorted = [...tiers].sort((a, b) => b.min_processes - a.min_processes)
  return sorted.find((tier) => selectedCount >= tier.min_processes) ?? null
}

function formatComboDiscountLabel(tier: DbProductComboDiscount): string {
  if (tier.label) return tier.label
  if (tier.discount_type === 'percent') return `${tier.discount_value}% off multi-process orders`
  if (tier.discount_type === 'fixed_amount') return `$${tier.discount_value?.toFixed(2)} off multi-process orders`
  return 'Cheapest process free on multi-process orders'
}

// ─── Process pill ──────────────────────────────────────────────────────────────

interface ProcessPillProps {
  processTypeKey: string
  label: string
  priceDelta: number
  selected: boolean
  onClick: () => void
}

function ProcessPill({ processTypeKey, label, priceDelta, selected, onClick }: ProcessPillProps) {
  const emojiMap: Record<string, string> = {
    engraving_cutting: '🔥',
    printing: '🖨️',
    sublimation: '🌈',
  }
  const emoji = emojiMap[processTypeKey] ?? '⚙️'
  const deltaLabel = priceDelta > 0 ? ` (+$${priceDelta.toFixed(2)})` : ''

  return (
    <Box
      component="button"
      onClick={onClick}
      aria-pressed={selected}
      sx={{
        px: 1.5,
        py: 0.75,
        borderRadius: 1,
        border: `1px solid ${selected ? brandTokens.forgeGold : alpha(brandTokens.parchment, 0.18)}`,
        background: selected ? alpha(brandTokens.forgeGold, 0.12) : 'none',
        color: selected ? brandTokens.forgeGold : brandTokens.parchment,
        cursor: 'pointer',
        fontWeight: selected ? 600 : 400,
        fontSize: '0.8rem',
        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
        '&:hover': {
          borderColor: alpha(brandTokens.forgeGold, 0.5),
          background: alpha(brandTokens.forgeGold, 0.08),
        },
      }}
    >
      <Box component="span" aria-hidden="true" sx={{ mr: 0.5 }}>
        {emoji}
      </Box>
      {label}
      {deltaLabel && (
        <Typography component="span" sx={{ fontSize: '0.7rem', opacity: 0.7, ml: 0.25 }}>
          {deltaLabel}
        </Typography>
      )}
    </Box>
  )
}

// ─── Variant pill ─────────────────────────────────────────────────────────────

interface VariantPillProps {
  variant: DbProductVariant
  selected: boolean
  onClick: () => void
}

function VariantPill({ variant, selected, onClick }: VariantPillProps) {
  const deltaLabel =
    variant.price_delta > 0 ? ` (+$${variant.price_delta.toFixed(2)})` : ''

  return (
    <Box
      component="button"
      onClick={onClick}
      aria-pressed={selected}
      sx={{
        px: 2,
        py: 0.875,
        borderRadius: 1,
        border: `1px solid ${selected ? brandTokens.forgeGold : alpha(brandTokens.parchment, 0.18)}`,
        background: selected ? alpha(brandTokens.forgeGold, 0.12) : 'none',
        color: selected ? brandTokens.forgeGold : brandTokens.parchment,
        cursor: 'pointer',
        fontWeight: selected ? 600 : 400,
        fontSize: '0.875rem',
        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
        '&:hover': {
          borderColor: alpha(brandTokens.forgeGold, 0.5),
          background: alpha(brandTokens.forgeGold, 0.08),
        },
      }}
    >
      {variant.label}
      {deltaLabel && (
        <Typography
          component="span"
          sx={{ fontSize: '0.7rem', opacity: 0.7, ml: 0.25 }}
        >
          {deltaLabel}
        </Typography>
      )}
    </Box>
  )
}

// ─── Option field ─────────────────────────────────────────────────────────────

interface OptionFieldProps {
  option: DbProductOption
  value: string
  onChange: (val: string) => void
}

function OptionField({ option, value, onChange }: OptionFieldProps) {
  const labelSx = {
    display: 'block',
    mb: 1,
    fontWeight: 600,
    fontSize: '0.875rem',
    color: brandTokens.parchment,
  }

  const stickerSizeGuidance = getStickerSizeGuidance(option.option_key, value)

  if (option.option_type === 'select') {
    return (
      <FormControl fullWidth size="small">
        <FormLabel sx={labelSx}>
          {option.label}
          {option.is_required && (
            <Typography component="span" sx={{ color: '#CF4040', ml: 0.4 }}>*</Typography>
          )}
        </FormLabel>
        <Select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          displayEmpty
          sx={{
            backgroundColor: alpha(brandTokens.bgSurface, 0.8),
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(brandTokens.parchment, 0.18),
            },
          }}
        >
          <MenuItem value="" disabled>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.4) }}>
              {option.placeholder ?? 'Select an option'}
            </Typography>
          </MenuItem>
          {(option.values ?? []).map((v) => (
            <MenuItem key={v.id} value={v.value}>
              {v.label}
              {v.price_delta > 0 && (
                <Typography component="span" sx={{ ml: 1, opacity: 0.6, fontSize: '0.75rem' }}>
                  +${v.price_delta.toFixed(2)}
                </Typography>
              )}
            </MenuItem>
          ))}
        </Select>
        {option.help_text && (
          <FormHelperText sx={{ color: alpha(brandTokens.parchment, 0.4), mx: 0, mt: 0.5 }}>
            {option.help_text}
          </FormHelperText>
        )}
        {stickerSizeGuidance && (
          <FormHelperText sx={{ color: alpha(brandTokens.forgeGold, 0.9), mx: 0, mt: 0.4 }}>
            {stickerSizeGuidance}
          </FormHelperText>
        )}
      </FormControl>
    )
  }

  if (option.option_type === 'text') {
    return (
      <FormControl fullWidth>
        <FormLabel sx={labelSx}>
          {option.label}
          {option.is_required && (
            <Typography component="span" sx={{ color: '#CF4040', ml: 0.4 }}>*</Typography>
          )}
        </FormLabel>
        <TextField
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={option.placeholder ?? ''}
          size="small"
          inputProps={{ maxLength: 120 }}
          sx={{
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(brandTokens.parchment, 0.18),
            },
            '& input': { color: brandTokens.parchment },
          }}
        />
        {option.help_text && (
          <FormHelperText sx={{ color: alpha(brandTokens.parchment, 0.4), mx: 0, mt: 0.5 }}>
            {option.help_text}
          </FormHelperText>
        )}
      </FormControl>
    )
  }

  if (option.option_type === 'textarea') {
    return (
      <FormControl fullWidth>
        <FormLabel sx={labelSx}>
          {option.label}
          {option.is_required && (
            <Typography component="span" sx={{ color: '#CF4040', ml: 0.4 }}>*</Typography>
          )}
        </FormLabel>
        <TextField
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={option.placeholder ?? ''}
          multiline
          rows={3}
          size="small"
          inputProps={{ maxLength: 500 }}
          sx={{
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(brandTokens.parchment, 0.18),
            },
            '& textarea': { color: brandTokens.parchment },
          }}
        />
        {option.help_text && (
          <FormHelperText sx={{ color: alpha(brandTokens.parchment, 0.4), mx: 0, mt: 0.5 }}>
            {option.help_text}
          </FormHelperText>
        )}
      </FormControl>
    )
  }

  if (option.option_type === 'file') {
    return (
      <Box>
        <FormLabel sx={labelSx}>
          {option.label}
          {option.is_required && (
            <Typography component="span" sx={{ color: '#CF4040', ml: 0.4 }}>*</Typography>
          )}
        </FormLabel>
        <Box
          sx={{
            border: `1px dashed ${alpha(brandTokens.parchment, 0.2)}`,
            borderRadius: 1,
            p: 2.5,
            textAlign: 'center',
            backgroundColor: alpha(brandTokens.bgSurface, 0.5),
          }}
        >
          <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.5), mb: 1 }}>
            {value ? `File selected: ${value}` : 'No file chosen'}
          </Typography>
          <Button
            component="label"
            variant="outlined"
            size="small"
            sx={{
              borderColor: alpha(brandTokens.parchment, 0.25),
              color: alpha(brandTokens.parchment, 0.65),
            }}
          >
            Choose File
            <input
              type="file"
              hidden
              accept=".svg,.png,.jpg,.jpeg,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onChange(file.name)
              }}
            />
          </Button>
          {option.help_text && (
            <Typography variant="caption" sx={{ display: 'block', mt: 1, color: alpha(brandTokens.parchment, 0.35), textTransform: 'none' }}>
              {option.help_text}
            </Typography>
          )}
        </Box>
      </Box>
    )
  }

  if (option.option_type === 'checkbox') {
    return (
      <FormControl>
        <FormControlLabel
          control={
            <Checkbox
              checked={value === 'true'}
              onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
              sx={{ color: alpha(brandTokens.parchment, 0.4) }}
            />
          }
          label={
            <Typography variant="body2">
              {option.label}
              {option.is_required && (
                <Typography component="span" sx={{ color: '#CF4040', ml: 0.4 }}>*</Typography>
              )}
            </Typography>
          }
        />
        {option.help_text && (
          <FormHelperText sx={{ color: alpha(brandTokens.parchment, 0.4), mx: 0, mt: -0.5 }}>
            {option.help_text}
          </FormHelperText>
        )}
      </FormControl>
    )
  }

  // number
  return (
    <FormControl fullWidth>
      <FormLabel sx={labelSx}>
        {option.label}
        {option.is_required && (
          <Typography component="span" sx={{ color: '#CF4040', ml: 0.4 }}>*</Typography>
        )}
      </FormLabel>
      <TextField
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={option.placeholder ?? ''}
        size="small"
        inputProps={{ min: 1 }}
        sx={{
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha(brandTokens.parchment, 0.18),
          },
          '& input': { color: brandTokens.parchment },
        }}
      />
      {option.help_text && (
        <FormHelperText sx={{ color: alpha(brandTokens.parchment, 0.4), mx: 0, mt: 0.5 }}>
          {option.help_text}
        </FormHelperText>
      )}
    </FormControl>
  )
}

function getStickerSizeGuidance(optionKey: string, value: string): string | null {
  if (optionKey !== 'sticker_size_type') return null

  switch (value) {
    case '1x1':
      return 'Expect at least 24 stickers per sheet at 1"x1".'
    case '2x2':
      return 'Expect at least 12 stickers per sheet at 2"x2".'
    case '3x3':
      return 'Expect at least 9 stickers per sheet at 3"x3".'
    case '4x4':
      return 'Expect at least 4 stickers per sheet at 4"x4".'
    case 'custom':
      return 'Custom size selected. Final sticker count per sheet will be confirmed during proofing.'
    default:
      return null
  }
}
