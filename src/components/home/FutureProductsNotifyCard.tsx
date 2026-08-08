'use client'

import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import Link from 'next/link'
import { brandTokens } from '@/theme/theme'

interface FutureProductsNotifyCardProps {
  content: Record<string, unknown> | null | undefined
  sectionKey: string
}

export function FutureProductsNotifyCard({ content, sectionKey }: FutureProductsNotifyCardProps) {
  const heading = typeof content?.heading === 'string' && content.heading.trim() ? content.heading : 'Want early access?'
  const subheading = typeof content?.subheading === 'string' ? content.subheading : 'Share your email and idea so we can keep you posted on future drops.'
  const ctaLabel = typeof content?.cta_label === 'string' && content.cta_label.trim() ? content.cta_label : 'Notify me'
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [idea, setIdea] = useState('')
  const [comments, setComments] = useState('')
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const supportingText = useMemo(() => {
    if (status === 'success' && message) return message
    if (status === 'error' && message) return message
    return subheading
  }, [message, status, subheading])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setStatus('idle')
    setMessage('')

    try {
      const response = await fetch('/api/future-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, idea, comments }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to save your interest.')
      setStatus('success')
      setMessage('Thanks! We will keep you in the loop for future drops.')
      setEmail('')
      setName('')
      setIdea('')
      setComments('')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to save your interest.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box component="section" aria-labelledby={`${sectionKey}-heading`} sx={{ py: { xs: 6, md: 8 }, borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.06)}` }}>
      <Container maxWidth="lg">
        <Paper sx={{ p: { xs: 3, md: 4 }, background: alpha(brandTokens.bgSurface, 0.95), border: `1px solid ${alpha(brandTokens.parchment, 0.08)}`, boxShadow: 'none' }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="overline" sx={{ color: brandTokens.forgeGold, display: 'block', mb: 1 }}>
                Future products
              </Typography>
              <Typography id={`${sectionKey}-heading`} variant="h2" component="h2" sx={{ mb: 1 }}>
                {heading}
              </Typography>
              <Typography variant="body1" sx={{ color: alpha(brandTokens.parchment, 0.68) }}>
                {supportingText}
              </Typography>
            </Box>

            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 1.5 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} fullWidth />
                <TextField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required fullWidth />
              </Stack>
              <TextField label="What would you like to see?" value={idea} onChange={(event) => setIdea(event.target.value)} multiline minRows={3} fullWidth />
              <TextField label="Anything else?" value={comments} onChange={(event) => setComments(event.target.value)} multiline minRows={2} fullWidth />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Button type="submit" variant="contained" disabled={submitting}>
                  {submitting ? 'Saving...' : ctaLabel}
                </Button>
                <Button component={Link} href="/future-products" variant="text">
                  View roadmap
                </Button>
              </Stack>
            </Box>
          </Stack>
        </Paper>
      </Container>
    </Box>
  )
}
