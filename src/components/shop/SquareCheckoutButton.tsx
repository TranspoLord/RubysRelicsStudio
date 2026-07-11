'use client'

import Button from '@mui/material/Button'
import { useState } from 'react'

interface CartItemForSquare {
  productId: string
  title: string
  quantity: number
  unitPrice: number
  selectedProcessKeys?: string[]
}

interface SquareCheckoutButtonProps {
  items: CartItemForSquare[]
  disabled?: boolean
}

export function SquareCheckoutButton({ items, disabled }: SquareCheckoutButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleCheckout() {
    setLoading(true)
    try {
      const response = await fetch('/api/square/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error ?? 'Could not create checkout')
      }

      window.location.href = data.checkoutUrl
    } catch (error) {
      console.error('[square-checkout]', error)
      alert(error instanceof Error ? error.message : 'Checkout failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="contained"
      color="primary"
      onClick={() => void handleCheckout()}
      disabled={disabled ?? loading}
    >
      {loading ? 'Processing...' : 'Checkout with Square'}
    </Button>
  )
}