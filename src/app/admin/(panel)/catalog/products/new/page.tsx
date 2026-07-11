'use client'

import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import ArrowBack from '@mui/icons-material/ArrowBack'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { brandTokens } from '@/theme/theme'

interface CategoryOption {
  key: string
  display_name: string
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
}

export default function NewProductPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [categoryKey, setCategoryKey] = useState('')
  const [basePrice, setBasePrice] = useState('0')

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await fetch('/api/admin/catalog/categories', { cache: 'no-store' })
        const payload = await response.json().catch(() => ({}))
        if (response.ok && Array.isArray(payload?.categories)) {
          setCategories(payload.categories)
        }
      } catch {
        // Ignore errors - categories are optional for this form
      } finally {
        setLoading(false)
      }
    }
    void loadCategories()
  }, [])

  const handleTitleChange = (value: string) => {
    setTitle(value)
    // Auto-generate slug from title if slug is empty
    if (!slug || slug === toSlug(title)) {
      setSlug(toSlug(value))
    }
  }

  async function createProduct() {
    if (!title.trim()) {
      setError('Title is required.')
      return
    }

    const finalSlug = (slug.trim().length > 0 ? slug : toSlug(title)).trim()
    if (!finalSlug) {
      setError('Slug is required.')
      return
    }

    if (!categoryKey) {
      setError('Category is required.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          slug: finalSlug,
          category_key: categoryKey,
          base_price: Number(basePrice),
          sort_order: 0,
          production_estimate_band: '3-5 business days',
          short_description: '',
          description: '',
          is_ready_made: false,
          is_customizable: true,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to create product.')
      }

      const productId = payload.product?.id
      if (productId) {
        router.push(`/admin/catalog/products/${productId}/builder`)
      } else {
        setError('Product created but redirect failed. ID not returned.')
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to create product.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.4, maxWidth: 600 }}>
      <IconButton component={Link} href="/admin/catalog/products" sx={{ p: 0.5, ml: -0.5 }}>
        <ArrowBack />
      </IconButton>

      <Box>
        <Typography variant="h4" component="h1" sx={{ mb: 0.5 }}>
          Create New Product
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
          Enter basic details and continue editing in the builder.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <Box sx={{ display: 'grid', gap: 1.2 }}>
        <TextField
          fullWidth
          size="small"
          label="Title"
          value={title}
          onChange={(event) => handleTitleChange(event.target.value)}
          required
        />

        <TextField
          fullWidth
          size="small"
          label="Slug (URL identifier)"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          helperText="Auto-generated from title if left blank"
        />

        <Select
          size="small"
          value={categoryKey}
          onChange={(event) => setCategoryKey(event.target.value)}
          displayEmpty
          required
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">Select category</MenuItem>
          {categories.map((category) => (
            <MenuItem key={category.key} value={category.key}>
              {category.display_name}
            </MenuItem>
          ))}
        </Select>

        <TextField
          size="small"
          type="number"
          label="Base price ($)"
          value={basePrice}
          onChange={(event) => setBasePrice(event.target.value)}
          sx={{ maxWidth: 220 }}
          inputProps={{ min: 0, step: 0.5 }}
        />

        <Button
          variant="contained"
          disabled={saving}
          onClick={() => void createProduct()}
          sx={{ mt: 1, maxWidth: 220 }}
        >
          {saving ? 'Creating...' : 'Create and Continue to Builder'}
        </Button>
      </Box>
    </Box>
  )
}