"use client"

import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

interface CartCaptureRow {
  id: string
  email: string
  cart_json: unknown[]
  recovery_sent_at: string | null
  created_at: string
}

interface AbandonedSessionRow {
  id: string
  customer_email: string | null
  order_total: number | null
  cart_recovery_email_sent_at: string | null
  created_at: string
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function formatTotal(cents: number | null): string {
  if (cents == null) return '—'
  return `$${(cents / 100).toFixed(2)}`
}

export default function AdminAbandonedCartsPage() {
  const [tab, setTab] = useState(0)
  const [captures, setCaptures] = useState<CartCaptureRow[]>([])
  const [sessions, setSessions] = useState<AbandonedSessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/abandoned-carts?type=all&limit=100')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as { captures?: CartCaptureRow[]; abandonedSessions?: AbandonedSessionRow[] }
      setCaptures(json.captures ?? [])
      setSessions(json.abandonedSessions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [])

  async function triggerBatch() {
    setTriggering(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/admin/abandoned-carts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_pre_checkout_batch', thresholdMinutes: 60 }),
      })
      const json = await res.json() as { dispatched?: number; error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setSuccess(`Dispatched ${json.dispatched ?? 0} recovery email(s).`)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trigger failed.')
    } finally {
      setTriggering(false)
    }
  }

  const pendingCaptures = captures.filter((c) => !c.recovery_sent_at)
  const sentCaptures = captures.filter((c) => c.recovery_sent_at)
  const pendingSessions = sessions.filter((s) => !s.cart_recovery_email_sent_at)
  const sentSessions = sessions.filter((s) => s.cart_recovery_email_sent_at)

  return (
    <Box sx={{ p: 3, maxWidth: 1100 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h5" fontWeight={700} color={brandTokens.forgeGold}>
            Abandoned Cart Recovery
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Pre-checkout captures and expired Stripe sessions awaiting recovery emails.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            onClick={loadData}
            disabled={loading}
            sx={{ borderColor: brandTokens.forgeGold, color: brandTokens.forgeGold }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={triggerBatch}
            disabled={triggering || loading}
            sx={{ background: brandTokens.forgeGold, '&:hover': { background: brandTokens.forgeGoldDark } }}
          >
            {triggering ? 'Sending…' : 'Run Recovery Batch'}
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Stack direction="row" spacing={2} mb={3} flexWrap="wrap" gap={1}>
        <Chip label={`${pendingCaptures.length} pre-checkout pending`} size="small" color={pendingCaptures.length > 0 ? 'warning' : 'default'} />
        <Chip label={`${pendingSessions.length} session abandonments pending`} size="small" color={pendingSessions.length > 0 ? 'warning' : 'default'} />
        <Chip label={`${sentCaptures.length + sentSessions.length} recovery emails sent total`} size="small" />
      </Stack>

      <Tabs
        value={tab}
        onChange={(_, v: number) => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label={`Pre-Checkout Captures (${captures.length})`} />
        <Tab label={`Expired Sessions (${sessions.length})`} />
      </Tabs>

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : (
        <>
          {tab === 0 && (
            <Box sx={{ overflowX: 'auto' }}>
              {captures.length === 0 ? (
                <Typography color="text.secondary" py={4} textAlign="center">
                  No pre-checkout cart captures yet.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Email</TableCell>
                      <TableCell>Items</TableCell>
                      <TableCell>Captured</TableCell>
                      <TableCell>Recovery Sent</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {captures.map((row) => (
                      <TableRow
                        key={row.id}
                        sx={{ background: row.recovery_sent_at ? 'transparent' : alpha(brandTokens.forgeGold, 0.04) }}
                      >
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>{row.email}</TableCell>
                        <TableCell>{Array.isArray(row.cart_json) ? row.cart_json.length : 0} item(s)</TableCell>
                        <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>{formatDate(row.created_at)}</TableCell>
                        <TableCell>
                          {row.recovery_sent_at ? (
                            <Chip label={formatDate(row.recovery_sent_at)} size="small" color="success" />
                          ) : (
                            <Chip label="Pending" size="small" color="warning" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>
          )}

          {tab === 1 && (
            <Box sx={{ overflowX: 'auto' }}>
              {sessions.length === 0 ? (
                <Typography color="text.secondary" py={4} textAlign="center">
                  No abandoned checkout sessions recorded.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Order ID</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Total</TableCell>
                      <TableCell>Abandoned At</TableCell>
                      <TableCell>Recovery Sent</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sessions.map((row) => (
                      <TableRow
                        key={row.id}
                        sx={{ background: row.cart_recovery_email_sent_at ? 'transparent' : alpha(brandTokens.forgeGold, 0.04) }}
                      >
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{row.id.slice(0, 8)}…</TableCell>
                        <TableCell sx={{ fontSize: 13 }}>{row.customer_email ?? '—'}</TableCell>
                        <TableCell>{formatTotal(row.order_total)}</TableCell>
                        <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>{formatDate(row.created_at)}</TableCell>
                        <TableCell>
                          {row.cart_recovery_email_sent_at ? (
                            <Chip label={formatDate(row.cart_recovery_email_sent_at)} size="small" color="success" />
                          ) : (
                            <Chip label="Pending" size="small" color="warning" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  )
}
