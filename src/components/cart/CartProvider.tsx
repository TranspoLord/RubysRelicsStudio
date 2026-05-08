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
      setItems(parsed)
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
