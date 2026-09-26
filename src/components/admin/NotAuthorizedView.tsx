'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { useAuth } from '@/components/auth/AuthProvider'
import { brandTokens } from '@/theme/theme'

/**
 * "Signed in, but not an admin" surface (§10.4).
 *
 * Names the account that was turned away and offers the two things that help:
 * switch to a different Google account, or go back to the shop. Rendering the
 * account is safe — it is the visitor's own session, read client-side for
 * display only.
 */
export function NotAuthorizedView() {
  const { user, isSignedIn, signOut } = useAuth()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accountLabel = user?.email ?? user?.id ?? 'a Google account'

  async function handleSwitchAccount() {
    if (busy) return
    setBusy(true)
    setError(null)

    try {
      await signOut()
      router.replace('/admin/login')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out.')
      setBusy(false)
    }
  }

  return (
    <Box
      component="main"
      id="main-content"
      sx={{ minHeight: '100vh', backgroundColor: brandTokens.bgVoid, py: { xs: 6, md: 8 } }}
    >
      <Container maxWidth="sm">
        <Box
          sx={{
            borderRadius: 2,
            border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
            backgroundColor: alpha(brandTokens.bgSurface, 0.62),
            p: { xs: 2.2, md: 2.8 },
          }}
        >
          <Typography variant="overline" sx={{ color: brandTokens.forgeGold, display: 'block', mb: 1 }}>
            Admin Access
          </Typography>
          <Typography variant="h3" component="h1" sx={{ mb: 1.2 }}>
            Not authorised
          </Typography>

          <Typography sx={{ color: alpha(brandTokens.parchment, 0.68), mb: 2 }}>
            {isSignedIn ? (
              <>
                You are signed in as{' '}
                <Box component="span" sx={{ color: brandTokens.parchment }}>
                  {accountLabel}
                </Box>
                , which is not on the admin allow-list.
              </>
            ) : (
              'That account is not on the admin allow-list.'
            )}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="contained" onClick={handleSwitchAccount} disabled={busy}>
              {busy ? 'Signing out…' : 'Use a different account'}
            </Button>
            <Button variant="outlined" component="a" href="/">
              Back to the shop
            </Button>
          </Stack>
        </Box>
      </Container>
    </Box>
  )
}
