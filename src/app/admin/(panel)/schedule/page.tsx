"use client"

import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

type Stage = 'design' | 'setup' | 'production' | 'finishing' | 'packing'
const STAGES: Stage[] = ['design', 'setup', 'production', 'finishing', 'packing']

interface OrderRef {
  id: string
  status: string
  customer_email: string | null
}

interface CustomRequestRef {
  id: string
  status: string
  customer_email: string | null
}

interface ScheduleBlock {
  id: string
  order_id: string | null
  order_item_id: string | null
  custom_request_id: string | null
  stage: Stage
  start_at: string
  end_at: string
  estimated_hours: number
  is_locked: boolean
  note: string | null
  created_by: string | null
  created_at: string
  exp_orders: OrderRef | null
  exp_custom_requests: CustomRequestRef | null
}

const STAGE_COLORS: Record<Stage, string> = {
  design: '#7c6bbf',
  setup: '#4a90d9',
  production: '#3aa66f',
  finishing: '#c9a96e',
  packing: '#b5826a',
}

const STAGE_LABELS: Record<Stage, string> = {
  design: 'Design',
  setup: 'Setup',
  production: 'Production',
  finishing: 'Finishing',
  packing: 'Packing',
}

const EMPTY_FORM = {
  orderId: '',
  customRequestId: '',
  stage: 'production' as Stage,
  startAt: '',
  endAt: '',
  estimatedHours: '1',
  note: '',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function hoursBetween(start: string, end: string): number {
  return Math.round(((new Date(end).getTime() - new Date(start).getTime()) / 3600000) * 10) / 10
}

function toLocalDateTimeInput(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalDateTimeInput(value: string): string {
  if (!value) return ''
  return new Date(value).toISOString()
}

// Default start: next hour; default end: 2 hours later
function defaultStart(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return toLocalDateTimeInput(d.toISOString())
}

function defaultEnd(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 3)
  return toLocalDateTimeInput(d.toISOString())
}

export default function AdminSchedulePage() {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all')
  const [fromFilter, setFromFilter] = useState('')
  const [toFilter, setToFilter] = useState('')

  // Create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM, startAt: defaultStart(), endAt: defaultEnd() })
  const [saving, setSaving] = useState(false)

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function loadBlocks() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (stageFilter !== 'all') params.set('stage', stageFilter)
      if (fromFilter) params.set('from', fromLocalDateTimeInput(fromFilter))
      if (toFilter) params.set('to', fromLocalDateTimeInput(toFilter))
      const res = await fetch(`/api/admin/schedule?${params.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as { blocks?: ScheduleBlock[] }
      setBlocks(json.blocks ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadBlocks() }, [stageFilter, fromFilter, toFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, startAt: defaultStart(), endAt: defaultEnd() })
    setDialogOpen(true)
  }

  function openEdit(block: ScheduleBlock) {
    setEditingId(block.id)
    setForm({
      orderId: block.order_id ?? '',
      customRequestId: block.custom_request_id ?? '',
      stage: block.stage,
      startAt: toLocalDateTimeInput(block.start_at),
      endAt: toLocalDateTimeInput(block.end_at),
      estimatedHours: String(block.estimated_hours),
      note: block.note ?? '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        orderId: form.orderId.trim() || null,
        customRequestId: form.customRequestId.trim() || null,
        stage: form.stage,
        startAt: fromLocalDateTimeInput(form.startAt),
        endAt: fromLocalDateTimeInput(form.endAt),
        estimatedHours: Number(form.estimatedHours),
        note: form.note.trim() || null,
      }

      const res = editingId
        ? await fetch('/api/admin/schedule', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingId, ...payload }),
          })
        : await fetch('/api/admin/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)

      setSuccess(editingId ? 'Block updated.' : 'Block created.')
      setDialogOpen(false)
      await loadBlocks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/schedule?id=${id}`, { method: 'DELETE' })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setSuccess('Block deleted.')
      setDeleteId(null)
      await loadBlocks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setDeleting(false)
    }
  }

  async function handleToggleLock(block: ScheduleBlock) {
    try {
      const res = await fetch('/api/admin/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: block.id, is_locked: !block.is_locked }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      await loadBlocks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lock toggle failed.')
    }
  }

  // Summary stats
  const totalHours = useMemo(
    () => Math.round(blocks.reduce((sum, b) => sum + Number(b.estimated_hours), 0) * 10) / 10,
    [blocks]
  )
  const lockedCount = blocks.filter((b) => b.is_locked).length
  const stageBreakdown = useMemo(() => {
    const acc: Partial<Record<Stage, number>> = {}
    for (const b of blocks) {
      acc[b.stage] = (acc[b.stage] ?? 0) + Number(b.estimated_hours)
    }
    return acc
  }, [blocks])

  return (
    <Box sx={{ p: 3, maxWidth: 1200 }}>
      {/* Header */}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h5" fontWeight={700} sx={{ color: brandTokens.forgeGold }}>
            Production Queue
          </Typography>
          <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.6) }} mt={0.5}>
            Machine scheduling blocks linked to orders and custom requests.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            onClick={loadBlocks}
            disabled={loading}
            sx={{ borderColor: brandTokens.forgeGold, color: brandTokens.forgeGold }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={openCreate}
            sx={{ background: brandTokens.forgeGold, '&:hover': { background: brandTokens.forgeGoldDark } }}
          >
            + Schedule Block
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Summary chips */}
      <Stack direction="row" spacing={1} mb={3} flexWrap="wrap" gap={1}>
        <Chip label={`${blocks.length} blocks`} size="small" />
        <Chip label={`${totalHours}h estimated`} size="small" sx={{ background: alpha(brandTokens.forgeGold, 0.15) }} />
        <Chip label={`${lockedCount} locked`} size="small" color={lockedCount > 0 ? 'info' : 'default'} />
        {(Object.entries(stageBreakdown) as [Stage, number][]).map(([stage, hrs]) => (
          <Chip
            key={stage}
            label={`${STAGE_LABELS[stage]}: ${Math.round(hrs * 10) / 10}h`}
            size="small"
            sx={{ background: alpha(STAGE_COLORS[stage], 0.15), color: STAGE_COLORS[stage] }}
          />
        ))}
      </Stack>

      {/* Filters */}
      <Stack direction="row" spacing={2} mb={3} flexWrap="wrap" gap={2} alignItems="center">
        <Select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as Stage | 'all')}
          size="small"
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="all">All Stages</MenuItem>
          {STAGES.map((s) => (
            <MenuItem key={s} value={s}>{STAGE_LABELS[s]}</MenuItem>
          ))}
        </Select>
        <TextField
          label="From"
          type="datetime-local"
          value={fromFilter}
          onChange={(e) => setFromFilter(e.target.value)}
          size="small"
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 200 }}
        />
        <TextField
          label="To"
          type="datetime-local"
          value={toFilter}
          onChange={(e) => setToFilter(e.target.value)}
          size="small"
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 200 }}
        />
        {(fromFilter || toFilter || stageFilter !== 'all') && (
          <Button
            size="small"
            variant="text"
            onClick={() => { setFromFilter(''); setToFilter(''); setStageFilter('all') }}
            sx={{ color: alpha(brandTokens.parchment, 0.55) }}
          >
            Clear
          </Button>
        )}
      </Stack>

      {/* Block list */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : blocks.length === 0 ? (
        <Typography color="text.secondary" py={4} textAlign="center">
          No schedule blocks found. Create one to start planning production.
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Stage</TableCell>
                <TableCell>Order / Request</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>End</TableCell>
                <TableCell>Hours</TableCell>
                <TableCell>Note</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {blocks.map((block) => {
                const orderRef = block.exp_orders
                const reqRef = block.exp_custom_requests
                const linkedLabel = orderRef
                  ? `Order ${block.order_id!.slice(0, 8)}… (${orderRef.status})`
                  : reqRef
                    ? `Request ${block.custom_request_id!.slice(0, 8)}… (${reqRef.status})`
                    : '—'
                const linkedEmail = orderRef?.customer_email ?? reqRef?.customer_email ?? null
                const actualHours = hoursBetween(block.start_at, block.end_at)

                return (
                  <TableRow
                    key={block.id}
                    sx={{
                      background: block.is_locked
                        ? alpha(brandTokens.forgeGold, 0.04)
                        : 'transparent',
                      '&:hover': { background: alpha(brandTokens.parchment, 0.03) },
                    }}
                  >
                    <TableCell>
                      <Chip
                        label={STAGE_LABELS[block.stage]}
                        size="small"
                        sx={{
                          background: alpha(STAGE_COLORS[block.stage], 0.18),
                          color: STAGE_COLORS[block.stage],
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: 13 }}>{linkedLabel}</Typography>
                      {linkedEmail && (
                        <Typography variant="caption" sx={{ color: alpha(brandTokens.parchment, 0.5) }}>
                          {linkedEmail}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(block.start_at)}</TableCell>
                    <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(block.end_at)}</TableCell>
                    <TableCell sx={{ fontSize: 13 }}>
                      <span title={`Estimated: ${block.estimated_hours}h | Window: ${actualHours}h`}>
                        {block.estimated_hours}h
                      </span>
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {block.note ?? '—'}
                    </TableCell>
                    <TableCell>
                      {block.is_locked ? (
                        <Chip label="Locked" size="small" color="warning" />
                      ) : (
                        <Chip label="Open" size="small" color="default" />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => handleToggleLock(block)}
                          sx={{ fontSize: 12, minWidth: 0, px: 1 }}
                        >
                          {block.is_locked ? 'Unlock' : 'Lock'}
                        </Button>
                        {!block.is_locked && (
                          <>
                            <Button
                              size="small"
                              variant="text"
                              onClick={() => openEdit(block)}
                              sx={{ fontSize: 12, minWidth: 0, px: 1 }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="small"
                              variant="text"
                              color="error"
                              onClick={() => setDeleteId(block.id)}
                              sx={{ fontSize: 12, minWidth: 0, px: 1 }}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      {/* Create / Edit dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        aria-labelledby="schedule-dialog-title"
      >
        <DialogTitle id="schedule-dialog-title">
          {editingId ? 'Edit Schedule Block' : 'New Schedule Block'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Order ID (UUID)"
              value={form.orderId}
              onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))}
              placeholder="Leave blank if linked to a custom request"
              size="small"
              fullWidth
            />
            <TextField
              label="Custom Request ID (UUID)"
              value={form.customRequestId}
              onChange={(e) => setForm((f) => ({ ...f, customRequestId: e.target.value }))}
              placeholder="Leave blank if linked to an order"
              size="small"
              fullWidth
            />
            <Select
              value={form.stage}
              onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value as Stage }))}
              size="small"
              fullWidth
            >
              {STAGES.map((s) => <MenuItem key={s} value={s}>{STAGE_LABELS[s]}</MenuItem>)}
            </Select>
            <TextField
              label="Start"
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End"
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Estimated Hours"
              type="number"
              value={form.estimatedHours}
              onChange={(e) => setForm((f) => ({ ...f, estimatedHours: e.target.value }))}
              inputProps={{ min: 0.1, step: 0.5 }}
              size="small"
              fullWidth
            />
            <TextField
              label="Note (optional)"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              size="small"
              fullWidth
              multiline
              rows={2}
            />
          </Stack>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="contained"
            sx={{ background: brandTokens.forgeGold, '&:hover': { background: brandTokens.forgeGoldDark } }}
          >
            {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        maxWidth="xs"
        aria-labelledby="delete-confirm-title"
      >
        <DialogTitle id="delete-confirm-title">Delete Schedule Block?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This action cannot be undone. Locked blocks cannot be deleted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)} disabled={deleting}>Cancel</Button>
          <Button
            onClick={() => deleteId && handleDelete(deleteId)}
            disabled={deleting}
            color="error"
            variant="contained"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
