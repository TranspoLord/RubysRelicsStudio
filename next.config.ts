import type { NextConfig } from 'next'

import { supabaseRemotePatterns } from './src/lib/security/remote-patterns'

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            // OCT #69: `payment=(self "https://js.stripe.com")` outlived Stripe.
            // Square Checkout is a hosted redirect, so this origin is never a
            // Payment Request frame here.
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
          // SEC-047: Content-Security-Policy is now set dynamically in proxy.ts
          // (the Next 16 name for middleware) with a per-request nonce. The
          // static placeholder here has been removed.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
  images: {
    // OCT #69: pinned to this project's hostname (from NEXT_PUBLIC_SUPABASE_URL)
    // instead of `*.supabase.co` — see src/lib/security/remote-patterns.ts.
    remotePatterns: supabaseRemotePatterns(),
  },
}

export default nextConfig