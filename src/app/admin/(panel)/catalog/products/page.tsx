'use client'

import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
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

import { brandTokens } from '@/theme/theme'

type StatusFilter = 'all' | 'active' | 'inactive' | 'archived'

type CatalogAction = 'archive' | 'restore' | 'publish' | 'deactivate'

interface CatalogProductRow {
  id: string
  title: string
  slug: string
  category_key: string
  category_display_name: string
  base_price: number
  is_active: boolean
  is_archived: boolean
  sort_order: number
  production_estimate_band: string
  updated_at: string
  process_type_keys: string[]
}

interface CategoryOption {
  key: string
  display_name: string
}

function asMoney(value: number): string {
  return `$${Number(value).toFixed(2)}`
}

function statusText(product: CatalogProductRow): string {
  if (product.is_archived) return 'Archived'
  if (product.is_active) return 'Published'
  return 'Draft'
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<CatalogProductRow[]>([])
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [queryDraft, setQueryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')

  async function loadProducts(nextQuery: string, nextStatus: StatusFilter, nextCategoryFilter: string) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (nextQuery.trim().length > 0) params.set('q', nextQuery.trim())
      if (nextStatus !== 'all') params.set('status', nextStatus)
      if (nextCategoryFilter !== 'all') params.set('category', nextCategoryFilter)

      const response = await fetch(`/api/admin/catalog?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load products.')
      }

      setProducts(Array.isArray(payload?.products) ? payload.products : [])
      const nextCategories = Array.isArray(payload?.categories) ? payload.categories : []
      setCategoryOptions(nextCategories)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load products.')
      setProducts([])
      setCategoryOptions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProducts(query, status, categoryFilter)
  }, [query, status, categoryFilter])

  async function runAction(product: CatalogProductRow, action: CatalogAction) {
    const confirmAction = action === 'archive' ? 'archive_product' : action === 'restore' ? 'restore_product' : null

    if (action === 'archive') {
      const confirmed = window.confirm(`Archive ${product.title}? You can restore it later.`)
      if (!confirmed) return
    }

    if (action === 'restore') {
      const confirmed = window.confirm(`Restore ${product.title}?`)
      if (!confirmed) return
    }

    setWorkingId(product.id)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, action, confirmAction }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const checklist = Array.isArray(payload?.checklistErrors) ? payload.checklistErrors : []
        if (checklist.length > 0) {
          throw new Error(`Publish checklist failed: ${checklist.join(' | ')}`)
        }
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to update product.')
      }

      setSuccess(`Product ${action} succeeded.`)
      await loadProducts(query, status, categoryFilter)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to update product.')
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.4 }}>
      <IconButton component={Link} href="/admin/catalog" sx={{ p: 0.5, ml: -0.5 }}>
        <ArrowBack />
      </IconButton>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h4" component="h1">Products</Typography>
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
            Filter products, manage lifecycle, and open the unified product builder.
          </Typography>
        </Box>
        <Link href="/admin/catalog/products/new" style={{ textDecoration: 'none' }}>
          <Button variant="contained">Add Product</Button>
        </Link>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          fullWidth
          size="small"
          label="Search title or slug"
          value={queryDraft}
          onChange={(event) => setQueryDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') setQuery(queryDraft)
          }}
        />
        <Select
          size="small"
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="all">All statuses</MenuItem>
          <MenuItem value="active">Published</MenuItem>
          <MenuItem value="inactive">Draft</MenuItem>
          <MenuItem value="archived">Archived</MenuItem>
        </Select>
        <Select
          size="small"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="all">All categories</MenuItem>
          {categoryOptions.map((category) => (
            <MenuItem key={category.key} value={category.key}>{category.display_name}</MenuItem>
          ))}
        </Select>
        <Button variant="outlined" onClick={() => setQuery(queryDraft)}>Search</Button>
        <Button
          variant="text"
          onClick={() => {
            setQueryDraft('')
            setQuery('')
            setStatus('all')
            setCategoryFilter('all')
          }}
        >
          Reset
        </Button>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : products.length === 0 ? (
        <Alert severity="info">No products matched your filters.</Alert>
      ) : (
        <Box sx={{ display: 'grid', gap: 0.9 }}>
          {products.map((product) => (
            <Box
              key={product.id}
              sx={{
                borderRadius: 1.2,
                border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
                backgroundColor: alpha(brandTokens.bgSurface, 0.5),
                p: 1.2,
              }}
            >
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between">
                <Box sx={{ display: 'grid', gap: 0.25 }}>
                  <Typography sx={{ fontWeight: 700 }}>{product.title}</Typography>
                  <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), fontSize: '0.78rem' }}>
                    /{product.slug} | {product.category_display_name}
                  </Typography>
                  <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.76rem' }}>
                    {statusText(product)} | {asMoney(product.base_price)} | Sort {product.sort_order} | {product.production_estimate_band}
                  </Typography>
                  {product.process_type_keys.length > 0 && (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.25 }}>
                      {product.process_type_keys.map((key) => (
                        <Chip
                          key={key}
                          label={key.replace(/_/g, ' ')}
                          size="small"
                          sx={{
                            fontSize: '0.68rem',
                            height: 18,
                            backgroundColor: alpha(brandTokens.forgeGold, 0.12),
                            color: brandTokens.forgeGold,
                            border: `1px solid ${alpha(brandTokens.forgeGold, 0.3)}`,
                            '& .MuiChip-label': { px: 0.8 },
                          }}
                        />
                      ))}
                    </Stack>
                  )}
                </Box>

                <Stack direction="row" spacing={0.8} flexWrap="wrap">
                  <Link href={`/admin/catalog/products/${product.id}/builder`} style={{ textDecoration: 'none' }}>
                    <Button size="small" variant="outlined">Builder</Button>
                  </Link>

                  {!product.is_archived && !product.is_active && (
                    <Button size="small" variant="contained" disabled={workingId === product.id} onClick={() => void runAction(product, 'publish')}>
                      Publish
                    </Button>
                  )}

                  {!product.is_archived && product.is_active && (
                    <Button size="small" variant="outlined" disabled={workingId === product.id} onClick={() => void runAction(product, 'deactivate')}>
                      Deactivate
                    </Button>
                  )}

                  {!product.is_archived && (
                    <Button size="small" color="error" variant="outlined" disabled={workingId === product.id} onClick={() => void runAction(product, 'archive')}>
                      Archive
                    </Button>
                  )}

                  {product.is_archived && (
                    <Button size="small" variant="outlined" disabled={workingId === product.id} onClick={() => void runAction(product, 'restore')}>
                      Restore
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}