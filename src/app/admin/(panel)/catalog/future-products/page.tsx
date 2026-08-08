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

interface FutureProductRow {
  id: string
  title: string
  description: string | null
  estimated_release: string | null
  category_key: string | null
  media_url: string | null
  media_alt: string | null
  status_id: string | null
  is_visible: boolean
  sort_order: number
}

export default function FutureProductsAdminPage() {
  const [items, setItems] = useState<FutureProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [estimatedRelease, setEstimatedRelease] = useState('')
  const [categoryKey, setCategoryKey] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaAlt, setMediaAlt] = useState('')
  const [statusId, setStatusId] = useState('')
  const [isVisible, setIsVisible] = useState(true)
  const [sortOrder, setSortOrder] = useState('0')

  async function loadItems() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/catalog/future-products', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load roadmap items.')
      }
      setItems(Array.isArray(payload?.products) ? payload.products : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load roadmap items.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadItems()
  }, [])

  async function saveItem() {
    if (!title.trim()) {
      setError('Title is required.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/future-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          estimated_release: estimatedRelease,
          category_key: categoryKey.trim(),
          media_url: mediaUrl.trim(),
          media_alt: mediaAlt.trim(),
          status_id: statusId.trim(),
          is_visible: isVisible,
          sort_order: Number(sortOrder),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save roadmap item.')
      }

      setSuccess('Roadmap item created.')
      setTitle('')
      setDescription('')
      setEstimatedRelease('')
      setCategoryKey('')
      setMediaUrl('')
      setMediaAlt('')
      setStatusId('')
      setIsVisible(true)
      setSortOrder('0')
      await loadItems()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save roadmap item.')
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
          Future Products Management
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
          Create and manage roadmap entries for the public future-products page.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Box sx={{ borderRadius: 1.4, border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`, backgroundColor: alpha(brandTokens.bgSurface, 0.52), p: 1.3, display: 'grid', gap: 1 }}>
        <Typography variant="h6">Create New Roadmap Item</Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField fullWidth size="small" label="Title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <TextField size="small" label="Estimated release" value={estimatedRelease} onChange={(event) => setEstimatedRelease(event.target.value)} placeholder="2026-09-01" />
          <TextField size="small" label="Sort order" type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} sx={{ width: 120 }} />
        </Stack>

        <TextField fullWidth size="small" label="Description" value={description} onChange={(event) => setDescription(event.target.value)} multiline minRows={3} />

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField fullWidth size="small" label="Category key" value={categoryKey} onChange={(event) => setCategoryKey(event.target.value)} helperText="Optional taxonomy key" />
          <TextField fullWidth size="small" label="Media URL" value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} helperText="Optional image or emoji URL" />
          <TextField fullWidth size="small" label="Media alt" value={mediaAlt} onChange={(event) => setMediaAlt(event.target.value)} helperText="Optional alt text" />
          <TextField fullWidth size="small" label="Status ID" value={statusId} onChange={(event) => setStatusId(event.target.value)} helperText="Optional status reference" />
          <FormControlLabel control={<Checkbox checked={isVisible} onChange={(event) => setIsVisible(event.target.checked)} />} label="Visible" />
        </Stack>

        <Button variant="contained" disabled={saving} onClick={() => void saveItem()}>
          {saving ? 'Saving...' : 'Create Roadmap Item'}
        </Button>
      </Box>

      <Box sx={{ borderRadius: 1.4, border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`, backgroundColor: alpha(brandTokens.bgSurface, 0.52), p: 1.3, display: 'grid', gap: 1 }}>
        {loading ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.6) }}>Loading roadmap items...</Typography>
        ) : items.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.6) }}>No roadmap items yet.</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.8 }}>
            {items.map((item) => (
              <Box key={item.id} sx={{ borderRadius: 1, border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`, backgroundColor: alpha(brandTokens.bgSurface, 0.32), p: 0.9, display: 'grid', gap: 0.3 }}>
                <Typography sx={{ fontWeight: 600 }}>{item.title}</Typography>
                <Typography sx={{ fontSize: '0.8rem', color: alpha(brandTokens.parchment, 0.62) }}>
                  {item.estimated_release ?? 'No release date'} | {item.is_visible ? 'Visible' : 'Hidden'} | sort: {item.sort_order}
                </Typography>
                {item.media_url && <Typography sx={{ fontSize: '0.78rem' }}>{item.media_url}</Typography>}
                {item.description && <Typography sx={{ fontSize: '0.85rem' }}>{item.description}</Typography>}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}
