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

// Session key for MFA verification state
const MFA_SESSION_KEY = 'admin_mfa_verified'

// Admin route guard that checks session-based MFA
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

    // Check if admin has completed password login
    const isLoggedIn = sessionStorage.getItem('admin_authenticated') === 'true'
    if (!isLoggedIn) {
      router.push('/admin/login')
      return
    }

    // Check if MFA has been verified in this session
    const mfaVerified = sessionStorage.getItem(MFA_SESSION_KEY) === 'true'

    if (requireMFA && !mfaVerified) {
      setNeedsMFA(true)
    } else {
      setNeedsMFA(false)
    }

    setIsLoading(false)
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

// Helper to mark MFA as verified (call from mfa-challenge on success)
export function setMFAVerified(verified: boolean) {
  if (verified) {
    sessionStorage.setItem(MFA_SESSION_KEY, 'true')
  } else {
    sessionStorage.removeItem(MFA_SESSION_KEY)
  }
}

// Helper to check MFA status
export function isMFAVerified(): boolean {
  return sessionStorage.getItem(MFA_SESSION_KEY) === 'true'
}