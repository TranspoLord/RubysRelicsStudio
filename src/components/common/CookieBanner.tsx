"use client"

import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

const CONSENT_KEY = 'rr_cookie_consent'
const CONSENT_VERSION = '1'

function getStoredConsent(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(CONSENT_KEY)
  } catch {
    return null
  }
}

function storeConsent(value: string): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, value)
  } catch {
    // localStorage unavailable — silently skip
  }
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const stored = getStoredConsent()
    if (!stored) {
      // Slight delay so the page renders first
      const timer = window.setTimeout(() => setVisible(true), 800)
      return () => window.clearTimeout(timer)
    }
  }, [])

  function handleAccept() {
    storeConsent(CONSENT_VERSION)
    setVisible(false)
  }

  function handleDismiss() {
    // Dismissed without explicit acceptance — store a "dismissed" marker so
    // we do not pester on every page load in the same session.
    storeConsent('dismissed')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <Box
      role="region"
      aria-label="Cookie consent"
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 2000,
        background: alpha('#1a1a1a', 0.97),
        borderTop: `2px solid ${brandTokens.forgeGold}`,
        px: { xs: 2, sm: 4 },
        py: { xs: 2, sm: 2.5 },
        display: 'flex',
        alignItems: { sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 2,
      }}
    >
      <Typography
        variant="body2"
        sx={{ color: '#e5e5e5', flex: 1, lineHeight: 1.6 }}
      >
        We use essential cookies to keep your cart and preferences. We also use
        Vercel Analytics for aggregate storefront performance — no personal data
        is tracked.{' '}
        <Link
          href="/resources/cookies"
          sx={{ color: brandTokens.forgeGold, textDecoration: 'underline' }}
        >
          Cookie policy
        </Link>
        .
      </Typography>

      <Box sx={{ display: 'flex', gap: 1.5, flexShrink: 0, flexWrap: 'wrap' }}>
        <Button
          size="small"
          variant="text"
          onClick={handleDismiss}
          sx={{ color: '#999', fontSize: 13, px: 2 }}
          aria-label="Dismiss cookie notice"
        >
          Dismiss
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={handleAccept}
          sx={{
            background: brandTokens.forgeGold,
            color: '#fff',
            fontSize: 13,
            px: 2.5,
            '&:hover': { background: brandTokens.forgeGoldDark },
          }}
          aria-label="Accept cookies"
        >
          Accept
        </Button>
      </Box>
    </Box>
  )
}
