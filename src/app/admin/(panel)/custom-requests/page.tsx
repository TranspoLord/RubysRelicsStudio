'use client'

import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

interface CustomRequestRow {
  id: string
  status: string
  customer_email: string
  item_type: string
  quantity: number
  quote_amount: number | null
  stripe_payment_link_url: string | null
  created_at: string
}

function prettyStatus(status: string) {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default function AdminCustomRequestsPage() {
  const [rows, setRows] = useState<CustomRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adminKey, setAdminKey] = useState('')
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, string>>({})
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  async function loadRows() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/custom-requests', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load custom requests.')
      }
      setRows(Array.isArray(payload?.requests) ? payload.requests : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load custom requests.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRows()
  }, [])

  const pending = useMemo(() => rows.filter((row) => row.status === 'awaiting_quote'), [rows])

  async function sendQuote(row: CustomRequestRow) {
    if (!adminKey.trim()) {
      setError('Enter admin key before quote actions.')
      return
    }

    const quoteAmountRaw = quoteDrafts[row.id]
    const quoteAmount = Number(quoteAmountRaw)
    if (!Number.isFinite(quoteAmount) || quoteAmount <= 0) {
      setError('Quote amount must be greater than zero.')
      return
    }

    setSubmittingId(row.id)
    setError(null)

    try {
      const response = await fetch(`/api/custom-orders/${row.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({
          action: 'send_quote',
          quoteAmount,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Could not send quote.')
      }

      await loadRows()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send quote.')
    } finally {
      setSubmittingId(null)
    }
  }

  async function rejectRequest(row: CustomRequestRow) {
    if (!adminKey.trim()) {
      setError('Enter admin key before status actions.')
      return
    }

    const proceed = window.confirm(
      `Reject request ${row.id.slice(0, 8)}? This is a destructive status change.`
    )
    if (!proceed) return

    setSubmittingId(row.id)
    setError(null)

    try {
      const response = await fetch(`/api/custom-orders/${row.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({
          action: 'mark_rejected',
          note: 'Rejected by admin review.',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Could not reject request.')
      }

      await loadRows()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject request.')
    } finally {
      setSubmittingId(null)
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.4 }}>
      <Typography variant="h4" component="h1">
        Custom Requests
      </Typography>
      <Typography sx={{ color: alpha(brandTokens.parchment, 0.62) }}>
        Review intake requests, issue Stripe Payment Link quotes, or reject with confirmation.
      </Typography>

      <TextField
        label="Admin key for actions"
        type="password"
        value={adminKey}
        onChange={(e) => setAdminKey(e.target.value)}
        size="small"
      />

      {error && (
        <Typography sx={{ color: '#f3aaaa', fontSize: '0.82rem' }}>{error}</Typography>
      )}

      <Box sx={{ border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`, borderRadius: 1.2, p: 1.1, backgroundColor: alpha(brandTokens.bgSurface, 0.42) }}>
        <Typography sx={{ fontSize: '0.8rem', color: alpha(brandTokens.parchment, 0.66) }}>
          Awaiting quote: {pending.length}
        </Typography>
      </Box>

      {loading ? (
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.62) }}>Loading requests...</Typography>
      ) : rows.length === 0 ? (
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.62) }}>No requests found.</Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 0.9 }}>
          {rows.map((row) => (
            <Box
              key={row.id}
              sx={{
                borderRadius: 1.2,
                border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                backgroundColor: alpha(brandTokens.bgSurface, 0.48),
                p: 1.1,
              }}
            >
              <Typography sx={{ fontWeight: 700, fontSize: '0.86rem' }}>
                {row.id}
              </Typography>
              <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), fontSize: '0.77rem' }}>
                {row.customer_email} · {row.item_type} · Qty {row.quantity}
              </Typography>
              <Typography sx={{ color: alpha(brandTokens.parchment, 0.58), fontSize: '0.75rem', mt: 0.2 }}>
                Status: {prettyStatus(row.status)}
              </Typography>

              {row.stripe_payment_link_url && (
                <Button
                  component="a"
                  href={row.stripe_payment_link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="small"
                  sx={{ mt: 0.65, mr: 0.8 }}
                >
                  Open Payment Link
                </Button>
              )}

              <Box sx={{ display: 'flex', gap: 0.7, alignItems: 'center', flexWrap: 'wrap', mt: 0.8 }}>
                <TextField
                  size="small"
                  label="Quote $"
                  type="number"
                  value={quoteDrafts[row.id] ?? ''}
                  onChange={(e) =>
                    setQuoteDrafts((prev) => ({
                      ...prev,
                      [row.id]: e.target.value,
                    }))
                  }
                  sx={{ width: 140 }}
                />
                <Button
                  size="small"
                  variant="contained"
                  disabled={submittingId === row.id}
                  onClick={() => void sendQuote(row)}
                >
                  Send Quote
                </Button>
                <Button
                  size="small"
                  color="error"
                  variant="outlined"
                  disabled={submittingId === row.id}
                  onClick={() => void rejectRequest(row)}
                >
                  Reject
                </Button>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
