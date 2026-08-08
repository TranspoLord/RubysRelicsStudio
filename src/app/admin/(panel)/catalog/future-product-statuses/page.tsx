'use client'

import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import ArrowBack from '@mui/icons-material/ArrowBack'
import Link from 'next/link'

import { brandTokens } from '@/theme/theme'

interface StatusRow {
  id: string
  label: string
  color: string
  sort_order: number
  is_default: boolean
  is_visible: boolean
}

export default function FutureProductStatusesAdminPage() {
  const [statuses, setStatuses] = useState<StatusRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [label, setLabel] = useState('')
  const [color, setColor] = useState('#6A7AC4')
  const [sortOrder, setSortOrder] = useState('0')
  const [isDefault, setIsDefault] = useState(false)
  const [isVisible, setIsVisible] = useState(true)

  async function loadStatuses() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/catalog/future-product-statuses', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load statuses.')
      }
      setStatuses(Array.isArray(payload?.statuses) ? payload.statuses : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load statuses.')
      setStatuses([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatuses()
  }, [])

  async function saveStatus() {
    if (!label.trim()) {
      setError('Label is required.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/future-product-statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          color,
          sort_order: Number(sortOrder),
          is_default: isDefault,
          is_visible: isVisible,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save status.')
      }

      setSuccess('Status created.')
      setLabel('')
      setColor('#6A7AC4')
      setSortOrder('0')
      setIsDefault(false)
      setIsVisible(true)
      await loadStatuses()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save status.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.4 }}>
      <IconButton component={Link} href="/admin/catalog" sx={{ p: 0.5, ml: -0.5 }}>
        <ArrowBack />
      </IconButton>

      <Box>
        <Typography variant="h5" component="h1" sx={{ mb: 0.5 }}>
          Future Product Statuses
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
          Manage the dropdown values used by the future-products roadmap.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Box sx={{ borderRadius: 1.4, border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`, backgroundColor: alpha(brandTokens.bgSurface, 0.52), p: 1.3, display: 'grid', gap: 1 }}>
        <Typography variant="h6">Create New Status</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField fullWidth size="small" label="Label" value={label} onChange={(event) => setLabel(event.target.value)} required />
          <TextField size="small" label="Color" value={color} onChange={(event) => setColor(event.target.value)} sx={{ width: 160 }} />
          <TextField size="small" type="number" label="Sort order" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} sx={{ width: 120 }} />
        </Stack>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <FormControlLabel control={<Checkbox checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />} label="Default" />
          <FormControlLabel control={<Checkbox checked={isVisible} onChange={(event) => setIsVisible(event.target.checked)} />} label="Visible" />
        </Stack>
        <Button variant="contained" disabled={saving} onClick={() => void saveStatus()}>
          {saving ? 'Saving...' : 'Create Status'}
        </Button>
      </Box>

      <Box sx={{ borderRadius: 1.4, border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`, backgroundColor: alpha(brandTokens.bgSurface, 0.52), p: 1.3, display: 'grid', gap: 1 }}>
        {loading ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.6) }}>Loading statuses...</Typography>
        ) : statuses.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.6) }}>No statuses yet.</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.8 }}>
            {statuses.map((status) => (
              <Box key={status.id} sx={{ borderRadius: 1, border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`, backgroundColor: alpha(brandTokens.bgSurface, 0.32), p: 0.9, display: 'grid', gap: 0.2 }}>
                <Typography sx={{ fontWeight: 600 }}>{status.label}</Typography>
                <Typography sx={{ fontSize: '0.8rem', color: alpha(brandTokens.parchment, 0.62) }}>
                  {status.color} | {status.is_default ? 'Default' : 'Optional'} | {status.is_visible ? 'Visible' : 'Hidden'} | sort: {status.sort_order}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}
