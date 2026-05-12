"use client"

import { useEffect, useState } from 'react'
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
  type CookieConsentState,
  writeConsentState,
} from '@/lib/cookie-consent'
import { brandTokens } from '@/theme/theme'

export function CookieBanner() {
  const [visible, setVisible] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [state, setState] = useState<CookieConsentState>(defaultConsentState())

  useEffect(() => {
    const stored = readConsentState()
    if (!stored) {
      // Slight delay so the page renders first
      const timer = window.setTimeout(() => setVisible(true), 800)
      return () => window.clearTimeout(timer)
    }

    setState(stored)
  }, [])

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
          onClick={() => setDialogOpen(true)}
          sx={{ color: brandTokens.forgeGold, fontSize: 13, px: 1.5 }}
          aria-label="Manage cookie preferences"
        >
          Manage
        </Button>
        <Button
          size="small"
          variant="text"
          onClick={handleEssentialOnly}
          sx={{ color: '#999', fontSize: 13, px: 2 }}
          aria-label="Use essential cookies only"
        >
          Essential Only
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={handleAcceptAll}
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
