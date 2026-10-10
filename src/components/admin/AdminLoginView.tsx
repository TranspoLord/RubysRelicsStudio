'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { AdminCsrfFetchBridge } from '@/components/admin/AdminCsrfFetchBridge'
import { useAuth } from '@/components/auth/AuthProvider'
import { SignIn } from '@/components/auth/SignIn'
import { ADMIN_ROLE } from '@/lib/auth/claims'
import { buildAuthCallbackUrl } from '@/lib/auth/redirect'
import { getBrowserSupabaseClient } from '@/lib/supabase/browser'
import { getSiteUrl } from '@/lib/supabase/env'
import { brandTokens } from '@/theme/theme'

export interface AdminLoginViewProps {
  /** Sanitized `/admin/**` destination for after the OAuth round trip. */
  nextPath: string
  /** Set when the page gate turned the visitor away (`?error=not_authorized`). */
  notAuthorizedNotice: boolean
  /** OCT #34 — the page gate found a session older than the configured TTL. */
  sessionExpiredNotice?: boolean
}

/**
 * Admin sign-in surface (§10.6).
 *
 * Reuses the storefront's `SignIn` (same Google/PKCE flow and the same
 * `AdminCsrfFetchBridge` the panel relies on), with an admin-toned heading.
 *
 * The client-side role check below is **display only**: it decides whether to
 * offer a "use a different account" action. Authorization is decided server
 * side by the Edge gate (§10.5) and the allow-list re-check (§10.3).
 */
export function AdminLoginView({
  nextPath,
  notAuthorizedNotice,
  sessionExpiredNotice = false,
}: AdminLoginViewProps) {
  const { user, isSignedIn, signOut } = useAuth()
  const router = useRouter()
  const [switching, setSwitching] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const expiredSignOutDone = useRef(false)

  /**
   * OCT #34: a session that outlived `admin_session.ttl_hours` must not be
   * reused. A refresh token keeps its `aal2` level, so signing in "again" on top
   * of the stale session would carry the old authentication forward. Signing out
   * first is what makes the next Google hop mint a fresh `amr` — and therefore a
   * fresh `authenticatedAt` for the TTL to measure from.
   */
  useEffect(() => {
    if (!sessionExpiredNotice || expiredSignOutDone.current) return
    expiredSignOutDone.current = true

    // Best effort: if the sign-out fails, the next OAuth hop still mints a new
    // session and the gate will simply reject the stale one again.
    void signOut().catch(() => undefined)
  }, [sessionExpiredNotice, signOut])

  const accountLabel = user?.email ?? user?.id ?? 'This Google account'

  // Reads `app_metadata`, never `user_metadata` — the latter is writable by the
  // signed-in user, so it must not influence even a display decision (§10.0).
  const signedInWithoutAdminRole = isSignedIn && user?.app_metadata?.role !== ADMIN_ROLE
  const showNotAuthorized = notAuthorizedNotice || signedInWithoutAdminRole

  /**
   * Mints a fresh access token from the current user record.
   *
   * A JWT carries the `app_metadata` it was issued with, so an account that was
   * granted (or lost) admin access *after* this session started keeps the old
   * roles until the token is renewed. Without this the only remedy is a full
   * sign-out/sign-in, which looks like the panel is broken.
   */
  async function handleRefreshAccess() {
    if (refreshing || switching) return
    setRefreshing(true)
    setError(null)

    try {
      const supabase = getBrowserSupabaseClient()
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) throw new Error(refreshError.message)

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh the session.')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleSwitchAccount() {
    if (switching) return
    setSwitching(true)
    setError(null)

    try {
      // Clear the current session first, then start OAuth again. Signing out is
      // what makes the next Google hop pick a different identity, and
      // prompt=select_account forces the chooser even if only one account is
      // signed in to the browser.
      await signOut()

      const supabase = getBrowserSupabaseClient()
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: buildAuthCallbackUrl(getSiteUrl(), nextPath),
          scopes: 'openid email profile',
          queryParams: { prompt: 'select_account' },
        },
      })

      if (oauthError) throw new Error(oauthError.message)
      // On success the browser navigates to Google; keep the busy state so the
      // button cannot be pressed twice.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch accounts.')
      setSwitching(false)
    }
  }

  return (
    <>
      <AdminCsrfFetchBridge />
      <Box
        component="main"
        id="main-content"
        sx={{ minHeight: '100vh', backgroundColor: brandTokens.bgVoid, py: { xs: 6, md: 8 } }}
      >
        <Container maxWidth="sm">
          {sessionExpiredNotice && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Your admin session expired, so the panel signed you out. Sign in again with Google to
              continue — that re-runs the second factor as well.
            </Alert>
          )}

          {showNotAuthorized && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <strong>{accountLabel}</strong> is not authorised for the admin panel. Only
              allow-listed Google accounts can open it. If this account was granted access just
              now, use <strong>Refresh access</strong> below — a sign-in token issued before the
              grant keeps the old roles until it is renewed.
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <SignIn
            next={nextPath}
            eyebrow="Admin Access"
            title="Sign in to the admin panel"
          />

          {signedInWithoutAdminRole && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
              <Button
                variant="contained"
                fullWidth
                onClick={handleRefreshAccess}
                disabled={refreshing || switching}
              >
                {refreshing ? 'Refreshing…' : 'Refresh access'}
              </Button>
              <Button
                variant="outlined"
                fullWidth
                onClick={handleSwitchAccount}
                disabled={switching || refreshing}
              >
                {switching ? 'Switching account…' : 'Use a different account'}
              </Button>
            </Stack>
          )}

          <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.82rem', mt: 2 }}>
            Access is re-checked against the admin allow-list on every request, so removing an
            account from the allow-list takes effect immediately — even for a session that is still
            signed in.
          </Typography>
        </Container>
      </Box>
    </>
  )
}
