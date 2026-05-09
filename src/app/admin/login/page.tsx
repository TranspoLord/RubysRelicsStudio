'use client'

import { useState } from 'react'
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!key.trim() || submitting) return

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Login failed.')
      }

      router.replace(nextPath)
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
            Enter the admin key to continue.
          </Typography>

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 1.4 }}>
            <TextField
              label="Admin Key"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoFocus
              fullWidth
            />

            {error && (
              <Typography sx={{ color: '#f3a8a8', fontSize: '0.82rem' }}>{error}</Typography>
            )}

            <Button type="submit" variant="contained" disabled={submitting || key.trim().length < 2}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </Box>
        </Box>
      </Container>
    </Box>
  )
}
