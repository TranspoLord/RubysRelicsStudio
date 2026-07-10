'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

type OptionType = 'select' | 'text' | 'textarea' | 'file' | 'checkbox' | 'number'
type DiscountType = 'percent' | 'fixed_amount' | 'unit_price'

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

interface ProductVariantRow {
  id: string
  product_id: string
  label: string
  sku: string | null
  price_delta: number
  capacity_weight: number | null
  is_enabled: boolean
  sort_order: number
}

interface BulkDiscountRow {
  id: string
  min_qty: number
  max_qty: number | null
  discount_type: DiscountType
  discount_value: number
  label: string | null
  is_enabled: boolean
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
  option_type: OptionType
  placeholder: string | null
  help_text: string | null
  is_required: boolean
  sort_order: number
  values: ProductOptionValueRow[]
}

interface OptionValueDraft {
  localId: string
  id: string | null
  label: string
  value: string
  price_delta: number
  is_enabled: boolean
  sort_order: number
}

interface OptionDraft {
  localId: string
  id: string | null
  option_key: string
  label: string
  option_type: OptionType
  placeholder: string
  help_text: string
  is_required: boolean
  sort_order: number
  values: OptionValueDraft[]
}

const OPTION_TYPE_CHOICES: OptionType[] = ['select', 'text', 'textarea', 'file', 'checkbox', 'number']
const DISCOUNT_TYPE_CHOICES: DiscountType[] = ['percent', 'fixed_amount', 'unit_price']
const DEFAULT_MEDIA_HOST_URL = 'https://postimages.org/'

function makeLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function asNumber(value: string, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeOptionKey(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function optionTypeLabel(value: OptionType): string {
  switch (value) {
    case 'select':
      return 'Single choice'
    case 'text':
      return 'Text'
    case 'textarea':
      return 'Long text'
    case 'file':
      return 'File upload'
    case 'checkbox':
      return 'Toggle'
    case 'number':
      return 'Number'
    default:
      return value
  }
}

function toOptionDraft(option: ProductOptionRow): OptionDraft {
  return {
    localId: makeLocalId(),
    id: option.id,
    option_key: option.option_key,
    label: option.label,
    option_type: option.option_type,
    placeholder: option.placeholder ?? '',
    help_text: option.help_text ?? '',
    is_required: option.is_required,
    sort_order: option.sort_order,
    values: (option.values ?? []).map((value) => ({
      localId: makeLocalId(),
      id: value.id,
      label: value.label,
      value: value.value,
      price_delta: Number(value.price_delta ?? 0),
      is_enabled: value.is_enabled,
      sort_order: value.sort_order,
    })),
  }
}

function cardSurface(tint: string, surfaceAlpha = 0.985, tintAlpha = 0.05) {
  return `linear-gradient(135deg, ${alpha(brandTokens.bgCard, surfaceAlpha)} 0%, ${alpha(tint, tintAlpha)} 100%)`
}

export default function ProductBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: productId } = use(params)

  const [loading, setLoading] = useState(true)
  const [savingCore, setSavingCore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [categories, setCategories] = useState<CategoryOption[]>([])

  const [mediaItems, setMediaItems] = useState<ProductMediaRow[]>([])
  const [mediaBusyId, setMediaBusyId] = useState<string | null>(null)
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaAlt, setMediaAlt] = useState('')
  const [mediaEmoji, setMediaEmoji] = useState('')
  const [mediaGradient, setMediaGradient] = useState('')
  const [mediaSortOrder, setMediaSortOrder] = useState('0')
  const [mediaFeatured, setMediaFeatured] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [externalMediaHostUrl, setExternalMediaHostUrl] = useState(DEFAULT_MEDIA_HOST_URL)

  const [options, setOptions] = useState<OptionDraft[]>([])
  const [optionBusyKey, setOptionBusyKey] = useState<string | null>(null)
  const [optionValueBusyKey, setOptionValueBusyKey] = useState<string | null>(null)
  const [newOptionType, setNewOptionType] = useState<OptionType>('text')

  const [variants, setVariants] = useState<ProductVariantRow[]>([])
  const [variantBusyId, setVariantBusyId] = useState<string | null>(null)
  const [variantLabel, setVariantLabel] = useState('')
  const [variantSku, setVariantSku] = useState('')
  const [variantPriceDelta, setVariantPriceDelta] = useState('0')
  const [variantWeight, setVariantWeight] = useState('')
  const [variantSortOrder, setVariantSortOrder] = useState('0')
  const [variantEnabled, setVariantEnabled] = useState(true)

  const [discounts, setDiscounts] = useState<BulkDiscountRow[]>([])
  const [discountBusyId, setDiscountBusyId] = useState<string | null>(null)
  const [minQty, setMinQty] = useState('1')
  const [maxQty, setMaxQty] = useState('')
  const [discountType, setDiscountType] = useState<DiscountType>('percent')
  const [discountValue, setDiscountValue] = useState('10')
  const [discountLabel, setDiscountLabel] = useState('')
  const [discountSortOrder, setDiscountSortOrder] = useState('0')

  // ── Process types ────────────────────────────────────────────────────────────
  interface ProcessTypeOption {
    key: string
    display_name: string
    emoji: string | null
    price_delta: number
    is_enabled: boolean
    pricing_id: string | null
  }
  interface ComboDiscountDraft {
    localId: string
    id: string | null
    min_processes: number
    discount_type: 'percent' | 'fixed_amount' | 'cheapest_free'
    discount_value: number | null
    label: string
  }
  const [allProcessTypes, setAllProcessTypes] = useState<ProcessTypeOption[]>([])
  const [assignedProcessKeys, setAssignedProcessKeys] = useState<string[]>([])
  const [processPricing, setProcessPricing] = useState<Record<string, number>>({})
  const [comboDiscounts, setComboDiscounts] = useState<ComboDiscountDraft[]>([])
  const [savingProcessTypes, setSavingProcessTypes] = useState(false)
  const [newComboMinProcesses, setNewComboMinProcesses] = useState('2')
  const [newComboDiscountType, setNewComboDiscountType] = useState<'percent' | 'fixed_amount' | 'cheapest_free'>('percent')
  const [newComboDiscountValue, setNewComboDiscountValue] = useState('10')
  const [newComboDiscountLabel, setNewComboDiscountLabel] = useState('')

  const categoryLabel = useMemo(() => {
    if (!product?.category_key) return ''
    return categories.find((category) => category.key === product.category_key)?.display_name ?? ''
  }, [categories, product?.category_key])

  async function loadCore() {
    const response = await fetch(`/api/admin/catalog/products/${productId}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load product.')
    }

    setProduct(payload.product as ProductDetail)
    setCategories(Array.isArray(payload.categories) ? payload.categories : [])
  }

  async function loadMedia() {
    const response = await fetch(`/api/admin/catalog/media?productId=${encodeURIComponent(productId)}`, {
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load product media.')
    }

    setMediaItems(Array.isArray(payload.media) ? payload.media : [])
  }

  async function loadOptions() {
    const response = await fetch(`/api/admin/catalog/options?productId=${encodeURIComponent(productId)}`, {
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load product options.')
    }

    const nextOptions = Array.isArray(payload.options) ? payload.options : []
    setOptions(nextOptions.map((entry: ProductOptionRow) => toOptionDraft(entry)))
  }

  async function loadPricing() {
    const [variantsRes, discountsRes] = await Promise.all([
      fetch(`/api/admin/catalog/variants?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' }),
      fetch(`/api/admin/catalog/discounts?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' }),
    ])

    const variantsPayload = await variantsRes.json().catch(() => ({}))
    const discountsPayload = await discountsRes.json().catch(() => ({}))

    if (!variantsRes.ok) {
      throw new Error(
        typeof variantsPayload?.error === 'string' ? variantsPayload.error : 'Failed to load variants.'
      )
    }

    if (!discountsRes.ok) {
      throw new Error(
        typeof discountsPayload?.error === 'string' ? discountsPayload.error : 'Failed to load discounts.'
      )
    }

    setVariants(Array.isArray(variantsPayload.variants) ? variantsPayload.variants : [])
    setDiscounts(Array.isArray(discountsPayload.discounts) ? discountsPayload.discounts : [])
  }

  async function loadProcessTypes() {
    const response = await fetch(
      `/api/admin/catalog/process-types?productId=${encodeURIComponent(productId)}`,
      { cache: 'no-store' }
    )
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load process types.')
    }
    const pts = Array.isArray(payload.processTypes) ? payload.processTypes : []
    setAllProcessTypes(pts)
    setAssignedProcessKeys(Array.isArray(payload.assigned) ? payload.assigned : [])
    // Build pricing map from the process types response
    const pricingMap: Record<string, number> = {}
    for (const pt of pts) {
      pricingMap[pt.key] = pt.price_delta ?? 0
    }
    setProcessPricing(pricingMap)
    // Load combo discounts
    const combos = Array.isArray(payload.comboDiscounts) ? payload.comboDiscounts : []
    setComboDiscounts(
      combos.map((c: { id?: string; min_processes: number; discount_type: string; discount_value: number | null; label: string | null }) => ({
        localId: makeLocalId(),
        id: c.id ?? null,
        min_processes: c.min_processes,
        discount_type: c.discount_type as 'percent' | 'fixed_amount' | 'cheapest_free',
        discount_value: c.discount_value ?? null,
        label: c.label ?? '',
      }))
    )
  }

  async function loadAll() {
    setLoading(true)
    setError(null)

    try {
      await Promise.all([loadCore(), loadMedia(), loadOptions(), loadPricing(), loadProcessTypes()])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load product builder.')
      setProduct(null)
      setCategories([])
      setMediaItems([])
      setOptions([])
      setVariants([])
      setDiscounts([])
    } finally {
      setLoading(false)
    }
  }

  function updateProcessPricing(key: string, delta: number) {
    setProcessPricing((prev) => ({ ...prev, [key]: delta }))
  }

  function addComboDiscount() {
    const minP = Number.parseInt(newComboMinProcesses, 10)
    if (!Number.isFinite(minP) || minP < 2) {
      setError('Min processes must be at least 2.')
      return
    }
    setComboDiscounts((prev) => [
      ...prev,
      {
        localId: makeLocalId(),
        id: null,
        min_processes: minP,
        discount_type: newComboDiscountType,
        discount_value: newComboDiscountType === 'cheapest_free' ? null : asNumber(newComboDiscountValue),
        label: newComboDiscountLabel,
      },
    ])
    setNewComboMinProcesses('2')
    setNewComboDiscountType('percent')
    setNewComboDiscountValue('10')
    setNewComboDiscountLabel('')
  }

  function removeComboDiscount(localId: string) {
    setComboDiscounts((prev) => prev.filter((c) => c.localId !== localId))
  }

  async function saveProcessTypes() {
    setSavingProcessTypes(true)
    setError(null)
    setSuccess(null)

    try {
      // Build process types array with pricing
      const processTypesPayload = allProcessTypes.map((pt) => ({
        key: pt.key,
        price_delta: processPricing[pt.key] ?? 0,
        is_enabled: assignedProcessKeys.includes(pt.key),
      }))

      // Build combo discounts payload
      const comboDiscountsPayload = comboDiscounts.map((c) => ({
        id: c.id,
        min_processes: c.min_processes,
        discount_type: c.discount_type,
        discount_value: c.discount_value,
        label: c.label || null,
      }))

      const response = await fetch('/api/admin/catalog/process-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          processTypes: processTypesPayload,
          comboDiscounts: comboDiscountsPayload,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save process types.')
      }
      setSuccess('Process types, pricing, and combo discounts saved.')
    } catch (ptError) {
      setError(ptError instanceof Error ? ptError.message : 'Failed to save process types.')
    } finally {
      setSavingProcessTypes(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [productId])

  function updateProduct<K extends keyof ProductDetail>(key: K, value: ProductDetail[K]) {
    setProduct((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function saveProductDetails() {
    if (!product) return

    setSavingCore(true)
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
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save product details.')
      }

      setProduct(payload.product as ProductDetail)
      setSuccess('Product details and base pricing saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save product details.')
    } finally {
      setSavingCore(false)
    }
  }

  async function handleBuilderSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await saveProductDetails()
  }

  async function uploadOwnMedia() {
    if (!uploadFile) {
      setError('Choose a media file first.')
      return
    }

    setUploadingMedia(true)
    setError(null)
    setSuccess(null)

    try {
      const form = new FormData()
      form.append('file', uploadFile)

      const response = await fetch('/api/admin/catalog/media/upload', {
        method: 'POST',
        body: form,
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to upload media file.')
      }

      setMediaUrl(typeof payload?.url === 'string' ? payload.url : '')
      setSuccess('Media uploaded. URL field has been filled for you.')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload media file.')
    } finally {
      setUploadingMedia(false)
    }
  }

  async function addMedia() {
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
          sort_order: asNumber(mediaSortOrder),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to add media item.')
      }

      setMediaUrl('')
      setMediaAlt('')
      setMediaEmoji('')
      setMediaGradient('')
      setMediaSortOrder('0')
      setMediaFeatured(false)
      setUploadFile(null)
      setSuccess('Media item added.')
      await loadMedia()
    } catch (mediaError) {
      setError(mediaError instanceof Error ? mediaError.message : 'Failed to add media item.')
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
        body: JSON.stringify({ mediaId, confirmAction: 'delete_media' }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete media item.')
      }

      setSuccess('Media item deleted.')
      await loadMedia()
    } catch (mediaError) {
      setError(mediaError instanceof Error ? mediaError.message : 'Failed to delete media item.')
    } finally {
      setMediaBusyId(null)
    }
  }

  function addOptionBlock() {
    const nextSort = options.length + 1
    const localId = makeLocalId()

    setOptions((prev) => [
      ...prev,
      {
        localId,
        id: null,
        option_key: '',
        label: '',
        option_type: newOptionType,
        placeholder: '',
        help_text: '',
        is_required: false,
        sort_order: nextSort,
        values: [],
      },
    ])
  }

  function updateOption(localId: string, updater: (entry: OptionDraft) => OptionDraft) {
    setOptions((prev) => prev.map((entry) => (entry.localId === localId ? updater(entry) : entry)))
  }

  function removeLocalOption(localId: string) {
    setOptions((prev) => prev.filter((entry) => entry.localId !== localId))
  }

  async function saveOption(localId: string) {
    const option = options.find((entry) => entry.localId === localId)
    if (!option) return

    const optionKey = normalizeOptionKey(option.option_key || option.label)

    setOptionBusyKey(localId)
    setError(null)
    setSuccess(null)

    try {
      const isUpdate = Boolean(option.id)
      const response = await fetch('/api/admin/catalog/options', {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isUpdate ? { optionId: option.id } : { productId }),
          option_key: optionKey,
          label: option.label,
          option_type: option.option_type,
          placeholder: option.placeholder,
          help_text: option.help_text,
          is_required: option.is_required,
          sort_order: option.sort_order,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save option.')
      }

      const saved = payload.option as ProductOptionRow
      updateOption(localId, (entry) => ({
        ...entry,
        id: saved.id,
        option_key: saved.option_key,
      }))
      setSuccess(isUpdate ? 'Option updated.' : 'Option added.')
    } catch (optionError) {
      setError(optionError instanceof Error ? optionError.message : 'Failed to save option.')
    } finally {
      setOptionBusyKey(null)
    }
  }

  async function deleteOption(localId: string) {
    const option = options.find((entry) => entry.localId === localId)
    if (!option) return

    if (!option.id) {
      removeLocalOption(localId)
      return
    }

    const confirmed = window.confirm('Delete this option and all of its choices?')
    if (!confirmed) return

    setOptionBusyKey(localId)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/options', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId: option.id, confirmAction: 'delete_option' }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete option.')
      }

      removeLocalOption(localId)
      setSuccess('Option deleted.')
    } catch (optionError) {
      setError(optionError instanceof Error ? optionError.message : 'Failed to delete option.')
    } finally {
      setOptionBusyKey(null)
    }
  }

  function addOptionChoice(localId: string) {
    updateOption(localId, (entry) => ({
      ...entry,
      values: [
        ...entry.values,
        {
          localId: makeLocalId(),
          id: null,
          label: '',
          value: '',
          price_delta: 0,
          is_enabled: true,
          sort_order: entry.values.length + 1,
        },
      ],
    }))
  }

  function updateOptionChoice(localId: string, valueLocalId: string, updater: (entry: OptionValueDraft) => OptionValueDraft) {
    updateOption(localId, (entry) => ({
      ...entry,
      values: entry.values.map((value) => (value.localId === valueLocalId ? updater(value) : value)),
    }))
  }

  async function saveOptionChoice(localId: string, valueLocalId: string) {
    const option = options.find((entry) => entry.localId === localId)
    if (!option) return

    const optionValue = option.values.find((value) => value.localId === valueLocalId)
    if (!optionValue) return

    if (!option.id) {
      setError('Save this option before saving its choices.')
      return
    }

    setOptionValueBusyKey(valueLocalId)
    setError(null)
    setSuccess(null)

    try {
      const isUpdate = Boolean(optionValue.id)
      const response = await fetch('/api/admin/catalog/options/values', {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isUpdate ? { optionValueId: optionValue.id } : { optionId: option.id }),
          label: optionValue.label,
          value: optionValue.value,
          price_delta: optionValue.price_delta,
          is_enabled: optionValue.is_enabled,
          sort_order: optionValue.sort_order,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save choice.')
      }

      const saved = payload.optionValue as ProductOptionValueRow
      updateOptionChoice(localId, valueLocalId, (entry) => ({
        ...entry,
        id: saved.id,
        label: saved.label,
        value: saved.value,
        price_delta: saved.price_delta,
        is_enabled: saved.is_enabled,
        sort_order: saved.sort_order,
      }))
      setSuccess(isUpdate ? 'Choice updated.' : 'Choice added.')
    } catch (valueError) {
      setError(valueError instanceof Error ? valueError.message : 'Failed to save choice.')
    } finally {
      setOptionValueBusyKey(null)
    }
  }

  async function deleteOptionChoice(localId: string, valueLocalId: string) {
    const option = options.find((entry) => entry.localId === localId)
    if (!option) return

    const optionValue = option.values.find((value) => value.localId === valueLocalId)
    if (!optionValue) return

    if (!optionValue.id) {
      updateOption(localId, (entry) => ({
        ...entry,
        values: entry.values.filter((value) => value.localId !== valueLocalId),
      }))
      return
    }

    const confirmed = window.confirm('Delete this choice?')
    if (!confirmed) return

    setOptionValueBusyKey(valueLocalId)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/options/values', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionValueId: optionValue.id, confirmAction: 'delete_option_value' }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete choice.')
      }

      updateOption(localId, (entry) => ({
        ...entry,
        values: entry.values.filter((value) => value.localId !== valueLocalId),
      }))
      setSuccess('Choice deleted.')
    } catch (valueError) {
      setError(valueError instanceof Error ? valueError.message : 'Failed to delete choice.')
    } finally {
      setOptionValueBusyKey(null)
    }
  }

  async function addVariant() {
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          label: variantLabel,
          sku: variantSku,
          price_delta: asNumber(variantPriceDelta),
          capacity_weight: variantWeight.trim().length > 0 ? asNumber(variantWeight) : null,
          is_enabled: variantEnabled,
          sort_order: asNumber(variantSortOrder),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to add variant.')
      }

      setVariantLabel('')
      setVariantSku('')
      setVariantPriceDelta('0')
      setVariantWeight('')
      setVariantSortOrder('0')
      setVariantEnabled(true)
      setSuccess('Variant added.')
      await loadPricing()
    } catch (variantError) {
      setError(variantError instanceof Error ? variantError.message : 'Failed to add variant.')
    }
  }

  async function deleteVariant(variantId: string) {
    const confirmed = window.confirm('Delete this variant?')
    if (!confirmed) return

    setVariantBusyId(variantId)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/variants', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId, confirmAction: 'delete_variant' }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete variant.')
      }

      setSuccess('Variant deleted.')
      await loadPricing()
    } catch (variantError) {
      setError(variantError instanceof Error ? variantError.message : 'Failed to delete variant.')
    } finally {
      setVariantBusyId(null)
    }
  }

  async function addDiscountTier() {
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          min_qty: asNumber(minQty, 1),
          max_qty: maxQty.trim().length > 0 ? asNumber(maxQty) : null,
          discount_type: discountType,
          discount_value: asNumber(discountValue),
          label: discountLabel,
          is_enabled: true,
          sort_order: asNumber(discountSortOrder),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to add discount tier.')
      }

      setMinQty('1')
      setMaxQty('')
      setDiscountType('percent')
      setDiscountValue('10')
      setDiscountLabel('')
      setDiscountSortOrder('0')
      setSuccess('Discount tier added.')
      await loadPricing()
    } catch (discountError) {
      setError(discountError instanceof Error ? discountError.message : 'Failed to add discount tier.')
    }
  }

  async function deleteDiscountTier(discountId: string) {
    const confirmed = window.confirm('Delete this discount tier?')
    if (!confirmed) return

    setDiscountBusyId(discountId)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/discounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discountId, confirmAction: 'delete_discount' }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete discount tier.')
      }

      setSuccess('Discount tier deleted.')
      await loadPricing()
    } catch (discountError) {
      setError(discountError instanceof Error ? discountError.message : 'Failed to delete discount tier.')
    } finally {
      setDiscountBusyId(null)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={20} />
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.72) }}>Loading product builder...</Typography>
      </Box>
    )
  }

  if (!product) {
    return <Alert severity='error'>Product not found.</Alert>
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.2 }}>
      <Box component='form' id='product-builder-form' onSubmit={handleBuilderSubmit} sx={{ display: 'none' }} />

      {(error || success) && (
        <Box
          sx={{
            border: `1px solid ${alpha(brandTokens.forgeGold, 0.14)}`,
            borderRadius: 1.2,
            background: cardSurface(brandTokens.parchment, 0.99, 0.07),
            p: 1,
          }}
        >
          {error ? <Alert severity='error'>{error}</Alert> : null}
          {!error && success ? <Alert severity='success'>{success}</Alert> : null}
        </Box>
      )}

      <Box
        sx={{
          display: 'grid',
          gap: 1,
          border: `1px solid ${alpha(brandTokens.copper, 0.14)}`,
          borderRadius: 1.2,
          p: 1,
          background: cardSurface(brandTokens.copper, 0.99, 0.06),
        }}
      >
        <Typography variant='h5' component='h1'>
          Product Builder
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.64), fontSize: '0.84rem' }}>
          Unified editing for details, media, options, variants, and pricing.
        </Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            fullWidth
            size='small'
            label='Title'
            value={product.title}
            onChange={(event) => updateProduct('title', event.target.value)}
          />
          <TextField
            fullWidth
            size='small'
            label='URL-Slug'
            value={product.slug}
            onChange={(event) => updateProduct('slug', event.target.value)}
          />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            select
            size='small'
            label='Category'
            value={product.category_key}
            onChange={(event) => updateProduct('category_key', event.target.value)}
            sx={{ minWidth: 260 }}
          >
            {categories.map((category) => (
              <MenuItem key={category.key} value={category.key}>{category.display_name}</MenuItem>
            ))}
          </TextField>

          <TextField
            size='small'
            type='number'
            label='Cat sort order'
            value={product.sort_order}
            onChange={(event) => updateProduct('sort_order', asNumber(event.target.value))}
            sx={{ width: 170 }}
          />

          <TextField
            fullWidth
            size='small'
            label='Production estimate'
            value={product.production_estimate_band}
            onChange={(event) => updateProduct('production_estimate_band', event.target.value)}
          />

          <TextField
            size='small'
            type='number'
            label='Base price'
            value={product.base_price}
            onChange={(event) => updateProduct('base_price', asNumber(event.target.value))}
            sx={{ width: 170 }}
          />
        </Stack>

        {categoryLabel ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.55), fontSize: '0.75rem' }}>
            Category selected: {categoryLabel}
          </Typography>
        ) : null}

        <TextField
          size='small'
          label='Short description'
          value={product.short_description}
          onChange={(event) => updateProduct('short_description', event.target.value)}
        />

        <TextField
          multiline
          minRows={5}
          size='small'
          label='Description'
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
            label='Ready-made'
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={product.is_customizable}
                onChange={(event) => updateProduct('is_customizable', event.target.checked)}
              />
            }
            label='Customizable'
          />
        </Stack>
      </Box>

      <Divider />

      <Box
        sx={{
          display: 'grid',
          gap: 1,
          border: `1px solid ${alpha(brandTokens.forgeGold, 0.14)}`,
          borderRadius: 1.2,
          p: 1,
          background: cardSurface(brandTokens.parchment, 0.985, 0.06),
        }}
      >
        <Typography variant='h6'>Media</Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            fullWidth
            size='small'
            label='External media host URL'
            value={externalMediaHostUrl}
            onChange={(event) => setExternalMediaHostUrl(event.target.value)}
          />
          <Button
            variant='outlined'
            onClick={() => window.open(externalMediaHostUrl, '_blank', 'noopener,noreferrer')}
          >
            Open media host
          </Button>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
          <Button variant='outlined' component='label'>
            Choose file
            <input
              hidden
              type='file'
              accept='image/*'
              onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
            />
          </Button>
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.78rem', flex: 1 }}>
            {uploadFile ? uploadFile.name : 'No file chosen'}
          </Typography>
          <Button variant='outlined' disabled={uploadingMedia || !uploadFile} onClick={() => void uploadOwnMedia()}>
            {uploadingMedia ? 'Uploading...' : 'Upload file'}
          </Button>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            fullWidth
            size='small'
            label='Media URL'
            value={mediaUrl}
            onChange={(event) => setMediaUrl(event.target.value)}
          />
          <TextField
            fullWidth
            size='small'
            label='Alt text'
            value={mediaAlt}
            onChange={(event) => setMediaAlt(event.target.value)}
          />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
          <TextField
            size='small'
            label='Emoji'
            value={mediaEmoji}
            onChange={(event) => setMediaEmoji(event.target.value)}
            sx={{ width: 160 }}
          />
          <TextField
            fullWidth
            size='small'
            label='Gradient'
            value={mediaGradient}
            onChange={(event) => setMediaGradient(event.target.value)}
          />
          <TextField
            size='small'
            type='number'
            label='Sort'
            value={mediaSortOrder}
            onChange={(event) => setMediaSortOrder(event.target.value)}
            sx={{ width: 120 }}
          />
          <FormControlLabel
            control={<Checkbox checked={mediaFeatured} onChange={(event) => setMediaFeatured(event.target.checked)} />}
            label='Featured'
          />
          <Button variant='contained' onClick={() => void addMedia()}>Add media</Button>
        </Stack>

        {mediaItems.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.8rem' }}>
            No media items yet.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.8 }}>
            {mediaItems.map((media) => (
              <Box
                key={media.id}
                sx={{
                  border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`,
                  borderRadius: 1,
                  p: 0.8,
                  background: cardSurface(brandTokens.parchment, 0.99, 0.07),
                }}
              >
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent='space-between'>
                  <Box sx={{ display: 'grid', gap: 0.25 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.82rem' }}>{media.alt}</Typography>
                    <Typography sx={{ color: alpha(brandTokens.parchment, 0.66), fontSize: '0.76rem' }}>
                      {media.url} | sort {media.sort_order} | {media.is_featured ? 'Featured' : 'Standard'}
                    </Typography>
                  </Box>
                  <Button
                    size='small'
                    variant='outlined'
                    color='error'
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

      <Divider />

      <Box
        sx={{
          display: 'grid',
          gap: 1,
          border: `1px solid ${alpha(brandTokens.rubyRed, 0.14)}`,
          borderRadius: 1.2,
          p: 1,
          background: cardSurface(brandTokens.copper, 0.99, 0.055),
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent='space-between' alignItems={{ md: 'center' }}>
          <Typography variant='h6'>Options</Typography>
          <Stack direction='row' spacing={1} alignItems='center'>
            <Select
              size='small'
              value={newOptionType}
              onChange={(event) => setNewOptionType(event.target.value as OptionType)}
              sx={{ minWidth: 180 }}
            >
              {OPTION_TYPE_CHOICES.map((type) => (
                <MenuItem key={type} value={type}>{optionTypeLabel(type)}</MenuItem>
              ))}
            </Select>
            <Button variant='contained' onClick={addOptionBlock}>Add option</Button>
          </Stack>
        </Stack>

        {options.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.8rem' }}>
            No options yet. Choose a type and add your first option block.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 1 }}>
            {options.map((option) => (
              <Box
                key={option.localId}
                sx={{
                  border: `1px solid ${alpha(brandTokens.forgeGold, 0.14)}`,
                  borderRadius: 1.2,
                  p: 1,
                  display: 'grid',
                  gap: 0.8,
                  background: cardSurface(brandTokens.forgeGold, 0.97, 0.02),
                }}
              >
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent='space-between'>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.86rem' }}>
                    {option.label || 'Untitled option'} ({optionTypeLabel(option.option_type)})
                  </Typography>
                  <Stack direction='row' spacing={1}>
                    <Button
                      size='small'
                      variant='outlined'
                      disabled={optionBusyKey === option.localId}
                      onClick={() => void saveOption(option.localId)}
                    >
                      Save option
                    </Button>
                    <Button
                      size='small'
                      variant='outlined'
                      color='error'
                      disabled={optionBusyKey === option.localId}
                      onClick={() => void deleteOption(option.localId)}
                    >
                      Delete option
                    </Button>
                  </Stack>
                </Stack>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  <TextField
                    fullWidth
                    size='small'
                    label='Title'
                    value={option.label}
                    onChange={(event) => updateOption(option.localId, (entry) => ({ ...entry, label: event.target.value }))}
                  />
                  <TextField
                    fullWidth
                    size='small'
                    label='Option key'
                    value={option.option_key}
                    onChange={(event) => updateOption(option.localId, (entry) => ({ ...entry, option_key: event.target.value }))}
                  />
                  <TextField
                    select
                    size='small'
                    label='Type'
                    value={option.option_type}
                    onChange={(event) =>
                      updateOption(option.localId, (entry) => ({
                        ...entry,
                        option_type: event.target.value as OptionType,
                        values: event.target.value === 'select' ? entry.values : [],
                      }))
                    }
                    sx={{ minWidth: 180 }}
                  >
                    {OPTION_TYPE_CHOICES.map((type) => (
                      <MenuItem key={type} value={type}>{optionTypeLabel(type)}</MenuItem>
                    ))}
                  </TextField>
                </Stack>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  <TextField
                    fullWidth
                    size='small'
                    label='Description'
                    value={option.help_text}
                    onChange={(event) => updateOption(option.localId, (entry) => ({ ...entry, help_text: event.target.value }))}
                  />
                  <TextField
                    fullWidth
                    size='small'
                    label='Placeholder'
                    value={option.placeholder}
                    onChange={(event) => updateOption(option.localId, (entry) => ({ ...entry, placeholder: event.target.value }))}
                    disabled={option.option_type === 'select' || option.option_type === 'checkbox'}
                  />
                </Stack>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                  <TextField
                    size='small'
                    type='number'
                    label='Sort'
                    value={option.sort_order}
                    onChange={(event) => updateOption(option.localId, (entry) => ({ ...entry, sort_order: asNumber(event.target.value) }))}
                    sx={{ width: 120 }}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={option.is_required}
                        onChange={(event) =>
                          updateOption(option.localId, (entry) => ({ ...entry, is_required: event.target.checked }))
                        }
                      />
                    }
                    label='Required'
                  />
                  {option.id ? (
                    <Typography sx={{ color: alpha(brandTokens.parchment, 0.56), fontSize: '0.75rem' }}>
                      Saved option id: {option.id}
                    </Typography>
                  ) : (
                    <Typography sx={{ color: alpha(brandTokens.parchment, 0.56), fontSize: '0.75rem' }}>
                      Unsaved option. Save before adding permanent choices.
                    </Typography>
                  )}
                </Stack>

                {option.option_type === 'select' ? (
                  <Box sx={{ borderTop: `1px solid ${alpha(brandTokens.parchment, 0.12)}`, pt: 0.9, display: 'grid', gap: 0.7 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent='space-between' alignItems={{ md: 'center' }}>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.8rem' }}>Choices and price deltas</Typography>
                      <Button size='small' variant='outlined' onClick={() => addOptionChoice(option.localId)}>
                        Add choice
                      </Button>
                    </Stack>

                    {option.values.length === 0 ? (
                      <Typography sx={{ color: alpha(brandTokens.parchment, 0.6), fontSize: '0.77rem' }}>
                        No choices yet. Add one to drive price differences like size upgrades.
                      </Typography>
                    ) : (
                      option.values.map((value) => (
                        <Box
                          key={value.localId}
                          sx={{
                            border: `1px solid ${alpha(brandTokens.parchment, 0.17)}`,
                            borderRadius: 1,
                            p: 0.75,
                            display: 'grid',
                            gap: 0.6,
                            background: cardSurface(brandTokens.parchment, 0.985, 0.065),
                          }}
                        >
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                            <TextField
                              size='small'
                              label='Choice title'
                              value={value.label}
                              onChange={(event) =>
                                updateOptionChoice(option.localId, value.localId, (entry) => ({ ...entry, label: event.target.value }))
                              }
                              sx={{ minWidth: 210 }}
                            />
                            <TextField
                              size='small'
                              label='Choice value'
                              value={value.value}
                              onChange={(event) =>
                                updateOptionChoice(option.localId, value.localId, (entry) => ({ ...entry, value: event.target.value }))
                              }
                              sx={{ minWidth: 210 }}
                            />
                            <TextField
                              size='small'
                              type='number'
                              label='Price delta'
                              value={value.price_delta}
                              onChange={(event) =>
                                updateOptionChoice(option.localId, value.localId, (entry) => ({ ...entry, price_delta: asNumber(event.target.value) }))
                              }
                              sx={{ width: 140 }}
                            />
                            <TextField
                              size='small'
                              type='number'
                              label='Sort'
                              value={value.sort_order}
                              onChange={(event) =>
                                updateOptionChoice(option.localId, value.localId, (entry) => ({ ...entry, sort_order: asNumber(event.target.value) }))
                              }
                              sx={{ width: 110 }}
                            />
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={value.is_enabled}
                                  onChange={(event) =>
                                    updateOptionChoice(option.localId, value.localId, (entry) => ({ ...entry, is_enabled: event.target.checked }))
                                  }
                                />
                              }
                              label='Enabled'
                            />
                          </Stack>

                          <Stack direction='row' spacing={1}>
                            <Button
                              size='small'
                              variant='outlined'
                              disabled={optionValueBusyKey === value.localId}
                              onClick={() => void saveOptionChoice(option.localId, value.localId)}
                            >
                              Save choice
                            </Button>
                            <Button
                              size='small'
                              variant='outlined'
                              color='error'
                              disabled={optionValueBusyKey === value.localId}
                              onClick={() => void deleteOptionChoice(option.localId, value.localId)}
                            >
                              Delete choice
                            </Button>
                          </Stack>
                        </Box>
                      ))
                    )}
                  </Box>
                ) : (
                  <Typography sx={{ color: alpha(brandTokens.parchment, 0.58), fontSize: '0.76rem' }}>
                    For non-choice option types, price changes are usually handled via variants or by switching this option to Single choice and using per-choice price deltas.
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Divider />

      <Box
        sx={{
          display: 'grid',
          gap: 1,
          border: `1px solid ${alpha(brandTokens.forgeGold, 0.14)}`,
          borderRadius: 1.2,
          p: 1,
          background: cardSurface(brandTokens.forgeGold, 0.96, 0.02),
        }}
      >
        <Typography variant='h6'>Variants</Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField size='small' label='Label' value={variantLabel} onChange={(event) => setVariantLabel(event.target.value)} sx={{ minWidth: 220 }} />
          <TextField size='small' label='SKU' value={variantSku} onChange={(event) => setVariantSku(event.target.value)} sx={{ width: 170 }} />
          <TextField size='small' type='number' label='Price delta' value={variantPriceDelta} onChange={(event) => setVariantPriceDelta(event.target.value)} sx={{ width: 140 }} />
          <TextField size='small' type='number' label='Weight' value={variantWeight} onChange={(event) => setVariantWeight(event.target.value)} sx={{ width: 120 }} />
          <TextField size='small' type='number' label='Sort' value={variantSortOrder} onChange={(event) => setVariantSortOrder(event.target.value)} sx={{ width: 110 }} />
          <Select size='small' value={variantEnabled ? 'enabled' : 'disabled'} onChange={(event) => setVariantEnabled(event.target.value === 'enabled')} sx={{ minWidth: 120 }}>
            <MenuItem value='enabled'>Enabled</MenuItem>
            <MenuItem value='disabled'>Disabled</MenuItem>
          </Select>
          <Button variant='outlined' onClick={() => void addVariant()}>Add variant</Button>
        </Stack>

        {variants.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.8rem' }}>
            No variants yet.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.7 }}>
            {variants.map((variant) => (
              <Box
                key={variant.id}
                sx={{
                  border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`,
                  borderRadius: 1,
                  p: 0.8,
                  background: cardSurface(brandTokens.forgeGold, 0.99, 0.07),
                }}
              >
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent='space-between' spacing={1}>
                  <Typography sx={{ color: alpha(brandTokens.parchment, 0.66), fontSize: '0.78rem' }}>
                    {variant.label} | SKU {variant.sku || 'n/a'} | delta {variant.price_delta} | sort {variant.sort_order} | {variant.is_enabled ? 'Enabled' : 'Disabled'}
                  </Typography>
                  <Button
                    size='small'
                    variant='outlined'
                    color='error'
                    disabled={variantBusyId === variant.id}
                    onClick={() => void deleteVariant(variant.id)}
                  >
                    Delete
                  </Button>
                </Stack>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Divider />

      <Box
        sx={{
          display: 'grid',
          gap: 1,
          border: `1px solid ${alpha(brandTokens.rubyRed, 0.14)}`,
          borderRadius: 1.2,
          p: 1,
          background: cardSurface(brandTokens.parchment, 0.985, 0.055),
        }}
      >
        <Typography variant='h6'>Bulk discount tiers</Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField size='small' type='number' label='Min qty' value={minQty} onChange={(event) => setMinQty(event.target.value)} sx={{ width: 130 }} />
          <TextField size='small' type='number' label='Max qty' value={maxQty} onChange={(event) => setMaxQty(event.target.value)} sx={{ width: 130 }} />
          <Select size='small' value={discountType} onChange={(event) => setDiscountType(event.target.value as DiscountType)} sx={{ minWidth: 180 }}>
            {DISCOUNT_TYPE_CHOICES.map((entry) => (
              <MenuItem key={entry} value={entry}>{entry}</MenuItem>
            ))}
          </Select>
          <TextField size='small' type='number' label='Value' value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} sx={{ width: 140 }} />
          <TextField size='small' label='Label' value={discountLabel} onChange={(event) => setDiscountLabel(event.target.value)} sx={{ minWidth: 190 }} />
          <TextField size='small' type='number' label='Sort' value={discountSortOrder} onChange={(event) => setDiscountSortOrder(event.target.value)} sx={{ width: 110 }} />
          <Button variant='outlined' onClick={() => void addDiscountTier()}>Add tier</Button>
        </Stack>

        {discounts.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.8rem' }}>
            No discount tiers yet.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.7 }}>
            {discounts.map((tier) => (
              <Box
                key={tier.id}
                sx={{
                  border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`,
                  borderRadius: 1,
                  p: 0.8,
                  background: cardSurface(brandTokens.copper, 0.99, 0.07),
                }}
              >
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent='space-between' spacing={1}>
                  <Typography sx={{ color: alpha(brandTokens.parchment, 0.66), fontSize: '0.78rem' }}>
                    Qty {tier.min_qty}{tier.max_qty ? ` - ${tier.max_qty}` : '+'} | {tier.discount_type} {tier.discount_value} | {tier.label || 'No label'} | {tier.is_enabled ? 'Enabled' : 'Disabled'}
                  </Typography>
                  <Button
                    size='small'
                    variant='outlined'
                    color='error'
                    disabled={discountBusyId === tier.id}
                    onClick={() => void deleteDiscountTier(tier.id)}
                  >
                    Delete
                  </Button>
                </Stack>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Divider />

      {/* ── Process types with pricing ──────────────────────────────────── */}
      <Box
        sx={{
          display: 'grid',
          gap: 1,
          border: `1px solid ${alpha(brandTokens.forgeGold, 0.18)}`,
          borderRadius: 1.2,
          p: 1,
          background: cardSurface(brandTokens.forgeGold, 0.99, 0.055),
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent='space-between' alignItems={{ md: 'center' }}>
          <Box>
            <Typography variant='h6'>Process Types & Pricing</Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.58), fontSize: '0.78rem' }}>
              Tag this product with the processes used to make it. Set a price delta for each process. Customers can select one or more processes at checkout.
            </Typography>
          </Box>
          <Button
            variant='contained'
            size='small'
            disabled={savingProcessTypes}
            onClick={() => void saveProcessTypes()}
          >
            {savingProcessTypes ? 'Saving...' : 'Save'}
          </Button>
        </Stack>

        {allProcessTypes.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.5), fontSize: '0.8rem' }}>
            No process types found. Run migration 030 to seed them.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.8 }}>
            {allProcessTypes.map((pt) => {
              const isAssigned = assignedProcessKeys.includes(pt.key)
              return (
                <Box
                  key={pt.key}
                  sx={{
                    display: 'grid',
                    gap: 0.6,
                    border: `1px solid ${isAssigned ? alpha(brandTokens.forgeGold, 0.3) : alpha(brandTokens.parchment, 0.1)}`,
                    borderRadius: 1,
                    p: 0.8,
                    background: isAssigned ? alpha(brandTokens.forgeGold, 0.06) : 'transparent',
                  }}
                >
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                    <Box
                      component='button'
                      type='button'
                      onClick={() =>
                        setAssignedProcessKeys((prev) =>
                          isAssigned ? prev.filter((k) => k !== pt.key) : [...prev, pt.key]
                        )
                      }
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.6,
                        px: 1.2,
                        py: 0.5,
                        borderRadius: 1,
                        border: `1px solid ${isAssigned ? alpha(brandTokens.forgeGold, 0.6) : alpha(brandTokens.parchment, 0.18)}`,
                        background: isAssigned ? alpha(brandTokens.forgeGold, 0.14) : 'transparent',
                        color: isAssigned ? brandTokens.forgeGold : alpha(brandTokens.parchment, 0.7),
                        fontSize: '0.82rem',
                        fontWeight: isAssigned ? 600 : 400,
                        cursor: 'pointer',
                        minWidth: 180,
                        textAlign: 'left',
                        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                      }}
                    >
                      {pt.emoji && <span aria-hidden='true'>{pt.emoji}</span>}
                      {pt.display_name}
                      <Typography component='span' sx={{ ml: 'auto', fontSize: '0.7rem', opacity: 0.6 }}>
                        {isAssigned ? 'ON' : 'OFF'}
                      </Typography>
                    </Box>

                    {isAssigned && (
                      <TextField
                        size='small'
                        type='number'
                        label='Price delta ($)'
                        value={String(processPricing[pt.key] ?? 0)}
                        onChange={(event) => updateProcessPricing(pt.key, asNumber(event.target.value))}
                        sx={{ width: 160 }}
                        slotProps={{ htmlInput: { step: '0.50', min: '0' } }}
                      />
                    )}

                    {!isAssigned && (
                      <Typography sx={{ color: alpha(brandTokens.parchment, 0.4), fontSize: '0.75rem', fontStyle: 'italic' }}>
                        Toggle on to set pricing
                      </Typography>
                    )}
                  </Stack>
                </Box>
              )
            })}
          </Box>
        )}

        <Divider sx={{ borderColor: alpha(brandTokens.parchment, 0.1) }} />

        {/* ── Combo discounts ──────────────────────────────────────────── */}
        <Box sx={{ display: 'grid', gap: 0.8 }}>
          <Typography variant='subtitle2' sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
            Combo Discounts
          </Typography>
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.55), fontSize: '0.75rem' }}>
            When a customer selects multiple processes, apply a discount. Tiers are evaluated from highest min_processes to lowest — the best matching tier is used.
          </Typography>

          {comboDiscounts.length === 0 ? (
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.5), fontSize: '0.78rem' }}>
              No combo discounts yet. Add one below.
            </Typography>
          ) : (
            <Box sx={{ display: 'grid', gap: 0.6 }}>
              {comboDiscounts.map((cd) => (
                <Box
                  key={cd.localId}
                  sx={{
                    display: 'grid',
                    gap: 0.5,
                    border: `1px solid ${alpha(brandTokens.parchment, 0.14)}`,
                    borderRadius: 1,
                    p: 0.7,
                    background: alpha(brandTokens.bgSurface, 0.4),
                  }}
                >
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                    <Typography sx={{ fontSize: '0.8rem', minWidth: 100 }}>
                      {cd.min_processes}+ processes
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: alpha(brandTokens.parchment, 0.7), minWidth: 120 }}>
                      {cd.discount_type === 'percent' ? `${cd.discount_value}% off` : cd.discount_type === 'fixed_amount' ? `-$${cd.discount_value?.toFixed(2)}` : 'Cheapest free'}
                    </Typography>
                    {cd.label && (
                      <Typography sx={{ fontSize: '0.78rem', color: alpha(brandTokens.parchment, 0.55), flex: 1 }}>
                        "{cd.label}"
                      </Typography>
                    )}
                    <Button size='small' variant='text' color='error' onClick={() => removeComboDiscount(cd.localId)}>
                      Remove
                    </Button>
                  </Stack>
                </Box>
              ))}
            </Box>
          )}

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 0.5 }}>
            <TextField
              size='small'
              type='number'
              label='Min processes'
              value={newComboMinProcesses}
              onChange={(event) => setNewComboMinProcesses(event.target.value)}
              sx={{ width: 130 }}
              slotProps={{ htmlInput: { min: '2' } }}
            />
            <Select
              size='small'
              value={newComboDiscountType}
              onChange={(event) => setNewComboDiscountType(event.target.value as 'percent' | 'fixed_amount' | 'cheapest_free')}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value='percent'>Percent off</MenuItem>
              <MenuItem value='fixed_amount'>Fixed amount off</MenuItem>
              <MenuItem value='cheapest_free'>Cheapest free</MenuItem>
            </Select>
            {newComboDiscountType !== 'cheapest_free' && (
              <TextField
                size='small'
                type='number'
                label='Value'
                value={newComboDiscountValue}
                onChange={(event) => setNewComboDiscountValue(event.target.value)}
                sx={{ width: 130 }}
              />
            )}
            <TextField
              size='small'
              label='Label (optional)'
              value={newComboDiscountLabel}
              onChange={(event) => setNewComboDiscountLabel(event.target.value)}
              sx={{ minWidth: 180 }}
            />
            <Button variant='outlined' size='small' onClick={addComboDiscount}>
              Add Combo Discount
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}
