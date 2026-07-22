'use client'

import { use, useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

interface CategoryOption {
  key: string
  display_name: string
}

interface ProductDetail {
  id: string
  title: string
  slug: string
  category_key: string
  base_price: number
  sort_order: number
  production_estimate_band: string
  short_description: string
  description: string
  is_ready_made: boolean
  is_customizable: boolean
}

interface ProductMediaRow {
  id: string
  product_id: string
  url: string
  alt: string
  emoji: string | null
  gradient: string | null
  is_featured: boolean
  sort_order: number
}

interface ProductOptionValueRow {
  id: string
  option_id: string
  label: string
  value: string
  price_delta: number
  is_enabled: boolean
  sort_order: number
}

interface ProductOptionRow {
  id: string
  product_id: string
  option_key: string
  label: string
  option_type: 'select' | 'text' | 'textarea' | 'file' | 'checkbox' | 'number'
  placeholder: string | null
  help_text: string | null
  is_required: boolean
  sort_order: number
  values: ProductOptionValueRow[]
}

const OPTION_TYPE_CHOICES: Array<ProductOptionRow['option_type']> = [
  'select',
  'text',
  'textarea',
  'file',
  'checkbox',
  'number',
]

function normalizeOptionKey(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

export default function ProductPageEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: productId } = use(params)
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [mediaItems, setMediaItems] = useState<ProductMediaRow[]>([])
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaAlt, setMediaAlt] = useState('')
  const [mediaEmoji, setMediaEmoji] = useState('')
  const [mediaGradient, setMediaGradient] = useState('')
  const [mediaSortOrder, setMediaSortOrder] = useState('0')
  const [mediaFeatured, setMediaFeatured] = useState(false)
  const [mediaBusyId, setMediaBusyId] = useState<string | null>(null)
  const [mediaUploading, setMediaUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [productOptions, setProductOptions] = useState<ProductOptionRow[]>([])
  const [optionBusyId, setOptionBusyId] = useState<string | null>(null)
  const [optionValueBusyId, setOptionValueBusyId] = useState<string | null>(null)
  const [optionKey, setOptionKey] = useState('')
  const [optionLabel, setOptionLabel] = useState('')
  const [optionType, setOptionType] = useState<ProductOptionRow['option_type']>('text')
  const [optionPlaceholder, setOptionPlaceholder] = useState('')
  const [optionHelpText, setOptionHelpText] = useState('')
  const [optionRequired, setOptionRequired] = useState(false)
  const [optionSortOrder, setOptionSortOrder] = useState('0')
  const [selectedOptionIdForValue, setSelectedOptionIdForValue] = useState('')
  const [valueLabel, setValueLabel] = useState('')
  const [valueRaw, setValueRaw] = useState('')
  const [valuePriceDelta, setValuePriceDelta] = useState('0')
  const [valueEnabled, setValueEnabled] = useState(true)
  const [valueSortOrder, setValueSortOrder] = useState('0')

  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      const [productRes, mediaRes, optionsRes] = await Promise.all([
        fetch(`/api/admin/catalog/products/${productId}`, { cache: 'no-store' }),
        fetch(`/api/admin/catalog/media?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' }),
        fetch(`/api/admin/catalog/options?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' }),
      ])

      const payload = await productRes.json().catch(() => ({}))
      const mediaPayload = await mediaRes.json().catch(() => ({}))
      const optionsPayload = await optionsRes.json().catch(() => ({}))

      if (!productRes.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load product.')
      }
      if (!mediaRes.ok) {
        throw new Error(
          typeof mediaPayload?.error === 'string' ? mediaPayload.error : 'Failed to load product media.'
        )
      }
      if (!optionsRes.ok) {
        throw new Error(
          typeof optionsPayload?.error === 'string' ? optionsPayload.error : 'Failed to load product options.'
        )
      }

      setProduct(payload.product as ProductDetail)
      setCategories(Array.isArray(payload.categories) ? payload.categories : [])
      setMediaItems(Array.isArray(mediaPayload.media) ? mediaPayload.media : [])
      const loadedOptions = Array.isArray(optionsPayload.options) ? optionsPayload.options : []
      setProductOptions(loadedOptions)
      if (loadedOptions.length > 0 && !selectedOptionIdForValue) {
        setSelectedOptionIdForValue(loadedOptions[0].id)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load product editor.')
      setProduct(null)
      setCategories([])
      setMediaItems([])
      setProductOptions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [productId])

  function updateProduct<K extends keyof ProductDetail>(key: K, value: ProductDetail[K]) {
    setProduct((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function saveProduct() {
    if (!product) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(`/api/admin/catalog/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save product.')
      }

      setProduct(payload.product as ProductDetail)
      setSuccess('Product content updated.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save product content.')
    } finally {
      setSaving(false)
    }
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setMediaUploading(true)
    setError(null)
    setSuccess(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/admin/catalog/media/upload', {
        method: 'POST',
        body: formData,
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Upload failed.')
      }

      setMediaUrl(payload.url)
      setSuccess('File uploaded. Set alt text and click Add Media to save.')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload file.')
    } finally {
      setMediaUploading(false)
      // Reset the file input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  async function addMedia() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/admin/catalog/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          url: mediaUrl,
          alt: mediaAlt,
          emoji: mediaEmoji,
          gradient: mediaGradient,
          is_featured: mediaFeatured,
          sort_order: Number(mediaSortOrder),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to add media.')
      }

      setSuccess('Media item added.')
      setMediaUrl('')
      setMediaAlt('')
      setMediaEmoji('')
      setMediaGradient('')
      setMediaSortOrder('0')
      setMediaFeatured(false)
      await loadData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to add media.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteMedia(mediaId: string) {
    const confirmed = window.confirm('Delete this media item?')
    if (!confirmed) return

    setMediaBusyId(mediaId)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/admin/catalog/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId,
          confirmAction: 'delete_media',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete media.')
      }

      setSuccess('Media item deleted.')
      await loadData()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete media.')
    } finally {
      setMediaBusyId(null)
    }
  }

  async function addOption() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/admin/catalog/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          option_key: normalizeOptionKey(optionKey || optionLabel),
          label: optionLabel,
          option_type: optionType,
          placeholder: optionPlaceholder,
          help_text: optionHelpText,
          is_required: optionRequired,
          sort_order: Number(optionSortOrder),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to add option.')
      }

      setSuccess('Option added.')
      setOptionKey('')
      setOptionLabel('')
      setOptionType('text')
      setOptionPlaceholder('')
      setOptionHelpText('')
      setOptionRequired(false)
      setOptionSortOrder('0')
      await loadData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to add option.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteOption(optionId: string) {
    const confirmed = window.confirm('Delete this option and its values?')
    if (!confirmed) return

    setOptionBusyId(optionId)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/admin/catalog/options', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optionId,
          confirmAction: 'delete_option',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete option.')
      }

      setSuccess('Option deleted.')
      if (selectedOptionIdForValue === optionId) {
        setSelectedOptionIdForValue('')
      }
      await loadData()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete option.')
    } finally {
      setOptionBusyId(null)
    }
  }

  async function addOptionValue() {
    if (!selectedOptionIdForValue) {
      setError('Select an option before adding a value.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/admin/catalog/options/values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optionId: selectedOptionIdForValue,
          label: valueLabel,
          value: valueRaw,
          price_delta: Number(valuePriceDelta),
          is_enabled: valueEnabled,
          sort_order: Number(valueSortOrder),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to add option value.')
      }

      setSuccess('Option value added.')
      setValueLabel('')
      setValueRaw('')
      setValuePriceDelta('0')
      setValueEnabled(true)
      setValueSortOrder('0')
      await loadData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to add option value.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteOptionValue(optionValueId: string) {
    const confirmed = window.confirm('Delete this option value?')
    if (!confirmed) return

    setOptionValueBusyId(optionValueId)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/admin/catalog/options/values', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optionValueId,
          confirmAction: 'delete_option_value',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete option value.')
      }

      setSuccess('Option value deleted.')
      await loadData()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete option value.')
    } finally {
      setOptionValueBusyId(null)
    }
  }

  if (loading) {
    return <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>Loading product editor...</Typography>
  }

  if (!product) {
    return <Alert severity="error">Product not found.</Alert>
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.2, overflowX: 'hidden' }}>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          fullWidth
          size="small"
          label="Title"
          value={product.title}
          onChange={(event) => updateProduct('title', event.target.value)}
        />
        <TextField
          fullWidth
          size="small"
          label="Slug"
          value={product.slug}
          onChange={(event) => updateProduct('slug', event.target.value)}
        />
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <Select
          size="small"
          value={product.category_key}
          onChange={(event) => updateProduct('category_key', event.target.value)}
          sx={{ minWidth: 220 }}
        >
          {categories.map((category) => (
            <MenuItem key={category.key} value={category.key}>{category.display_name}</MenuItem>
          ))}
        </Select>
        <TextField
          size="small"
          type="number"
          label="Sort order"
          value={product.sort_order}
          onChange={(event) => updateProduct('sort_order', Number(event.target.value))}
          sx={{ width: 160 }}
        />
        <TextField
          fullWidth
          size="small"
          label="Production estimate"
          value={product.production_estimate_band}
          onChange={(event) => updateProduct('production_estimate_band', event.target.value)}
        />
      </Stack>

      <TextField
        size="small"
        label="Short description"
        value={product.short_description}
        onChange={(event) => updateProduct('short_description', event.target.value)}
      />
      <TextField
        multiline
        minRows={5}
        size="small"
        label="Description"
        value={product.description}
        onChange={(event) => updateProduct('description', event.target.value)}
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <FormControlLabel
          control={
            <Checkbox
              checked={product.is_ready_made}
              onChange={(event) => updateProduct('is_ready_made', event.target.checked)}
            />
          }
          label="Ready-made"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={product.is_customizable}
              onChange={(event) => updateProduct('is_customizable', event.target.checked)}
            />
          }
          label="Customizable"
        />
      </Stack>

      <Box>
        <Button variant="contained" disabled={saving} onClick={() => void saveProduct()}>
          {saving ? 'Saving...' : 'Save Product Content'}
        </Button>
      </Box>

      <Box sx={{ borderTop: `1px solid ${alpha(brandTokens.parchment, 0.16)}`, pt: 1.2, display: 'grid', gap: 1 }}>
        <Typography variant="h6">Media</Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="Media URL"
            value={mediaUrl}
            onChange={(event) => setMediaUrl(event.target.value)}
          />
          <TextField
            fullWidth
            size="small"
            label="Alt text"
            value={mediaAlt}
            onChange={(event) => setMediaAlt(event.target.value)}
          />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
          <TextField
            size="small"
            label="Emoji"
            value={mediaEmoji}
            onChange={(event) => setMediaEmoji(event.target.value)}
            sx={{ width: 160 }}
          />
          <TextField
            fullWidth
            size="small"
            label="Gradient"
            value={mediaGradient}
            onChange={(event) => setMediaGradient(event.target.value)}
          />
          <TextField
            size="small"
            type="number"
            label="Sort"
            value={mediaSortOrder}
            onChange={(event) => setMediaSortOrder(event.target.value)}
            sx={{ width: 120 }}
          />
          <FormControlLabel
            control={<Checkbox checked={mediaFeatured} onChange={(event) => setMediaFeatured(event.target.checked)} />}
            label="Featured"
          />
          <Button variant="outlined" disabled={saving || !mediaUrl} onClick={() => void addMedia()}>
            Add Media
          </Button>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            style={{ display: 'none' }}
            onChange={(event) => void handleFileUpload(event)}
          />
          <Button
            variant="contained"
            disabled={mediaUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {mediaUploading ? 'Uploading...' : 'Upload Image File'}
          </Button>
          {mediaUrl && (
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), fontSize: '0.78rem', wordBreak: 'break-all' }}>
              URL set: {mediaUrl}
            </Typography>
          )}
        </Stack>

        {mediaItems.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.82rem' }}>
            No media items yet.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.7 }}>
            {mediaItems.map((media) => (
              <Box
                key={media.id}
                sx={{
                  borderRadius: 1,
                  border: `1px solid ${alpha(brandTokens.parchment, 0.14)}`,
                  p: 0.8,
                  backgroundColor: alpha(brandTokens.bgSurface, 0.38),
                }}
              >
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                  <Box sx={{ display: 'grid', gap: 0.2 }}>
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{media.alt}</Typography>
                    <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), fontSize: '0.78rem' }}>
                      {media.url} | sort {media.sort_order} | {media.is_featured ? 'Featured' : 'Standard'}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    disabled={mediaBusyId === media.id}
                    onClick={() => void deleteMedia(media.id)}
                  >
                    Delete
                  </Button>
                </Stack>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Box sx={{ borderTop: `1px solid ${alpha(brandTokens.parchment, 0.16)}`, pt: 1.2, display: 'grid', gap: 1 }}>
        <Typography variant="h6">Options</Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
          <TextField
            size="small"
            label="Option label"
            value={optionLabel}
            onChange={(event) => setOptionLabel(event.target.value)}
            sx={{ minWidth: 220 }}
          />
          <TextField
            size="small"
            label="Option key"
            value={optionKey}
            onChange={(event) => setOptionKey(event.target.value)}
            sx={{ minWidth: 180 }}
          />
          <Select
            size="small"
            value={optionType}
            onChange={(event) => setOptionType(event.target.value as ProductOptionRow['option_type'])}
            sx={{ minWidth: 150 }}
          >
            {OPTION_TYPE_CHOICES.map((type) => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </Select>
          <TextField
            size="small"
            type="number"
            label="Sort"
            value={optionSortOrder}
            onChange={(event) => setOptionSortOrder(event.target.value)}
            sx={{ width: 110 }}
          />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="Placeholder"
            value={optionPlaceholder}
            onChange={(event) => setOptionPlaceholder(event.target.value)}
          />
          <TextField
            fullWidth
            size="small"
            label="Help text"
            value={optionHelpText}
            onChange={(event) => setOptionHelpText(event.target.value)}
          />
          <FormControlLabel
            control={<Checkbox checked={optionRequired} onChange={(event) => setOptionRequired(event.target.checked)} />}
            label="Required"
          />
          <Button variant="outlined" disabled={saving} onClick={() => void addOption()}>
            Add Option
          </Button>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
          <Select
            size="small"
            value={selectedOptionIdForValue}
            onChange={(event) => setSelectedOptionIdForValue(event.target.value)}
            sx={{ minWidth: 220 }}
            displayEmpty
          >
            <MenuItem value="">Select option for value</MenuItem>
            {productOptions.map((option) => (
              <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>
            ))}
          </Select>
          <TextField size="small" label="Value label" value={valueLabel} onChange={(event) => setValueLabel(event.target.value)} sx={{ minWidth: 180 }} />
          <TextField size="small" label="Value key" value={valueRaw} onChange={(event) => setValueRaw(event.target.value)} sx={{ minWidth: 180 }} />
          <TextField size="small" type="number" label="Delta" value={valuePriceDelta} onChange={(event) => setValuePriceDelta(event.target.value)} sx={{ width: 110 }} />
          <TextField size="small" type="number" label="Sort" value={valueSortOrder} onChange={(event) => setValueSortOrder(event.target.value)} sx={{ width: 110 }} />
          <FormControlLabel
            control={<Checkbox checked={valueEnabled} onChange={(event) => setValueEnabled(event.target.checked)} />}
            label="Enabled"
          />
          <Button variant="outlined" disabled={saving} onClick={() => void addOptionValue()}>
            Add Value
          </Button>
        </Stack>

        {productOptions.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.82rem' }}>
            No options yet.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.7 }}>
            {productOptions.map((option) => (
              <Box
                key={option.id}
                sx={{
                  borderRadius: 1,
                  border: `1px solid ${alpha(brandTokens.parchment, 0.14)}`,
                  p: 0.8,
                  backgroundColor: alpha(brandTokens.bgSurface, 0.38),
                  display: 'grid',
                  gap: 0.6,
                }}
              >
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                  <Typography sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.7) }}>
                    {option.label} ({option.option_type}) | key {option.option_key} | sort {option.sort_order} | {option.is_required ? 'Required' : 'Optional'}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    disabled={optionBusyId === option.id}
                    onClick={() => void deleteOption(option.id)}
                  >
                    Delete Option
                  </Button>
                </Stack>

                {option.values.length > 0 && (
                  <Box sx={{ display: 'grid', gap: 0.45 }}>
                    {option.values.map((optionValue) => (
                      <Stack key={optionValue.id} direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                        <Typography sx={{ fontSize: '0.78rem', color: alpha(brandTokens.parchment, 0.62) }}>
                          {optionValue.label} ({optionValue.value}) | delta {optionValue.price_delta} | sort {optionValue.sort_order} | {optionValue.is_enabled ? 'Enabled' : 'Disabled'}
                        </Typography>
                        <Button
                          size="small"
                          variant="text"
                          color="error"
                          disabled={optionValueBusyId === optionValue.id}
                          onClick={() => void deleteOptionValue(optionValue.id)}
                        >
                          Delete Value
                        </Button>
                      </Stack>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Typography sx={{ color: alpha(brandTokens.parchment, 0.6), fontSize: '0.78rem' }}>
        Advanced bulk-edit controls remain available at /admin/catalog/products.
      </Typography>
    </Box>
  )
}