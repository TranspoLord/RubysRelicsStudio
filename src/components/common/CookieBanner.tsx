"use client"

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Link from '@mui/material/Link'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import {
  createAcceptedConsent,
  defaultConsentState,
  readConsentState,
  shouldShowCookieBanner,
  type CookieConsentState,
  writeConsentState,
} from '@/lib/cookie-consent'
import { brandTokens } from '@/theme/theme'

/**
 * Space the fixed bar reserves at the bottom of the viewport while it is up.
 * §8.2: the bar covered the Street / City / ZIP fields on `/checkout`, so a
 * focused control could sit underneath it. `scroll-padding-bottom` makes the
 * browser stop short of the bar instead. Slightly above the measured 87 px so
 * the focused control clears the border too.
 */
const BANNER_SCROLL_PADDING_PX = 104

/**
 * Banner actions are touch targets: the audit measured all three at 31 px (§8.2),
 * under the 44 px comfortable minimum on a phone.
 */
const bannerActionSx = { fontSize: 13, minHeight: { xs: 44, sm: 36 } }

export function CookieBanner() {
  const pathname = usePathname()
  // §9.2: consent is a storefront concern. The banner is mounted in the root
  // layout, so inside `/admin` this fixed bar sat over the module rail and made
  // "Abandoned Carts" and "Homepage" unclickable until it was dismissed.
  const suppressed = !shouldShowCookieBanner(pathname)
  const [visible, setVisible] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [state, setState] = useState<CookieConsentState>(defaultConsentState())

  useEffect(() => {
    if (suppressed) return

    const stored = readConsentState()
    if (!stored) {
      // Slight delay so the page renders first
      const timer = window.setTimeout(() => setVisible(true), 800)
      return () => window.clearTimeout(timer)
    }

    setState(stored)
  }, [suppressed])

  // §8.2: keep the bar from burying whatever the user is interacting with.
  useEffect(() => {
    if (!visible) return

    const root = document.documentElement
    const previous = root.style.scrollPaddingBottom
    root.style.scrollPaddingBottom = `${BANNER_SCROLL_PADDING_PX}px`
    return () => {
      root.style.scrollPaddingBottom = previous
    }
  }, [visible])

  function persistAndClose(next: CookieConsentState) {
    setState(next)
    writeConsentState(next)
    setVisible(false)
    setDialogOpen(false)
  }

  function handleAcceptAll() {
    persistAndClose(createAcceptedConsent(true, true))
  }

  function handleEssentialOnly() {
    persistAndClose(createAcceptedConsent(false, false))
  }

  function handleSavePreferences() {
    persistAndClose(
      createAcceptedConsent(state.preferences.analytics, state.preferences.preferences)
    )
  }

  function handleDismiss() {
    const next = defaultConsentState()
    next.level = 'dismissed'
    persistAndClose(next)
  }

  if (suppressed || !visible) return null

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

      <Box sx={{ display: 'flex', gap: 1.5, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button
          size="small"
          variant="text"
          onClick={() => setDialogOpen(true)}
          sx={{ ...bannerActionSx, color: brandTokens.forgeGold, px: 1.5 }}
          aria-label="Manage cookie preferences"
        >
          Manage
        </Button>
        <Button
          size="small"
          variant="text"
          onClick={handleEssentialOnly}
          sx={{ ...bannerActionSx, color: brandTokens.parchmentMuted, px: 2 }}
          aria-label="Use essential cookies only"
        >
          Essential Only
        </Button>
        <Button
          size="small"
          // The label colour, gradient and hover state all come from the theme's
          // `containedPrimary` (primary.contrastText = #0C0A07 ≈ 7:1 on gold).
          // Hard-coding `color: '#fff'` here produced the 2.81:1 (storefront) /
          // 1.67:1 (panel) defect in §8.2 / §9.2 — measured and pinned in
          // src/theme/theme.test.ts.
          variant="contained"
          color="primary"
          onClick={handleAcceptAll}
          sx={{ ...bannerActionSx, px: 2.5 }}
          aria-label="Accept cookies"
        >
          Accept
        </Button>
      </Box>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        aria-labelledby="cookie-preferences-title"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="cookie-preferences-title">Cookie Preferences</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Essential storage is always enabled for cart and session continuity. You can opt in to analytics and preference storage below.
          </Typography>

          <FormControlLabel
            control={<Switch checked disabled />}
            label="Essential storage (required)"
          />
          <FormControlLabel
            control={
              <Switch
                checked={state.preferences.analytics}
                onChange={(event) =>
                  setState((prev) => ({
                    ...prev,
                    preferences: { ...prev.preferences, analytics: event.target.checked },
                  }))
                }
              />
            }
            label="Analytics (aggregate performance insights)"
          />
          <FormControlLabel
            control={
              <Switch
                checked={state.preferences.preferences}
                onChange={(event) =>
                  setState((prev) => ({
                    ...prev,
                    preferences: { ...prev.preferences, preferences: event.target.checked },
                  }))
                }
              />
            }
            label="Preferences (remember UI choices)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDismiss}>Dismiss</Button>
          <Button onClick={handleSavePreferences} variant="contained">
            Save Preferences
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
