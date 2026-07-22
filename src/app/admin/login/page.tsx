'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

export default function AdminLoginPage() {
  const router = useRouter()
  const [nextPath] = useState('/admin')

  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Detect MUI autofill animation — browsers fire this on password fields
  // when a password manager fills in the value. This catches autofill
  // before the user interacts with the form.
  const handleAnimationStart = useCallback(
    (event: React.AnimationEvent<HTMLInputElement>) => {
      if (event.animationName === 'mui-auto-fill') {
        const el = inputRef.current
        if (el && el.value !== key) {
          setKey(el.value)
        }
      }
    },
    [key]
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // Read from the DOM directly — React state may be stale if a
    // password manager autofilled the field without firing onChange.
    // Use the DOM value for both the empty check AND the fetch.
    const domValue = inputRef.current?.value ?? ''
    if (!domValue.trim() || submitting) return

    // Sync React state for correctness
    if (domValue !== key) {
      setKey(domValue)
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: domValue }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Login failed.')
      }

      // SEC-030: Removed client-side admin_authenticated flag.
      // Server-side session verification is the only auth check.
      router.replace('/admin/mfa-challenge')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not authenticate admin session.')
      setSubmitting(false)
    }
  }

  return (
    <Box component="main" id="main-content" sx={{ minHeight: '100vh', backgroundColor: brandTokens.bgVoid, py: { xs: 6, md: 8 } }}>
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
            Ruby's Relics Admin
          </Typography>
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.68), mb: 2 }}>
            Enter the admin key to continue. MFA will be required after login.
          </Typography>

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 1.4 }}>
            <TextField
              label="Admin Key"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onAnimationStart={handleAnimationStart}
              autoFocus
              fullWidth
              inputRef={inputRef}
            />

            {error && (
              <Typography sx={{ color: '#f3a8a8', fontSize: '0.82rem' }}>{error}</Typography>
            )}

            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </Box>
        </Box>
      </Container>
    </Box>
  )
}