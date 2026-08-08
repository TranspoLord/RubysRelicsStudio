'use client'

import { useEffect } from 'react'

function getCookieValue(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function shouldAttachCsrfHeader(input: RequestInfo | URL, init?: RequestInit): boolean {
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
  if (!target.pathname.startsWith('/api/admin')) return false

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
