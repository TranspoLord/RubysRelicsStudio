'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Box, Typography, TextField, Button, Alert, Paper } from '@mui/material'
import { brandTokens } from '@/theme/theme'
import { alpha } from '@mui/material/styles'
import { RubyMascot } from '@/components/mascot/RubyMascot'

export default function MFAChallengePage() {
  const router = useRouter()
  const [totp, setTotp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showQR, setShowQR] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState('')

  useEffect(() => {
    // Check if admin has completed password login
    const isLoggedIn = sessionStorage.getItem('admin_authenticated') === 'true'
    if (!isLoggedIn) {
      router.push('/admin/login')
      return
    }

    // Generate QR code URL for enrollment
    const secret = process.env.NEXT_PUBLIC_ADMIN_TOTP_SECRET || 'JBSWY3DPEHPK3PXP'
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=otpauth://totp/RubysRelics?secret=${secret}&issuer=RubysRelics`
    setQrCodeUrl(qrUrl)
  }, [router])

  const handleVerify = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/verify-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totp }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed')
      }

      // Redirect to the admin panel
      router.push('/admin')
    } catch (err: any) {
      setError(err.message ?? 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  const handleShowQR = () => {
    setShowQR(true)
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
          Enter the 6-digit code from your authenticator app (Google Authenticator, Authy, etc.).
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {showQR && qrCodeUrl && (
          <Box sx={{ mb: 2, textAlign: 'center' }}>
            <img src={qrCodeUrl} alt="TOTP QR Code" style={{ maxWidth: '100%' }} />
            <Typography variant="caption" sx={{ color: alpha(brandTokens.parchment, 0.5), mt: 1, display: 'block' }}>
              Scan this QR code with your authenticator app
            </Typography>
          </Box>
        )}

        <TextField
          label="Authentication Code"
          value={totp}
          onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
          disabled={loading || !totp || totp.length < 6}
          sx={{
            mb: 1,
            backgroundColor: brandTokens.forgeGold,
            color: brandTokens.bgVoid,
          }}
        >
          Verify Code
        </Button>

        <Button
          variant="outlined"
          fullWidth
          onClick={handleShowQR}
          disabled={loading}
          sx={{
            borderColor: alpha(brandTokens.parchment, 0.3),
            color: brandTokens.parchment,
          }}
        >
          Show QR Code
        </Button>
      </Paper>
    </Box>
  )
}