'use client'

import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import Link from 'next/link'

import {
  getCategoryOptionTemplate,
  normalizeOptionKey,
  type OptionBlueprint,
  type ProductOptionType,
} from '@/lib/catalog/option-templates'
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

interface OptionValueDraft {
  label: string
  value: string
  price_delta: number
  is_enabled: boolean
  sort_order: number
}

interface OptionDraft {
  option_key: string
  label: string
  option_type: ProductOptionType
  placeholder: string
  help_text: string
  is_required: boolean
  sort_order: number
  values: OptionValueDraft[]
}

const OPTION_TYPE_CHOICES: ProductOptionType[] = ['select', 'text', 'textarea', 'file', 'checkbox', 'number']

function toDraftOption(input: OptionBlueprint, fallbackSort: number): OptionDraft {
  return {
    option_key: normalizeOptionKey(input.option_key),
    label: input.label,
    option_type: input.option_type,
    placeholder: input.placeholder ?? '',
    help_text: input.help_text ?? '',
    is_required: input.is_required ?? false,
    sort_order: Number.isFinite(input.sort_order) ? Number(input.sort_order) : fallbackSort,
    values: (input.values ?? []).map((value, index) => ({
      label: value.label,
      value: value.value,
      price_delta: Number(value.price_delta ?? 0),
      is_enabled: value.is_enabled ?? true,
      sort_order: Number.isFinite(value.sort_order) ? Number(value.sort_order) : index + 1,
    })),
  }
}

function asMoney(value: number): string {
  return `$${Number(value).toFixed(2)}`
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

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [categoryKey, setCategoryKey] = useState('')
  const [basePrice, setBasePrice] = useState('0')
  const [applyCategoryTemplate, setApplyCategoryTemplate] = useState(true)
  const [draftOptions, setDraftOptions] = useState<OptionDraft[]>([])
  const [draftOptionLabel, setDraftOptionLabel] = useState('')
  const [draftOptionKey, setDraftOptionKey] = useState('')
  const [draftOptionType, setDraftOptionType] = useState<ProductOptionType>('text')
  const [draftOptionPlaceholder, setDraftOptionPlaceholder] = useState('')
  const [draftOptionHelpText, setDraftOptionHelpText] = useState('')
  const [draftOptionRequired, setDraftOptionRequired] = useState(false)
  const [draftOptionSort, setDraftOptionSort] = useState('1')
  const [draftValueOptionKey, setDraftValueOptionKey] = useState('')
  const [draftValueLabel, setDraftValueLabel] = useState('')
  const [draftValueKey, setDraftValueKey] = useState('')
  const [draftValueDelta, setDraftValueDelta] = useState('0')
  const [draftValueSort, setDraftValueSort] = useState('1')
  const [draftValueEnabled, setDraftValueEnabled] = useState(true)

  const categoryLabel = useMemo(() => {
    if (!categoryKey) return ''
    return categoryOptions.find((c) => c.key === categoryKey)?.display_name ?? ''
  }, [categoryOptions, categoryKey])

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
      if (!categoryKey && nextCategories.length > 0) {
        setCategoryKey(nextCategories[0].key)
      }
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

  function applyTemplateForCategory(targetCategoryKey: string) {
    const template = getCategoryOptionTemplate(targetCategoryKey)
    setDraftOptions(template.map((option, index) => toDraftOption(option, index + 1)))
    setDraftValueOptionKey('')
  }

  function addDraftOption() {
    const label = draftOptionLabel.trim()
    if (label.length < 2) {
      setError('Add-on title must be at least 2 characters.')
      return
    }

    const key = normalizeOptionKey(draftOptionKey || label)
    if (key.length < 2) {
      setError('Add-on key is invalid.')
      return
    }

    if (draftOptions.some((option) => option.option_key === key)) {
      setError('Add-on key is already in use in this draft.')
      return
    }

    const nextSort = Number.parseInt(draftOptionSort, 10)
    setDraftOptions((prev) => [
      ...prev,
      {
        option_key: key,
        label,
        option_type: draftOptionType,
        placeholder: draftOptionPlaceholder.trim(),
        help_text: draftOptionHelpText.trim(),
        is_required: draftOptionRequired,
        sort_order: Number.isFinite(nextSort) ? nextSort : prev.length + 1,
        values: [],
      },
    ])
    setDraftOptionLabel('')
    setDraftOptionKey('')
    setDraftOptionType('text')
    setDraftOptionPlaceholder('')
    setDraftOptionHelpText('')
    setDraftOptionRequired(false)
    setDraftOptionSort(String(draftOptions.length + 2))
    setSuccess('Draft add-on added.')
  }

  function removeDraftOption(optionKey: string) {
    setDraftOptions((prev) => prev.filter((option) => option.option_key !== optionKey))
    if (draftValueOptionKey === optionKey) {
      setDraftValueOptionKey('')
    }
  }

  function addDraftValue() {
    if (!draftValueOptionKey) {
      setError('Select an add-on before adding a value.')
      return
    }

    const valueLabel = draftValueLabel.trim()
    const valueKey = draftValueKey.trim()
    if (!valueLabel || !valueKey) {
      setError('Value label and value key are required.')
      return
    }

    const delta = Number(draftValueDelta)
    const sort = Number.parseInt(draftValueSort, 10)

    setDraftOptions((prev) =>
      prev.map((option) => {
        if (option.option_key !== draftValueOptionKey) return option
        if (option.values.some((value) => value.value === valueKey)) return option
        return {
          ...option,
          values: [
            ...option.values,
            {
              label: valueLabel,
              value: valueKey,
              price_delta: Number.isFinite(delta) ? delta : 0,
              is_enabled: draftValueEnabled,
              sort_order: Number.isFinite(sort) ? sort : option.values.length + 1,
            },
          ],
        }
      })
    )

    setDraftValueLabel('')
    setDraftValueKey('')
    setDraftValueDelta('0')
    setDraftValueSort('1')
    setDraftValueEnabled(true)
    setSuccess('Draft value added.')
  }

  async function createProduct() {
    if (!title.trim()) {
      setError('Title is required to create a product.')
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
    setSuccess(null)

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
          apply_category_template: applyCategoryTemplate,
          option_blueprint: draftOptions,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to create product.')
      }

      setSuccess('Draft product created.')
      setTitle('')
      setSlug('')
      setBasePrice('0')
      setDraftOptions([])
      setDraftValueOptionKey('')
      await loadProducts(query, status, categoryFilter)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to create product.')
    } finally {
      setSaving(false)
    }
  }

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
      <Box>
        <Link href='/admin/catalog' style={{ textDecoration: 'none' }}>
          <Button variant='text' sx={{ px: 0 }}>
            {'<- Back'}
          </Button>
        </Link>
      </Box>

      <Box sx={{ display: 'grid', gap: 0.5 }}>
        <Typography variant='h4' component='h1'>Products</Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
          Filter products, manage lifecycle, and open the unified product builder.
        </Typography>
      </Box>

      {error && <Alert severity='error'>{error}</Alert>}
      {success && <Alert severity='success'>{success}</Alert>}

      <Box
        sx={{
          borderRadius: 1.4,
          border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`,
          backgroundColor: alpha(brandTokens.bgSurface, 0.52),
          p: 1.2,
          display: 'grid',
          gap: 1,
        }}
      >
        <Typography variant='h6'>Create Draft Product</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField size='small' label='Title' value={title} onChange={(event) => setTitle(event.target.value)} fullWidth />
          <TextField size='small' label='Slug (optional)' value={slug} onChange={(event) => setSlug(event.target.value)} fullWidth />
        </Stack>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <Select
            size='small'
            value={categoryKey}
            onChange={(event) => {
              const nextCategory = event.target.value
              setCategoryKey(nextCategory)
              if (applyCategoryTemplate && draftOptions.length === 0 && nextCategory) {
                applyTemplateForCategory(nextCategory)
              }
            }}
            sx={{ minWidth: 220 }}
            displayEmpty
          >
            <MenuItem value=''>Select category</MenuItem>
            {categoryOptions.map((category) => (
              <MenuItem key={category.key} value={category.key}>{category.display_name}</MenuItem>
            ))}
          </Select>
          <TextField size='small' type='number' label='Base price' value={basePrice} onChange={(event) => setBasePrice(event.target.value)} sx={{ width: 160 }} />
          <Button variant='contained' disabled={saving} onClick={() => void createProduct()}>
            {saving ? 'Creating...' : 'Create Draft'}
          </Button>
        </Stack>
        {categoryLabel && (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.6), fontSize: '0.78rem' }}>
            New draft category: {categoryLabel}
          </Typography>
        )}

        <Box
          sx={{
            borderRadius: 1.2,
            border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
            backgroundColor: alpha(brandTokens.bgSurface, 0.4),
            p: 1,
            display: 'grid',
            gap: 1,
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent='space-between'>
            <Typography sx={{ fontWeight: 700 }}>Add-ons for this new product</Typography>
            <Stack direction='row' spacing={1}>
              <FormControlLabel
                control={
                  <Checkbox
                    size='small'
                    checked={applyCategoryTemplate}
                    onChange={(event) => setApplyCategoryTemplate(event.target.checked)}
                  />
                }
                label='Auto-apply category starter'
              />
              <Button
                variant='text'
                disabled={!categoryKey}
                onClick={() => applyTemplateForCategory(categoryKey)}
              >
                Apply Starter Template
              </Button>
              <Button variant='text' color='inherit' onClick={() => setDraftOptions([])}>
                Clear
              </Button>
            </Stack>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <TextField
              size='small'
              label='Add-on title'
              value={draftOptionLabel}
              onChange={(event) => setDraftOptionLabel(event.target.value)}
              sx={{ minWidth: 220 }}
            />
            <TextField
              size='small'
              label='Add-on key'
              value={draftOptionKey}
              onChange={(event) => setDraftOptionKey(event.target.value)}
              sx={{ minWidth: 180 }}
            />
            <Select
              size='small'
              value={draftOptionType}
              onChange={(event) => setDraftOptionType(event.target.value as ProductOptionType)}
              sx={{ minWidth: 150 }}
            >
              {OPTION_TYPE_CHOICES.map((type) => (
                <MenuItem key={type} value={type}>{type}</MenuItem>
              ))}
            </Select>
            <TextField
              size='small'
              label='Sort'
              type='number'
              value={draftOptionSort}
              onChange={(event) => setDraftOptionSort(event.target.value)}
              sx={{ width: 110 }}
            />
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <TextField
              fullWidth
              size='small'
              label='Description'
              value={draftOptionHelpText}
              onChange={(event) => setDraftOptionHelpText(event.target.value)}
            />
            <TextField
              fullWidth
              size='small'
              label='Placeholder'
              value={draftOptionPlaceholder}
              onChange={(event) => setDraftOptionPlaceholder(event.target.value)}
            />
            <FormControlLabel
              control={
                <Checkbox
                  size='small'
                  checked={draftOptionRequired}
                  onChange={(event) => setDraftOptionRequired(event.target.checked)}
                />
              }
              label='Required'
            />
            <Button variant='outlined' onClick={addDraftOption}>Add Add-on</Button>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <Select
              size='small'
              value={draftValueOptionKey}
              onChange={(event) => setDraftValueOptionKey(event.target.value)}
              sx={{ minWidth: 220 }}
              displayEmpty
            >
              <MenuItem value=''>Choose add-on for value</MenuItem>
              {draftOptions.map((option) => (
                <MenuItem key={option.option_key} value={option.option_key}>{option.label}</MenuItem>
              ))}
            </Select>
            <TextField
              size='small'
              label='Value label'
              value={draftValueLabel}
              onChange={(event) => setDraftValueLabel(event.target.value)}
              sx={{ minWidth: 150 }}
            />
            <TextField
              size='small'
              label='Value key'
              value={draftValueKey}
              onChange={(event) => setDraftValueKey(event.target.value)}
              sx={{ minWidth: 150 }}
            />
            <TextField
              size='small'
              type='number'
              label='Price delta'
              value={draftValueDelta}
              onChange={(event) => setDraftValueDelta(event.target.value)}
              sx={{ width: 130 }}
            />
            <TextField
              size='small'
              type='number'
              label='Sort'
              value={draftValueSort}
              onChange={(event) => setDraftValueSort(event.target.value)}
              sx={{ width: 110 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  size='small'
                  checked={draftValueEnabled}
                  onChange={(event) => setDraftValueEnabled(event.target.checked)}
                />
              }
              label='Enabled'
            />
            <Button variant='outlined' onClick={addDraftValue}>Add Value</Button>
          </Stack>

          {draftOptions.length === 0 ? (
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.78rem' }}>
              No add-ons queued. You can still add add-ons later on the product edit page.
            </Typography>
          ) : (
            <Box sx={{ display: 'grid', gap: 0.7 }}>
              {draftOptions
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((option) => (
                  <Box
                    key={option.option_key}
                    sx={{
                      borderRadius: 1,
                      border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
                      p: 0.8,
                      backgroundColor: alpha(brandTokens.bgSurface, 0.44),
                      display: 'grid',
                      gap: 0.4,
                    }}
                  >
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent='space-between' spacing={1}>
                      <Typography sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.72) }}>
                        {option.label} ({option.option_type}) | key {option.option_key} | sort {option.sort_order} | {option.is_required ? 'Required' : 'Optional'}
                      </Typography>
                      <Button size='small' color='error' variant='text' onClick={() => removeDraftOption(option.option_key)}>
                        Remove
                      </Button>
                    </Stack>
                    {option.help_text && (
                      <Typography sx={{ fontSize: '0.76rem', color: alpha(brandTokens.parchment, 0.6) }}>
                        {option.help_text}
                      </Typography>
                    )}
                    {option.values.length > 0 && (
                      <Box sx={{ display: 'grid', gap: 0.25 }}>
                        {option.values
                          .slice()
                          .sort((a, b) => a.sort_order - b.sort_order)
                          .map((value) => (
                            <Typography
                              key={`${option.option_key}-${value.value}`}
                              sx={{ fontSize: '0.75rem', color: alpha(brandTokens.parchment, 0.57) }}
                            >
                              {value.label} ({value.value}) | delta ${value.price_delta.toFixed(2)} | {value.is_enabled ? 'Enabled' : 'Disabled'}
                            </Typography>
                          ))}
                      </Box>
                    )}
                  </Box>
                ))}
            </Box>
          )}
        </Box>
      </Box>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          fullWidth
          size='small'
          label='Search title or slug'
          value={queryDraft}
          onChange={(event) => setQueryDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') setQuery(queryDraft)
          }}
        />
        <Select
          size='small'
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value='all'>All statuses</MenuItem>
          <MenuItem value='active'>Published</MenuItem>
          <MenuItem value='inactive'>Draft</MenuItem>
          <MenuItem value='archived'>Archived</MenuItem>
        </Select>
        <Select
          size='small'
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value='all'>All categories</MenuItem>
          {categoryOptions.map((category) => (
            <MenuItem key={category.key} value={category.key}>{category.display_name}</MenuItem>
          ))}
        </Select>
        <Button variant='outlined' onClick={() => setQuery(queryDraft)}>Search</Button>
        <Button
          variant='text'
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
        <Alert severity='info'>No products matched your filters.</Alert>
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
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent='space-between'>
                <Box sx={{ display: 'grid', gap: 0.25 }}>
                  <Typography sx={{ fontWeight: 700 }}>{product.title}</Typography>
                  <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), fontSize: '0.78rem' }}>
                    /{product.slug} | {product.category_display_name}
                  </Typography>
                  <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.76rem' }}>
                    {statusText(product)} | {asMoney(product.base_price)} | Sort {product.sort_order} | {product.production_estimate_band}
                  </Typography>
                  {product.process_type_keys.length > 0 && (
                    <Stack direction='row' spacing={0.5} flexWrap='wrap' useFlexGap sx={{ mt: 0.25 }}>
                      {product.process_type_keys.map((key) => (
                        <Chip
                          key={key}
                          label={key.replace(/_/g, ' ')}
                          size='small'
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

                <Stack direction='row' spacing={0.8} flexWrap='wrap'>
                  <Link href={`/admin/catalog/products/${product.id}/builder`} style={{ textDecoration: 'none' }}>
                    <Button size='small' variant='outlined'>Builder</Button>
                  </Link>

                  {!product.is_archived && !product.is_active && (
                    <Button size='small' variant='contained' disabled={workingId === product.id} onClick={() => void runAction(product, 'publish')}>
                      Publish
                    </Button>
                  )}

                  {!product.is_archived && product.is_active && (
                    <Button size='small' variant='outlined' disabled={workingId === product.id} onClick={() => void runAction(product, 'deactivate')}>
                      Deactivate
                    </Button>
                  )}

                  {!product.is_archived && (
                    <Button size='small' color='error' variant='outlined' disabled={workingId === product.id} onClick={() => void runAction(product, 'archive')}>
                      Archive
                    </Button>
                  )}

                  {product.is_archived && (
                    <Button size='small' variant='outlined' disabled={workingId === product.id} onClick={() => void runAction(product, 'restore')}>
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
