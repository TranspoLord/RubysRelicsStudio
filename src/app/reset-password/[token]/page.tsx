'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Link from '@mui/material/Link'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { brandTokens } from '@/theme/theme'

interface PageProps {
  params: Promise<{ token: string }>
}

export default function ResetPasswordPage({ params }: PageProps) {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  // Extract token from params
  useEffect(() => {
    params.then((p) => {
      setToken(p.token)
    })
  }, [params])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    // Validate passwords match
    if (password !== passwordConfirm) {
      setMessage({ type: 'error', text: 'Passwords do not match.' })
      setLoading(false)
      return
    }

    if (password.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters.' })
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/customer/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to reset password')
      }

      setMessage({
        type: 'success',
        text: 'Password reset successfully! Redirecting to login...',
      })

      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to reset password',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />

      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Reset Password', href: '/reset-password' },
        ]}
      />

      <Container maxWidth="sm" sx={{ py: 6, flex: 1 }}>
        <Box sx={{ display: 'grid', gap: 3 }}>
          <Box>
            <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
              Reset Password
            </Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.7) }}>
              Enter your new password below.
            </Typography>
          </Box>

          {message && (
            <Alert severity={message.type} onClose={() => setMessage(null)}>
              {message.text}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Box sx={{ display: 'grid', gap: 2.2 }}>
              <TextField
                label="New Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                fullWidth
                required
                helperText="At least 8 characters"
              />

              <TextField
                label="Confirm Password"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                disabled={loading}
                fullWidth
                required
              />

              <Button
                variant="contained"
                type="submit"
                disabled={loading || !password || !passwordConfirm}
                startIcon={loading ? <CircularProgress size={20} /> : undefined}
                fullWidth
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </Button>
            </Box>
          </form>

          <Box sx={{ textAlign: 'center', pt: 1 }}>
            <Typography variant="body2">
              Remember your password?{' '}
              <Link href="/login" sx={{ cursor: 'pointer' }}>
                Log in here
              </Link>
            </Typography>
          </Box>
        </Box>
      </Container>

      <Footer />
    </Box>
  )
}
