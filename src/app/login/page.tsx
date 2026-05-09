'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { brandTokens } from '@/theme/theme'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch('/api/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to log in. Please try again.')
        setLoading(false)
        return
      }

      // Set session cookie and redirect to account page
      router.push('/account')
    } catch (err) {
      console.error('Login error:', err)
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />

      <Container maxWidth="sm" sx={{ py: 6, flex: 1 }}>
        <Box sx={{ display: 'grid', gap: 2.2 }}>
          <Typography variant="h4" component="h1">
            Log In to Your Account
          </Typography>
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
            Access your order history, saved addresses, and wishlist.
          </Typography>

          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 1.5 }}>
            <TextField
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              fullWidth
            />

            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              fullWidth
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : undefined}
              sx={{ mt: 1 }}
            >
              {loading ? 'Logging in...' : 'Log In'}
            </Button>
          </Box>

          <Box sx={{ display: 'grid', gap: 1, pt: 1 }}>
            <Typography variant="body2">
              Don't have an account?{' '}
              <Link href="/signup" sx={{ cursor: 'pointer' }}>
                Sign up here
              </Link>
            </Typography>

            <Typography variant="body2">
              <Link href="/forgot-password" sx={{ cursor: 'pointer' }}>
                Forgot your password?
              </Link>
            </Typography>
          </Box>
        </Box>
      </Container>

      <Footer />
    </Box>
  )
}
