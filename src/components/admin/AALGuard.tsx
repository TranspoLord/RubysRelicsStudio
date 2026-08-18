/**
 * @deprecated This component is not imported anywhere in the codebase.
 * Use requireAdminPageSessionOrRedirect() in Server Components or
 * requireAdminApiSession() in API routes for auth checks instead.
 *
 * This component has been updated to remove all insecure sessionStorage
 * usage. Session state is now exclusively managed via the httpOnly
 * rr_admin_session cookie, verified server-side via HMAC + DB lookup.
 */
'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Box, Typography, Button, CircularProgress } from '@mui/material'
import { brandTokens } from '@/theme/theme'
import { alpha } from '@mui/material/styles'

interface AALGuardProps {
  children: React.ReactNode
  requireMFA?: boolean
}

/**
 * Admin route guard that checks session-based MFA.
 *
 * SEC-047-FIX: Replaced sessionStorage checks (which were forgeable by XSS)
 * with server-side verification via /api/admin/session GET endpoint.
 *
 * @deprecated Use requireAdminPageSessionOrRedirect() instead.
 */
export function AALGuard({ children, requireMFA = true }: AALGuardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isLoading, setIsLoading] = useState(true)
  const [needsMFA, setNeedsMFA] = useState(false)

  useEffect(() => {
    // Skip MFA check on the MFA challenge page itself
    if (pathname === '/admin/mfa-challenge') {
      setIsLoading(false)
      return
    }

    // SEC-047-FIX: Check session validity via the server endpoint instead of
    // sessionStorage. This is a defense-in-depth check — the middleware
    // already blocks unauthenticated requests server-side.
    fetch('/api/admin/session', { method: 'GET' })
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          router.push('/admin/login')
          return
        }

        // If MFA is required and the session isn't MFA-verified,
        // redirect to the challenge page.
        if (requireMFA && !data.mfaVerified) {
          setNeedsMFA(true)
        } else {
          setNeedsMFA(false)
        }
        setIsLoading(false)
      })
      .catch(() => {
        // If the session check fails, redirect to login.
        router.push('/admin/login')
      })
  }, [pathname, requireMFA, router])

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <CircularProgress sx={{ color: brandTokens.forgeGold }} />
      </Box>
    )
  }

  if (needsMFA) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ color: brandTokens.parchment, mb: 2 }}>
          Two-Factor Authentication Required
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.7), mb: 3 }}>
          For security, MFA is required to access administrative areas.
        </Typography>
        <Button
          variant="contained"
          onClick={() => router.push('/admin/mfa-challenge')}
          sx={{ backgroundColor: brandTokens.forgeGold, color: brandTokens.bgVoid }}
        >
          Complete MFA Challenge
        </Button>
      </Box>
    )
  }

  return <>{children}</>
}
