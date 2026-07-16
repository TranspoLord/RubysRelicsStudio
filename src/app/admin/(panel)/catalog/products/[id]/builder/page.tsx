'use client'

import { useEffect, useState, use } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import InputAdornment from '@mui/material/InputAdornment'

import { brandTokens } from '@/theme/theme'
import { optionTypeLabel, asNumber, hasAutoOption, getProcessAutoOption, makeLocalId } from '@/components/admin/product-builder/utils/helpers'

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
  is_active: boolean
  is_archived: boolean
  updated_at: string
  has_designer: boolean
  designer_mockup_url: string | null
}

interface MediaItem {
  id: string
  url: string
  alt: string
  emoji: string | null
  gradient: string | null
  is_featured: boolean
  sort_order: number
}

type OptionType = 'select' | 'text' | 'textarea' | 'file' | 'checkbox' | 'number'

interface OptionValue {
  id: string
  label: string
  value: string
  price_delta: number
  is_enabled: boolean
  sort_order: number
}

interface Option {
  id: string
  option_key: string
  label: string
  option_type: OptionType
  placeholder: string | null
  help_text: string | null
  is_required: boolean
  sort_order: number
  values: OptionValue[]
}

interface Variant {
  id: string
  label: string
  sku: string
  price_delta: number
  weight: number
  sort_order: number
  is_enabled: boolean
}

interface DiscountTier {
  id: string
  min_qty: number
  max_qty: number | null
  discount_type: 'percent' | 'fixed_amount'
  discount_value: number
  label: string | null
  is_enabled: boolean
}

interface ProcessType {
  key: string
  display_name: string
  emoji: string | null
  price_delta: number
  is_enabled: boolean
  pricing_id: string | null
}

interface ComboDiscount {
  id: string
  min_processes: number
  discount_type: 'percent' | 'fixed_amount' | 'cheapest_free'
  discount_value: number | null
  label: string | null
  is_enabled: boolean
  localId: string
}

function cardSurface(base: string, opacity = 0.12): string {
  return alpha(base, opacity)
}

export default function ProductBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: productId } = use(params)
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [options, setOptions] = useState<Option[]>([])
  const [variants, setVariants] = useState<Variant[]>([])
  const [discounts, setDiscounts] = useState<DiscountTier[]>([])
  const [processTypes, setProcessTypes] = useState<ProcessType[]>([])
  const [assignedProcessKeys, setAssignedProcessKeys] = useState<string[]>([])
  const [comboDiscounts, setComboDiscounts] = useState<ComboDiscount[]>([])
  const [processPricing, setProcessPricing] = useState<Record<string, number>>({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingProcessTypes, setSavingProcessTypes] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Product description editing state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [externalMediaHostUrl, setExternalMediaHostUrl] = useState('https://www.dropbox.com')

  // Media editing state
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaAlt, setMediaAlt] = useState('')
  const [mediaEmoji, setMediaEmoji] = useState('')
  const [mediaGradient, setMediaGradient] = useState('')
  const [mediaSortOrder, setMediaSortOrder] = useState('')
  const [mediaFeatured, setMediaFeatured] = useState(false)
  const [mediaBusyId, setMediaBusyId] = useState<string | null>(null)
  const [editingMediaId, setEditingMediaId] = useState<string | null>(null)
  const [editMediaUrl, setEditMediaUrl] = useState('')
  const [editMediaAlt, setEditMediaAlt] = useState('')
  const [editMediaEmoji, setEditMediaEmoji] = useState('')
  const [editMediaGradient, setEditMediaGradient] = useState('')
  const [editMediaSortOrder, setEditMediaSortOrder] = useState('')
  const [editMediaFeatured, setEditMediaFeatured] = useState(false)

  // Variant editing state
  const [variantLabel, setVariantLabel] = useState('')
  const [variantSku, setVariantSku] = useState('')
  const [variantPriceDelta, setVariantPriceDelta] = useState('')
  const [variantWeight, setVariantWeight] = useState('')
  const [variantSortOrder, setVariantSortOrder] = useState('')
  const [variantEnabled, setVariantEnabled] = useState(true)
  const [variantBusyId, setVariantBusyId] = useState<string | null>(null)

  // Discount editing state
  const [minQty, setMinQty] = useState('')
  const [maxQty, setMaxQty] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'fixed_amount'>('percent')
  const [discountValue, setDiscountValue] = useState('')
  const [discountLabel, setDiscountLabel] = useState('')
  const [discountSortOrder, setDiscountSortOrder] = useState('')
  const [discountBusyId, setDiscountBusyId] = useState<string | null>(null)

  // Combo discount editing state
  const [newComboMinProcesses, setNewComboMinProcesses] = useState('')
  const [newComboDiscountType, setNewComboDiscountType] = useState<'percent' | 'fixed_amount' | 'cheapest_free'>('percent')
  const [newComboDiscountValue, setNewComboDiscountValue] = useState('')
  const [newComboDiscountLabel, setNewComboDiscountLabel] = useState('')

  // Option editing state
  const [optionBusyKey, setOptionBusyKey] = useState<string | null>(null)
  const [optionError, setOptionError] = useState<string | null>(null)
  const [optionSuccess, setOptionSuccess] = useState<string | null>(null)
  const [newOptionKey, setNewOptionKey] = useState('')
  const [newOptionLabel, setNewOptionLabel] = useState('')
  const [newOptionType, setNewOptionType] = useState<OptionType>('select')
  const [newOptionPlaceholder, setNewOptionPlaceholder] = useState('')
  const [newOptionHelpText, setNewOptionHelp] = useState('')
  const [newOptionRequired, setNewOptionRequired] = useState(false)
  const [newOptionSortOrder, setNewOptionSortOrder] = useState('')

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)

      try {
        const [productRes, categoryRes, mediaRes, optionsRes, variantsRes, discountsRes, processTypesRes] =
          await Promise.all([
            fetch(`/api/admin/catalog/products/${productId}`, { cache: 'no-store' }),
            fetch('/api/admin/catalog/categories', { cache: 'no-store' }),
            fetch(`/api/admin/catalog/media?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' }),
            fetch(`/api/admin/catalog/options?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' }),
            fetch(`/api/admin/catalog/variants?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' }),
            fetch(`/api/admin/catalog/discounts?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' }),
            fetch(`/api/admin/catalog/process-types?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' }),
          ])

        const productPayload = await productRes.json().catch(() => ({}))
        const categoryPayload = await categoryRes.json().catch(() => ({}))
        const mediaPayload = await mediaRes.json().catch(() => ({}))
        const optionsPayload = await optionsRes.json().catch(() => ({}))
        const variantsPayload = await variantsRes.json().catch(() => ({}))
        const discountsPayload = await discountsRes.json().catch(() => ({}))
        const processPayload = await processTypesRes.json().catch(() => ({}))

        if (productRes.ok && productPayload.product) {
          setProduct(productPayload.product)
        }

        if (categoryRes.ok && Array.isArray(categoryPayload?.categories)) {
          setCategories(categoryPayload.categories)
        }

        if (mediaRes.ok && Array.isArray(mediaPayload?.media)) {
          setMediaItems(mediaPayload.media)
        }

        if (optionsRes.ok && Array.isArray(optionsPayload?.options)) {
          setOptions(optionsPayload.options)
        }

        if (variantsRes.ok && Array.isArray(variantsPayload?.variants)) {
          setVariants(variantsPayload.variants)
        }

        if (discountsRes.ok && Array.isArray(discountsPayload?.discounts)) {
          setDiscounts(discountsPayload.discounts)
        }

        if (processTypesRes.ok && processPayload.processTypes) {
          setProcessTypes(processPayload.processTypes)
          setAssignedProcessKeys(processPayload.assigned ?? [])
          setComboDiscounts(
            (processPayload.comboDiscounts ?? []).map((cd: ComboDiscount) => ({
              ...cd,
              localId: makeLocalId(),
            }))
          )
          const initialPricing: Record<string, number> = {}
          for (const pt of processPayload.processTypes ?? []) {
            initialPricing[pt.key] = pt.price_delta ?? 0
          }
          setProcessPricing(initialPricing)
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load product data.')
      } finally {
        setLoading(false)
      }
    }

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
        body: JSON.stringify({
          title: product.title,
          slug: product.slug,
          category_key: product.category_key,
          base_price: product.base_price,
          sort_order: product.sort_order,
          production_estimate_band: product.production_estimate_band,
          short_description: product.short_description,
          description: product.description,
          is_ready_made: product.is_ready_made,
          is_customizable: product.is_customizable,
          has_designer: product.has_designer,
          designer_mockup_url: product.designer_mockup_url,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save product.')
      }

      setSuccess('Product saved.')
      if (payload.product) {
        setProduct(payload.product)
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save product.')
    } finally {
      setSaving(false)
    }
  }

  async function addMedia() {
    setUploadingMedia(true)
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
          sort_order: asNumber(mediaSortOrder, 0),
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
      setMediaSortOrder('')
      setMediaFeatured(false)
      const mediaRes = await fetch(`/api/admin/catalog/media?productId=${encodeURIComponent(productId)}`, {
        cache: 'no-store',
      })
      const mediaPayload = await mediaRes.json().catch(() => ({}))
      if (mediaRes.ok && Array.isArray(mediaPayload?.media)) {
        setMediaItems(mediaPayload.media)
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to add media.')
    } finally {
      setUploadingMedia(false)
    }
  }

  async function deleteMedia(mediaId: string) {
    const confirmed = window.confirm('Delete this media item?')
    if (!confirmed) return

    setMediaBusyId(mediaId)
    setError(null)

    try {
      const response = await fetch('/api/admin/catalog/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId, confirmAction: 'delete_media' }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete media.')
      }

      setMediaItems((prev) => prev.filter((m) => m.id !== mediaId))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete media.')
    } finally {
      setMediaBusyId(null)
    }
  }

  async function updateMedia(mediaId: string) {
    setMediaBusyId(mediaId)
    setError(null)

    try {
      const response = await fetch('/api/admin/catalog/media', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId,
          url: editMediaUrl,
          alt: editMediaAlt,
          emoji: editMediaEmoji,
          gradient: editMediaGradient,
          is_featured: editMediaFeatured,
          sort_order: asNumber(editMediaSortOrder, 0),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to update media.')
      }

      setSuccess('Media updated.')
      setEditingMediaId(null)
      const mediaRes = await fetch(`/api/admin/catalog/media?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' })
      const mediaPayload = await mediaRes.json().catch(() => ({}))
      if (mediaRes.ok && Array.isArray(mediaPayload?.media)) {
        setMediaItems(mediaPayload.media)
      }
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update media.')
    } finally {
      setMediaBusyId(null)
    }
  }

  async function addVariant() {
    if (!variantLabel) {
      setError('Variant label is required.')
      return
    }

    try {
      const response = await fetch('/api/admin/catalog/variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          label: variantLabel,
          sku: variantSku || null,
          price_delta: asNumber(variantPriceDelta, 0),
          capacity_weight: variantWeight ? asNumber(variantWeight, 0) : null,
          is_enabled: variantEnabled,
          sort_order: asNumber(variantSortOrder, 0),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to add variant.')
      }

      setSuccess('Variant added.')
      setVariantLabel('')
      setVariantSku('')
      setVariantPriceDelta('')
      setVariantWeight('')
      setVariantSortOrder('')

      const variantsRes = await fetch(`/api/admin/catalog/variants?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' })
      const variantsPayload = await variantsRes.json().catch(() => ({}))
      if (variantsRes.ok && Array.isArray(variantsPayload?.variants)) {
        setVariants(variantsPayload.variants)
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to add variant.')
    }
  }

  async function deleteVariant(variantId: string) {
    const confirmed = window.confirm('Delete this variant?')
    if (!confirmed) return

    setVariantBusyId(variantId)
    setError(null)

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

      setVariants((prev) => prev.filter((v) => v.id !== variantId))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete variant.')
    } finally {
      setVariantBusyId(null)
    }
  }

  async function addDiscountTier() {
    if (!minQty || !discountValue) {
      setError('Min qty and discount value are required.')
      return
    }

    try {
      const response = await fetch('/api/admin/catalog/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          min_qty: asNumber(minQty, 0),
          max_qty: maxQty ? asNumber(maxQty, 0) : null,
          discount_type: discountType,
          discount_value: asNumber(discountValue, 0),
          label: discountLabel || null,
          sort_order: asNumber(discountSortOrder, 0),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to add discount tier.')
      }

      setSuccess('Discount tier added.')
      setMinQty('')
      setMaxQty('')
      setDiscountValue('')
      setDiscountLabel('')
      setDiscountSortOrder('')

      const discountsRes = await fetch(`/api/admin/catalog/discounts?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' })
      const discountsPayload = await discountsRes.json().catch(() => ({}))
      if (discountsRes.ok && Array.isArray(discountsPayload?.discounts)) {
        setDiscounts(discountsPayload.discounts)
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to add discount tier.')
    }
  }

  async function deleteDiscountTier(tierId: string) {
    const confirmed = window.confirm('Delete this discount tier?')
    if (!confirmed) return

    setDiscountBusyId(tierId)
    setError(null)

    try {
      const response = await fetch('/api/admin/catalog/discounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discountId: tierId, confirmAction: 'delete_discount' }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete discount tier.')
      }

      setDiscounts((prev) => prev.filter((d) => d.id !== tierId))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete discount tier.')
    } finally {
      setDiscountBusyId(null)
    }
  }

  async function saveProcessTypes() {
    setSavingProcessTypes(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/process-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          processTypes: assignedProcessKeys.map((key) => ({
            key,
            price_delta: processPricing[key] ?? 0,
            is_enabled: true,
          })),
          comboDiscounts: comboDiscounts.map((cd) => ({
            min_processes: cd.min_processes,
            discount_type: cd.discount_type,
            discount_value: cd.discount_value,
            label: cd.label,
          })),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save process types.')
      }

      setSuccess('Process types saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save process types.')
    } finally {
      setSavingProcessTypes(false)
    }
  }

  async function updateProcessPricing(key: string, value: number) {
    setProcessPricing((prev) => ({ ...prev, [key]: value }))
  }

  async function addComboDiscount() {
    const minProcesses = asNumber(newComboMinProcesses, 2)
    if (!minProcesses) return

    const newCombo: ComboDiscount = {
      id: makeLocalId(),
      min_processes: minProcesses,
      discount_type: newComboDiscountType,
      discount_value: newComboDiscountType !== 'cheapest_free' ? asNumber(newComboDiscountValue, 0) : null,
      label: newComboDiscountLabel || null,
      is_enabled: true,
      localId: makeLocalId(),
    }
    setComboDiscounts((prev) => [...prev, newCombo])
    setNewComboMinProcesses('')
    setNewComboDiscountValue('')
    setNewComboDiscountLabel('')
  }

  async function removeComboDiscount(localId: string) {
    setComboDiscounts((prev) => prev.filter((cd) => cd.localId !== localId))
  }

  // Option value editing state
  const [newValueLabel, setNewValueLabel] = useState('')
  const [newValueValue, setNewValueValue] = useState('')
  const [newValuePriceDelta, setNewValuePriceDelta] = useState('')
  const [newValueSort, setNewValueSort] = useState('')
  const [addingValueForOption, setAddingValueForOption] = useState<string | null>(null)

  async function saveOption(optionId: string) {
    setOptionBusyKey(optionId)
    setOptionError(null)
    setOptionSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/options', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save option.')
      }

      setOptionSuccess(`Option saved.`)
      const optionsRes = await fetch(`/api/admin/catalog/options?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' })
      const optionsPayload = await optionsRes.json().catch(() => ({}))
      if (optionsRes.ok && Array.isArray(optionsPayload?.options)) {
        setOptions(optionsPayload.options)
      }
    } catch (saveError) {
      setOptionError(saveError instanceof Error ? saveError.message : 'Failed to save option.')
    } finally {
      setOptionBusyKey(null)
    }
  }

  async function deleteOption(optionId: string) {
    const confirmed = window.confirm('Delete this option and all its values?')
    if (!confirmed) return

    setOptionBusyKey(optionId)
    setOptionError(null)

    try {
      const response = await fetch('/api/admin/catalog/options', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId, confirmAction: 'delete_option' }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete option.')
      }

      setOptions((prev) => prev.filter((o) => o.id !== optionId))
      setOptionSuccess('Option deleted.')
    } catch (deleteError) {
      setOptionError(deleteError instanceof Error ? deleteError.message : 'Failed to delete option.')
    } finally {
      setOptionBusyKey(null)
    }
  }

  async function addOption() {
    if (!newOptionLabel || !newOptionKey) {
      setOptionError('Option key and label are required.')
      return
    }

    try {
      const response = await fetch('/api/admin/catalog/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          option_key: newOptionKey,
          label: newOptionLabel,
          option_type: newOptionType,
          placeholder: newOptionPlaceholder || null,
          help_text: newOptionHelpText || null,
          is_required: newOptionRequired,
          sort_order: asNumber(newOptionSortOrder, 0),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to add option.')
      }

      setOptionSuccess('Option added.')
      setNewOptionKey('')
      setNewOptionLabel('')
      setNewOptionPlaceholder('')
      setNewOptionHelp('')
      setNewOptionRequired(false)
      setNewOptionSortOrder('')

      const optionsRes = await fetch(`/api/admin/catalog/options?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' })
      const optionsPayload = await optionsRes.json().catch(() => ({}))
      if (optionsRes.ok && Array.isArray(optionsPayload?.options)) {
        setOptions(optionsPayload.options)
      }
    } catch (saveError) {
      setOptionError(saveError instanceof Error ? saveError.message : 'Failed to add option.')
    }
  }

  async function addOptionValue(optionId: string) {
    if (!newValueLabel || !newValueValue) {
      setOptionError('Value label and value are required.')
      return
    }

    try {
      const response = await fetch('/api/admin/catalog/options/values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optionId,
          label: newValueLabel,
          value: newValueValue,
          price_delta: asNumber(newValuePriceDelta, 0),
          sort_order: asNumber(newValueSort, 0),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to add option value.')
      }

      setOptionSuccess('Option value added.')
      setNewValueLabel('')
      setNewValueValue('')
      setNewValuePriceDelta('')
      setNewValueSort('')
      setAddingValueForOption(null)

      const optionsRes = await fetch(`/api/admin/catalog/options?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' })
      const optionsPayload = await optionsRes.json().catch(() => ({}))
      if (optionsRes.ok && Array.isArray(optionsPayload?.options)) {
        setOptions(optionsPayload.options)
      }
    } catch (saveError) {
      setOptionError(saveError instanceof Error ? saveError.message : 'Failed to add option value.')
    }
  }

  async function deleteOptionValue(valueId: string) {
    const confirmed = window.confirm('Delete this option value?')
    if (!confirmed) return

    try {
      const response = await fetch('/api/admin/catalog/options/values', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueId, confirmAction: 'delete_option_value' }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete option value.')
      }

      setOptionSuccess('Option value deleted.')
      const optionsRes = await fetch(`/api/admin/catalog/options?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' })
      const optionsPayload = await optionsRes.json().catch(() => ({}))
      if (optionsRes.ok && Array.isArray(optionsPayload?.options)) {
        setOptions(optionsPayload.options)
      }
    } catch (deleteError) {
      setOptionError(deleteError instanceof Error ? deleteError.message : 'Failed to delete option value.')
    }
  }

  if (loading) {
    return <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>Loading product builder...</Typography>
  }

  if (!product) {
    return <Alert severity="error">Product not found.</Alert>
  }

  const categoryLabel = categories.find((c) => c.key === product.category_key)?.display_name

  return (
    <Box sx={{ display: 'grid', gap: 2, overflowX: 'hidden' }}>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button
          variant="outlined"
          disabled={!product.category_key || !product.slug}
          onClick={() => window.open(`/shop/categories/${product.category_key}/${product.slug}`, '_blank', 'noopener,noreferrer')}
        >
          Preview Product
        </Button>
        <Button variant="contained" disabled={saving} onClick={() => void saveProduct()}>
          {saving ? 'Saving...' : 'Save Product'}
        </Button>
      </Stack>

      {/* ── Product Description ──────────────────────────────────────── */}
      <Box
        sx={{
          display: 'grid',
          gap: 1,
          border: `1px solid ${alpha(brandTokens.copper, 0.14)}`,
          borderRadius: 1.2,
          p: 1,
          background: cardSurface(brandTokens.copper, 0.06),
        }}
      >
        <Typography variant="h5" component="h1">
          Product Description
        </Typography>

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
            label="URL-Slug"
            value={product.slug}
            onChange={(event) => updateProduct('slug', event.target.value)}
          />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <Select
            size="small"
            label="Category"
            value={product.category_key}
            onChange={(event) => updateProduct('category_key', event.target.value)}
            sx={{ minWidth: 260 }}
          >
            {categories.map((category) => (
              <MenuItem key={category.key} value={category.key}>
                {category.display_name}
              </MenuItem>
            ))}
          </Select>

          <TextField
            size="small"
            type="number"
            label="Cat sort order"
            value={product.sort_order}
            onChange={(event) => updateProduct('sort_order', asNumber(event.target.value))}
            sx={{ width: 170 }}
          />

          <TextField
            fullWidth
            size="small"
            label="Production estimate"
            value={product.production_estimate_band}
            onChange={(event) => updateProduct('production_estimate_band', event.target.value)}
          />
        </Stack>

        {categoryLabel && (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.55), fontSize: '0.75rem' }}>
            Category selected: {categoryLabel}
          </Typography>
        )}

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
          <FormControlLabel
            control={
              <Checkbox
                checked={product.has_designer}
                onChange={(event) => updateProduct('has_designer', event.target.checked)}
              />
            }
            label="Has Embedded Designer"
          />
        </Stack>

        {product.has_designer && (
          <TextField
            size="small"
            label="Designer Mockup URL"
            value={product.designer_mockup_url ?? ''}
            onChange={(event) => updateProduct('designer_mockup_url', event.target.value)}
            helperText="URL to the product mockup image (e.g., t-shirt template)"
            sx={{ mt: 1 }}
          />
        )}
      </Box>

      <Divider />

      {/* ── Product Media ──────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'grid',
          gap: 1,
          border: `1px solid ${alpha(brandTokens.rubyRed, 0.14)}`,
          borderRadius: 1.2,
          p: 1,
          background: cardSurface(brandTokens.parchment, 0.06),
        }}
      >
        <Typography variant="h6">Product Media</Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="External media host URL"
            value={externalMediaHostUrl}
            onChange={(event) => setExternalMediaHostUrl(event.target.value)}
          />
          <Button
            variant="outlined"
            onClick={() => window.open(externalMediaHostUrl, '_blank', 'noopener,noreferrer')}
          >
            Open media host
          </Button>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
          <Button variant="outlined" component="label">
            Choose file
            <input hidden type="file" accept="image/*" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} />
          </Button>
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.78rem', flex: 1 }}>
            {uploadFile ? uploadFile.name : 'No file chosen'}
          </Typography>
          <Button variant="outlined" disabled={uploadingMedia || !uploadFile} onClick={() => void addMedia()}>
            {uploadingMedia ? 'Uploading...' : 'Upload file'}
          </Button>
        </Stack>

        <Divider />

        <Typography variant="subtitle2" sx={{ fontSize: '0.85rem', mt: 0.5 }}>
          Add New Media
        </Typography>

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
          <Button variant="contained" onClick={() => void addMedia()}>
            Add media
          </Button>
        </Stack>

        {mediaItems.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.8rem' }}>
            No media items yet. Add one above.
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
                  background: cardSurface(brandTokens.parchment, 0.07),
                }}
              >
                {editingMediaId === media.id ? (
                  <Box sx={{ display: 'grid', gap: 1 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                      <TextField
                        fullWidth
                        size="small"
                        label="URL"
                        value={editMediaUrl}
                        onChange={(event) => setEditMediaUrl(event.target.value)}
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label="Alt text"
                        value={editMediaAlt}
                        onChange={(event) => setEditMediaAlt(event.target.value)}
                      />
                    </Stack>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
                      <TextField
                        size="small"
                        label="Emoji"
                        value={editMediaEmoji}
                        onChange={(event) => setEditMediaEmoji(event.target.value)}
                        sx={{ width: 120 }}
                      />
                      <TextField
                        size="small"
                        label="Gradient"
                        value={editMediaGradient}
                        onChange={(event) => setEditMediaGradient(event.target.value)}
                        sx={{ width: 150 }}
                      />
                      <TextField
                        size="small"
                        type="number"
                        label="Sort"
                        value={editMediaSortOrder}
                        onChange={(event) => setEditMediaSortOrder(event.target.value)}
                        sx={{ width: 100 }}
                      />
                      <FormControlLabel
                        control={<Checkbox checked={editMediaFeatured} onChange={(event) => setEditMediaFeatured(event.target.checked)} />}
                        label="Featured"
                      />
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="contained" disabled={mediaBusyId === media.id} onClick={() => void updateMedia(media.id)}>
                        {mediaBusyId === media.id ? 'Saving...' : 'Save'}
                      </Button>
                      <Button size="small" variant="text" onClick={() => setEditingMediaId(null)}>
                        Cancel
                      </Button>
                    </Stack>
                  </Box>
                ) : (
                  <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                    {media.url && (
                      <Box
                        component="img"
                        src={media.url}
                        alt={media.alt}
                        sx={{
                          width: 60,
                          height: 60,
                          objectFit: 'cover',
                          borderRadius: 1,
                          mr: 1,
                          flexShrink: 0,
                        }}
                        onError={(event) => {
                          event.currentTarget.style.display = 'none'
                        }}
                      />
                    )}
                    <Box sx={{ display: 'grid', gap: 0.25, flex: 1 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.82rem' }}>{media.alt}</Typography>
                      <Typography sx={{ color: alpha(brandTokens.parchment, 0.66), fontSize: '0.76rem' }}>
                        {media.url} | sort {media.sort_order} | {media.is_featured ? 'Featured' : 'Standard'}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5}>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={mediaBusyId === media.id}
                        onClick={() => {
                          setEditingMediaId(media.id)
                          setEditMediaUrl(media.url)
                          setEditMediaAlt(media.alt)
                          setEditMediaEmoji(media.emoji ?? '')
                          setEditMediaGradient(media.gradient ?? '')
                          setEditMediaSortOrder(String(media.sort_order))
                          setEditMediaFeatured(media.is_featured)
                        }}
                      >
                        Edit
                      </Button>
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
                  </Stack>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Divider />

      {/* ── Variants ────────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'grid',
          gap: 1,
          border: `1px solid ${alpha(brandTokens.forgeGold, 0.14)}`,
          borderRadius: 1.2,
          p: 1,
          background: cardSurface(brandTokens.forgeGold, 0.02),
        }}
      >
        <Typography variant="h6">Variants</Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField size="small" label="Label" value={variantLabel} onChange={(event) => setVariantLabel(event.target.value)} />
          <TextField size="small" label="SKU" value={variantSku} onChange={(event) => setVariantSku(event.target.value)} />
          <TextField
            size="small"
            type="number"
            label="Price delta"
            value={variantPriceDelta}
            onChange={(event) => setVariantPriceDelta(event.target.value)}
          />
          <TextField
            size="small"
            type="number"
            label="Weight"
            value={variantWeight}
            onChange={(event) => setVariantWeight(event.target.value)}
          />
          <TextField
            size="small"
            type="number"
            label="Sort"
            value={variantSortOrder}
            onChange={(event) => setVariantSortOrder(event.target.value)}
          />
          <Select
            size="small"
            value={variantEnabled ? 'enabled' : 'disabled'}
            onChange={(event) => setVariantEnabled(event.target.value === 'enabled')}
          >
            <MenuItem value="enabled">Enabled</MenuItem>
            <MenuItem value="disabled">Disabled</MenuItem>
          </Select>
          <Button variant="outlined" onClick={() => void addVariant()}>
            Add variant
          </Button>
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
                  background: cardSurface(brandTokens.forgeGold, 0.07),
                }}
              >
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                  <Typography sx={{ color: alpha(brandTokens.parchment, 0.66), fontSize: '0.78rem' }}>
                    {variant.label} | SKU {variant.sku || 'n/a'} | delta ${variant.price_delta.toFixed(2)} | sort {variant.sort_order} | {variant.is_enabled ? 'Enabled' : 'Disabled'}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
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

      {/* ── Process Types & Pricing ────────────────────────────────────── */}
      <Box
        sx={{
          display: 'grid',
          gap: 1,
          border: `1px solid ${alpha(brandTokens.rubyRed, 0.14)}`,
          borderRadius: 1.2,
          p: 1,
          background: cardSurface(brandTokens.parchment, 0.06),
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ md: 'center' }}>
          <Box>
            <Typography variant="h6">Process Types & Pricing</Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.58), fontSize: '0.78rem' }}>
              Tag this product with the processes used to make it. Set a price delta for each process.
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            disabled={savingProcessTypes}
            onClick={() => void saveProcessTypes()}
          >
            {savingProcessTypes ? 'Saving...' : 'Save'}
          </Button>
        </Stack>

        {processTypes.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.5), fontSize: '0.8rem' }}>
            No process types found. Run migration 030 to seed them.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.8 }}>
            {processTypes.map((pt) => {
              const isAssigned = assignedProcessKeys.includes(pt.key)
              const autoOption = hasAutoOption(pt.key)
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
                    component="button"
                    type="button"
                    onClick={() => {
                      setAssignedProcessKeys((prev) =>
                        isAssigned ? prev.filter((k) => k !== pt.key) : [...prev, pt.key]
                      )
                    }}
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
                    {pt.emoji && <span aria-hidden="true">{pt.emoji}</span>}
                    {pt.display_name}
                    <Typography component="span" sx={{ ml: 'auto', fontSize: '0.7rem', opacity: 0.6 }}>
                      {isAssigned ? 'ON' : 'OFF'}
                    </Typography>
                  </Box>

                  {isAssigned && (
                    <Typography sx={{ fontSize: '0.75rem', color: alpha(brandTokens.parchment, 0.5), fontStyle: 'italic' }}>
                      Auto-generates "{getProcessAutoOption(pt.key)?.label}" option in Options section
                    </Typography>
                  )}
                </Stack>

                  {isAssigned && (
                    <TextField
                      size="small"
                      type="number"
                      label="Price delta ($)"
                      value={String(processPricing[pt.key] ?? 0)}
                      onChange={(event) => updateProcessPricing(pt.key, asNumber(event.target.value))}
                      sx={{ width: 160 }}
                      slotProps={{ htmlInput: { step: '0.50', min: '0' } }}
                    />
                  )}
                </Box>
              )
            })}
          </Box>
        )}

        <Divider sx={{ borderColor: alpha(brandTokens.parchment, 0.1) }} />

        {/* ── Combo Discounts ──────────────────────────────────────────── */}
        <Box sx={{ display: 'grid', gap: 0.8, mt: 0.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
            Combo Discounts
          </Typography>
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.55), fontSize: '0.75rem' }}>
            When a customer selects multiple processes, apply a discount.
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
                    background: alpha(brandTokens.bgSurface ?? brandTokens.parchment, 0.4),
                  }}
                >
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                    <Typography sx={{ fontSize: '0.8rem', minWidth: 100 }}>
                      {cd.min_processes}+ processes
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: alpha(brandTokens.parchment, 0.7), minWidth: 120 }}>
                      {cd.discount_type === 'percent' ? `${cd.discount_value}% off` : cd.discount_type === 'fixed_amount' ? `$${cd.discount_value?.toFixed(2)} off` : 'Cheapest free'}
                    </Typography>
                    {cd.label && (
                      <Typography sx={{ fontSize: '0.78rem', color: alpha(brandTokens.parchment, 0.55), flex: 1 }}>
                        "{cd.label}"
                      </Typography>
                    )}
                    <Button size="small" variant="text" color="error" onClick={() => removeComboDiscount(cd.localId)}>
                      Remove
                    </Button>
                  </Stack>
                </Box>
              ))}
            </Box>
          )}

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <TextField
              size="small"
              type="number"
              label="Min processes"
              value={newComboMinProcesses}
              onChange={(event) => setNewComboMinProcesses(event.target.value)}
              sx={{ width: 130 }}
              slotProps={{ htmlInput: { min: 2 } }}
            />
            <Select
              size="small"
              value={newComboDiscountType}
              onChange={(event) => setNewComboDiscountType(event.target.value as 'percent' | 'fixed_amount' | 'cheapest_free')}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="percent">Percent off</MenuItem>
              <MenuItem value="fixed_amount">Fixed amount off</MenuItem>
              <MenuItem value="cheapest_free">Cheapest free</MenuItem>
            </Select>
            {newComboDiscountType !== 'cheapest_free' && (
              <TextField
                size="small"
                type="number"
                label="Value"
                value={newComboDiscountValue}
                onChange={(event) => setNewComboDiscountValue(event.target.value)}
                sx={{ width: 130 }}
              />
            )}
            <TextField
              size="small"
              label="Label (optional)"
              value={newComboDiscountLabel}
              onChange={(event) => setNewComboDiscountLabel(event.target.value)}
              sx={{ minWidth: 180 }}
            />
            <Button variant="outlined" size="small" onClick={() => void addComboDiscount()}>
              Add Combo Discount
            </Button>
          </Stack>
        </Box>
      </Box>

      <Divider />

      {/* ── Pricing Section ──────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'grid',
          gap: 1,
          border: `1px solid ${alpha(brandTokens.rubyRed, 0.14)}`,
          borderRadius: 1.2,
          p: 1,
          background: cardSurface(brandTokens.rubyRed, 0.06),
        }}
      >
        <Typography variant="h6">Pricing</Typography>

        <TextField
          size="small"
          type="number"
          label="Base price ($)"
          value={product.base_price}
          onChange={(event) => updateProduct('base_price', asNumber(event.target.value))}
          sx={{ width: 180 }}
          InputProps={{
            startAdornment: <InputAdornment position="start">$</InputAdornment>,
          }}
        />

        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem', mt: 0.5 }}>
          Bulk Discount Tiers
        </Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            size="small"
            type="number"
            label="Min qty"
            value={minQty}
            onChange={(event) => setMinQty(event.target.value)}
            sx={{ width: 130 }}
          />
          <TextField
            size="small"
            type="number"
            label="Max qty"
            value={maxQty}
            onChange={(event) => setMaxQty(event.target.value)}
            sx={{ width: 130 }}
            inputProps={{ placeholder: 'Leave empty for unlimited' }}
          />
          <Select
            size="small"
            value={discountType}
            onChange={(event) => setDiscountType(event.target.value as 'percent' | 'fixed_amount')}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="percent">Percent off</MenuItem>
            <MenuItem value="fixed_amount">Fixed amount off</MenuItem>
          </Select>
          <TextField
            size="small"
            type="number"
            label="Value"
            value={discountValue}
            onChange={(event) => setDiscountValue(event.target.value)}
            sx={{ width: 140 }}
          />
          <TextField
            size="small"
            label="Label"
            value={discountLabel}
            onChange={(event) => setDiscountLabel(event.target.value)}
            sx={{ minWidth: 190 }}
          />
          <TextField
            size="small"
            type="number"
            label="Sort"
            value={discountSortOrder}
            onChange={(event) => setDiscountSortOrder(event.target.value)}
            sx={{ width: 110 }}
          />
          <Button variant="outlined" onClick={() => void addDiscountTier()}>
            Add tier
          </Button>
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
                  background: cardSurface(brandTokens.copper, 0.07),
                }}
              >
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                  <Typography sx={{ color: alpha(brandTokens.parchment, 0.66), fontSize: '0.78rem' }}>
                    Qty {tier.min_qty}{tier.max_qty ? ` - ${tier.max_qty}` : '+'} | {tier.discount_type} {tier.discount_value} | {tier.label || 'No label'} | {tier.is_enabled ? 'Enabled' : 'Disabled'}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
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

      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button
          variant="outlined"
          disabled={!product.category_key || !product.slug}
          onClick={() => window.open(`/shop/categories/${product.category_key}/${product.slug}`, '_blank', 'noopener,noreferrer')}
        >
          Preview Product
        </Button>
        <Button variant="contained" disabled={saving} onClick={() => void saveProduct()}>
          {saving ? 'Saving...' : 'Save Product'}
        </Button>
      </Stack>

      <Divider />

      {/* ── Options ──────────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'grid',
          gap: 1,
          border: `1px solid ${alpha(brandTokens.rubyRed, 0.14)}`,
          borderRadius: 1.2,
          p: 1,
          background: cardSurface(brandTokens.rubyRed, 0.06),
        }}
      >
        <Typography variant="h6">Options</Typography>
        {optionError && <Alert severity="error">{optionError}</Alert>}
        {optionSuccess && <Alert severity="success">{optionSuccess}</Alert>}

        <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.55), fontSize: '0.75rem' }}>
          Product customization options. Process types may auto-generate options when enabled.
        </Typography>

        <Divider />

        <Typography variant="subtitle2" sx={{ fontSize: '0.85rem', mt: 0.5 }}>
          Add New Option
        </Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
          <TextField
            size="small"
            label="Key"
            value={newOptionKey}
            onChange={(event) => setNewOptionKey(event.target.value)}
            sx={{ width: 160 }}
          />
          <TextField
            size="small"
            label="Label"
            value={newOptionLabel}
            onChange={(event) => setNewOptionLabel(event.target.value)}
            sx={{ width: 160 }}
          />
          <Select
            size="small"
            value={newOptionType}
            onChange={(event) => setNewOptionType(event.target.value as OptionType)}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="select">Single choice</MenuItem>
            <MenuItem value="text">Text</MenuItem>
            <MenuItem value="textarea">Long text</MenuItem>
            <MenuItem value="file">File upload</MenuItem>
            <MenuItem value="checkbox">Toggle</MenuItem>
            <MenuItem value="number">Number</MenuItem>
          </Select>
          <TextField
            size="small"
            type="number"
            label="Sort"
            value={newOptionSortOrder}
            onChange={(event) => setNewOptionSortOrder(event.target.value)}
            sx={{ width: 100 }}
          />
          <FormControlLabel
            control={<Checkbox checked={newOptionRequired} onChange={(event) => setNewOptionRequired(event.target.checked)} />}
            label="Required"
          />
          <Button variant="contained" size="small" onClick={() => void addOption()}>
            Add option
          </Button>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
          <TextField
            size="small"
            label="Placeholder (text/file/textarea options)"
            value={newOptionPlaceholder}
            onChange={(event) => setNewOptionPlaceholder(event.target.value)}
            sx={{ minWidth: 220 }}
          />
          <TextField
            size="small"
            label="Help text"
            value={newOptionHelpText}
            onChange={(event) => setNewOptionHelp(event.target.value)}
            sx={{ minWidth: 220 }}
          />
        </Stack>

        {options.length === 0 ? (
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.8rem' }}>
            No options yet. Add one above.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 1 }}>
            {options.map((option) => (
              <Box
                key={option.id}
                sx={{
                  border: `1px solid ${alpha(brandTokens.forgeGold, 0.14)}`,
                  borderRadius: 1.2,
                  p: 1,
                  display: 'grid',
                  gap: 0.8,
                  background: cardSurface(brandTokens.forgeGold, 0.02),
                }}
              >
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between">
                  <Typography sx={{ fontWeight: 700, fontSize: '0.86rem' }}>
                    {option.label || 'Untitled option'} ({optionTypeLabel(option.option_type)})
                  </Typography>
                  <Stack direction="row" spacing={0.5}>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={optionBusyKey === option.id}
                      onClick={() => void saveOption(option.id)}
                    >
                      Save
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      disabled={optionBusyKey === option.id}
                      onClick={() => void deleteOption(option.id)}
                    >
                      Delete
                    </Button>
                  </Stack>
                </Stack>

                <Typography sx={{ fontSize: '0.76rem', color: alpha(brandTokens.parchment, 0.6), mt: 0.5 }}>
                  Option values:
                </Typography>

                {option.values.length === 0 && (
                  <Typography sx={{ fontSize: '0.75rem', color: alpha(brandTokens.parchment, 0.5), fontStyle: 'italic' }}>
                    No values yet.
                  </Typography>
                )}

                {option.values.length > 0 && (
                  <Box sx={{ display: 'grid', gap: 0.4, pl: 1 }}>
                    {option.values.map((value) => (
                      <Stack key={value.id} direction="row" spacing={1} alignItems="center">
                        <Typography sx={{ fontSize: '0.75rem', color: alpha(brandTokens.parchment, 0.6), flex: 1 }}>
                          • {value.label} ({value.value}) | delta ${value.price_delta.toFixed(2)}
                        </Typography>
                        <Button
                          size="small"
                          variant="text"
                          color="error"
                          sx={{ fontSize: '0.7rem', minWidth: 'auto', p: 0.3 }}
                          onClick={() => void deleteOptionValue(value.id)}
                        >
                          ✕
                        </Button>
                      </Stack>
                    ))}
                  </Box>
                )}

                <Divider sx={{ borderColor: alpha(brandTokens.parchment, 0.08) }} />

                {addingValueForOption === option.id ? (
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
                    <TextField
                      size="small"
                      label="Label"
                      value={newValueLabel}
                      onChange={(event) => setNewValueLabel(event.target.value)}
                      sx={{ width: 150 }}
                    />
                    <TextField
                      size="small"
                      label="Value"
                      value={newValueValue}
                      onChange={(event) => setNewValueValue(event.target.value)}
                      sx={{ width: 150 }}
                    />
                    <TextField
                      size="small"
                      type="number"
                      label="Price delta"
                      value={newValuePriceDelta}
                      onChange={(event) => setNewValuePriceDelta(event.target.value)}
                      sx={{ width: 120 }}
                    />
                    <TextField
                      size="small"
                      type="number"
                      label="Sort"
                      value={newValueSort}
                      onChange={(event) => setNewValueSort(event.target.value)}
                      sx={{ width: 80 }}
                    />
                    <Button size="small" variant="contained" onClick={() => void addOptionValue(option.id)}>
                      Add
                    </Button>
                    <Button size="small" variant="text" onClick={() => setAddingValueForOption(null)}>
                      Cancel
                    </Button>
                  </Stack>
                ) : (
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => {
                      setAddingValueForOption(option.id)
                      setNewValueLabel('')
                      setNewValueValue('')
                      setNewValuePriceDelta('')
                      setNewValueSort('')
                    }}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    + Add value
                  </Button>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}