'use client'

import { useEffect, useRef } from 'react'
import { useCart } from '@/components/cart/CartProvider'

/**
 * OCT #13: only clear the cart when the page actually found the order. The old
 * version cleared it on *any* visit to `/checkout/success`, so opening the URL by
 * hand — or landing there after a failed payment — silently emptied a cart that
 * was never bought.
 */
export function ClearCartOnSuccess({ enabled }: { enabled: boolean }) {
  const { clearCart } = useCart()
  const cleared = useRef(false)

  useEffect(() => {
    if (!enabled || cleared.current) return
    cleared.current = true
    clearCart()
  }, [enabled, clearCart])

  return null
}