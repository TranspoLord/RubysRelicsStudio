'use client'

import { useEffect, useMemo, useState } from 'react'
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

interface CategoryRow {
  key: string
  display_name: string
  slug: string
  parent_key: string | null
  visible: boolean
  sort_order: number
  emoji: string | null
  gradient: string | null
  tagline: string | null
  updated_at: string
}

interface CategoryEditor {
  key: string
  display_name: string
  slug: string
  parent_key: string
  visible: boolean
  sort_order: string
  emoji: string
  gradient: string
  tagline: string
}

const EMPTY_EDITOR: CategoryEditor = {
  key: '',
  display_name: '',
  slug: '',
  parent_key: '',
  visible: true,
  sort_order: '0',
  emoji: '',
  gradient: '',
  tagline: '',
}

function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120)
}

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

export default function CategoriesAdminPage() {
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [workingKey, setWorkingKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editor, setEditor] = useState<CategoryEditor>(EMPTY_EDITOR)

  const isEditing = useMemo(() => categories.some((c) => c.key === editor.key), [categories, editor.key])

  async function loadCategories(nextQuery = '') {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (nextQuery.trim().length > 0) params.set('q', nextQuery.trim())

      const response = await fetch(`/api/admin/catalog/categories?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load categories.')
      }

      setCategories(Array.isArray(payload?.categories) ? payload.categories : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load categories.')
      setCategories([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCategories()
  }, [])

  function updateEditor<K extends keyof CategoryEditor>(key: K, value: CategoryEditor[K]) {
    setEditor((prev) => ({ ...prev, [key]: value }))
  }

  function resetEditor() {
    setEditor(EMPTY_EDITOR)
  }

  function hydrateEditor(row: CategoryRow) {
    setEditor({
      key: row.key,
      display_name: row.display_name,
      slug: row.slug,
      parent_key: row.parent_key ?? '',
      visible: row.visible,
      sort_order: String(row.sort_order),
      emoji: row.emoji ?? '',
      gradient: row.gradient ?? '',
      tagline: row.tagline ?? '',
    })
  }

  async function saveCategory() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const method = isEditing ? 'PUT' : 'POST'
      const response = await fetch('/api/admin/catalog/categories', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: normalizeKey(editor.key || editor.display_name),
          display_name: editor.display_name,
          slug: normalizeSlug(editor.slug || editor.display_name),
          parent_key: editor.parent_key || null,
          visible: editor.visible,
          sort_order: Number(editor.sort_order),
          emoji: editor.emoji,
          gradient: editor.gradient,
          tagline: editor.tagline,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save category.')
      }

      setSuccess(isEditing ? 'Category updated.' : 'Category created.')
      resetEditor()
      await loadCategories(query)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save category.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteCategory(row: CategoryRow) {
    const confirmed = window.confirm(
      `Delete category ${row.display_name}? This is blocked if products are still assigned.`
    )
    if (!confirmed) return

    setWorkingKey(row.key)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: row.key,
          confirmAction: 'delete_category',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete category.')
      }

      if (editor.key === row.key) {
        resetEditor()
      }
      setSuccess('Category deleted.')
      await loadCategories(query)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete category.')
    } finally {
      setWorkingKey(null)
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.4 }}>
      <IconButton component={Link} href="/admin/catalog" sx={{ p: 0.5, ml: -0.5 }}>
        <ArrowBack />
      </IconButton>

      <Box>
        <Typography variant="h5" component="h1" sx={{ mb: 0.5 }}>
          Categories Management
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
          Manage category names, visibility, images, and product assignments
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
        <Typography variant="h6">Category Editor</Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="Display name"
            value={editor.display_name}
            onChange={(event) => updateEditor('display_name', event.target.value)}
          />
          <TextField
            fullWidth
            size="small"
            label="Key"
            value={editor.key}
            onChange={(event) => updateEditor('key', event.target.value)}
            helperText="Auto-normalized if left blank"
          />
          <TextField
            fullWidth
            size="small"
            label="Slug"
            value={editor.slug}
            onChange={(event) => updateEditor('slug', event.target.value)}
            helperText="Auto-normalized if left blank"
          />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="Parent key (optional)"
            value={editor.parent_key}
            onChange={(event) => updateEditor('parent_key', event.target.value)}
          />
          <TextField
            size="small"
            label="Sort order"
            type="number"
            value={editor.sort_order}
            onChange={(event) => updateEditor('sort_order', event.target.value)}
            sx={{ width: 160 }}
          />
          <TextField
            size="small"
            label="Emoji"
            value={editor.emoji}
            onChange={(event) => updateEditor('emoji', event.target.value)}
            sx={{ width: 160 }}
          />
          <TextField
            fullWidth
            size="small"
            label="Gradient token"
            value={editor.gradient}
            onChange={(event) => updateEditor('gradient', event.target.value)}
          />
        </Stack>

        <TextField
          fullWidth
          size="small"
          label="Tagline"
          value={editor.tagline}
          onChange={(event) => updateEditor('tagline', event.target.value)}
        />

        <FormControlLabel
          control={
            <Checkbox
              checked={editor.visible}
              onChange={(event) => updateEditor('visible', event.target.checked)}
            />
          }
          label="Visible to customers"
        />

        <Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={saving} onClick={() => void saveCategory()}>
            {saving ? 'Saving...' : isEditing ? 'Save Category' : 'Create Category'}
          </Button>
          <Button variant="text" onClick={resetEditor} disabled={saving}>
            Clear Form
          </Button>
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
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="Search categories"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button variant="outlined" onClick={() => void loadCategories(query)} disabled={loading}>
            Search
          </Button>
          <Button
            variant="text"
            onClick={() => {
              setQuery('')
              void loadCategories('')
            }}
            disabled={loading}
          >
            Reset
          </Button>
        </Stack>

        {loading ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.6) }}>Loading categories...</Typography>
        ) : categories.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.6) }}>No categories found.</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.8 }}>
            {categories.map((row) => (
              <Box
                key={row.key}
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
                      {row.display_name} {row.emoji ?? ''}
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: alpha(brandTokens.parchment, 0.62) }}>
                      key: {row.key} | slug: {row.slug} | {row.visible ? 'Visible' : 'Hidden'} | sort: {row.sort_order}
                    </Typography>
                    {row.tagline && (
                      <Typography sx={{ fontSize: '0.78rem', color: alpha(brandTokens.parchment, 0.55) }}>
                        {row.tagline}
                      </Typography>
                    )}
                  </Box>

                  <Stack direction="row" spacing={0.8}>
                    <Button size="small" variant="text" onClick={() => hydrateEditor(row)}>
                      Edit
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      disabled={workingKey === row.key}
                      onClick={() => void deleteCategory(row)}
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
