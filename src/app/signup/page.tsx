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
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { brandTokens } from '@/theme/theme'

export default function SignupPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    newsletter: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleChange = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    if (!formData.email || !formData.password) {
      setError('Email and password are required.')
      return
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/customer/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName,
          receivesNewsletter: formData.newsletter,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to create account. Please try again.')
        setLoading(false)
        return
      }

      // Redirect to account page after successful signup
      router.push('/account')
    } catch (err) {
      console.error('Signup error:', err)
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
            Create Your Account
          </Typography>
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
            Save addresses, track orders, and manage your preferences in one place.
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
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              disabled={loading}
              required
              fullWidth
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <TextField
                label="First Name"
                value={formData.firstName}
                onChange={(e) => handleChange('firstName', e.target.value)}
                disabled={loading}
              />
              <TextField
                label="Last Name"
                value={formData.lastName}
                onChange={(e) => handleChange('lastName', e.target.value)}
                disabled={loading}
              />
            </Box>

            <TextField
              label="Password"
              type="password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              disabled={loading}
              required
              fullWidth
              helperText="At least 8 characters"
            />

            <TextField
              label="Confirm Password"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => handleChange('confirmPassword', e.target.value)}
              disabled={loading}
              required
              fullWidth
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.newsletter}
                  onChange={(e) => handleChange('newsletter', e.target.checked)}
                  disabled={loading}
                />
              }
              label="Yes, send me new releases and occasional treasures!"
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : undefined}
              sx={{ mt: 1 }}
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </Button>
          </Box>

          <Box sx={{ display: 'grid', gap: 1, pt: 1 }}>
            <Typography variant="body2">
              Already have an account?{' '}
              <Link href="/login" sx={{ cursor: 'pointer' }}>
                Log in here
              </Link>
            </Typography>

            <Typography variant="caption" sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
              By creating an account, you agree to our{' '}
              <Link href="/resources/terms" sx={{ cursor: 'pointer' }}>
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/resources/privacy" sx={{ cursor: 'pointer' }}>
                Privacy Policy
              </Link>
              .
            </Typography>
          </Box>
        </Box>
      </Container>

      <Footer />
    </Box>
  )
}
