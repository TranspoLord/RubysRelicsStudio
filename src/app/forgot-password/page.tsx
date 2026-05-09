'use client'

import { useState } from 'react'
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

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch('/api/customer/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send reset email')
      }

      setMessage({
        type: 'success',
        text: 'If an account exists with that email, you will receive a password reset link shortly.',
      })
      setEmail('')
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to send reset email',
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
          { label: 'Forgot Password', href: '/forgot-password' },
        ]}
      />

      <Container maxWidth="sm" sx={{ py: 6, flex: 1 }}>
        <Box sx={{ display: 'grid', gap: 3 }}>
          <Box>
            <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
              Forgot Password?
            </Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.7) }}>
              Enter your email address and we'll send you a link to reset your password.
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
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                fullWidth
                required
              />

              <Button
                variant="contained"
                type="submit"
                disabled={loading || !email.trim()}
                startIcon={loading ? <CircularProgress size={20} /> : undefined}
                fullWidth
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
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

          <Box sx={{ textAlign: 'center', pt: 2 }}>
            <Typography variant="body2">
              Don't have an account?{' '}
              <Link href="/signup" sx={{ cursor: 'pointer' }}>
                Sign up here
              </Link>
            </Typography>
          </Box>
        </Box>
      </Container>

      <Footer />
    </Box>
  )
}
