"use client"

import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

type OrderStatus =
  | 'awaiting_payment'
  | 'paid'
  | 'in_production'
  | 'ready_to_ship'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

interface OrderListRow {
  id: string
  order_path: string
  payment_mode: string
  payment_status: PaymentStatus
  status: OrderStatus
  subtotal: number
  discount_amount: number
  shipping_cost: number
  order_total: number
  shipping_method: string
  production_estimate_band: string
  paid_at: string | null
  cancelled_at: string | null
  refunded_at: string | null
  created_at: string
  updated_at: string
}

interface OrderItemRow {
  id: string
  product_id: string | null
  product_title: string
  variant_label: string | null
  selected_options: Record<string, string>
  unit_price: number
  quantity: number
  line_subtotal: number
  line_discount: number
  line_total: number
  created_at: string
}

interface OrderNoteRow {
  id: string
  note: string
  is_pinned: boolean
  created_by: string | null
  created_at: string
}

interface OrderHookRow {
  id: string
  stage: 'design' | 'setup' | 'production' | 'finishing' | 'packing'
  scheduled_for: string | null
  estimated_hours: number | null
  assignee: string | null
  note: string | null
  is_completed: boolean
  completed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface OrderEventRow {
  id: string
  action_type: string
  previous_status: string | null
  next_status: string | null
  previous_payment_status: string | null
  next_payment_status: string | null
  note: string | null
  metadata: Record<string, unknown>
  created_by: string | null
  created_at: string
}

interface OrderDetail {
  order: Record<string, unknown>
  items: OrderItemRow[]
  notes: OrderNoteRow[]
  hooks: OrderHookRow[]
  events: OrderEventRow[]
}

const STATUS_CHOICES: Array<'all' | OrderStatus> = [
  'all',
  'awaiting_payment',
  'paid',
  'in_production',
  'ready_to_ship',
  'shipped',
  'delivered',
  'cancelled',
]

const PAYMENT_CHOICES: Array<'all' | PaymentStatus> = ['all', 'pending', 'paid', 'failed', 'refunded']

function asMoney(value: number): string {
  return `$${Number(value ?? 0).toFixed(2)}`
}

function nextStatusOptions(status: OrderStatus): OrderStatus[] {
  const map: Record<OrderStatus, OrderStatus[]> = {
    awaiting_payment: ['paid', 'cancelled'],
    paid: ['in_production', 'cancelled'],
    in_production: ['ready_to_ship', 'cancelled'],
    ready_to_ship: ['shipped', 'cancelled'],
    shipped: ['delivered', 'cancelled'],
    delivered: [],
    cancelled: [],
  }
  return map[status] ?? []
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [queryDraft, setQueryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | OrderStatus>('all')
  const [payment, setPayment] = useState<'all' | PaymentStatus>('all')

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('')
  const [actionNote, setActionNote] = useState('')
  const [newNote, setNewNote] = useState('')
  const [hookStage, setHookStage] = useState<OrderHookRow['stage']>('design')
  const [hookScheduledFor, setHookScheduledFor] = useState('')
  const [hookEstimatedHours, setHookEstimatedHours] = useState('')
  const [hookAssignee, setHookAssignee] = useState('')
  const [hookNote, setHookNote] = useState('')

  const selectedRow = useMemo(() => {
    if (!selectedOrderId) return null
    return orders.find((row) => row.id === selectedOrderId) ?? null
  }, [orders, selectedOrderId])

  useEffect(() => {
    if (selectedRow) {
      const allowed = nextStatusOptions(selectedRow.status)
      setNextStatus(allowed[0] ?? '')
    } else {
      setNextStatus('')
    }
  }, [selectedRow])

  async function loadOrders(nextQ: string, nextStatus: 'all' | OrderStatus, nextPayment: 'all' | PaymentStatus) {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (nextQ.trim().length > 0) params.set('q', nextQ.trim())
      if (nextStatus !== 'all') params.set('status', nextStatus)
      if (nextPayment !== 'all') params.set('payment', nextPayment)

      const response = await fetch(`/api/admin/orders?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load orders.')
      }

      const rows = Array.isArray(payload?.orders) ? payload.orders : []
      setOrders(rows)

      if (selectedOrderId && !rows.some((row: OrderListRow) => row.id === selectedOrderId)) {
        setSelectedOrderId(null)
        setDetail(null)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load orders.')
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  async function loadOrderDetail(orderId: string) {
    setDetailLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ orderId })
      const response = await fetch(`/api/admin/orders?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load order detail.')
      }

      setDetail({
        order: payload?.order ?? {},
        items: Array.isArray(payload?.items) ? payload.items : [],
        notes: Array.isArray(payload?.notes) ? payload.notes : [],
        hooks: Array.isArray(payload?.hooks) ? payload.hooks : [],
        events: Array.isArray(payload?.events) ? payload.events : [],
      })
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : 'Failed to load order detail.')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    void loadOrders(query, status, payment)
  }, [query, status, payment])

  async function runAction(body: Record<string, unknown>, success: string) {
    if (!selectedOrderId) return

    setActionLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: selectedOrderId, ...body }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Action failed.')
      }

      setSuccessMessage(success)
      await loadOrders(query, status, payment)
      await loadOrderDetail(selectedOrderId)
      setActionNote('')
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Action failed.')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.1 }}>
      <Typography variant="h4" component="h1">Orders</Typography>
      <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
        Guarded status transitions, production hooks, internal notes, and cancellation/refund action trails.
      </Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          fullWidth
          size="small"
          label="Search order id or status"
          value={queryDraft}
          onChange={(event) => setQueryDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') setQuery(queryDraft)
          }}
        />
        <Select
          size="small"
          value={status}
          onChange={(event) => setStatus(event.target.value as 'all' | OrderStatus)}
          sx={{ minWidth: 190 }}
        >
          {STATUS_CHOICES.map((value) => (
            <MenuItem key={value} value={value}>{value === 'all' ? 'All statuses' : value}</MenuItem>
          ))}
        </Select>
        <Select
          size="small"
          value={payment}
          onChange={(event) => setPayment(event.target.value as 'all' | PaymentStatus)}
          sx={{ minWidth: 170 }}
        >
          {PAYMENT_CHOICES.map((value) => (
            <MenuItem key={value} value={value}>{value === 'all' ? 'All payments' : value}</MenuItem>
          ))}
        </Select>
        <Button variant="outlined" onClick={() => setQuery(queryDraft)}>Search</Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {successMessage && <Alert severity="success">{successMessage}</Alert>}

      <Box sx={{ display: 'grid', gap: 1 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress />
          </Box>
        ) : orders.length === 0 ? (
          <Alert severity="info">No orders matched the current filters.</Alert>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.8 }}>
            {orders.map((order) => (
              <Box
                key={order.id}
                sx={{
                  borderRadius: 1,
                  border: `1px solid ${alpha(brandTokens.parchment, 0.14)}`,
                  p: 1,
                  backgroundColor:
                    selectedOrderId === order.id
                      ? alpha(brandTokens.forgeGold, 0.08)
                      : alpha(brandTokens.bgSurface, 0.5),
                }}
              >
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                  <Box sx={{ display: 'grid', gap: 0.2 }}>
                    <Typography sx={{ fontWeight: 700 }}>
                      {order.id}
                    </Typography>
                    <Typography sx={{ fontSize: '0.76rem', color: alpha(brandTokens.parchment, 0.66) }}>
                      {order.order_path} · {order.status} · payment {order.payment_status} · {asMoney(order.order_total)}
                    </Typography>
                    <Typography sx={{ fontSize: '0.74rem', color: alpha(brandTokens.parchment, 0.56) }}>
                      Created {new Date(order.created_at).toLocaleString()} · Updated {new Date(order.updated_at).toLocaleString()}
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setSelectedOrderId(order.id)
                      void loadOrderDetail(order.id)
                    }}
                  >
                    Open
                  </Button>
                </Stack>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {selectedRow && (
        <Box
          sx={{
            borderRadius: 1.2,
            border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`,
            backgroundColor: alpha(brandTokens.bgSurface, 0.56),
            p: 1.2,
            display: 'grid',
            gap: 1,
          }}
        >
          <Typography variant="h6">Order Detail</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: alpha(brandTokens.parchment, 0.7) }}>
            {selectedRow.id} · Status {selectedRow.status} · Payment {selectedRow.payment_status}
          </Typography>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <Select
              size="small"
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value as OrderStatus | '')}
              displayEmpty
              sx={{ minWidth: 220 }}
            >
              {nextStatusOptions(selectedRow.status).length === 0 ? (
                <MenuItem value="" disabled>No allowed transitions</MenuItem>
              ) : (
                nextStatusOptions(selectedRow.status).map((value) => (
                  <MenuItem key={value} value={value}>{value}</MenuItem>
                ))
              )}
            </Select>
            <TextField
              fullWidth
              size="small"
              label="Action note (optional)"
              value={actionNote}
              onChange={(event) => setActionNote(event.target.value)}
            />
            <Button
              variant="contained"
              disabled={actionLoading || nextStatus === ''}
              onClick={() => void runAction({ action: 'transition', nextStatus, note: actionNote }, 'Order transition applied.')}
            >
              Transition
            </Button>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <Button
              variant="outlined"
              color="error"
              disabled={actionLoading || selectedRow.status === 'cancelled' || selectedRow.status === 'delivered'}
              onClick={() => void runAction({ action: 'cancel', note: actionNote }, 'Order cancelled.')}
            >
              Cancel Order
            </Button>
            <Button
              variant="outlined"
              color="error"
              disabled={actionLoading || selectedRow.payment_status !== 'paid'}
              onClick={() => void runAction({ action: 'mark_refunded', note: actionNote }, 'Order marked refunded.')}
            >
              Mark Refunded
            </Button>
          </Stack>

          <Box sx={{ borderTop: `1px solid ${alpha(brandTokens.parchment, 0.12)}`, pt: 1, display: 'grid', gap: 1 }}>
            <Typography sx={{ fontWeight: 600 }}>Internal Notes</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                fullWidth
                size="small"
                label="New internal note"
                value={newNote}
                onChange={(event) => setNewNote(event.target.value)}
              />
              <Button
                variant="contained"
                disabled={actionLoading || newNote.trim().length < 2}
                onClick={() => {
                  const noteText = newNote
                  void runAction({ action: 'add_note', note: noteText }, 'Internal note added.')
                  setNewNote('')
                }}
              >
                Add Note
              </Button>
            </Stack>

            {detailLoading ? (
              <CircularProgress size={20} />
            ) : (detail?.notes.length ?? 0) === 0 ? (
              <Typography sx={{ fontSize: '0.76rem', color: alpha(brandTokens.parchment, 0.58) }}>
                No internal notes yet.
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.5 }}>
                {detail?.notes.map((note) => (
                  <Box key={note.id} sx={{ borderRadius: 1, border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`, p: 0.8 }}>
                    <Typography sx={{ fontSize: '0.8rem' }}>{note.note}</Typography>
                    <Typography sx={{ fontSize: '0.7rem', color: alpha(brandTokens.parchment, 0.55) }}>
                      {new Date(note.created_at).toLocaleString()} · {note.created_by ?? 'admin'}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          <Box sx={{ borderTop: `1px solid ${alpha(brandTokens.parchment, 0.12)}`, pt: 1, display: 'grid', gap: 1 }}>
            <Typography sx={{ fontWeight: 600 }}>Production Scheduling Hooks</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <Select
                size="small"
                value={hookStage}
                onChange={(event) => setHookStage(event.target.value as OrderHookRow['stage'])}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="design">design</MenuItem>
                <MenuItem value="setup">setup</MenuItem>
                <MenuItem value="production">production</MenuItem>
                <MenuItem value="finishing">finishing</MenuItem>
                <MenuItem value="packing">packing</MenuItem>
              </Select>
              <TextField
                size="small"
                label="Scheduled for (ISO datetime)"
                value={hookScheduledFor}
                onChange={(event) => setHookScheduledFor(event.target.value)}
                sx={{ minWidth: 220 }}
              />
              <TextField
                size="small"
                label="Est hours"
                type="number"
                value={hookEstimatedHours}
                onChange={(event) => setHookEstimatedHours(event.target.value)}
                sx={{ width: 130 }}
              />
              <TextField
                size="small"
                label="Assignee"
                value={hookAssignee}
                onChange={(event) => setHookAssignee(event.target.value)}
                sx={{ minWidth: 160 }}
              />
              <TextField
                size="small"
                label="Hook note"
                value={hookNote}
                onChange={(event) => setHookNote(event.target.value)}
                sx={{ minWidth: 200 }}
              />
              <Button
                variant="contained"
                disabled={actionLoading}
                onClick={() => {
                  void runAction(
                    {
                      action: 'add_hook',
                      stage: hookStage,
                      scheduledFor: hookScheduledFor,
                      estimatedHours: hookEstimatedHours.length > 0 ? Number(hookEstimatedHours) : null,
                      assignee: hookAssignee,
                      note: hookNote,
                    },
                    'Production hook added.'
                  )
                  setHookScheduledFor('')
                  setHookEstimatedHours('')
                  setHookAssignee('')
                  setHookNote('')
                }}
              >
                Add Hook
              </Button>
            </Stack>

            {(detail?.hooks.length ?? 0) === 0 ? (
              <Typography sx={{ fontSize: '0.76rem', color: alpha(brandTokens.parchment, 0.58) }}>
                No production hooks yet.
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.5 }}>
                {detail?.hooks.map((hook) => (
                  <Stack
                    key={hook.id}
                    direction={{ xs: 'column', md: 'row' }}
                    justifyContent="space-between"
                    spacing={0.8}
                    sx={{ borderRadius: 1, border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`, p: 0.8 }}
                  >
                    <Box sx={{ display: 'grid', gap: 0.2 }}>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {hook.stage} · {hook.is_completed ? 'completed' : 'open'}
                      </Typography>
                      <Typography sx={{ fontSize: '0.72rem', color: alpha(brandTokens.parchment, 0.58) }}>
                        {hook.scheduled_for ? new Date(hook.scheduled_for).toLocaleString() : 'No schedule'} · {hook.assignee ?? 'Unassigned'} · est {hook.estimated_hours ?? 0}h
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={actionLoading || hook.is_completed}
                      onClick={() => void runAction({ action: 'complete_hook', hookId: hook.id }, 'Hook marked completed.')}
                    >
                      Complete
                    </Button>
                  </Stack>
                ))}
              </Box>
            )}
          </Box>

          <Box sx={{ borderTop: `1px solid ${alpha(brandTokens.parchment, 0.12)}`, pt: 1, display: 'grid', gap: 1 }}>
            <Typography sx={{ fontWeight: 600 }}>Order Items</Typography>
            {(detail?.items.length ?? 0) === 0 ? (
              <Typography sx={{ fontSize: '0.76rem', color: alpha(brandTokens.parchment, 0.58) }}>
                No order items found.
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.5 }}>
                {detail?.items.map((item) => (
                  <Box key={item.id} sx={{ borderRadius: 1, border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`, p: 0.8 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                      {item.product_title} · Qty {item.quantity}
                    </Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: alpha(brandTokens.parchment, 0.58) }}>
                      Unit {asMoney(item.unit_price)} · Subtotal {asMoney(item.line_subtotal)} · Discount {asMoney(item.line_discount)} · Total {asMoney(item.line_total)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          <Box sx={{ borderTop: `1px solid ${alpha(brandTokens.parchment, 0.12)}`, pt: 1, display: 'grid', gap: 1 }}>
            <Typography sx={{ fontWeight: 600 }}>Action Trail</Typography>
            {(detail?.events.length ?? 0) === 0 ? (
              <Typography sx={{ fontSize: '0.76rem', color: alpha(brandTokens.parchment, 0.58) }}>
                No action events recorded yet.
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.5 }}>
                {detail?.events.map((event) => (
                  <Box key={event.id} sx={{ borderRadius: 1, border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`, p: 0.8 }}>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>
                      {event.action_type} · {new Date(event.created_at).toLocaleString()}
                    </Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: alpha(brandTokens.parchment, 0.58) }}>
                      {event.previous_status ?? 'n/a'} {' -> '} {event.next_status ?? 'n/a'} · payment {event.previous_payment_status ?? 'n/a'} {' -> '} {event.next_payment_status ?? 'n/a'}
                    </Typography>
                    {event.note && (
                      <Typography sx={{ fontSize: '0.72rem', color: alpha(brandTokens.parchment, 0.68) }}>
                        {event.note}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  )
}
