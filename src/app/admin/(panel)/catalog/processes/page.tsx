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

interface ProcessTypeRow {
  key: string
  display_name: string
  slug: string
  emoji: string | null
  visible: boolean
  sort_order: number
}

export default function ProcessesAdminPage() {
  const [processTypes, setProcessTypes] = useState<ProcessTypeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Editor state
  const [editKey, setEditKey] = useState('')
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [editVisible, setEditVisible] = useState(true)
  const [editSortOrder, setEditSortOrder] = useState('0')

  const isEditing = editKey.length > 0

  async function loadProcessTypes() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/catalog/processes', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load process types.')
      }
      setProcessTypes(Array.isArray(payload?.processTypes) ? payload.processTypes : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load process types.')
      setProcessTypes([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional initial data load
    void loadProcessTypes()
  }, [])

  function resetEditor() {
    setEditKey('')
    setEditDisplayName('')
    setEditSlug('')
    setEditEmoji('')
    setEditVisible(true)
    setEditSortOrder('0')
  }

  function hydrateEditor(row: ProcessTypeRow) {
    setEditKey(row.key)
    setEditDisplayName(row.display_name)
    setEditSlug(row.slug)
    setEditEmoji(row.emoji ?? '')
    setEditVisible(row.visible)
    setEditSortOrder(String(row.sort_order))
  }

  async function saveProcessType() {
    const key = editKey || editDisplayName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)
    const slug = editSlug || key

    if (!editDisplayName.trim()) {
      setError('Display name is required.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const method = isEditing ? 'PUT' : 'POST'
      const response = await fetch('/api/admin/catalog/processes', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          display_name: editDisplayName,
          slug,
          emoji: editEmoji,
          visible: editVisible,
          sort_order: Number(editSortOrder),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save process type.')
      }

      setSuccess(isEditing ? 'Process type updated.' : 'Process type created.')
      resetEditor()
      await loadProcessTypes()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save process type.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteProcessType(row: ProcessTypeRow) {
    const confirmed = window.confirm(`Delete process type ${row.display_name}? Products using this process will need to be reassigned.`)
    if (!confirmed) return

    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/processes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: row.key, confirmAction: 'delete_process_type' }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete process type.')
      }

      setSuccess('Process type deleted.')
      await loadProcessTypes()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete process type.')
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.4 }}>
      <IconButton component={Link} href="/admin/catalog" sx={{ p: 0.5, ml: -0.5 }}>
        <ArrowBack />
      </IconButton>

      <Box>
        <Typography variant="h5" component="h1" sx={{ mb: 0.5 }}>
          Process Types Management
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
          Manage manufacturing processes that can be assigned to products.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Box
        sx={{
          borderRadius: 1.4,
          border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`,
          backgroundColor: alpha(brandTokens.bgSurface, 0.52),
          p: 1.3,
          display: 'grid',
          gap: 1,
        }}
      >
        <Typography variant="h6">
          {isEditing ? 'Edit Process Type' : 'Create New Process Type'}
        </Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="Display name"
            value={editDisplayName}
            onChange={(event) => setEditDisplayName(event.target.value)}
            required
          />
          <TextField
            fullWidth
            size="small"
            label="Key"
            value={editKey}
            onChange={(event) => setEditKey(event.target.value)}
            helperText="Auto-generated from name if left blank. Cannot be changed after creation."
            disabled={isEditing}
          />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="Slug"
            value={editSlug}
            onChange={(event) => setEditSlug(event.target.value)}
            helperText="URL slug, auto-generated from name if left blank"
          />
          <TextField
            size="small"
            label="Emoji"
            value={editEmoji}
            onChange={(event) => setEditEmoji(event.target.value)}
            sx={{ width: 120 }}
          />
          <TextField
            size="small"
            type="number"
            label="Sort order"
            value={editSortOrder}
            onChange={(event) => setEditSortOrder(event.target.value)}
            sx={{ width: 120 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={editVisible}
                onChange={(event) => setEditVisible(event.target.checked)}
              />
            }
            label="Visible"
          />
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={saving} onClick={() => void saveProcessType()}>
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Process Type'}
          </Button>
          {isEditing && (
            <Button variant="text" onClick={resetEditor} disabled={saving}>
              Cancel Edit
            </Button>
          )}
        </Stack>
      </Box>

      <Box
        sx={{
          borderRadius: 1.4,
          border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`,
          backgroundColor: alpha(brandTokens.bgSurface, 0.52),
          p: 1.3,
          display: 'grid',
          gap: 1,
        }}
      >
        {loading ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.6) }}>Loading process types...</Typography>
        ) : processTypes.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.6) }}>No process types found.</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.8 }}>
            {processTypes.map((proc) => (
              <Box
                key={proc.key}
                sx={{
                  borderRadius: 1,
                  border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
                  backgroundColor: alpha(brandTokens.bgSurface, 0.32),
                  p: 0.9,
                  display: 'grid',
                  gap: 0.4,
                }}
              >
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                  <Box sx={{ display: 'grid', gap: 0.2 }}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {proc.display_name} {proc.emoji ?? ''}
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: alpha(brandTokens.parchment, 0.62) }}>
                      key: {proc.key} | slug: {proc.slug} | {proc.visible ? 'Visible' : 'Hidden'} | sort: {proc.sort_order}
                    </Typography>
                  </Box>

                  <Stack direction="row" spacing={0.8}>
                    <Button size="small" variant="text" onClick={() => hydrateEditor(proc)}>
                      Edit
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      onClick={() => void deleteProcessType(proc)}
                    >
                      Delete
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}