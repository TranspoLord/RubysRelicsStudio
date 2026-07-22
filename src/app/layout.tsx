import type { Metadata, Viewport } from 'next'
import { Cinzel, Inter } from 'next/font/google'
import { headers } from 'next/headers'
import { Analytics } from '@vercel/analytics/react'
import { ThemeRegistry } from '@/theme/ThemeRegistry'
import { SkipToMain } from '@/components/common/SkipToMain'
import { CookieBanner } from '@/components/common/CookieBanner'
import { CartProvider } from '@/components/cart/CartProvider'
import './globals.css'

// ─── Fonts ────────────────────────────────────────────────────────────────────
const cinzel = Cinzel({
  subsets: ['latin'],
  variable: '--font-cinzel',
  display: 'swap',
  weight: ['400', '600', '700'],
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// ─── Metadata ─────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: {
    default: "Ruby's Relics Studio",
    template: "%s | Ruby's Relics Studio",
  },
  description:
    'Handcrafted treasures forged with laser precision. Custom laser engravings, sublimation printing, and made-to-order creations. One-dragon studio — each piece made with care.',
  keywords: [
    'laser engraving',
    'sublimation',
    'custom gifts',
    'personalized drinkware',
    'wood signs',
    'leather goods',
    'handmade',
    'made to order',
  ],
  authors: [{ name: "Ruby's Relics Studio" }],
  creator: "Ruby's Relics Studio",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    siteName: "Ruby's Relics Studio",
    title: "Ruby's Relics Studio — Forged in Fire. Gathered for Your Hoard.",
    description:
      'Custom laser engravings, sublimation gifts, and handcrafted treasures made to order by a one-dragon studio.',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0C0A07',
}

// ─── Root layout ─────────────────────────────────────────────────────────────
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // SEC-047: Read the CSP nonce set by middleware so Next.js can add it to
  // its injected inline scripts. Without this, the CSP blocks Next.js's own
  // bootstrap scripts and the page won't function (including controlled inputs).
  const headersList = await headers()
  const nonce = headersList.get('x-nonce') ?? ''

  return (
    <html lang="en" className={`${cinzel.variable} ${inter.variable}`}>
      <body nonce={nonce}>
        <ThemeRegistry>
          <CartProvider>
            <SkipToMain />
            {children}
          </CartProvider>
        </ThemeRegistry>
        {/* Vercel Analytics — aggregate only, no PII in events */}
        <Analytics />
        {/* Cookie consent banner — client-only, no SSR */}
        <CookieBanner />
      </body>
    </html>
  )
}
