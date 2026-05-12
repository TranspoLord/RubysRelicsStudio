'use client'

import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { useCart } from '@/components/cart/CartProvider'
import { brandTokens } from '@/theme/theme'

interface StorefrontConfig {
  stripeCheckoutEnabled: boolean
  stripeDisabledMessage: string
}

interface CheckoutResponse {
  checkoutUrl?: string
  error?: string
}

export function CheckoutPageView() {
  const { items, subtotal, discountTotal, total } = useCart()
  const [config, setConfig] = useState<StorefrontConfig>({
    stripeCheckoutEnabled: true,
    stripeDisabledMessage: 'Checkout is temporarily unavailable. Please submit a custom request.',
  })
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [creatingSession, setCreatingSession] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [customerEmail, setCustomerEmail] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [dealCode, setDealCode] = useState('')

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

  const hasItems = items.length > 0
  const canCheckout = hasItems && config.stripeCheckoutEnabled && !creatingSession && !loadingConfig

  const summaryRows = useMemo(
    () => [
      { label: 'Subtotal', value: subtotal },
      { label: 'Discounts', value: -discountTotal },
      { label: 'Total', value: total, emph: true },
    ],
    [subtotal, discountTotal, total]
  )

  async function handleStripeCheckout() {
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

      const response = await fetch('/api/checkout/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          customerEmail: normalizedEmail || null,
          promoCode,
          dealCode,
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
                <Typography sx={{ fontWeight: 700, mb: 0.3 }}>{item.title}</Typography>
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
                  <Typography sx={{ color: alpha(brandTokens.parchment, 0.58), fontSize: '0.78rem' }}>
                    Qty {item.quantity}
                  </Typography>
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
            label="Promo code"
            value={promoCode}
            onChange={(event) => setPromoCode(event.target.value)}
            inputProps={{ maxLength: 40 }}
            disabled={creatingSession}
          />
          <TextField
            size="small"
            label="Bundle deal code"
            value={dealCode}
            onChange={(event) => setDealCode(event.target.value)}
            inputProps={{ maxLength: 40 }}
            disabled={creatingSession}
          />
          <Typography sx={{ fontSize: '0.72rem', color: alpha(brandTokens.parchment, 0.55) }}>
            Codes are validated server-side and applied before Stripe checkout.
          </Typography>
        </Box>

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
              onClick={handleStripeCheckout}
              disabled={!canCheckout}
            >
              {creatingSession ? 'Starting Secure Checkout...' : 'Pay with Stripe'}
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
