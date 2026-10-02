'use client'

import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import GoogleIcon from '@mui/icons-material/Google'
import LogoutIcon from '@mui/icons-material/Logout'
import { alpha } from '@mui/material/styles'

import { useAuth } from '@/components/auth/AuthProvider'
import { buildAuthCallbackUrl } from '@/lib/auth/redirect'
import { getBrowserSupabaseClient } from '@/lib/supabase/browser'
import { getSiteUrl } from '@/lib/supabase/env'
import { brandTokens } from '@/theme/theme'

export interface SignInProps {
  /** Same-origin path to return to after the OAuth round trip. */
  next?: string
  /** Overline above the heading. Defaults to `Account`. */
  eyebrow?: string
  /** Heading text. Defaults to `Sign in to Ruby's Relics`. */
  title?: string
}

/**
 * Google sign-in entry point.
 *
 * Uses Supabase Auth's `signInWithOAuth({ provider: 'google' })`, which
 * redirects the browser to Google (PKCE flow) and back to
 * `/auth/callback` where the code is exchanged for a cookie-backed session.
 *
 * Requires an `<AuthProvider>` ancestor (mounted in `src/app/layout.tsx`).
 */
export function SignIn({ next = '/', eyebrow, title }: SignInProps) {
  const { user, isSignedIn, isLoading, signOut } = useAuth()

  const [isRedirecting, setIsRedirecting] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGoogleSignIn() {
    if (isRedirecting) return

    setIsRedirecting(true)
    setError(null)

    try {
      const supabase = getBrowserSupabaseClient()
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: buildAuthCallbackUrl(getSiteUrl(), next),
          scopes: 'openid email profile',
          // Always show Google's account chooser instead of silently reusing
          // the last account — this is a shared-device-friendly storefront.
          queryParams: { prompt: 'select_account' },
        },
      })

      if (oauthError) {
        setError(oauthError.message)
        setIsRedirecting(false)
      }
      // On success the browser navigates to Google. The pending state is kept
      // on purpose so the button cannot be submitted twice.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Google sign-in.')
      setIsRedirecting(false)
    }
  }

  async function handleSignOut() {
    if (isSigningOut) return

    setIsSigningOut(true)
    setError(null)

    try {
      await signOut()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out.')
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
        backgroundColor: alpha(brandTokens.bgSurface, 0.62),
        p: { xs: 2.2, md: 2.8 },
      }}
    >
      {isLoading ? (
        <Stack alignItems="center" spacing={1.4} sx={{ py: 2 }}>
          <CircularProgress size={26} />
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.68), fontSize: '0.9rem' }}>
            Checking your session…
          </Typography>
        </Stack>
      ) : isSignedIn ? (
        <>
          <Typography variant="overline" sx={{ color: brandTokens.forgeGold, display: 'block', mb: 1 }}>
            Signed in
          </Typography>
          <Typography variant="h3" component="h1" sx={{ mb: 1.2 }}>
            Welcome back
          </Typography>
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.68), mb: 2 }}>
            You are signed in as <Box component="span" sx={{ color: brandTokens.parchment }}>
              {user?.email ?? user?.id ?? 'your Google account'}
            </Box>
            .
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 1.6 }}>
              {error}
            </Alert>
          )}

          <Button
            variant="outlined"
            onClick={handleSignOut}
            startIcon={<LogoutIcon />}
            disabled={isSigningOut}
          >
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </>
      ) : (
        <>
          <Typography variant="overline" sx={{ color: brandTokens.forgeGold, display: 'block', mb: 1 }}>
            {eyebrow ?? 'Account'}
          </Typography>
          <Typography variant="h3" component="h1" sx={{ mb: 1.2 }}>
            {title ?? "Sign in to Ruby's Relics"}
          </Typography>
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.68), mb: 2 }}>
            We use Google to sign you in — no password to remember, and we only ever see your
            name, email address, and profile picture.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 1.6 }}>
              {error}
            </Alert>
          )}

          <Button
            variant="contained"
            onClick={handleGoogleSignIn}
            startIcon={<GoogleIcon />}
            disabled={isRedirecting}
            aria-busy={isRedirecting}
            fullWidth
          >
            {isRedirecting ? 'Redirecting to Google…' : 'Continue with Google'}
          </Button>

          <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.78rem', mt: 1.6 }}>
            By continuing you agree to our terms of service and privacy policy.
          </Typography>
        </>
      )}
    </Box>
  )
}
