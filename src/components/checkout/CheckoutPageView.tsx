'use client'

import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { useCart, CartItem } from '@/components/cart/CartProvider'
import { ShippingForm } from '@/components/checkout/ShippingForm'
import { ShippingRate } from '@/lib/shippo/client'
import { brandTokens } from '@/theme/theme'

interface StorefrontConfig {
  stripeCheckoutEnabled: boolean
  stripeDisabledMessage: string
}

interface SummaryRow {
  label: string
  value: number
  emph: boolean
}

interface CheckoutResponse {
  checkoutUrl?: string
  error?: string
}

interface ShippingAddress {
  name?: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
}

export function CheckoutPageView() {
  const { items, subtotal, discountTotal, total, removeItem, updateQuantity } = useCart()
  const [config, setConfig] = useState<StorefrontConfig>({
    stripeCheckoutEnabled: true,
    stripeDisabledMessage: 'Checkout is temporarily unavailable. Please submit a custom request.',
  })
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [creatingSession, setCreatingSession] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [customerEmail, setCustomerEmail] = useState('')
  const [discountCode, setDiscountCode] = useState('')
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null)
  const [selectedRate, setSelectedRate] = useState<ShippingRate | null>(null)

  useEffect(() => {
    let active = true

    void (async () => {
      try {
        const res = await fetch('/api/storefront-config')
        const json = await res.json()
        if (!active) return

        setConfig({
          stripeCheckoutEnabled: Boolean(json?.stripeCheckoutEnabled ?? true),
          stripeDisabledMessage:
            typeof json?.stripeDisabledMessage === 'string'
              ? json.stripeDisabledMessage
              : 'Checkout is temporarily unavailable. Please submit a custom request.',
        })
      } catch {
        if (!active) return
      } finally {
        if (active) setLoadingConfig(false)
      }
    })()

    return () => {
      active = false
    }
  }, [])

  // Calculate total weight from cart items (using weight if available, or default 1 lb)
  const totalWeight = useMemo(() => {
    return items.reduce((sum, item) => {
      const itemWeight = item.weight ?? 1 // Default 1 lb if no weight set
      return sum + itemWeight * item.quantity
    }, 0)
  }, [items])

  const hasItems = items.length > 0
  const hasShipping = Boolean(shippingAddress && selectedRate)
  const canCheckout = hasItems && config.stripeCheckoutEnabled && !creatingSession && !loadingConfig && hasShipping

  const summaryRows = useMemo<SummaryRow[]>(() => {
    const rows: SummaryRow[] = [
      { label: 'Subtotal', value: subtotal, emph: false },
      { label: 'Discounts', value: -discountTotal, emph: false },
    ]

    if (selectedRate) {
      rows.push({ label: 'Shipping', value: selectedRate.amount, emph: false })
    }

    rows.push({ label: 'Total', value: total + (selectedRate?.amount ?? 0), emph: true })

    return rows
  }, [subtotal, discountTotal, total, selectedRate])

  async function handleCheckout() {
    if (!canCheckout) return

    setCheckoutError(null)
    setCreatingSession(true)

    try {
      const normalizedEmail = customerEmail.trim().toLowerCase()

      if (normalizedEmail) {
        await fetch('/api/cart/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: normalizedEmail,
            cartItems: items.map((item) => ({
              productId: item.productId,
              title: item.title,
              quantity: item.quantity,
              lineTotal: item.lineTotal,
              variantLabel: item.variantLabel,
            })),
          }),
        })
      }

      // Use Square checkout endpoint - format must match API expectations
      const response = await fetch('/api/square/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((item) => ({
            productId: item.productId,
            title: item.title,
            quantity: item.quantity,
            unitPrice: item.lineTotal / item.quantity,
            selectedProcessKeys: item.selectedProcessKeys,
          })),
          buyerEmail: normalizedEmail || undefined,
          shippingAddress: shippingAddress || undefined,
          shippingRate: selectedRate || undefined,
        }),
      })

      const payload = (await response.json()) as CheckoutResponse

      if (!response.ok || !payload.checkoutUrl) {
        const message =
          typeof payload.error === 'string'
            ? payload.error
            : 'Checkout could not be started. Please try again.'
        setCheckoutError(message)
        return
      }

      window.location.assign(payload.checkoutUrl)
    } catch {
      setCheckoutError('Checkout could not be started. Please try again.')
    } finally {
      setCreatingSession(false)
    }
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 360px' },
        gap: { xs: 2.2, md: 3 },
      }}
    >
      <Box
        sx={{
          border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
          borderRadius: 2,
          backgroundColor: alpha(brandTokens.bgSurface, 0.6),
          p: { xs: 1.5, md: 2 },
        }}
      >
        {!hasItems ? (
          <Box sx={{ textAlign: 'center', py: { xs: 4, md: 5 } }}>
            <Typography sx={{ fontSize: '2rem', mb: 0.8 }}>📦</Typography>
            <Typography variant="h4" sx={{ mb: 0.8 }}>
              Your Cart Is Empty
            </Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.64), mb: 2 }}>
              Add products before attempting checkout.
            </Typography>
            <Button component="a" href="/shop" variant="contained">
              Browse Shop
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gap: 1.25 }}>
            {items.map((item) => (
              <Box
                key={item.key}
                sx={{
                  border: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
                  borderRadius: 1.5,
                  p: 1.2,
                  backgroundColor: alpha(brandTokens.bgSurface, 0.45),
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Typography sx={{ fontWeight: 700, mb: 0.3 }}>{item.title}</Typography>
                  <IconButton
                    size="small"
                    onClick={() => removeItem(item.key)}
                    sx={{ color: alpha(brandTokens.parchment, 0.42), p: 0.3 }}
                    title="Remove item"
                  >
                    ×
                  </IconButton>
                </Box>
                {item.variantLabel && (
                  <Typography sx={{ fontSize: '0.75rem', color: alpha(brandTokens.parchment, 0.6), mb: 0.2 }}>
                    {item.variantLabel}
                  </Typography>
                )}
                {item.options.length > 0 && (
                  <Typography sx={{ fontSize: '0.72rem', color: alpha(brandTokens.parchment, 0.55), mb: 0.65 }}>
                    {item.options.map((o) => `${o.label}: ${o.valueLabel ?? o.value}`).join(' • ')}
                  </Typography>
                )}

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <IconButton
                      size="small"
                      onClick={() => updateQuantity(item.key, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      sx={{
                        color: alpha(brandTokens.parchment, 0.7),
                        border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`,
                        p: 0.25,
                        fontSize: '0.8rem',
                      }}
                    >
                      −
                    </IconButton>
                    <Typography sx={{ color: alpha(brandTokens.parchment, 0.58), fontSize: '0.78rem', mx: 0.5 }}>
                      Qty {item.quantity}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => updateQuantity(item.key, item.quantity + 1)}
                      sx={{
                        color: alpha(brandTokens.parchment, 0.7),
                        border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`,
                        p: 0.25,
                        fontSize: '0.8rem',
                      }}
                    >
                      +
                    </IconButton>
                  </Box>
                  <Typography sx={{ fontWeight: 700, fontFamily: 'var(--font-cinzel, serif)' }}>
                    ${item.lineTotal.toFixed(2)}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Box
        sx={{
          border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
          borderRadius: 2,
          backgroundColor: alpha(brandTokens.bgSurface, 0.65),
          p: { xs: 1.5, md: 2 },
          height: 'fit-content',
        }}
      >
        <Typography variant="h5" sx={{ mb: 1.4 }}>
          Checkout Summary
        </Typography>

        <Box sx={{ display: 'grid', gap: 0.7 }}>
          {summaryRows.map((row) => (
            <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography
                sx={{
                  color: row.emph ? brandTokens.parchment : alpha(brandTokens.parchment, 0.6),
                  fontWeight: row.emph ? 700 : 400,
                }}
              >
                {row.label}
              </Typography>
              <Typography
                sx={{
                  fontWeight: row.emph ? 700 : 500,
                  fontFamily: row.emph ? 'var(--font-cinzel, serif)' : 'inherit',
                }}
              >
                ${row.value.toFixed(2)}
              </Typography>
            </Box>
          ))}
        </Box>

        <Divider sx={{ my: 1.4, borderColor: alpha(brandTokens.parchment, 0.08) }} />

        <Box sx={{ display: 'grid', gap: 0.8, mb: 1.2 }}>
          <TextField
            size="small"
            label="Email address"
            type="email"
            value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)}
            inputProps={{ maxLength: 254, autoComplete: 'email' }}
            disabled={creatingSession}
            required
          />
          <TextField
            size="small"
            label="Promo / Bundle Code"
            value={discountCode}
            onChange={(event) => setDiscountCode(event.target.value)}
            inputProps={{ maxLength: 40 }}
            disabled={creatingSession}
            placeholder="Enter promo or bundle code"
          />
        </Box>

        <ShippingForm
          onAddressChange={setShippingAddress}
          onRateSelect={setSelectedRate}
          packageWeight={totalWeight}
        />

        {loadingConfig ? (
          <Box sx={{ py: 1.2, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={20} />
          </Box>
        ) : (
          <>
            {!config.stripeCheckoutEnabled && (
              <Box
                sx={{
                  mb: 1.1,
                  p: 1,
                  borderRadius: 1,
                  border: `1px solid ${alpha('#CF4040', 0.4)}`,
                  backgroundColor: alpha('#CF4040', 0.12),
                }}
              >
                <Typography sx={{ fontSize: '0.78rem', color: '#F1B4B4' }}>
                  {config.stripeDisabledMessage}
                </Typography>
              </Box>
            )}

            {checkoutError && (
              <Box
                sx={{
                  mb: 1.1,
                  p: 1,
                  borderRadius: 1,
                  border: `1px solid ${alpha('#CF4040', 0.3)}`,
                  backgroundColor: alpha('#CF4040', 0.09),
                }}
              >
                <Typography sx={{ fontSize: '0.78rem', color: '#F1B4B4' }}>
                  {checkoutError}
                </Typography>
              </Box>
            )}

            <Button
              fullWidth
              variant="contained"
              onClick={handleCheckout}
              disabled={!canCheckout}
            >
              {creatingSession ? 'Starting Secure Checkout...' : 'Pay with Square'}
            </Button>
          </>
        )}

        <Button
          fullWidth
          component="a"
          href="/cart"
          variant="text"
          sx={{ mt: 0.8, color: alpha(brandTokens.parchment, 0.72) }}
        >
          Back to Cart
        </Button>
      </Box>
    </Box>
  )
}