'use client'

import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

interface CustomRequestRow {
  id: string
  status: string
  customer_name: string
  customer_email: string
  item_type: string
  quantity: number
  description: string
  files: Array<{ name: string; size: number; type: string; path?: string }> | null
  quote_amount: number | null
  square_payment_link_url: string | null
  quote_sent_at: string | null
  quote_expires_at: string | null
  quote_last_resent_at: string | null
  quote_resend_count: number
  production_handoff_at: string | null
  recovery_reminder_sent_at: string | null
  created_at: string
  updated_at: string
}

type StatusFilter =
  | 'all'
  | 'awaiting_quote'
  | 'quote_sent'
  | 'paid'
  | 'expired'
  | 'cancelled'
  | 'restricted_pending_review'
  | 'restricted_rejected'
  | 'restricted_approved'

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
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, string>>({})
  const [extendDrafts, setExtendDrafts] = useState<Record<string, string>>({})
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [queryDraft, setQueryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [runningRecoveryBatch, setRunningRecoveryBatch] = useState(false)
  const [artworkUrls, setArtworkUrls] = useState<
    Record<string, Array<{ name: string; url: string }> | 'loading' | 'error'>
  >({})
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectingRowId, setRejectingRowId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  async function loadRows(nextQuery = query, nextStatus = status) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (nextQuery.trim().length > 0) params.set('q', nextQuery.trim())
      if (nextStatus !== 'all') params.set('status', nextStatus)

      const response = await fetch(`/api/admin/custom-requests?${params.toString()}`, { cache: 'no-store' })
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
    void loadRows(query, status)
  }, [query, status])

  const pending = useMemo(() => rows.filter((row) => row.status === 'awaiting_quote'), [rows])
  const quoteSent = useMemo(() => rows.filter((row) => row.status === 'quote_sent'), [rows])

  async function sendQuote(row: CustomRequestRow) {
    const quoteAmountRaw = quoteDrafts[row.id]
    const quoteAmount = Number(quoteAmountRaw)
    if (!Number.isFinite(quoteAmount) || quoteAmount <= 0) {
      setError('Quote amount must be greater than zero.')
      return
    }

    setSubmittingId(row.id)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch(`/api/custom-orders/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_quote',
          quoteAmount,
          note: noteDrafts[row.id] ?? '',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Could not send quote.')
      }

      setSuccessMessage('Quote sent successfully.')
      await loadRows()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send quote.')
    } finally {
      setSubmittingId(null)
    }
  }

  async function resendQuote(row: CustomRequestRow) {
    setSubmittingId(row.id)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch(`/api/custom-orders/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resend_quote',
          note: noteDrafts[row.id] ?? '',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Could not resend quote.')
      }

      setSuccessMessage('Quote email resent.')
      await loadRows()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend quote.')
    } finally {
      setSubmittingId(null)
    }
  }

  async function extendQuoteExpiry(row: CustomRequestRow) {
    const extendDays = Number(extendDrafts[row.id] ?? '3')
    if (!Number.isInteger(extendDays) || extendDays < 1 || extendDays > 30) {
      setError('Extend days must be an integer between 1 and 30.')
      return
    }

    setSubmittingId(row.id)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch(`/api/custom-orders/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extend_quote_expiry',
          extendDays,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Could not extend quote expiry.')
      }

      setSuccessMessage('Quote expiry extended.')
      await loadRows()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not extend quote expiry.')
    } finally {
      setSubmittingId(null)
    }
  }

  async function handoffToProduction(row: CustomRequestRow) {
    setSubmittingId(row.id)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch(`/api/custom-orders/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'handoff_to_production',
          note: noteDrafts[row.id] ?? '',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Could not hand off request.')
      }

      setSuccessMessage('Paid request handed off to production.')
      await loadRows()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not hand off request.')
    } finally {
      setSubmittingId(null)
    }
  }

  async function openRejectDialog(row: CustomRequestRow) {
    setRejectingRowId(row.id)
    setRejectionReason('')
    setRejectDialogOpen(true)
  }

  async function confirmReject() {
    if (!rejectingRowId) return

    setRejectDialogOpen(false)
    setSubmittingId(rejectingRowId)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch(`/api/custom-orders/${rejectingRowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_rejected',
          confirmAction: 'mark_rejected',
          note: rejectionReason.trim() || 'Rejected by admin review.',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Could not reject request.')
      }

      setSuccessMessage('Request rejected.')
      setRejectingRowId(null)
      await loadRows()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject request.')
      setRejectingRowId(null)
    } finally {
      setSubmittingId(null)
    }
  }

  async function reopenRequest(row: CustomRequestRow) {
    setSubmittingId(row.id)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch(`/api/custom-orders/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reopen_request',
          note: noteDrafts[row.id] ?? '',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Could not reopen request.')
      }

      setSuccessMessage('Request reopened.')
      await loadRows()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reopen request.')
    } finally {
      setSubmittingId(null)
    }
  }

  async function fetchArtwork(id: string) {
    setArtworkUrls((prev) => ({ ...prev, [id]: 'loading' }))
    try {
      const res = await fetch(`/api/admin/custom-requests/${id}/artwork`, { cache: 'no-store' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error('Failed to load artwork URLs.')
      setArtworkUrls((prev) => ({
        ...prev,
        [id]: Array.isArray(payload?.urls) ? (payload.urls as Array<{ name: string; url: string }>) : [],
      }))
    } catch {
      setArtworkUrls((prev) => ({ ...prev, [id]: 'error' }))
    }
  }

  async function runRecoveryBatch() {
    setRunningRecoveryBatch(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/admin/custom-requests/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thresholdHours: 24, limit: 80 }),
      })

      const payload = await response.json().catch(() => ({})) as {
        result?: { scanned?: number; sent?: number; skipped?: number; failed?: number }
        error?: string
      }

      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not run recovery batch.')
      }

      const result = payload.result ?? {}
      setSuccessMessage(
        `Recovery batch complete. Scanned ${result.scanned ?? 0}, sent ${result.sent ?? 0}, skipped ${result.skipped ?? 0}, failed ${result.failed ?? 0}.`
      )
      await loadRows()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run recovery batch.')
    } finally {
      setRunningRecoveryBatch(false)
    }
  }

  const isRowCancelled = (row: CustomRequestRow) => row.status === 'cancelled'

  return (
    <Box sx={{ display: 'grid', gap: 1.4 }}>
      <Typography variant="h4" component="h1">
        Custom Requests
      </Typography>
      <Typography sx={{ color: alpha(brandTokens.parchment, 0.62) }}>
        Review intake requests with search/filters, send and resend quotes, extend expiry, and hand off paid requests to production.
      </Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          fullWidth
          size="small"
          label="Search id, email, name, or item"
          value={queryDraft}
          onChange={(event) => setQueryDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') setQuery(queryDraft)
          }}
        />
        <Select
          size="small"
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="all">All statuses</MenuItem>
          <MenuItem value="awaiting_quote">awaiting_quote</MenuItem>
          <MenuItem value="quote_sent">quote_sent</MenuItem>
          <MenuItem value="paid">paid</MenuItem>
          <MenuItem value="expired">expired</MenuItem>
          <MenuItem value="cancelled">cancelled</MenuItem>
          <MenuItem value="restricted_pending_review">restricted_pending_review</MenuItem>
          <MenuItem value="restricted_rejected">restricted_rejected</MenuItem>
          <MenuItem value="restricted_approved">restricted_approved</MenuItem>
        </Select>
        <Button variant="outlined" onClick={() => setQuery(queryDraft)}>Search</Button>
        <Button
          variant="contained"
          disabled={runningRecoveryBatch}
          onClick={() => void runRecoveryBatch()}
        >
          {runningRecoveryBatch ? 'Sending reminders...' : 'Run Recovery Reminders'}
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {successMessage && <Alert severity="success">{successMessage}</Alert>}

      <Box sx={{ border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`, borderRadius: 1.2, p: 1.1, backgroundColor: alpha(brandTokens.bgSurface, 0.42) }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Typography sx={{ fontSize: '0.8rem', color: alpha(brandTokens.parchment, 0.66) }}>
            Awaiting quote: {pending.length}
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: alpha(brandTokens.parchment, 0.66) }}>
            Quote sent: {quoteSent.length}
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: alpha(brandTokens.parchment, 0.66) }}>
            Loaded rows: {rows.length}
          </Typography>
        </Stack>
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
                backgroundColor: isRowCancelled(row)
                  ? alpha(brandTokens.parchment, 0.08)
                  : alpha(brandTokens.bgSurface, 0.48),
                p: 1.1,
                opacity: isRowCancelled(row) ? 0.6 : 1,
              }}
            >
              <Typography sx={{ fontWeight: 700, fontSize: '0.86rem' }}>
                {row.id}
              </Typography>
              <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), fontSize: '0.77rem' }}>
                {row.customer_name} · {row.customer_email} · {row.item_type} · Qty {row.quantity}
              </Typography>
              <Typography sx={{ color: alpha(brandTokens.parchment, 0.58), fontSize: '0.75rem', mt: 0.2 }}>
                Status: {prettyStatus(row.status)}
                {isRowCancelled(row) && (
                  <Typography component="span" sx={{ ml: 1, color: '#F1B4B4', fontSize: '0.7rem' }}>
                    (Rejected)
                  </Typography>
                )}
              </Typography>
              {row.quote_expires_at && (
                <Typography sx={{ color: alpha(brandTokens.parchment, 0.54), fontSize: '0.73rem' }}>
                  Quote expires: {new Date(row.quote_expires_at).toLocaleString()} · Resent {row.quote_resend_count}x
                </Typography>
              )}
              {row.production_handoff_at && (
                <Typography sx={{ color: alpha(brandTokens.forgeGold, 0.86), fontSize: '0.73rem' }}>
                  Handed to production: {new Date(row.production_handoff_at).toLocaleString()}
                </Typography>
              )}
              {row.recovery_reminder_sent_at && (
                <Typography sx={{ color: alpha(brandTokens.parchment, 0.54), fontSize: '0.73rem' }}>
                  Recovery reminder sent: {new Date(row.recovery_reminder_sent_at).toLocaleString()}
                </Typography>
              )}

              {row.description && (
                <Typography sx={{ color: alpha(brandTokens.parchment, 0.72), fontSize: '0.77rem', mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {row.description}
                </Typography>
              )}

              {/* Artwork files */}
              {Array.isArray(row.files) && row.files.some((f) => f.path) && (
                <Box sx={{ mt: 0.7 }}>
                  {artworkUrls[row.id] === undefined && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => void fetchArtwork(row.id)}
                    >
                      View Artwork ({row.files!.filter((f) => f.path).length}{' '}
                      {row.files!.filter((f) => f.path).length === 1 ? 'file' : 'files'})
                    </Button>
                  )}
                  {artworkUrls[row.id] === 'loading' && (
                    <Typography sx={{ fontSize: '0.77rem', color: alpha(brandTokens.parchment, 0.55) }}>
                      Generating signed URLs…
                    </Typography>
                  )}
                  {artworkUrls[row.id] === 'error' && (
                    <Typography sx={{ fontSize: '0.77rem', color: '#F1B4B4' }}>
                      Failed to load artwork links.
                    </Typography>
                  )}
                  {Array.isArray(artworkUrls[row.id]) && (
                    <Stack direction="row" spacing={0.8} flexWrap="wrap">
                      {(artworkUrls[row.id] as Array<{ name: string; url: string }>).map((entry, i) => (
                        <Button
                          key={i}
                          size="small"
                          variant="outlined"
                          component="a"
                          href={entry.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {entry.name}
                        </Button>
                      ))}
                    </Stack>
                  )}
                </Box>
              )}

              {row.square_payment_link_url && (
                <Button
                  component="a"
                  href={row.square_payment_link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="small"
                  sx={{ mt: 0.65, mr: 0.8 }}
                >
                  Open Payment Link
                </Button>
              )}

              {!isRowCancelled(row) && (
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
                  <TextField
                    size="small"
                    label="Extend days"
                    type="number"
                    value={extendDrafts[row.id] ?? '3'}
                    onChange={(e) =>
                      setExtendDrafts((prev) => ({
                        ...prev,
                        [row.id]: e.target.value,
                      }))
                    }
                    sx={{ width: 130 }}
                  />
                  <TextField
                    size="small"
                    label="Admin note"
                    value={noteDrafts[row.id] ?? ''}
                    onChange={(e) =>
                      setNoteDrafts((prev) => ({
                        ...prev,
                        [row.id]: e.target.value,
                      }))
                    }
                    sx={{ minWidth: 220 }}
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
                    variant="outlined"
                    disabled={submittingId === row.id || row.status !== 'quote_sent'}
                    onClick={() => void resendQuote(row)}
                  >
                    Resend Quote
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={submittingId === row.id || row.status !== 'quote_sent'}
                    onClick={() => void extendQuoteExpiry(row)}
                  >
                    Extend Expiry
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={submittingId === row.id || row.status !== 'paid'}
                    onClick={() => void handoffToProduction(row)}
                  >
                    Handoff to Production
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    disabled={submittingId === row.id}
                    onClick={() => void openRejectDialog(row)}
                  >
                    Reject
                  </Button>
                </Box>
              )}

              {isRowCancelled(row) && (
                <Box sx={{ mt: 0.8 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={submittingId === row.id}
                    onClick={() => void reopenRequest(row)}
                  >
                    Reopen
                  </Button>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Reject Confirmation Dialog */}
      <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)}>
        <DialogTitle>Reject Request</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            This request will be marked as rejected and moved to the cancelled status.
          </Typography>
          <TextField
            autoFocus
            label="Rejection reason (optional)"
            placeholder="Why is this request being rejected?"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            multiline
            rows={3}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => void confirmReject()} color="error">
            Confirm Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}