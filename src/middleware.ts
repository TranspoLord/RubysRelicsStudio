import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Security headers middleware
 * Adds hardening headers to every response for defense-in-depth.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Harden response headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Permissions Policy — restrict which APIs and features can be used
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  )

  // Content Security Policy
  // Relaxed enough for MUI Emotion's inline styles and Resend/Shippo/Square APIs
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // unsafe-eval needed for Next.js dev, unsafe-inline for MUI
    "style-src 'self' 'unsafe-inline'",                 // MUI/Emotion inline styles
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]

  response.headers.set('Content-Security-Policy', cspDirectives.join('; '))

  return response
}

// Apply to all routes except static assets
export const config = {
  matcher: [
    // Skip static files and internal Next.js paths
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}