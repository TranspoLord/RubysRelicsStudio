'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Box, Typography, TextField, Button, Alert, Paper } from '@mui/material'
import { brandTokens } from '@/theme/theme'
import { alpha } from '@mui/material/styles'
import { RubyMascot } from '@/components/mascot/RubyMascot'
import { collectDeviceFingerprint } from '@/lib/fingerprint'

export default function MFAChallengePage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codeSent, setCodeSent] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [fingerprintHash, setFingerprintHash] = useState<string | null>(null)

  useEffect(() => {
    // Check if admin has completed password login
    const isLoggedIn = sessionStorage.getItem('admin_authenticated') === 'true'
    if (!isLoggedIn) {
      router.push('/admin/login')
    }
  }, [router])

  // Collect device fingerprint on mount
  useEffect(() => {
    collectDeviceFingerprint().then((fp) => {
      setFingerprintHash(fp.hash)
    }).catch((err) => {
      console.warn('[MFA] Failed to collect device fingerprint:', err)
    })
  }, [])

  // Countdown timer for code expiration
  useEffect(() => {
    if (countdown <= 0) return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [countdown])

  const handleSendCode = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/send-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceFingerprint: fingerprintHash,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send code')
      }

      setCodeSent(true)
      setCountdown(600) // 10 minutes
    } catch (err: any) {
      setError(err.message ?? 'Failed to send verification code')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/verify-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          deviceFingerprint: fingerprintHash,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed')
      }

      // Mark MFA as verified in session
      sessionStorage.setItem('admin_mfa_verified', 'true')

      // Redirect to the admin panel
      router.push('/admin')
    } catch (err: any) {
      setError(err.message ?? 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Paper
        sx={{
          p: 4,
          maxWidth: 400,
          width: '100%',
          backgroundColor: alpha(brandTokens.bgVoid, 0.8),
          border: `1px solid ${alpha(brandTokens.forgeGold, 0.3)}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <RubyMascot placement="checkout" mood="neutral" />
          <Typography variant="h5" sx={{ color: brandTokens.parchment }}>
            Two-Factor Authentication
          </Typography>
        </Box>

        <Typography sx={{ color: alpha(brandTokens.parchment, 0.7), mb: 2 }}>
          Enter the 6-digit code sent to your email to complete login.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {codeSent && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Code sent! Check your email. Code expires in {formatTime(countdown)}
          </Alert>
        )}

        <TextField
          label="Verification Code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          fullWidth
          inputProps={{ maxLength: 6, placeholder: '000000' }}
          sx={{
            mb: 2,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(brandTokens.parchment, 0.3),
            },
          }}
        />

        <Button
          variant="contained"
          fullWidth
          onClick={handleVerify}
          disabled={loading || !code || code.length < 6}
          sx={{
            mb: 1,
            backgroundColor: brandTokens.forgeGold,
            color: brandTokens.bgVoid,
          }}
        >
          Verify Code
        </Button>

        <Button
          variant="contained"
          fullWidth
          onClick={handleSendCode}
          disabled={loading || countdown > 0}
          sx={{
            backgroundColor: alpha(brandTokens.forgeGold, 0.7),
            color: brandTokens.bgVoid,
          }}
        >
          {countdown > 0 ? `Resend in ${formatTime(countdown)}` : 'Send Code to Email'}
        </Button>
      </Paper>
    </Box>
  )
}