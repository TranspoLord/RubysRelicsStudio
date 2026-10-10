'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * OCT #13: while Square is still confirming the payment, refresh the server
 * component every few seconds so the page updates itself instead of leaving the
 * customer on "Awaiting payment". It stops after `maxAttempts` so an abandoned
 * tab does not poll forever, and it stops as soon as the server render reports a
 * settled payment (`active` flips to false).
 */
export function OrderStatusPoller({
  active,
  intervalMs = 5000,
  maxAttempts = 12,
}: {
  active: boolean
  intervalMs?: number
  maxAttempts?: number
}) {
  const router = useRouter()
  const attempts = useRef(0)

  useEffect(() => {
    if (!active) return

    attempts.current = 0
    const timer = setInterval(() => {
      attempts.current += 1
      if (attempts.current > maxAttempts) {
        clearInterval(timer)
        return
      }
      router.refresh()
    }, intervalMs)

    return () => clearInterval(timer)
  }, [active, intervalMs, maxAttempts, router])

  return null
}
