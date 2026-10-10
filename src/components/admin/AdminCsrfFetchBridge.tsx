'use client'

import { useEffect } from 'react'

/**
 * OCT #6: the admin mutations that predate the `/api/admin` namespace.
 *
 * Every one of these is authenticated and CSRF-checked server-side
 * (`requireAdminApiSession` → `requireCsrf`), but they sit outside the edge gate,
 * so the fetch bridge has to name them explicitly instead of matching
 * `/api/admin`. Moving the routes under `/api/admin` is the follow-up; this list
 * is what the `admin-fetch-scope` contract test allows.
 */
export const ADMIN_MUTATION_PREFIXES = [
  '/api/admin',
  '/api/custom-orders/',
  '/api/designs/export',
] as const

function getCookieValue(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function shouldAttachCsrfHeader(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return false
  }

  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url

  const target = new URL(url, window.location.origin)

  // Only attach for same-origin admin APIs.
  if (target.origin !== window.location.origin) return false
  if (!ADMIN_MUTATION_PREFIXES.some((prefix) => target.pathname.startsWith(prefix))) return false

  return true
}

export function AdminCsrfFetchBridge() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (!shouldAttachCsrfHeader(input, init)) {
        return originalFetch(input, init)
      }

      const token = getCookieValue('rrs_csrf')
      if (!token) {
        return originalFetch(input, init)
      }

      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      if (!headers.has('x-csrf-token')) {
        headers.set('x-csrf-token', token)
      }

      return originalFetch(input, {
        ...init,
        headers,
      })
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return null
}
