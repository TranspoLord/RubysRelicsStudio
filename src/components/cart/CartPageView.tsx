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
import { SquareCheckoutButton } from '@/components/shop/SquareCheckoutButton'
import { brandTokens } from '@/theme/theme'

interface StorefrontConfig {
  squareCheckoutEnabled: boolean
}

interface SquareCartItem {
  productId: string
  title: string
  quantity: number
  unitPrice: number
  selectedProcessKeys?: string[]
}

export function CartPageView() {
  const { items, subtotal, discountTotal, total, removeItem, updateQuantity, clearCart } = useCart()
  const [config, setConfig] = useState<StorefrontConfig>({
    squareCheckoutEnabled: true,
  })
  const [loadingConfig, setLoadingConfig] = useState(true)

  // Prepare items for Square checkout
  const squareItems: SquareCartItem[] = useMemo(() => {
    return items.map((item) => ({
      productId: item.productId,
      title: item.title,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      selectedProcessKeys: item.selectedProcessKeys,
    }))
  }, [items])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const res = await fetch('/api/storefront-config')
        const json = await res.json()
        if (!active) return
        setConfig({
          squareCheckoutEnabled: Boolean(json?.paymentProvider === 'square'),
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

  if (loadingConfig) {
    return (
      <Box sx={{ display: 'grid', gap: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <CircularProgress size={24} />
        <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.6) }}>
          Loading checkout options...
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.5, mt: 1 }}>
      {items.map((item) => (
        <Box key={item.key} sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1, border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`, borderRadius: 1 }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap>
              {item.title}
              {item.variantLabel && ` (${item.variantLabel})`}
            </Typography>
            {item.selectedProcessKeys && item.selectedProcessKeys.length > 0 && (
              <Typography variant="caption" sx={{ color: alpha(brandTokens.parchment, 0.5) }}>
                Processes: {item.selectedProcessKeys.join(', ')}
              </Typography>
            )}
            <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.6) }}>
              ${item.lineTotal.toFixed(2)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Button
              size="small"
              onClick={() => updateQuantity(item.key, item.quantity - 1)}
              disabled={item.quantity <= 1}
              sx={{ minWidth: 32, p: 0.5 }}
            >
              −
            </Button>
            <Typography sx={{ minWidth: 24, textAlign: 'center' }}>{item.quantity}</Typography>
            <Button
              size="small"
              onClick={() => updateQuantity(item.key, item.quantity + 1)}
              sx={{ minWidth: 32, p: 0.5 }}
            >
              +
            </Button>
            <Button
              size="small"
              color="error"
              onClick={() => removeItem(item.key)}
              sx={{ minWidth: 32, p: 0.5 }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </Button>
          </Box>
        </Box>
      ))}

      <Divider sx={{ borderColor: alpha(brandTokens.parchment, 0.1) }} />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" component="span">
          Total
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: 'var(--font-cinzel)' }}>
          ${total.toFixed(2)}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Button variant="outlined" onClick={clearCart} disabled={items.length === 0}>
          Clear Cart
        </Button>
        <SquareCheckoutButton items={squareItems} disabled={items.length === 0} />
      </Box>

      {items.length === 0 && (
        <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.5), textAlign: 'center', mt: 2 }}>
          Your cart is empty. Add items to begin checkout.
        </Typography>
      )}
    </Box>
  )
}