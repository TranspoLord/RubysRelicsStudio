"use client"

import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

type StockStatus = 'forced_in_stock' | 'forced_out_of_stock' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'untracked'

interface InventoryProductRow {
  id: string
  title: string
  slug: string
  category_key: string
  category_display_name: string
  is_active: boolean
  is_archived: boolean
  sort_order: number
  available_qty: number
  low_stock_threshold: number
  availability_override: 'inherit' | 'force_in_stock' | 'force_out_of_stock'
  is_track_inventory: boolean
  is_in_stock: boolean
  is_low_stock: boolean
  stock_status: StockStatus
}

interface InventoryEditorState {
  productId: string | null
  availableQty: string
  lowStockThreshold: string
  availabilityOverride: 'inherit' | 'force_in_stock' | 'force_out_of_stock'
  isTrackInventory: boolean
}

const EMPTY_EDITOR: InventoryEditorState = {
  productId: null,
  availableQty: '0',
  lowStockThreshold: '3',
  availabilityOverride: 'inherit',
  isTrackInventory: false,
}

const REASON_OPTIONS = ['initial_set', 'manual_correction', 'restock', 'damaged', 'bulk_update'] as const

type ReasonCode = (typeof REASON_OPTIONS)[number]

function statusLabel(status: StockStatus): string {
  if (status === 'forced_in_stock') return 'Forced in stock'
  if (status === 'forced_out_of_stock') return 'Forced out of stock'
  if (status === 'low_stock') return 'Low stock'
  if (status === 'out_of_stock') return 'Out of stock'
  if (status === 'untracked') return 'Untracked'
  return 'In stock'
}

export default function AdminInventoryPage() {
  const [products, setProducts] = useState<InventoryProductRow[]>([])
  const [queryDraft, setQueryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [bulkAdjusting, setBulkAdjusting] = useState(false)
  const [editor, setEditor] = useState<InventoryEditorState>(EMPTY_EDITOR)
  const [adjustDelta, setAdjustDelta] = useState('1')
  const [adjustReason, setAdjustReason] = useState<ReasonCode>('manual_correction')
  const [adjustNote, setAdjustNote] = useState('')
  const [bulkDelta, setBulkDelta] = useState('1')
  const [bulkReason, setBulkReason] = useState<ReasonCode>('bulk_update')
  const [bulkNote, setBulkNote] = useState('')
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const selectedProduct = useMemo(() => {
    if (!editor.productId) return null
    return products.find((row) => row.id === editor.productId) ?? null
  }, [editor.productId, products])

  async function loadProducts(nextQuery: string) {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (nextQuery.trim().length > 0) params.set('q', nextQuery.trim())
      const response = await fetch(`/api/admin/inventory?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load inventory products.')
      }

      setProducts(Array.isArray(payload?.products) ? payload.products : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load inventory products.')
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProducts(query)
  }, [query])

  function hydrateEditor(row: InventoryProductRow) {
    setEditor({
      productId: row.id,
      availableQty: String(row.available_qty),
      lowStockThreshold: String(row.low_stock_threshold),
      availabilityOverride: row.availability_override,
      isTrackInventory: row.is_track_inventory,
    })
    setAdjustDelta('1')
    setAdjustReason('manual_correction')
    setAdjustNote('')
  }

  function updateEditor<K extends keyof InventoryEditorState>(key: K, value: InventoryEditorState[K]) {
    setEditor((prev) => ({ ...prev, [key]: value }))
  }

  async function saveInventoryConfig() {
    if (!editor.productId) {
      setError('Select a product before saving inventory configuration.')
      return
    }

    setSavingConfig(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/admin/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: editor.productId,
          availableQty: Number(editor.availableQty),
          lowStockThreshold: Number(editor.lowStockThreshold),
          availabilityOverride: editor.availabilityOverride,
          isTrackInventory: editor.isTrackInventory,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save inventory config.')
      }

      setSuccessMessage('Inventory configuration saved.')
      await loadProducts(query)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save inventory config.')
    } finally {
      setSavingConfig(false)
    }
  }

  async function adjustSingle() {
    if (!editor.productId) {
      setError('Select a product before adjusting quantity.')
      return
    }

    setAdjusting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/admin/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: editor.productId,
          deltaQty: Number(adjustDelta),
          reasonCode: adjustReason,
          note: adjustNote,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to adjust inventory.')
      }

      setSuccessMessage('Inventory quantity adjusted.')
      await loadProducts(query)
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : 'Failed to adjust inventory.')
    } finally {
      setAdjusting(false)
    }
  }

  async function bulkAdjust() {
    if (selectedProductIds.length === 0) {
      setError('Select at least one product for bulk adjustment.')
      return
    }

    const delta = Number(bulkDelta)
    if (!Number.isInteger(delta) || delta === 0) {
      setError('Bulk delta must be a non-zero integer.')
      return
    }

    setBulkAdjusting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/admin/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reasonCode: bulkReason,
          note: bulkNote,
          adjustments: selectedProductIds.map((productId) => ({ productId, deltaQty: delta })),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to run bulk adjustment.')
      }

      const results = Array.isArray(payload?.results) ? payload.results : []
      const okCount = results.filter((row: { ok?: unknown }) => row.ok === true).length
      setSuccessMessage(`Bulk adjustment applied to ${okCount}/${results.length} rows.`)
      await loadProducts(query)
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : 'Failed to run bulk adjustment.')
    } finally {
      setBulkAdjusting(false)
    }
  }

  function toggleSelection(productId: string, checked: boolean) {
    setSelectedProductIds((prev) => {
      if (checked) {
        if (prev.includes(productId)) return prev
        return [...prev, productId]
      }
      return prev.filter((id) => id !== productId)
    })
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.1 }}>
      <Typography variant="h4" component="h1">Inventory</Typography>
      <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
        Control ready-made stock, low-stock thresholds, availability overrides, and bulk adjustments.
      </Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          fullWidth
          size="small"
          label="Search title, slug, or category"
          value={queryDraft}
          onChange={(event) => setQueryDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') setQuery(queryDraft)
          }}
        />
        <Button variant="outlined" onClick={() => setQuery(queryDraft)}>Search</Button>
        <Button
          variant="text"
          onClick={() => {
            setQueryDraft('')
            setQuery('')
          }}
        >
          Reset
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {successMessage && <Alert severity="success">{successMessage}</Alert>}

      <Box
        sx={{
          borderRadius: 1.2,
          border: `1px solid ${alpha(brandTokens.parchment, 0.14)}`,
          backgroundColor: alpha(brandTokens.bgSurface, 0.56),
          p: 1.2,
          display: 'grid',
          gap: 1,
        }}
      >
        <Typography sx={{ fontWeight: 700 }}>Inventory Config</Typography>

        {!selectedProduct ? (
          <Alert severity="info">Pick a product from the list below to edit stock settings.</Alert>
        ) : (
          <>
            <Typography sx={{ fontSize: '0.8rem', color: alpha(brandTokens.parchment, 0.68) }}>
              Editing {selectedProduct.title} ({selectedProduct.category_display_name})
            </Typography>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                size="small"
                label="Available qty"
                type="number"
                value={editor.availableQty}
                onChange={(event) => updateEditor('availableQty', event.target.value)}
                sx={{ width: 180 }}
              />
              <TextField
                size="small"
                label="Low-stock threshold"
                type="number"
                value={editor.lowStockThreshold}
                onChange={(event) => updateEditor('lowStockThreshold', event.target.value)}
                sx={{ width: 210 }}
              />
              <Select
                size="small"
                value={editor.availabilityOverride}
                onChange={(event) =>
                  updateEditor('availabilityOverride', event.target.value as InventoryEditorState['availabilityOverride'])
                }
                sx={{ minWidth: 220 }}
              >
                <MenuItem value="inherit">Inherit stock logic</MenuItem>
                <MenuItem value="force_in_stock">Force in stock</MenuItem>
                <MenuItem value="force_out_of_stock">Force out of stock</MenuItem>
              </Select>
            </Stack>

            <FormControlLabel
              control={
                <Checkbox
                  checked={editor.isTrackInventory}
                  onChange={(event) => updateEditor('isTrackInventory', event.target.checked)}
                />
              }
              label="Track inventory for checkout"
            />

            <Stack direction="row" spacing={1}>
              <Button variant="contained" disabled={savingConfig} onClick={() => void saveInventoryConfig()}>
                {savingConfig ? 'Saving...' : 'Save Config'}
              </Button>
              <Button
                variant="outlined"
                disabled={loading}
                onClick={() => {
                  if (selectedProduct) hydrateEditor(selectedProduct)
                }}
              >
                Reset Form
              </Button>
            </Stack>

            <Box sx={{ borderTop: `1px solid ${alpha(brandTokens.parchment, 0.12)}`, pt: 1, display: 'grid', gap: 1 }}>
              <Typography sx={{ fontWeight: 600 }}>Single Adjustment</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <TextField
                  size="small"
                  label="Delta qty (+/-)"
                  type="number"
                  value={adjustDelta}
                  onChange={(event) => setAdjustDelta(event.target.value)}
                  sx={{ width: 180 }}
                />
                <Select
                  size="small"
                  value={adjustReason}
                  onChange={(event) => setAdjustReason(event.target.value as ReasonCode)}
                  sx={{ minWidth: 220 }}
                >
                  {REASON_OPTIONS.filter((reason) => reason !== 'bulk_update').map((reason) => (
                    <MenuItem key={reason} value={reason}>{reason}</MenuItem>
                  ))}
                </Select>
                <TextField
                  fullWidth
                  size="small"
                  label="Adjustment note (optional)"
                  value={adjustNote}
                  onChange={(event) => setAdjustNote(event.target.value)}
                />
              </Stack>
              <Button variant="contained" disabled={adjusting} onClick={() => void adjustSingle()}>
                {adjusting ? 'Applying...' : 'Apply Adjustment'}
              </Button>
            </Box>
          </>
        )}
      </Box>

      <Box
        sx={{
          borderRadius: 1.2,
          border: `1px solid ${alpha(brandTokens.parchment, 0.14)}`,
          backgroundColor: alpha(brandTokens.bgSurface, 0.56),
          p: 1.2,
          display: 'grid',
          gap: 1,
        }}
      >
        <Typography sx={{ fontWeight: 700 }}>Bulk Adjustment</Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.66), fontSize: '0.78rem' }}>
          Applies the same delta to every checked product row.
        </Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            size="small"
            label="Bulk delta (+/-)"
            type="number"
            value={bulkDelta}
            onChange={(event) => setBulkDelta(event.target.value)}
            sx={{ width: 180 }}
          />
          <Select
            size="small"
            value={bulkReason}
            onChange={(event) => setBulkReason(event.target.value as ReasonCode)}
            sx={{ minWidth: 220 }}
          >
            {REASON_OPTIONS.map((reason) => (
              <MenuItem key={reason} value={reason}>{reason}</MenuItem>
            ))}
          </Select>
          <TextField
            fullWidth
            size="small"
            label="Bulk note (optional)"
            value={bulkNote}
            onChange={(event) => setBulkNote(event.target.value)}
          />
        </Stack>

        <Button variant="contained" disabled={bulkAdjusting || selectedProductIds.length === 0} onClick={() => void bulkAdjust()}>
          {bulkAdjusting ? 'Applying...' : `Apply to ${selectedProductIds.length} selected`}
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress />
        </Box>
      ) : products.length === 0 ? (
        <Alert severity="info">No ready-made products were found for inventory control.</Alert>
      ) : (
        <Box sx={{ display: 'grid', gap: 0.8 }}>
          {products.map((row) => (
            <Box
              key={row.id}
              sx={{
                borderRadius: 1,
                border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
                p: 1,
                display: 'grid',
                gap: 0.4,
              }}
            >
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Checkbox
                    checked={selectedProductIds.includes(row.id)}
                    onChange={(event) => toggleSelection(row.id, event.target.checked)}
                    sx={{ p: 0.2, mt: -0.25 }}
                  />
                  <Box sx={{ display: 'grid', gap: 0.2 }}>
                    <Typography sx={{ fontWeight: 700 }}>{row.title}</Typography>
                    <Typography sx={{ fontSize: '0.76rem', color: alpha(brandTokens.parchment, 0.66) }}>
                      /{row.slug} · {row.category_display_name} · Status {statusLabel(row.stock_status)}
                    </Typography>
                    <Typography sx={{ fontSize: '0.74rem', color: alpha(brandTokens.parchment, 0.6) }}>
                      Qty {row.available_qty} · Threshold {row.low_stock_threshold} · Track {row.is_track_inventory ? 'On' : 'Off'} · Override {row.availability_override}
                    </Typography>
                  </Box>
                </Stack>
                <Button size="small" variant="outlined" onClick={() => hydrateEditor(row)}>
                  Edit
                </Button>
              </Stack>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
