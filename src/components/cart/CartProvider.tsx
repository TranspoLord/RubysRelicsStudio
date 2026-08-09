'use client'

import { createContext, useContext, useEffect, useMemo, useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { alpha } from '@mui/material/styles'
import { useRouter } from 'next/navigation'
import type { DesignDocumentV1 } from '@/lib/design/schema'
import { parseDesignDocument } from '@/lib/design/schema'

import { brandTokens } from '@/theme/theme'

const CART_STORAGE_KEY = 'rrs_cart_v1'

export interface CartItemOption {
  key: string
  label: string
  value: string
  valueLabel?: string
}

export interface CartItem {
  key: string
  productId: string
  productSlug: string
  categorySlug?: string
  title: string
  quantity: number
  variantId?: string | null
  variantLabel?: string | null
  options: CartItemOption[]
  selectedProcessKeys?: string[]
  unitPrice: number
  lineSubtotal: number
  lineDiscount: number
  lineTotal: number
  imageUrl?: string | null
  imageEmoji?: string | null
  weight?: number | null
  designDocument?: DesignDocumentV1 | null
}

function asFiniteMoney(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, n)
}

function normalizeCartItem(input: unknown): CartItem | null {
  if (!input || typeof input !== 'object') return null

  const row = input as Partial<CartItem>
  if (
    typeof row.key !== 'string' ||
    typeof row.productId !== 'string' ||
    typeof row.productSlug !== 'string' ||
    typeof row.title !== 'string'
  ) {
    return null
  }

  const options = Array.isArray(row.options)
    ? row.options
        .filter(
          (opt): opt is CartItemOption =>
            Boolean(opt) &&
            typeof opt === 'object' &&
            typeof opt.key === 'string' &&
            typeof opt.label === 'string' &&
            typeof opt.value === 'string'
        )
        .map((opt) => ({
          key: opt.key,
          label: opt.label,
          value: opt.value,
          valueLabel: typeof opt.valueLabel === 'string' ? opt.valueLabel : undefined,
        }))
    : []

  const selectedProcessKeys = Array.isArray(row.selectedProcessKeys)
    ? row.selectedProcessKeys.filter((k) => typeof k === 'string')
    : []

  const quantity = clampQty(row.quantity ?? 1)
  const lineSubtotal = asFiniteMoney(row.lineSubtotal)
  const lineDiscount = asFiniteMoney(row.lineDiscount)
  const lineTotal = asFiniteMoney(row.lineTotal)
  const unitPrice = asFiniteMoney(row.unitPrice)
  const designDocument = parseDesignDocument((row as { designDocument?: unknown }).designDocument)
  if ((row as { designDocument?: unknown }).designDocument && !designDocument) {
    return null
  }

  return {
    key: row.key,
    productId: row.productId,
    productSlug: row.productSlug,
    categorySlug: typeof row.categorySlug === 'string' ? row.categorySlug : undefined,
    title: row.title,
    quantity,
    variantId: typeof row.variantId === 'string' ? row.variantId : null,
    variantLabel: typeof row.variantLabel === 'string' ? row.variantLabel : null,
    options,
    selectedProcessKeys,
    unitPrice,
    lineSubtotal,
    lineDiscount,
    lineTotal,
    imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : null,
    imageEmoji: typeof row.imageEmoji === 'string' ? row.imageEmoji : null,
    weight: typeof row.weight === 'number' ? row.weight : null,
    designDocument,
  }
}

interface CartContextValue {
  items: CartItem[]
  itemCount: number
  subtotal: number
  discountTotal: number
  total: number
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
  addItem: (item: CartItem) => void
  removeItem: (key: string) => void
  updateQuantity: (key: string, quantity: number) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

function clampQty(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1
  return Math.max(1, Math.min(999, Math.floor(quantity)))
}

function QtyBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <IconButton
      aria-label={label}
      size="small"
      onClick={onClick}
      disabled={disabled}
      sx={{
        width: 24,
        height: 24,
        borderRadius: 0.8,
        border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`,
        color: alpha(brandTokens.parchment, 0.8),
        fontSize: '0.85rem',
        lineHeight: 1,
        '&:disabled': { opacity: 0.3 },
        '&:hover': { background: alpha(brandTokens.forgeGold, 0.12) },
      }}
    >
      {children}
    </IconButton>
  )
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [items, setItems] = useState<CartItem[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)

  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as CartItem[]
      if (!Array.isArray(parsed)) return
      const normalized = parsed
        .map((item) => normalizeCartItem(item))
        .filter((item): item is CartItem => item !== null)
      setItems(normalized)
    } catch {
      // Ignore malformed storage.
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Ignore storage write errors.
    }
  }, [items])

  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + clampQty(item.quantity), 0),
    [items]
  )

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.lineSubtotal, 0),
    [items]
  )

  const discountTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.lineDiscount, 0),
    [items]
  )

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.lineTotal, 0),
    [items]
  )

  function addItem(next: CartItem) {
    setItems((prev) => {
      const existing = prev.find((item) => item.key === next.key)
      if (!existing) return [...prev, { ...next, quantity: clampQty(next.quantity) }]

      const mergedQty = clampQty(existing.quantity + next.quantity)
      const unitSubtotal = next.quantity > 0 ? next.lineSubtotal / next.quantity : next.unitPrice
      const unitDiscount = next.quantity > 0 ? next.lineDiscount / next.quantity : 0
      const unitTotal = next.quantity > 0 ? next.lineTotal / next.quantity : next.unitPrice

      return prev.map((item) => {
        if (item.key !== next.key) return item
        return {
          ...item,
          quantity: mergedQty,
          unitPrice: next.unitPrice,
          lineSubtotal: unitSubtotal * mergedQty,
          lineDiscount: unitDiscount * mergedQty,
          lineTotal: unitTotal * mergedQty,
          imageUrl: next.imageUrl ?? item.imageUrl,
          imageEmoji: next.imageEmoji ?? item.imageEmoji,
          selectedProcessKeys: next.selectedProcessKeys ?? item.selectedProcessKeys,
          designDocument: next.designDocument ?? item.designDocument ?? null,
        }
      })
    })
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((item) => item.key !== key))
  }

  function updateQuantity(key: string, quantity: number) {
    const nextQty = clampQty(quantity)
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item
        const unitSubtotal = item.quantity > 0 ? item.lineSubtotal / item.quantity : item.unitPrice
        const unitDiscount = item.quantity > 0 ? item.lineDiscount / item.quantity : 0
        const unitTotal = item.quantity > 0 ? item.lineTotal / item.quantity : item.unitPrice
        return {
          ...item,
          quantity: nextQty,
          lineSubtotal: unitSubtotal * nextQty,
          lineDiscount: unitDiscount * nextQty,
          lineTotal: unitTotal * nextQty,
        }
      })
    )
  }

const clearCart = useCallback(() => {
    setItems([])
  }, [])

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount,
      subtotal,
      discountTotal,
      total,
      drawerOpen,
      openDrawer,
      closeDrawer,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
    }),
    [items, itemCount, subtotal, discountTotal, total, drawerOpen, clearCart]
  )

  const HEADER_HEIGHT = { xs: 64, md: 72 }

  return (
    <CartContext.Provider value={value}>
      {children}

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={closeDrawer}
        sx={{ zIndex: (theme) => theme.zIndex.appBar - 1 }}
        PaperProps={{
          sx: {
            width: { xs: '92vw', sm: 380, md: 400 },
            top: HEADER_HEIGHT,
            height: { xs: 'calc(100% - 64px)', md: 'calc(100% - 72px)' },
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: alpha(brandTokens.bgCard, 0.98),
            backgroundImage: `linear-gradient(160deg, ${alpha(brandTokens.bgCard, 0.99)} 0%, ${alpha(brandTokens.forgeGold, 0.03)} 100%)`,
            borderLeft: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
          },
        }}
      >
        {/* ── Header row ─────────────────────────────── */}
        <Box
          sx={{
            px: 2,
            py: 1.2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
            flexShrink: 0,
          }}
        >
          <Typography
            sx={{
              fontFamily: 'var(--font-cinzel, serif)',
              fontWeight: 700,
              fontSize: '1rem',
              letterSpacing: '0.04em',
            }}
          >
            Cart{items.length > 0 ? ` (${itemCount})` : ''}
          </Typography>
          <IconButton aria-label="Close cart" size="small" onClick={closeDrawer}
            sx={{ color: alpha(brandTokens.parchment, 0.7) }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* ── Item list ──────────────────────────────── */}
        {items.length === 0 ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.4, px: 3, pb: 4 }}>
            <Typography sx={{ fontSize: '2rem' }}>🛒</Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), textAlign: 'center' }}>
              Your cart is empty.
            </Typography>
            <Button variant="outlined" onClick={() => { closeDrawer(); router.push('/shop') }}>
              Browse Shop
            </Button>
          </Box>
        ) : (
          <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1.2, display: 'grid', gap: 1 }}>
            {items.map((item) => (
              <Box
                key={item.key}
                sx={{
                  border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                  borderRadius: 1.4,
                  p: 1.1,
                  background: `linear-gradient(135deg, ${alpha(brandTokens.bgCard, 0.99)} 0%, ${alpha(brandTokens.parchment, 0.03)} 100%)`,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.8 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.84rem', lineHeight: 1.3 }}>
                      {item.title}
                    </Typography>
                    {item.variantLabel && (
                      <Typography sx={{ fontSize: '0.72rem', color: alpha(brandTokens.parchment, 0.58), mt: 0.15 }}>
                        {item.variantLabel}
                      </Typography>
                    )}
                    {item.options.length > 0 && (
                      <Typography sx={{ fontSize: '0.68rem', color: alpha(brandTokens.parchment, 0.48), mt: 0.1 }}>
                        {item.options.map((o) => o.valueLabel ?? o.value).join(' · ')}
                      </Typography>
                    )}
                    {item.selectedProcessKeys && item.selectedProcessKeys.length > 0 && (
                      <Typography sx={{ fontSize: '0.68rem', color: alpha(brandTokens.forgeGold, 0.7), mt: 0.1 }}>
                        {item.selectedProcessKeys.map((k) => k.replace(/_/g, ' ')).join(' + ')}
                      </Typography>
                    )}
                  </Box>
                  <IconButton
                    aria-label={`Remove ${item.title}`}
                    size="small"
                    onClick={() => removeItem(item.key)}
                    sx={{ color: alpha(brandTokens.parchment, 0.42), alignSelf: 'flex-start', p: 0.3 }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
                  </IconButton>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <QtyBtn
                      label="Decrease quantity"
                      disabled={item.quantity <= 1}
                      onClick={() => updateQuantity(item.key, item.quantity - 1)}
                    >−</QtyBtn>
                    <Typography sx={{ minWidth: 22, textAlign: 'center', fontSize: '0.82rem' }}>
                      {item.quantity}
                    </Typography>
                    <QtyBtn
                      label="Increase quantity"
                      onClick={() => updateQuantity(item.key, item.quantity + 1)}
                    >+</QtyBtn>
                  </Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.84rem', fontFamily: 'var(--font-cinzel, serif)' }}>
                    ${item.lineTotal.toFixed(2)}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/* ── Totals + actions ───────────────────────── */}
        {items.length > 0 && (
          <Box
            sx={{
              flexShrink: 0,
              borderTop: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
              px: 2,
              py: 1.4,
              display: 'grid',
              gap: 0.6,
            }}
          >
            {discountTotal > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.8rem', color: alpha(brandTokens.parchment, 0.62) }}>Discounts</Typography>
                <Typography sx={{ fontSize: '0.8rem', color: brandTokens.forgeGoldLight }}>−${discountTotal.toFixed(2)}</Typography>
              </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
              <Typography sx={{ fontWeight: 700 }}>Total</Typography>
              <Typography sx={{ fontWeight: 700, fontFamily: 'var(--font-cinzel, serif)' }}>${total.toFixed(2)}</Typography>
            </Box>
            <Button
              variant="contained"
              fullWidth
              size="small"
              sx={{ py: 0.7, fontSize: '0.85rem', mb: 0.5 }}
              onClick={() => { closeDrawer(); router.push('/checkout') }}
            >
              Checkout
            </Button>
            <Button
              variant="outlined"
              fullWidth
              size="small"
              sx={{ py: 0.55, fontSize: '0.8rem' }}
              onClick={() => { closeDrawer(); router.push('/cart') }}
            >
              View Full Cart
            </Button>
          </Box>
        )}
      </Drawer>
    </CartContext.Provider>
  )
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within CartProvider.')
  }
  return context
}
