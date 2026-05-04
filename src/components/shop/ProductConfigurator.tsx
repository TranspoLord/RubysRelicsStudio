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
import type { DbProductDetail, DbProductVariant, DbProductOption } from '@/lib/supabase/queries/products'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConfiguratorState {
  variantId: string | null
  optionValues: Record<string, string>
  quantity: number
}

interface ProductConfiguratorProps {
  product: DbProductDetail
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductConfigurator({ product }: ProductConfiguratorProps) {
  const { variants, options } = product

  const [state, setState] = useState<ConfiguratorState>({
    variantId: variants[0]?.id ?? null,
    optionValues: {},
    quantity: 1,
  })
  const [addedToCart, setAddedToCart] = useState(false)

  // ── Computed price ──────────────────────────────────────────────────────────
  const computedPrice = useMemo(() => {
    let price = product.base_price

    // Add variant delta
    const selectedVariant = variants.find((v) => v.id === state.variantId)
    if (selectedVariant) price += selectedVariant.price_delta

    // Add option value deltas
    for (const opt of options) {
      const selectedVal = state.optionValues[opt.option_key]
      if (!selectedVal) continue
      const matchingValue = opt.values?.find((v) => v.value === selectedVal)
      if (matchingValue) price += matchingValue.price_delta
    }

    return price * state.quantity
  }, [product.base_price, variants, options, state])

  // ── Validation ──────────────────────────────────────────────────────────────
  const requiredOptions = options.filter((o) => o.is_required)
  const isValid =
    (variants.length === 0 || state.variantId !== null) &&
    requiredOptions.every((o) => {
      const val = state.optionValues[o.option_key]
      return val !== undefined && val.trim().length > 0
    })

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleVariantChange = (variantId: string) =>
    setState((prev) => ({ ...prev, variantId }))

  const handleOptionChange = (key: string, value: string) =>
    setState((prev) => ({
      ...prev,
      optionValues: { ...prev.optionValues, [key]: value },
    }))

  const handleQuantityChange = (delta: number) =>
    setState((prev) => ({ ...prev, quantity: Math.max(1, prev.quantity + delta) }))

  const handleAddToCart = () => {
    // TODO: wire to cart context / server action
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
              '&:hover': { backgroundColor: alpha(brandTokens.parchment, 0.07) },
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
          ${computedPrice.toFixed(2)}
        </Typography>
      </Box>

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
        {addedToCart ? '✓ Added to Cart' : 'Add to Cart'}
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
