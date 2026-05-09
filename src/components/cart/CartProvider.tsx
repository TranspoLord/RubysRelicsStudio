'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

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
  unitPrice: number
  lineSubtotal: number
  lineDiscount: number
  lineTotal: number
  imageUrl?: string | null
  imageEmoji?: string | null
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

  const quantity = clampQty(row.quantity ?? 1)
  const lineSubtotal = asFiniteMoney(row.lineSubtotal)
  const lineDiscount = asFiniteMoney(row.lineDiscount)
  const lineTotal = asFiniteMoney(row.lineTotal)
  const unitPrice = asFiniteMoney(row.unitPrice)

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
    unitPrice,
    lineSubtotal,
    lineDiscount,
    lineTotal,
    imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : null,
    imageEmoji: typeof row.imageEmoji === 'string' ? row.imageEmoji : null,
  }
}

interface CartContextValue {
  items: CartItem[]
  itemCount: number
  subtotal: number
  discountTotal: number
  total: number
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

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

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

  function clearCart() {
    setItems([])
  }

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount,
      subtotal,
      discountTotal,
      total,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
    }),
    [items, itemCount, subtotal, discountTotal, total]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within CartProvider.')
  }
  return context
}
