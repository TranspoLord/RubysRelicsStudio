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

type OrderPath = 'all' | 'shop' | 'ready_made' | 'custom'
type LaborStage = 'design' | 'setup' | 'production' | 'finishing' | 'packing'

interface FinanceSummary {
  from: string
  to: string
  gross_orders: number
  paid_orders: number
  units_sold: number
  gross_sales: number
  refunds: number
  net_sales: number
  material_cost: number
  gross_profit: number
  labor_hours: number
  labor_cost: number
  net_profit: number
  aov: number
  effective_hourly_revenue: number
  effective_hourly_gross_profit: number
  machine_hours_scheduled: number
  machine_blocks_locked: number
}

interface ContributionRow {
  product_id: string
  product_title: string
  category_key: string
  units: number
  gross_sales: number
  material_cost: number
  gross_margin: number
}

interface LaborStageRow {
  stage: LaborStage
  minutes: number
  hours: number
  cost: number
}

interface LaborEntryRow {
  id: string
  order_id: string | null
  order_item_id: string | null
  stage: LaborStage
  minutes: number
  hourly_rate: number
  note: string | null
  logged_by: string | null
  logged_at: string
}

interface FinancePayload {
  summary: FinanceSummary
  itemContributions: ContributionRow[]
  laborByStage: LaborStageRow[]
}

const LABOR_STAGES: LaborStage[] = ['design', 'setup', 'production', 'finishing', 'packing']

function asMoney(value: number): string {
  return `$${Number(value ?? 0).toFixed(2)}`
}

function asDateInputValue(input: Date): string {
  const d = new Date(input)
  const year = d.getFullYear()
  const month = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function AdminFinancePage() {
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return asDateInputValue(d)
  })
  const [to, setTo] = useState(() => asDateInputValue(new Date()))
  const [orderPath, setOrderPath] = useState<OrderPath>('all')

  const [financeLoading, setFinanceLoading] = useState(true)
  const [laborLoading, setLaborLoading] = useState(true)
  const [submittingLabor, setSubmittingLabor] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [finance, setFinance] = useState<FinancePayload | null>(null)
  const [laborEntries, setLaborEntries] = useState<LaborEntryRow[]>([])

  const [laborOrderId, setLaborOrderId] = useState('')
  const [laborOrderItemId, setLaborOrderItemId] = useState('')
  const [laborStage, setLaborStage] = useState<LaborStage>('production')
  const [laborMinutes, setLaborMinutes] = useState('60')
  const [laborRate, setLaborRate] = useState('30')
  const [laborNote, setLaborNote] = useState('')

  const summaryCards = useMemo(() => {
    if (!finance) return []
    const s = finance.summary
    return [
      { label: 'Gross Sales', value: asMoney(s.gross_sales) },
      { label: 'Refunds', value: asMoney(s.refunds) },
      { label: 'Net Sales', value: asMoney(s.net_sales) },
      { label: 'Gross Profit', value: asMoney(s.gross_profit) },
      { label: 'Labor Cost', value: asMoney(s.labor_cost) },
      { label: 'Net Profit', value: asMoney(s.net_profit) },
      { label: 'Labor Hours', value: `${s.labor_hours.toFixed(2)}h` },
      { label: 'AOV', value: asMoney(s.aov) },
      { label: 'Hourly Revenue', value: asMoney(s.effective_hourly_revenue) },
      { label: 'Hourly Gross Profit', value: asMoney(s.effective_hourly_gross_profit) },
      { label: 'Machine Hours', value: `${s.machine_hours_scheduled.toFixed(2)}h` },
      { label: 'Locked Blocks', value: String(s.machine_blocks_locked) },
    ]
  }, [finance])

  async function loadFinance() {
    setFinanceLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ from, to })
      if (orderPath !== 'all') {
        params.set('orderPath', orderPath)
      }

      const response = await fetch(`/api/admin/finance?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load finance analytics.')
      }

      setFinance(payload as FinancePayload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load finance analytics.')
      setFinance(null)
    } finally {
      setFinanceLoading(false)
    }
  }

  async function loadLaborEntries() {
    setLaborLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ from, to })
      const response = await fetch(`/api/admin/labor?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load labor entries.')
      }

      setLaborEntries(Array.isArray(payload?.entries) ? payload.entries : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load labor entries.')
      setLaborEntries([])
    } finally {
      setLaborLoading(false)
    }
  }

  useEffect(() => {
    void Promise.all([loadFinance(), loadLaborEntries()])
  }, [from, to, orderPath])

  async function exportFinanceCsv() {
    const params = new URLSearchParams({ from, to, format: 'csv' })
    if (orderPath !== 'all') {
      params.set('orderPath', orderPath)
    }

    const response = await fetch(`/api/admin/finance?${params.toString()}`, { cache: 'no-store' })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(typeof payload?.error === 'string' ? payload.error : 'Could not export finance report.')
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'finance-report.csv'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  async function submitLaborEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setSubmittingLabor(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/labor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: laborOrderId.trim() || undefined,
          orderItemId: laborOrderItemId.trim() || undefined,
          stage: laborStage,
          minutes: Number(laborMinutes),
          hourlyRate: Number(laborRate),
          note: laborNote.trim() || undefined,
        }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to create labor entry.')
      }

      setSuccess('Labor entry added.')
      setLaborMinutes('60')
      setLaborRate('30')
      setLaborNote('')
      await Promise.all([loadLaborEntries(), loadFinance()])
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create labor entry.')
    } finally {
      setSubmittingLabor(false)
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="h3" component="h1">
        Finance and Labor Analytics
      </Typography>
      <Typography sx={{ color: alpha(brandTokens.parchment, 0.66) }}>
        Review sales, margin, machine capacity, and labor performance from one admin surface.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Box
        sx={{
          borderRadius: 1.2,
          border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
          backgroundColor: alpha(brandTokens.bgSurface, 0.62),
          p: 1.2,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(5, minmax(0, 1fr))' },
          gap: 1,
          alignItems: 'end',
        }}
      >
        <TextField
          type="date"
          size="small"
          label="From"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />

        <TextField
          type="date"
          size="small"
          label="To"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />

        <Select
          size="small"
          value={orderPath}
          onChange={(e) => setOrderPath(e.target.value as OrderPath)}
        >
          <MenuItem value="all">All Order Paths</MenuItem>
          <MenuItem value="shop">Shop</MenuItem>
          <MenuItem value="ready_made">Ready-Made</MenuItem>
          <MenuItem value="custom">Custom</MenuItem>
        </Select>

        <Button variant="outlined" onClick={() => void Promise.all([loadFinance(), loadLaborEntries()])}>
          Refresh
        </Button>

        <Button
          variant="contained"
          onClick={() => {
            void exportFinanceCsv().catch((exportError) => {
              setError(exportError instanceof Error ? exportError.message : 'Could not export finance report.')
            })
          }}
        >
          Export CSV
        </Button>
      </Box>

      {financeLoading ? (
        <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={24} />
        </Box>
      ) : finance ? (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
              gap: 1,
            }}
          >
            {summaryCards.map((card) => (
              <Box
                key={card.label}
                sx={{
                  borderRadius: 1.2,
                  border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                  backgroundColor: alpha(brandTokens.bgSurface, 0.5),
                  p: 1,
                }}
              >
                <Typography sx={{ fontSize: '0.72rem', color: alpha(brandTokens.parchment, 0.55), mb: 0.2 }}>
                  {card.label}
                </Typography>
                <Typography sx={{ fontFamily: 'var(--font-cinzel, serif)', fontWeight: 700 }}>
                  {card.value}
                </Typography>
              </Box>
            ))}
          </Box>

          <Box
            sx={{
              borderRadius: 1.2,
              border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
              backgroundColor: alpha(brandTokens.bgSurface, 0.58),
              p: 1.2,
            }}
          >
            <Typography sx={{ fontWeight: 700, mb: 1 }}>Item Contribution View</Typography>
            <Box sx={{ display: 'grid', gap: 0.7 }}>
              <RowHeader
                columns={[
                  'Product',
                  'Category',
                  'Units',
                  'Gross Sales',
                  'Material Cost',
                  'Gross Margin',
                ]}
              />
              {finance.itemContributions.length === 0 ? (
                <Typography sx={{ color: alpha(brandTokens.parchment, 0.55), fontSize: '0.82rem' }}>
                  No contribution rows for this range.
                </Typography>
              ) : (
                finance.itemContributions.slice(0, 40).map((row) => (
                  <Row
                    key={`${row.product_id}-${row.product_title}`}
                    cells={[
                      row.product_title,
                      row.category_key,
                      String(row.units),
                      asMoney(row.gross_sales),
                      asMoney(row.material_cost),
                      asMoney(row.gross_margin),
                    ]}
                  />
                ))
              )}
            </Box>
          </Box>

          <Box
            sx={{
              borderRadius: 1.2,
              border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
              backgroundColor: alpha(brandTokens.bgSurface, 0.58),
              p: 1.2,
            }}
          >
            <Typography sx={{ fontWeight: 700, mb: 1 }}>Labor Stage Breakdown</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {finance.laborByStage.map((stage) => (
                <Box
                  key={stage.stage}
                  sx={{
                    px: 1,
                    py: 0.8,
                    borderRadius: 1,
                    border: `1px solid ${alpha(brandTokens.parchment, 0.14)}`,
                    backgroundColor: alpha(brandTokens.bgVoid, 0.35),
                  }}
                >
                  <Typography sx={{ fontSize: '0.7rem', color: alpha(brandTokens.parchment, 0.55), textTransform: 'uppercase' }}>
                    {stage.stage}
                  </Typography>
                  <Typography sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.8) }}>
                    {stage.hours.toFixed(2)}h / {asMoney(stage.cost)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </>
      ) : null}

      <Box
        component="form"
        onSubmit={submitLaborEntry}
        sx={{
          borderRadius: 1.2,
          border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
          backgroundColor: alpha(brandTokens.bgSurface, 0.62),
          p: 1.2,
          display: 'grid',
          gap: 1,
        }}
      >
        <Typography sx={{ fontWeight: 700 }}>Log Labor Time Entry</Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
            gap: 1,
          }}
        >
          <TextField
            size="small"
            label="Order ID"
            value={laborOrderId}
            onChange={(e) => setLaborOrderId(e.target.value)}
          />
          <TextField
            size="small"
            label="Order Item ID (optional)"
            value={laborOrderItemId}
            onChange={(e) => setLaborOrderItemId(e.target.value)}
          />
          <Select
            size="small"
            value={laborStage}
            onChange={(e) => setLaborStage(e.target.value as LaborStage)}
          >
            {LABOR_STAGES.map((stage) => (
              <MenuItem key={stage} value={stage}>
                {stage}
              </MenuItem>
            ))}
          </Select>
          <TextField
            size="small"
            type="number"
            label="Minutes"
            value={laborMinutes}
            onChange={(e) => setLaborMinutes(e.target.value)}
          />
          <TextField
            size="small"
            type="number"
            label="Hourly Rate"
            value={laborRate}
            onChange={(e) => setLaborRate(e.target.value)}
          />
          <Button type="submit" variant="contained" disabled={submittingLabor}>
            {submittingLabor ? 'Saving...' : 'Add Entry'}
          </Button>
        </Box>

        <TextField
          size="small"
          multiline
          minRows={2}
          label="Note"
          value={laborNote}
          onChange={(e) => setLaborNote(e.target.value)}
        />
      </Box>

      <Box
        sx={{
          borderRadius: 1.2,
          border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
          backgroundColor: alpha(brandTokens.bgSurface, 0.58),
          p: 1.2,
        }}
      >
        <Typography sx={{ fontWeight: 700, mb: 1 }}>Recent Labor Entries</Typography>

        {laborLoading ? (
          <Box sx={{ py: 2, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={22} />
          </Box>
        ) : laborEntries.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.55), fontSize: '0.82rem' }}>
            No labor entries in this range yet.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.6 }}>
            <RowHeader columns={['Logged At', 'Stage', 'Minutes', 'Rate', 'Order', 'Note']} />
            {laborEntries.slice(0, 60).map((entry) => (
              <Row
                key={entry.id}
                cells={[
                  new Date(entry.logged_at).toLocaleString(),
                  entry.stage,
                  String(entry.minutes),
                  asMoney(entry.hourly_rate),
                  entry.order_id ?? '-',
                  entry.note ?? '-',
                ]}
              />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

function RowHeader({ columns }: { columns: string[] }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
        gap: 0.6,
      }}
    >
      {columns.map((col) => (
        <Typography key={col} sx={{ fontSize: '0.68rem', color: alpha(brandTokens.parchment, 0.5), textTransform: 'uppercase' }}>
          {col}
        </Typography>
      ))}
    </Box>
  )
}

function Row({ cells }: { cells: string[] }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
        gap: 0.6,
        borderTop: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
        pt: 0.6,
      }}
    >
      {cells.map((cell, index) => (
        <Typography key={`${index}-${cell}`} sx={{ fontSize: '0.78rem', color: alpha(brandTokens.parchment, 0.82) }}>
          {cell}
        </Typography>
      ))}
    </Box>
  )
}
