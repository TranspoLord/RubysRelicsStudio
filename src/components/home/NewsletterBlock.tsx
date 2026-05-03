'use client'

import { useState } from 'react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'
import { Analytics } from '@/lib/analytics/events'

type SubmitState = 'idle' | 'loading' | 'success' | 'error'

export function NewsletterBlock() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<SubmitState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email.trim()) return

    const trimmed = email.trim().toLowerCase()
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg('Please enter a valid email address.')
      return
    }

    setState('loading')
    setErrorMsg('')
    Analytics.newsletterSignupAttempted('homepage_footer')

    try {
      // TODO: Wire to /api/newsletter/subscribe → Resend contact list / Supabase consent record.
      // For now, simulate a short delay.
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setState('success')
      setEmail('')
    } catch {
      setState('error')
      setErrorMsg('Something went wrong. Please try again in a moment.')
    }
  }

  return (
    <Box
      component="section"
      aria-labelledby="newsletter-heading"
      sx={{
        py: { xs: 8, md: 10 },
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(160deg,
          ${alpha(brandTokens.bgSurface, 0.95)} 0%,
          ${alpha(brandTokens.forgeGoldDark, 0.08)} 50%,
          ${alpha(brandTokens.bgSurface, 0.95)} 100%
        )`,
        borderTop: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
      }}
    >
      {/* Glow */}
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 60% 70% at 50% 50%, ${alpha(brandTokens.forgeGold, 0.05)} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      <Container maxWidth="sm" sx={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <Box aria-hidden="true" sx={{ fontSize: '2.5rem', mb: 2 }}>
          📜
        </Box>

        <Typography
          variant="overline"
          sx={{ color: 'primary.main', display: 'block', mb: 1 }}
        >
          The Hoard Dispatch
        </Typography>

        <Typography
          id="newsletter-heading"
          variant="h2"
          component="h2"
          sx={{ color: 'text.primary', mb: 1.5 }}
        >
          Never Miss a New Treasure Drop
        </Typography>

        <Typography variant="body1" color="text.secondary" sx={{ mb: 5, lineHeight: 1.8 }}>
          Get new releases, seasonal collections, and limited-run creations before they vanish
          back into the hoard. No spam — only genuine forge updates.
        </Typography>

        {state === 'success' ? (
          <Box
            role="status"
            aria-live="polite"
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1.5,
              py: 3,
              px: 4,
              borderRadius: 2,
              backgroundColor: alpha('#4A7C3F', 0.15),
              border: `1px solid ${alpha('#4A7C3F', 0.3)}`,
            }}
          >
            <CheckCircleOutlineIcon sx={{ fontSize: '2rem', color: '#6BBF5A' }} />
            <Typography variant="h6" sx={{ color: 'text.primary' }}>
              You&apos;re in the hoard!
            </Typography>
            <Typography variant="body2" color="text.secondary">
              We&apos;ll send you updates on new drops and seasonal specials.
            </Typography>
          </Box>
        ) : (
          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            aria-label="Newsletter signup form"
          >
            <Box
              sx={{
                display: 'flex',
                gap: 1.5,
                flexDirection: { xs: 'column', sm: 'row' },
                justifyContent: 'center',
              }}
            >
              <TextField
                type="email"
                name="email"
                id="newsletter-email"
                label="Your email address"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrorMsg('') }}
                required
                aria-required="true"
                aria-describedby={errorMsg ? 'newsletter-error' : undefined}
                error={!!errorMsg}
                disabled={state === 'loading'}
                autoComplete="email"
                inputProps={{ 'aria-label': 'Email address for newsletter' }}
                sx={{ flex: 1, maxWidth: 340 }}
              />
              <Button
                type="submit"
                variant="contained"
                color="primary"
                size="large"
                disabled={state === 'loading' || !email.trim()}
                startIcon={
                  state === 'loading' ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <AutoAwesomeIcon sx={{ fontSize: '1rem' }} />
                  )
                }
                sx={{ flexShrink: 0, px: 3 }}
              >
                {state === 'loading' ? 'Joining…' : 'Join the Hoard'}
              </Button>
            </Box>

            {errorMsg && (
              <Typography
                id="newsletter-error"
                role="alert"
                variant="body2"
                sx={{ color: 'error.main', mt: 1, textAlign: 'left' }}
              >
                {errorMsg}
              </Typography>
            )}

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              You can unsubscribe at any time. We store your consent with a timestamp and source.
              See our{' '}
              <Box
                component="a"
                href="/resources/privacy"
                sx={{ color: 'primary.light', '&:hover': { color: 'primary.main' } }}
              >
                Privacy Policy
              </Box>
              .
            </Typography>
          </Box>
        )}
      </Container>
    </Box>
  )
}
