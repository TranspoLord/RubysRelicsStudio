'use client'

import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'

import { useCart } from '@/components/cart/CartProvider'
import { brandTokens } from '@/theme/theme'

interface StorefrontConfig {
  stripeCheckoutEnabled: boolean
  stripeDisabledMessage: string
}

export function CartPageView() {
  const { items, subtotal, discountTotal, total, removeItem, updateQuantity, clearCart } = useCart()
  const [config, setConfig] = useState<StorefrontConfig>({
    stripeCheckoutEnabled: true,
    stripeDisabledMessage: 'Checkout is temporarily unavailable. Please submit a custom request.',
  })
  const [loadingConfig, setLoadingConfig] = useState(true)

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
  const canCheckout = hasItems && config.stripeCheckoutEnabled

  const summaryRows = useMemo(
    () => [
      { label: 'Subtotal', value: subtotal },
      { label: 'Discounts', value: -discountTotal },
      { label: 'Total', value: total, emph: true },
    ],
    [subtotal, discountTotal, total]
  )

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
            <Typography sx={{ fontSize: '2rem', mb: 0.8 }}>🛒</Typography>
            <Typography variant="h4" sx={{ mb: 0.8 }}>
              Your Cart Is Empty
            </Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.64), mb: 2 }}>
              Add products from the shop to start checkout.
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
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.2 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, mb: 0.3 }}>{item.title}</Typography>
                    {item.variantLabel && (
                      <Typography sx={{ fontSize: '0.75rem', color: alpha(brandTokens.parchment, 0.6), mb: 0.2 }}>
                        {item.variantLabel}
                      </Typography>
                    )}
                    {item.options.length > 0 && (
                      <Typography sx={{ fontSize: '0.72rem', color: alpha(brandTokens.parchment, 0.55) }}>
                        {item.options.map((o) => `${o.label}: ${o.valueLabel ?? o.value}`).join(' • ')}
                      </Typography>
                    )}
                  </Box>

                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => removeItem(item.key)}
                    sx={{ minWidth: 36, color: alpha(brandTokens.parchment, 0.5), alignSelf: 'flex-start' }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </Button>
                </Box>

                <Box
                  sx={{
                    mt: 1.1,
                    pt: 0.9,
                    borderTop: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}>
                    <QtyButton
                      label="Decrease quantity"
                      onClick={() => updateQuantity(item.key, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                    >
                      -
                    </QtyButton>
                    <Typography sx={{ minWidth: 20, textAlign: 'center', fontSize: '0.82rem' }}>
                      {item.quantity}
                    </Typography>
                    <QtyButton
                      label="Increase quantity"
                      onClick={() => updateQuantity(item.key, item.quantity + 1)}
                    >
                      +
                    </QtyButton>
                  </Box>

                  <Typography sx={{ fontWeight: 700, fontFamily: 'var(--font-cinzel, serif)' }}>
                    ${item.lineTotal.toFixed(2)}
                  </Typography>
                </Box>
              </Box>
            ))}

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button size="small" color="inherit" onClick={clearCart}>
                Clear cart
              </Button>
            </Box>
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
          Order Summary
        </Typography>

        <Box sx={{ display: 'grid', gap: 0.7 }}>
          {summaryRows.map((row) => (
            <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ color: row.emph ? brandTokens.parchment : alpha(brandTokens.parchment, 0.6), fontWeight: row.emph ? 700 : 400 }}>
                {row.label}
              </Typography>
              <Typography sx={{ fontWeight: row.emph ? 700 : 500, fontFamily: row.emph ? 'var(--font-cinzel, serif)' : 'inherit' }}>
                ${row.value.toFixed(2)}
              </Typography>
            </Box>
          ))}
        </Box>

        <Divider sx={{ my: 1.4, borderColor: alpha(brandTokens.parchment, 0.08) }} />

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

            <Button
              fullWidth
              variant="contained"
              disabled={!canCheckout}
              component={canCheckout ? 'a' : 'button'}
              href={canCheckout ? '/checkout' : undefined}
            >
              Continue to Checkout
            </Button>
          </>
        )}

        <Button
          fullWidth
          component="a"
          href="/custom-orders"
          variant="text"
          sx={{ mt: 0.8, color: alpha(brandTokens.parchment, 0.72) }}
        >
          Need a Quote Instead?
        </Button>
      </Box>
    </Box>
  )
}

function QtyButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      sx={{
        width: 24,
        height: 24,
        borderRadius: 1,
        border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`,
        background: 'none',
        color: brandTokens.parchment,
        cursor: 'pointer',
        '&:disabled': { opacity: 0.35, cursor: 'not-allowed' },
      }}
    >
      {children}
    </Box>
  )
}
