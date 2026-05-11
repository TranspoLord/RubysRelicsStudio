'use client'

import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Checkbox from '@mui/material/Checkbox'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

interface CatalogProductRow {
  id: string
  title: string
  slug: string
  short_description: string
  description: string
  category_key: string
  category_display_name: string
  base_price: number
  is_ready_made: boolean
  is_customizable: boolean
  is_active: boolean
  is_archived: boolean
  sort_order: number
  production_estimate_band: string
  updated_at: string
}

interface CategoryOption {
  key: string
  display_name: string
}

interface ProductEditorState {
  productId: string | null
  title: string
  slug: string
  category_key: string
  base_price: string
  sort_order: string
  production_estimate_band: string
  short_description: string
  description: string
  is_ready_made: boolean
  is_customizable: boolean
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
  updated_at: string
}

interface VariantEditorState {
  variantId: string | null
  label: string
  sku: string
  price_delta: string
  capacity_weight: string
  is_enabled: boolean
  sort_order: string
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
  created_at: string
}

interface MediaEditorState {
  mediaId: string | null
  url: string
  alt: string
  emoji: string
  gradient: string
  is_featured: boolean
  sort_order: string
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

interface OptionEditorState {
  optionId: string | null
  option_key: string
  label: string
  option_type: 'select' | 'text' | 'textarea' | 'file' | 'checkbox' | 'number'
  placeholder: string
  help_text: string
  is_required: boolean
  sort_order: string
}

interface OptionValueEditorState {
  optionValueId: string | null
  optionId: string
  label: string
  value: string
  price_delta: string
  is_enabled: boolean
  sort_order: string
}

interface BulkDiscountRow {
  id: string
  product_id: string
  min_qty: number
  max_qty: number | null
  discount_type: 'percent' | 'fixed_amount' | 'unit_price'
  discount_value: number
  label: string | null
  is_enabled: boolean
  sort_order: number
  updated_at: string
}

interface DiscountEditorState {
  discountId: string | null
  min_qty: string
  max_qty: string
  discount_type: 'percent' | 'fixed_amount' | 'unit_price'
  discount_value: string
  label: string
  is_enabled: boolean
  sort_order: string
}

type StatusFilter = 'all' | 'active' | 'inactive' | 'archived'

const EMPTY_EDITOR: ProductEditorState = {
  productId: null,
  title: '',
  slug: '',
  category_key: '',
  base_price: '0',
  sort_order: '0',
  production_estimate_band: '3-5 business days',
  short_description: '',
  description: '',
  is_ready_made: false,
  is_customizable: true,
}

const EMPTY_VARIANT_EDITOR: VariantEditorState = {
  variantId: null,
  label: '',
  sku: '',
  price_delta: '0',
  capacity_weight: '',
  is_enabled: true,
  sort_order: '0',
}

const EMPTY_MEDIA_EDITOR: MediaEditorState = {
  mediaId: null,
  url: '',
  alt: '',
  emoji: '',
  gradient: '',
  is_featured: false,
  sort_order: '0',
}

const EMPTY_OPTION_EDITOR: OptionEditorState = {
  optionId: null,
  option_key: '',
  label: '',
  option_type: 'text',
  placeholder: '',
  help_text: '',
  is_required: false,
  sort_order: '0',
}

const EMPTY_OPTION_VALUE_EDITOR: OptionValueEditorState = {
  optionValueId: null,
  optionId: '',
  label: '',
  value: '',
  price_delta: '0',
  is_enabled: true,
  sort_order: '0',
}

const EMPTY_DISCOUNT_EDITOR: DiscountEditorState = {
  discountId: null,
  min_qty: '1',
  max_qty: '',
  discount_type: 'percent',
  discount_value: '10',
  label: '',
  is_enabled: true,
  sort_order: '0',
}

const DISCOUNT_TYPE_CHOICES: Array<BulkDiscountRow['discount_type']> = [
  'percent',
  'fixed_amount',
  'unit_price',
]

const OPTION_TYPE_CHOICES: Array<ProductOptionRow['option_type']> = [
  'select',
  'text',
  'textarea',
  'file',
  'checkbox',
  'number',
]

function statusText(product: CatalogProductRow): string {
  if (product.is_archived) return 'Archived'
  if (product.is_active) return 'Published'
  return 'Draft'
}

function asMoney(value: number): string {
  return `$${Number(value).toFixed(2)}`
}

export default function AdminCatalogPage() {
  const [products, setProducts] = useState<CatalogProductRow[]>([])
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [queryDraft, setQueryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [editor, setEditor] = useState<ProductEditorState>(EMPTY_EDITOR)
  const [variants, setVariants] = useState<ProductVariantRow[]>([])
  const [variantEditor, setVariantEditor] = useState<VariantEditorState>(EMPTY_VARIANT_EDITOR)
  const [variantLoading, setVariantLoading] = useState(false)
  const [variantSaving, setVariantSaving] = useState(false)
  const [variantWorkingId, setVariantWorkingId] = useState<string | null>(null)
  const [mediaItems, setMediaItems] = useState<ProductMediaRow[]>([])
  const [mediaEditor, setMediaEditor] = useState<MediaEditorState>(EMPTY_MEDIA_EDITOR)
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaSaving, setMediaSaving] = useState(false)
  const [mediaWorkingId, setMediaWorkingId] = useState<string | null>(null)
  const [productOptions, setProductOptions] = useState<ProductOptionRow[]>([])
  const [optionEditor, setOptionEditor] = useState<OptionEditorState>(EMPTY_OPTION_EDITOR)
  const [optionValueEditor, setOptionValueEditor] = useState<OptionValueEditorState>(
    EMPTY_OPTION_VALUE_EDITOR
  )
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [optionSaving, setOptionSaving] = useState(false)
  const [optionValueSaving, setOptionValueSaving] = useState(false)
  const [optionWorkingId, setOptionWorkingId] = useState<string | null>(null)
  const [optionValueWorkingId, setOptionValueWorkingId] = useState<string | null>(null)
  const [bulkDiscounts, setBulkDiscounts] = useState<BulkDiscountRow[]>([])
  const [discountEditor, setDiscountEditor] = useState<DiscountEditorState>(EMPTY_DISCOUNT_EDITOR)
  const [discountsLoading, setDiscountsLoading] = useState(false)
  const [discountSaving, setDiscountSaving] = useState(false)
  const [discountWorkingId, setDiscountWorkingId] = useState<string | null>(null)
  const [savingProduct, setSavingProduct] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)

  const categories = useMemo(() => {
    return Array.from(new Set(products.map((row) => row.category_display_name))).sort((a, b) =>
      a.localeCompare(b)
    )
  }, [products])

  const selectedProductLabel = useMemo(() => {
    if (!editor.productId) return null
    const matched = products.find((product) => product.id === editor.productId)
    return matched?.title ?? editor.title ?? null
  }, [editor.productId, editor.title, products])

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
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load catalog.')
      }

      setProducts(Array.isArray(payload?.products) ? payload.products : [])
      setCategoryOptions(Array.isArray(payload?.categories) ? payload.categories : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load catalog.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProducts(query, status, categoryFilter)
  }, [query, status, categoryFilter])

  function hydrateEditor(product: CatalogProductRow) {
    setEditor({
      productId: product.id,
      title: product.title,
      slug: product.slug,
      category_key: product.category_key,
      base_price: String(product.base_price),
      sort_order: String(product.sort_order),
      production_estimate_band: product.production_estimate_band,
      short_description: product.short_description,
      description: product.description,
      is_ready_made: product.is_ready_made,
      is_customizable: product.is_customizable,
    })
    setVariantEditor(EMPTY_VARIANT_EDITOR)
    setMediaEditor(EMPTY_MEDIA_EDITOR)
    setOptionEditor(EMPTY_OPTION_EDITOR)
    setOptionValueEditor(EMPTY_OPTION_VALUE_EDITOR)
    setDiscountEditor(EMPTY_DISCOUNT_EDITOR)
    void loadVariants(product.id)
    void loadMedia(product.id)
    void loadOptions(product.id)
    void loadDiscounts(product.id)
  }

  function resetEditor() {
    setEditor(EMPTY_EDITOR)
    setVariants([])
    setVariantEditor(EMPTY_VARIANT_EDITOR)
    setMediaItems([])
    setMediaEditor(EMPTY_MEDIA_EDITOR)
    setProductOptions([])
    setOptionEditor(EMPTY_OPTION_EDITOR)
    setOptionValueEditor(EMPTY_OPTION_VALUE_EDITOR)
    setBulkDiscounts([])
    setDiscountEditor(EMPTY_DISCOUNT_EDITOR)
  }

  function updateEditor<K extends keyof ProductEditorState>(key: K, value: ProductEditorState[K]) {
    setEditor((prev) => ({ ...prev, [key]: value }))
  }

  async function saveProduct() {
    setSavingProduct(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const method = editor.productId ? 'PUT' : 'POST'
      const response = await fetch('/api/admin/catalog', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: editor.productId,
          title: editor.title,
          slug: editor.slug,
          category_key: editor.category_key,
          base_price: Number(editor.base_price),
          sort_order: Number(editor.sort_order),
          production_estimate_band: editor.production_estimate_band,
          short_description: editor.short_description,
          description: editor.description,
          is_ready_made: editor.is_ready_made,
          is_customizable: editor.is_customizable,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save product.')
      }

      setSuccessMessage(editor.productId ? 'Product updated successfully.' : 'Product created successfully as draft.')
      const savedProductId = payload?.product?.id as string | undefined
      const currentEditor = editor
      resetEditor()
      await loadProducts(query, status, categoryFilter)
      if (savedProductId) {
        setEditor({
          ...currentEditor,
          productId: savedProductId,
        })
        await loadVariants(savedProductId)
        await loadMedia(savedProductId)
        await loadOptions(savedProductId)
        await loadDiscounts(savedProductId)
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save product.')
    } finally {
      setSavingProduct(false)
    }
  }

  async function loadVariants(productId: string) {
    setVariantLoading(true)

    try {
      const params = new URLSearchParams({ productId })
      const response = await fetch(`/api/admin/catalog/variants?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load variants.')
      }

      setVariants(Array.isArray(payload?.variants) ? payload.variants : [])
    } catch (variantError) {
      setError(variantError instanceof Error ? variantError.message : 'Failed to load variants.')
      setVariants([])
    } finally {
      setVariantLoading(false)
    }
  }

  async function loadMedia(productId: string) {
    setMediaLoading(true)

    try {
      const params = new URLSearchParams({ productId })
      const response = await fetch(`/api/admin/catalog/media?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load media.')
      }

      setMediaItems(Array.isArray(payload?.media) ? payload.media : [])
    } catch (mediaError) {
      setError(mediaError instanceof Error ? mediaError.message : 'Failed to load media.')
      setMediaItems([])
    } finally {
      setMediaLoading(false)
    }
  }

  function updateVariantEditor<K extends keyof VariantEditorState>(
    key: K,
    value: VariantEditorState[K]
  ) {
    setVariantEditor((prev) => ({ ...prev, [key]: value }))
  }

  function hydrateVariantEditor(variant: ProductVariantRow) {
    setVariantEditor({
      variantId: variant.id,
      label: variant.label,
      sku: variant.sku ?? '',
      price_delta: String(variant.price_delta),
      capacity_weight: variant.capacity_weight === null ? '' : String(variant.capacity_weight),
      is_enabled: variant.is_enabled,
      sort_order: String(variant.sort_order),
    })
  }

  function resetVariantEditor() {
    setVariantEditor(EMPTY_VARIANT_EDITOR)
  }

  function updateMediaEditor<K extends keyof MediaEditorState>(key: K, value: MediaEditorState[K]) {
    setMediaEditor((prev) => ({ ...prev, [key]: value }))
  }

  function hydrateMediaEditor(media: ProductMediaRow) {
    setMediaEditor({
      mediaId: media.id,
      url: media.url,
      alt: media.alt,
      emoji: media.emoji ?? '',
      gradient: media.gradient ?? '',
      is_featured: media.is_featured,
      sort_order: String(media.sort_order),
    })
  }

  function resetMediaEditor() {
    setMediaEditor(EMPTY_MEDIA_EDITOR)
  }

  async function loadOptions(productId: string) {
    setOptionsLoading(true)

    try {
      const params = new URLSearchParams({ productId })
      const response = await fetch(`/api/admin/catalog/options?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load options.')
      }

      setProductOptions(Array.isArray(payload?.options) ? payload.options : [])
    } catch (optionsError) {
      setError(optionsError instanceof Error ? optionsError.message : 'Failed to load options.')
      setProductOptions([])
    } finally {
      setOptionsLoading(false)
    }
  }

  async function loadDiscounts(productId: string) {
    setDiscountsLoading(true)

    try {
      const params = new URLSearchParams({ productId })
      const response = await fetch(`/api/admin/catalog/discounts?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load discounts.')
      }

      setBulkDiscounts(Array.isArray(payload?.discounts) ? payload.discounts : [])
    } catch (discountError) {
      setError(discountError instanceof Error ? discountError.message : 'Failed to load discounts.')
      setBulkDiscounts([])
    } finally {
      setDiscountsLoading(false)
    }
  }

  function updateDiscountEditor<K extends keyof DiscountEditorState>(key: K, value: DiscountEditorState[K]) {
    setDiscountEditor((prev) => ({ ...prev, [key]: value }))
  }

  function hydrateDiscountEditor(discount: BulkDiscountRow) {
    setDiscountEditor({
      discountId: discount.id,
      min_qty: String(discount.min_qty),
      max_qty: discount.max_qty === null ? '' : String(discount.max_qty),
      discount_type: discount.discount_type,
      discount_value: String(discount.discount_value),
      label: discount.label ?? '',
      is_enabled: discount.is_enabled,
      sort_order: String(discount.sort_order),
    })
  }

  function resetDiscountEditor() {
    setDiscountEditor(EMPTY_DISCOUNT_EDITOR)
  }

  async function saveDiscount() {
    if (!editor.productId) {
      setError('Select or create a product before editing discounts.')
      return
    }

    setDiscountSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const method = discountEditor.discountId ? 'PUT' : 'POST'
      const response = await fetch('/api/admin/catalog/discounts', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: editor.productId,
          discountId: discountEditor.discountId,
          min_qty: Number(discountEditor.min_qty),
          max_qty: discountEditor.max_qty.trim().length > 0 ? Number(discountEditor.max_qty) : null,
          discount_type: discountEditor.discount_type,
          discount_value: Number(discountEditor.discount_value),
          label: discountEditor.label,
          is_enabled: discountEditor.is_enabled,
          sort_order: Number(discountEditor.sort_order),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save discount.')
      }

      setSuccessMessage(
        discountEditor.discountId ? 'Discount tier updated successfully.' : 'Discount tier created successfully.'
      )
      resetDiscountEditor()
      await loadDiscounts(editor.productId)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save discount.')
    } finally {
      setDiscountSaving(false)
    }
  }

  async function deleteDiscount(discount: BulkDiscountRow) {
    const confirmed = window.confirm(
      `Delete discount tier (min qty ${discount.min_qty})? This action cannot be undone.`
    )
    if (!confirmed) return

    if (!editor.productId) {
      setError('Select or create a product before deleting discounts.')
      return
    }

    setDiscountWorkingId(discount.id)
    setError(null)

    try {
      const response = await fetch('/api/admin/catalog/discounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discountId: discount.id,
          confirmAction: 'delete_discount',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete discount.')
      }

      if (discountEditor.discountId === discount.id) {
        resetDiscountEditor()
      }

      setSuccessMessage('Discount tier deleted successfully.')
      await loadDiscounts(editor.productId)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete discount.')
    } finally {
      setDiscountWorkingId(null)
    }
  }

  function updateOptionEditor<K extends keyof OptionEditorState>(key: K, value: OptionEditorState[K]) {    setOptionEditor((prev) => ({ ...prev, [key]: value }))
  }

  function hydrateOptionEditor(option: ProductOptionRow) {
    setOptionEditor({
      optionId: option.id,
      option_key: option.option_key,
      label: option.label,
      option_type: option.option_type,
      placeholder: option.placeholder ?? '',
      help_text: option.help_text ?? '',
      is_required: option.is_required,
      sort_order: String(option.sort_order),
    })
  }

  function resetOptionEditor() {
    setOptionEditor(EMPTY_OPTION_EDITOR)
  }

  function updateOptionValueEditor<K extends keyof OptionValueEditorState>(
    key: K,
    value: OptionValueEditorState[K]
  ) {
    setOptionValueEditor((prev) => ({ ...prev, [key]: value }))
  }

  function hydrateOptionValueEditor(optionId: string, optionValue: ProductOptionValueRow) {
    setOptionValueEditor({
      optionValueId: optionValue.id,
      optionId,
      label: optionValue.label,
      value: optionValue.value,
      price_delta: String(optionValue.price_delta),
      is_enabled: optionValue.is_enabled,
      sort_order: String(optionValue.sort_order),
    })
  }

  function startCreateOptionValue(optionId: string) {
    setOptionValueEditor({
      ...EMPTY_OPTION_VALUE_EDITOR,
      optionId,
    })
  }

  function resetOptionValueEditor() {
    setOptionValueEditor(EMPTY_OPTION_VALUE_EDITOR)
  }

  async function saveOption() {
    if (!editor.productId) {
      setError('Select or create a product before editing options.')
      return
    }

    setOptionSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const method = optionEditor.optionId ? 'PUT' : 'POST'
      const response = await fetch('/api/admin/catalog/options', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: editor.productId,
          optionId: optionEditor.optionId,
          option_key: optionEditor.option_key,
          label: optionEditor.label,
          option_type: optionEditor.option_type,
          placeholder: optionEditor.placeholder,
          help_text: optionEditor.help_text,
          is_required: optionEditor.is_required,
          sort_order: Number(optionEditor.sort_order),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save option.')
      }

      setSuccessMessage(optionEditor.optionId ? 'Option updated successfully.' : 'Option created successfully.')
      resetOptionEditor()
      await loadOptions(editor.productId)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save option.')
    } finally {
      setOptionSaving(false)
    }
  }

  async function deleteOption(option: ProductOptionRow) {
    const confirmed = window.confirm(`Delete option ${option.label}? This action cannot be undone.`)
    if (!confirmed) return

    if (!editor.productId) {
      setError('Select or create a product before deleting options.')
      return
    }

    setOptionWorkingId(option.id)
    setError(null)

    try {
      const response = await fetch('/api/admin/catalog/options', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optionId: option.id,
          confirmAction: 'delete_option',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete option.')
      }

      if (optionEditor.optionId === option.id) {
        resetOptionEditor()
      }
      if (optionValueEditor.optionId === option.id) {
        resetOptionValueEditor()
      }

      setSuccessMessage('Option deleted successfully.')
      await loadOptions(editor.productId)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete option.')
    } finally {
      setOptionWorkingId(null)
    }
  }

  async function saveOptionValue() {
    if (!editor.productId) {
      setError('Select or create a product before editing option values.')
      return
    }

    if (!optionValueEditor.optionId) {
      setError('Select an option before saving an option value.')
      return
    }

    setOptionValueSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const method = optionValueEditor.optionValueId ? 'PUT' : 'POST'
      const response = await fetch('/api/admin/catalog/options/values', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optionId: optionValueEditor.optionId,
          optionValueId: optionValueEditor.optionValueId,
          label: optionValueEditor.label,
          value: optionValueEditor.value,
          price_delta: Number(optionValueEditor.price_delta),
          is_enabled: optionValueEditor.is_enabled,
          sort_order: Number(optionValueEditor.sort_order),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save option value.')
      }

      setSuccessMessage(
        optionValueEditor.optionValueId
          ? 'Option value updated successfully.'
          : 'Option value created successfully.'
      )
      const selectedOptionId = optionValueEditor.optionId
      resetOptionValueEditor()
      await loadOptions(editor.productId)
      setOptionValueEditor((prev) => ({
        ...prev,
        optionId: selectedOptionId,
      }))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save option value.')
    } finally {
      setOptionValueSaving(false)
    }
  }

  async function deleteOptionValue(optionValue: ProductOptionValueRow) {
    const confirmed = window.confirm(`Delete option value ${optionValue.label}? This action cannot be undone.`)
    if (!confirmed) return

    if (!editor.productId) {
      setError('Select or create a product before deleting option values.')
      return
    }

    setOptionValueWorkingId(optionValue.id)
    setError(null)

    try {
      const response = await fetch('/api/admin/catalog/options/values', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optionValueId: optionValue.id,
          confirmAction: 'delete_option_value',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete option value.')
      }

      if (optionValueEditor.optionValueId === optionValue.id) {
        resetOptionValueEditor()
      }

      setSuccessMessage('Option value deleted successfully.')
      await loadOptions(editor.productId)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete option value.')
    } finally {
      setOptionValueWorkingId(null)
    }
  }

  async function saveVariant() {
    if (!editor.productId) {
      setError('Select or create a product before editing variants.')
      return
    }

    setVariantSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const method = variantEditor.variantId ? 'PUT' : 'POST'
      const response = await fetch('/api/admin/catalog/variants', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: editor.productId,
          variantId: variantEditor.variantId,
          label: variantEditor.label,
          sku: variantEditor.sku,
          price_delta: Number(variantEditor.price_delta),
          capacity_weight:
            variantEditor.capacity_weight.trim().length > 0
              ? Number(variantEditor.capacity_weight)
              : null,
          is_enabled: variantEditor.is_enabled,
          sort_order: Number(variantEditor.sort_order),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save variant.')
      }

      setSuccessMessage(variantEditor.variantId ? 'Variant updated successfully.' : 'Variant created successfully.')
      resetVariantEditor()
      await loadVariants(editor.productId)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save variant.')
    } finally {
      setVariantSaving(false)
    }
  }

  async function deleteVariant(variant: ProductVariantRow) {
    const confirmed = window.confirm(
      `Delete variant ${variant.label}? This action cannot be undone.`
    )
    if (!confirmed) return

    if (!editor.productId) {
      setError('Select or create a product before deleting variants.')
      return
    }

    setVariantWorkingId(variant.id)
    setError(null)

    try {
      const response = await fetch('/api/admin/catalog/variants', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantId: variant.id,
          confirmAction: 'delete_variant',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete variant.')
      }

      if (variantEditor.variantId === variant.id) {
        resetVariantEditor()
      }

      setSuccessMessage('Variant deleted successfully.')
      await loadVariants(editor.productId)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete variant.')
    } finally {
      setVariantWorkingId(null)
    }
  }

  async function saveMedia() {
    if (!editor.productId) {
      setError('Select or create a product before editing media.')
      return
    }

    setMediaSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const method = mediaEditor.mediaId ? 'PUT' : 'POST'
      const response = await fetch('/api/admin/catalog/media', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: editor.productId,
          mediaId: mediaEditor.mediaId,
          url: mediaEditor.url,
          alt: mediaEditor.alt,
          emoji: mediaEditor.emoji,
          gradient: mediaEditor.gradient,
          is_featured: mediaEditor.is_featured,
          sort_order: Number(mediaEditor.sort_order),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save media.')
      }

      setSuccessMessage(mediaEditor.mediaId ? 'Media item updated successfully.' : 'Media item created successfully.')
      resetMediaEditor()
      await loadMedia(editor.productId)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save media.')
    } finally {
      setMediaSaving(false)
    }
  }

  async function deleteMedia(media: ProductMediaRow) {
    const confirmed = window.confirm(`Delete media item ${media.alt}? This action cannot be undone.`)
    if (!confirmed) return

    if (!editor.productId) {
      setError('Select or create a product before deleting media.')
      return
    }

    setMediaWorkingId(media.id)
    setError(null)

    try {
      const response = await fetch('/api/admin/catalog/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: media.id, confirmAction: 'delete_media' }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete media.')
      }

      if (mediaEditor.mediaId === media.id) {
        resetMediaEditor()
      }

      setSuccessMessage('Media item deleted successfully.')
      await loadMedia(editor.productId)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete media.')
    } finally {
      setMediaWorkingId(null)
    }
  }

  async function runAction(product: CatalogProductRow, action: 'archive' | 'restore' | 'publish' | 'deactivate') {
    if (action === 'archive') {
      const confirmed = window.confirm(
        `Archive ${product.title}? This removes the product from storefront visibility.`
      )
      if (!confirmed) return
    }

    setWorkingId(product.id)
    setError(null)

    try {
      const response = await fetch('/api/admin/catalog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          action,
          confirmAction: action === 'archive' ? 'archive' : undefined,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (action === 'publish' && Array.isArray(payload?.checklistErrors) && payload.checklistErrors.length > 0) {
          const checklistText = payload.checklistErrors
            .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
            .join(' | ')
          throw new Error(`Publish checklist failed: ${checklistText}`)
        }
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to update product.')
      }

      await loadProducts(query, status, categoryFilter)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to update product.')
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.4 }}>
      <Box sx={{ display: 'grid', gap: 0.6 }}>
        <Typography variant="h4" component="h1">Catalog</Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
          Manage product visibility and publish lifecycle while Phase 2 catalog CRUD expands.
        </Typography>
      </Box>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          fullWidth
          size="small"
          label="Search title or slug"
          value={queryDraft}
          onChange={(event) => setQueryDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              setQuery(queryDraft)
            }
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

      {error && <Alert severity="error">{error}</Alert>}
      {successMessage && <Alert severity="success">{successMessage}</Alert>}

      <Box
        sx={{
          borderRadius: 1.4,
          border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`,
          backgroundColor: alpha(brandTokens.bgSurface, 0.58),
          p: 1.3,
          display: 'grid',
          gap: 1,
        }}
      >
        <Typography variant="h6">
          {editor.productId ? 'Edit Product' : 'Create Product'}
        </Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="Title"
            value={editor.title}
            onChange={(event) => updateEditor('title', event.target.value)}
          />
          <TextField
            fullWidth
            size="small"
            label="Slug"
            value={editor.slug}
            onChange={(event) => updateEditor('slug', event.target.value)}
            helperText="lowercase-hyphen format"
          />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <Select
            size="small"
            value={editor.category_key}
            onChange={(event) => updateEditor('category_key', event.target.value)}
            displayEmpty
            sx={{ minWidth: 240 }}
          >
            <MenuItem value="" disabled>Select category</MenuItem>
            {categoryOptions.map((category) => (
              <MenuItem key={category.key} value={category.key}>{category.display_name}</MenuItem>
            ))}
          </Select>
          <TextField
            size="small"
            label="Base price"
            type="number"
            value={editor.base_price}
            onChange={(event) => updateEditor('base_price', event.target.value)}
            sx={{ width: 160 }}
          />
          <TextField
            size="small"
            label="Sort order"
            type="number"
            value={editor.sort_order}
            onChange={(event) => updateEditor('sort_order', event.target.value)}
            sx={{ width: 160 }}
          />
        </Stack>

        <TextField
          size="small"
          label="Production estimate band"
          value={editor.production_estimate_band}
          onChange={(event) => updateEditor('production_estimate_band', event.target.value)}
        />

        <TextField
          size="small"
          label="Short description"
          value={editor.short_description}
          onChange={(event) => updateEditor('short_description', event.target.value)}
        />

        <TextField
          size="small"
          label="Description"
          multiline
          minRows={4}
          value={editor.description}
          onChange={(event) => updateEditor('description', event.target.value)}
        />

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <FormControlLabel
            control={
              <Checkbox
                checked={editor.is_ready_made}
                onChange={(event) => updateEditor('is_ready_made', event.target.checked)}
              />
            }
            label="Ready-made product"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={editor.is_customizable}
                onChange={(event) => updateEditor('is_customizable', event.target.checked)}
              />
            }
            label="Customizable"
          />
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={savingProduct} onClick={() => void saveProduct()}>
            {savingProduct ? 'Saving...' : editor.productId ? 'Save Changes' : 'Create Draft'}
          </Button>
          <Button variant="text" disabled={savingProduct} onClick={resetEditor}>Clear</Button>
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
        <Typography variant="h6">Variants</Typography>

        {!editor.productId ? (
          <Alert severity="info">Select a product from the list or save a new product to manage variants.</Alert>
        ) : (
          <>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.68), fontSize: '0.8rem' }}>
              Managing variants for {selectedProductLabel ?? 'selected product'}.
            </Typography>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                fullWidth
                size="small"
                label="Variant label"
                value={variantEditor.label}
                onChange={(event) => updateVariantEditor('label', event.target.value)}
              />
              <TextField
                size="small"
                label="SKU"
                value={variantEditor.sku}
                onChange={(event) => updateVariantEditor('sku', event.target.value)}
                sx={{ minWidth: 180 }}
              />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                size="small"
                label="Price delta"
                type="number"
                value={variantEditor.price_delta}
                onChange={(event) => updateVariantEditor('price_delta', event.target.value)}
                sx={{ width: 160 }}
              />
              <TextField
                size="small"
                label="Capacity weight"
                type="number"
                value={variantEditor.capacity_weight}
                onChange={(event) => updateVariantEditor('capacity_weight', event.target.value)}
                sx={{ width: 180 }}
              />
              <TextField
                size="small"
                label="Sort order"
                type="number"
                value={variantEditor.sort_order}
                onChange={(event) => updateVariantEditor('sort_order', event.target.value)}
                sx={{ width: 160 }}
              />
            </Stack>

            <FormControlLabel
              control={
                <Checkbox
                  checked={variantEditor.is_enabled}
                  onChange={(event) => updateVariantEditor('is_enabled', event.target.checked)}
                />
              }
              label="Variant enabled"
            />

            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                disabled={variantSaving || variantLoading}
                onClick={() => void saveVariant()}
              >
                {variantSaving ? 'Saving...' : variantEditor.variantId ? 'Save Variant' : 'Add Variant'}
              </Button>
              <Button
                variant="text"
                disabled={variantSaving || variantLoading}
                onClick={resetVariantEditor}
              >
                Clear Variant Form
              </Button>
              <Button
                variant="outlined"
                disabled={variantSaving || variantLoading}
                onClick={() => {
                  if (editor.productId) {
                    void loadVariants(editor.productId)
                  }
                }}
              >
                Refresh Variants
              </Button>
            </Stack>

            {variantLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={22} />
              </Box>
            ) : variants.length === 0 ? (
              <Alert severity="info">No variants configured for this product yet.</Alert>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.8 }}>
                {variants.map((variant) => (
                  <Box
                    key={variant.id}
                    sx={{
                      borderRadius: 1,
                      border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                      p: 1,
                      display: 'grid',
                      gap: 0.3,
                    }}
                  >
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={0.8}>
                      <Box sx={{ display: 'grid', gap: 0.2 }}>
                        <Typography sx={{ fontWeight: 600 }}>{variant.label}</Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: alpha(brandTokens.parchment, 0.64) }}>
                          SKU {variant.sku || 'n/a'} · Delta {asMoney(variant.price_delta)} · Weight {variant.capacity_weight ?? 0} · Sort {variant.sort_order} · {variant.is_enabled ? 'Enabled' : 'Disabled'}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.8}>
                        <Button
                          size="small"
                          variant="text"
                          disabled={variantSaving || variantWorkingId === variant.id}
                          onClick={() => hydrateVariantEditor(variant)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          disabled={variantSaving || variantWorkingId === variant.id}
                          onClick={() => void deleteVariant(variant)}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
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
        <Typography variant="h6">Media</Typography>

        {!editor.productId ? (
          <Alert severity="info">Select a product from the list or save a new product to manage media.</Alert>
        ) : (
          <>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.68), fontSize: '0.8rem' }}>
              Managing media for {selectedProductLabel ?? 'selected product'}.
            </Typography>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                fullWidth
                size="small"
                label="Media URL"
                value={mediaEditor.url}
                onChange={(event) => updateMediaEditor('url', event.target.value)}
              />
              <TextField
                fullWidth
                size="small"
                label="Alt text"
                value={mediaEditor.alt}
                onChange={(event) => updateMediaEditor('alt', event.target.value)}
              />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                size="small"
                label="Emoji"
                value={mediaEditor.emoji}
                onChange={(event) => updateMediaEditor('emoji', event.target.value)}
                sx={{ width: 140 }}
              />
              <TextField
                fullWidth
                size="small"
                label="Gradient token"
                value={mediaEditor.gradient}
                onChange={(event) => updateMediaEditor('gradient', event.target.value)}
              />
              <TextField
                size="small"
                label="Sort order"
                type="number"
                value={mediaEditor.sort_order}
                onChange={(event) => updateMediaEditor('sort_order', event.target.value)}
                sx={{ width: 160 }}
              />
            </Stack>

            <FormControlLabel
              control={
                <Checkbox
                  checked={mediaEditor.is_featured}
                  onChange={(event) => updateMediaEditor('is_featured', event.target.checked)}
                />
              }
              label="Featured media"
            />

            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                disabled={mediaSaving || mediaLoading}
                onClick={() => void saveMedia()}
              >
                {mediaSaving ? 'Saving...' : mediaEditor.mediaId ? 'Save Media' : 'Add Media'}
              </Button>
              <Button
                variant="text"
                disabled={mediaSaving || mediaLoading}
                onClick={resetMediaEditor}
              >
                Clear Media Form
              </Button>
              <Button
                variant="outlined"
                disabled={mediaSaving || mediaLoading}
                onClick={() => {
                  if (editor.productId) {
                    void loadMedia(editor.productId)
                  }
                }}
              >
                Refresh Media
              </Button>
            </Stack>

            {mediaLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={22} />
              </Box>
            ) : mediaItems.length === 0 ? (
              <Alert severity="info">No media configured for this product yet.</Alert>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.8 }}>
                {mediaItems.map((media) => (
                  <Box
                    key={media.id}
                    sx={{
                      borderRadius: 1,
                      border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                      p: 1,
                      display: 'grid',
                      gap: 0.3,
                    }}
                  >
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={0.8}>
                      <Box sx={{ display: 'grid', gap: 0.2 }}>
                        <Typography sx={{ fontWeight: 600 }}>{media.alt}</Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: alpha(brandTokens.parchment, 0.64) }}>
                          {media.url} · Sort {media.sort_order} · {media.is_featured ? 'Featured' : 'Standard'}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.8}>
                        <Button
                          size="small"
                          variant="text"
                          disabled={mediaSaving || mediaWorkingId === media.id}
                          onClick={() => hydrateMediaEditor(media)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          disabled={mediaSaving || mediaWorkingId === media.id}
                          onClick={() => void deleteMedia(media)}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
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
        <Typography variant="h6">Options</Typography>

        {!editor.productId ? (
          <Alert severity="info">Select a product from the list or save a new product to manage options.</Alert>
        ) : (
          <>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.68), fontSize: '0.8rem' }}>
              Managing options for {selectedProductLabel ?? 'selected product'}.
            </Typography>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                size="small"
                label="Option key"
                value={optionEditor.option_key}
                onChange={(event) => updateOptionEditor('option_key', event.target.value)}
                sx={{ minWidth: 180 }}
              />
              <TextField
                fullWidth
                size="small"
                label="Option label"
                value={optionEditor.label}
                onChange={(event) => updateOptionEditor('label', event.target.value)}
              />
              <Select
                size="small"
                value={optionEditor.option_type}
                onChange={(event) =>
                  updateOptionEditor('option_type', event.target.value as OptionEditorState['option_type'])
                }
                sx={{ minWidth: 160 }}
              >
                {OPTION_TYPE_CHOICES.map((optionType) => (
                  <MenuItem key={optionType} value={optionType}>{optionType}</MenuItem>
                ))}
              </Select>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                fullWidth
                size="small"
                label="Placeholder"
                value={optionEditor.placeholder}
                onChange={(event) => updateOptionEditor('placeholder', event.target.value)}
                disabled={optionEditor.option_type === 'select' || optionEditor.option_type === 'checkbox'}
              />
              <TextField
                size="small"
                label="Sort order"
                type="number"
                value={optionEditor.sort_order}
                onChange={(event) => updateOptionEditor('sort_order', event.target.value)}
                sx={{ width: 160 }}
              />
            </Stack>

            <TextField
              size="small"
              label="Help text"
              value={optionEditor.help_text}
              onChange={(event) => updateOptionEditor('help_text', event.target.value)}
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={optionEditor.is_required}
                  onChange={(event) => updateOptionEditor('is_required', event.target.checked)}
                />
              }
              label="Option required"
            />

            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                disabled={optionSaving || optionsLoading}
                onClick={() => void saveOption()}
              >
                {optionSaving ? 'Saving...' : optionEditor.optionId ? 'Save Option' : 'Add Option'}
              </Button>
              <Button variant="text" disabled={optionSaving || optionsLoading} onClick={resetOptionEditor}>
                Clear Option Form
              </Button>
              <Button
                variant="outlined"
                disabled={optionSaving || optionsLoading}
                onClick={() => {
                  if (editor.productId) {
                    void loadOptions(editor.productId)
                  }
                }}
              >
                Refresh Options
              </Button>
            </Stack>

            <Box sx={{ borderTop: `1px solid ${alpha(brandTokens.parchment, 0.12)}`, pt: 1 }}>
              <Typography sx={{ mb: 0.8, fontWeight: 600 }}>Option Values</Typography>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <Select
                  size="small"
                  value={optionValueEditor.optionId}
                  onChange={(event) => updateOptionValueEditor('optionId', event.target.value)}
                  displayEmpty
                  sx={{ minWidth: 220 }}
                >
                  <MenuItem value="" disabled>Select option</MenuItem>
                  {productOptions.map((option) => (
                    <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>
                  ))}
                </Select>
                <TextField
                  size="small"
                  label="Value label"
                  value={optionValueEditor.label}
                  onChange={(event) => updateOptionValueEditor('label', event.target.value)}
                  sx={{ minWidth: 180 }}
                />
                <TextField
                  size="small"
                  label="Value"
                  value={optionValueEditor.value}
                  onChange={(event) => updateOptionValueEditor('value', event.target.value)}
                  sx={{ minWidth: 180 }}
                />
              </Stack>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 1 }}>
                <TextField
                  size="small"
                  label="Price delta"
                  type="number"
                  value={optionValueEditor.price_delta}
                  onChange={(event) => updateOptionValueEditor('price_delta', event.target.value)}
                  sx={{ width: 160 }}
                />
                <TextField
                  size="small"
                  label="Sort order"
                  type="number"
                  value={optionValueEditor.sort_order}
                  onChange={(event) => updateOptionValueEditor('sort_order', event.target.value)}
                  sx={{ width: 160 }}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={optionValueEditor.is_enabled}
                      onChange={(event) => updateOptionValueEditor('is_enabled', event.target.checked)}
                    />
                  }
                  label="Value enabled"
                />
              </Stack>

              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button
                  variant="contained"
                  disabled={optionValueSaving || optionsLoading}
                  onClick={() => void saveOptionValue()}
                >
                  {optionValueSaving
                    ? 'Saving...'
                    : optionValueEditor.optionValueId
                      ? 'Save Value'
                      : 'Add Value'}
                </Button>
                <Button
                  variant="text"
                  disabled={optionValueSaving || optionsLoading}
                  onClick={resetOptionValueEditor}
                >
                  Clear Value Form
                </Button>
              </Stack>
            </Box>

            {optionsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={22} />
              </Box>
            ) : productOptions.length === 0 ? (
              <Alert severity="info">No options configured for this product yet.</Alert>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.8 }}>
                {productOptions.map((option) => (
                  <Box
                    key={option.id}
                    sx={{
                      borderRadius: 1,
                      border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                      p: 1,
                      display: 'grid',
                      gap: 0.3,
                    }}
                  >
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={0.8}>
                      <Box sx={{ display: 'grid', gap: 0.2 }}>
                        <Typography sx={{ fontWeight: 600 }}>{option.label} ({option.option_key})</Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: alpha(brandTokens.parchment, 0.64) }}>
                          {option.option_type} · {option.is_required ? 'Required' : 'Optional'} · Sort {option.sort_order}
                        </Typography>
                        {option.values.length > 0 && (
                          <Typography sx={{ fontSize: '0.76rem', color: alpha(brandTokens.parchment, 0.6) }}>
                            Values: {option.values.map((valueRow) => valueRow.label).join(', ')}
                          </Typography>
                        )}
                      </Box>
                      <Stack direction="row" spacing={0.8} flexWrap="wrap">
                        <Button
                          size="small"
                          variant="text"
                          disabled={optionSaving || optionWorkingId === option.id}
                          onClick={() => hydrateOptionEditor(option)}
                        >
                          Edit Option
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          disabled={optionValueSaving || optionWorkingId === option.id}
                          onClick={() => startCreateOptionValue(option.id)}
                        >
                          Add Value
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          disabled={optionSaving || optionWorkingId === option.id}
                          onClick={() => void deleteOption(option)}
                        >
                          Delete Option
                        </Button>
                      </Stack>
                    </Stack>

                    {option.values.length > 0 && (
                      <Box sx={{ display: 'grid', gap: 0.4, mt: 0.5 }}>
                        {option.values.map((valueRow) => (
                          <Stack
                            key={valueRow.id}
                            direction={{ xs: 'column', md: 'row' }}
                            justifyContent="space-between"
                            spacing={0.8}
                            sx={{ borderTop: `1px solid ${alpha(brandTokens.parchment, 0.08)}`, pt: 0.5 }}
                          >
                            <Typography sx={{ fontSize: '0.78rem', color: alpha(brandTokens.parchment, 0.68) }}>
                              {valueRow.label} ({valueRow.value}) · Delta {asMoney(valueRow.price_delta)} · Sort {valueRow.sort_order} · {valueRow.is_enabled ? 'Enabled' : 'Disabled'}
                            </Typography>
                            <Stack direction="row" spacing={0.8}>
                              <Button
                                size="small"
                                variant="text"
                                disabled={optionValueSaving || optionValueWorkingId === valueRow.id}
                                onClick={() => hydrateOptionValueEditor(option.id, valueRow)}
                              >
                                Edit Value
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                variant="outlined"
                                disabled={optionValueSaving || optionValueWorkingId === valueRow.id}
                                onClick={() => void deleteOptionValue(valueRow)}
                              >
                                Delete Value
                              </Button>
                            </Stack>
                          </Stack>
                        ))}
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
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
        <Typography variant="h6">Bulk Discount Tiers</Typography>

        {!editor.productId ? (
          <Alert severity="info">Select a product from the list or save a new product to manage discount tiers.</Alert>
        ) : (
          <>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.68), fontSize: '0.8rem' }}>
              Managing bulk discount tiers for {selectedProductLabel ?? 'selected product'}. Tiers are matched by quantity at checkout — the best matching tier wins.
            </Typography>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                size="small"
                label="Min qty"
                type="number"
                value={discountEditor.min_qty}
                onChange={(event) => updateDiscountEditor('min_qty', event.target.value)}
                sx={{ width: 140 }}
              />
              <TextField
                size="small"
                label="Max qty (blank = no cap)"
                type="number"
                value={discountEditor.max_qty}
                onChange={(event) => updateDiscountEditor('max_qty', event.target.value)}
                sx={{ width: 200 }}
              />
              <Select
                size="small"
                value={discountEditor.discount_type}
                onChange={(event) =>
                  updateDiscountEditor('discount_type', event.target.value as DiscountEditorState['discount_type'])
                }
                sx={{ minWidth: 180 }}
              >
                {DISCOUNT_TYPE_CHOICES.map((discountType) => (
                  <MenuItem key={discountType} value={discountType}>{discountType}</MenuItem>
                ))}
              </Select>
              <TextField
                size="small"
                label={
                  discountEditor.discount_type === 'percent'
                    ? 'Discount %'
                    : discountEditor.discount_type === 'unit_price'
                      ? 'Unit price ($)'
                      : 'Discount amount ($)'
                }
                type="number"
                value={discountEditor.discount_value}
                onChange={(event) => updateDiscountEditor('discount_value', event.target.value)}
                sx={{ width: 180 }}
              />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                fullWidth
                size="small"
                label="Label (optional, shown to customer)"
                value={discountEditor.label}
                onChange={(event) => updateDiscountEditor('label', event.target.value)}
              />
              <TextField
                size="small"
                label="Sort order"
                type="number"
                value={discountEditor.sort_order}
                onChange={(event) => updateDiscountEditor('sort_order', event.target.value)}
                sx={{ width: 160 }}
              />
            </Stack>

            <FormControlLabel
              control={
                <Checkbox
                  checked={discountEditor.is_enabled}
                  onChange={(event) => updateDiscountEditor('is_enabled', event.target.checked)}
                />
              }
              label="Tier enabled"
            />

            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                disabled={discountSaving || discountsLoading}
                onClick={() => void saveDiscount()}
              >
                {discountSaving ? 'Saving...' : discountEditor.discountId ? 'Save Tier' : 'Add Tier'}
              </Button>
              <Button
                variant="text"
                disabled={discountSaving || discountsLoading}
                onClick={resetDiscountEditor}
              >
                Clear Tier Form
              </Button>
              <Button
                variant="outlined"
                disabled={discountSaving || discountsLoading}
                onClick={() => {
                  if (editor.productId) {
                    void loadDiscounts(editor.productId)
                  }
                }}
              >
                Refresh Tiers
              </Button>
            </Stack>

            {discountsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={22} />
              </Box>
            ) : bulkDiscounts.length === 0 ? (
              <Alert severity="info">No discount tiers configured for this product yet.</Alert>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.8 }}>
                {bulkDiscounts.map((discount) => (
                  <Box
                    key={discount.id}
                    sx={{
                      borderRadius: 1,
                      border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                      p: 1,
                      display: 'grid',
                      gap: 0.3,
                    }}
                  >
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={0.8}>
                      <Box sx={{ display: 'grid', gap: 0.2 }}>
                        <Typography sx={{ fontWeight: 600 }}>
                          {discount.label
                            ? discount.label
                            : `Qty ${discount.min_qty}${discount.max_qty !== null ? `–${discount.max_qty}` : '+'}`}
                        </Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: alpha(brandTokens.parchment, 0.64) }}>
                          {discount.discount_type} · {
                            discount.discount_type === 'percent'
                              ? `${discount.discount_value}%`
                              : asMoney(discount.discount_value)
                          } · Min {discount.min_qty}{discount.max_qty !== null ? ` / Max ${discount.max_qty}` : ' / No cap'} · Sort {discount.sort_order} · {discount.is_enabled ? 'Enabled' : 'Disabled'}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.8}>
                        <Button
                          size="small"
                          variant="text"
                          disabled={discountSaving || discountWorkingId === discount.id}
                          onClick={() => hydrateDiscountEditor(discount)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          disabled={discountSaving || discountWorkingId === discount.id}
                          onClick={() => void deleteDiscount(discount)}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
      </Box>

      <Typography sx={{ color: alpha(brandTokens.parchment, 0.6), fontSize: '0.8rem' }}>
        Loaded {products.length} products across {categories.length} categories.
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : products.length === 0 ? (
        <Alert severity="info">No catalog products matched your filters.</Alert>
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
                    /{product.slug} · {product.category_display_name}
                  </Typography>
                  <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.76rem' }}>
                    {statusText(product)} · {asMoney(product.base_price)} · Sort {product.sort_order} · {product.production_estimate_band}
                  </Typography>
                </Box>

                <Stack direction="row" spacing={0.8} flexWrap="wrap">
                  <Button
                    size="small"
                    variant="text"
                    disabled={workingId === product.id || savingProduct}
                    onClick={() => hydrateEditor(product)}
                  >
                    Edit
                  </Button>

                  {!product.is_archived && !product.is_active && (
                    <Button
                      size="small"
                      variant="contained"
                      disabled={workingId === product.id}
                      onClick={() => void runAction(product, 'publish')}
                    >
                      Publish
                    </Button>
                  )}

                  {!product.is_archived && product.is_active && (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={workingId === product.id}
                      onClick={() => void runAction(product, 'deactivate')}
                    >
                      Deactivate
                    </Button>
                  )}

                  {!product.is_archived && (
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      disabled={workingId === product.id || savingProduct}
                      onClick={() => void runAction(product, 'archive')}
                    >
                      Archive
                    </Button>
                  )}

                  {product.is_archived && (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={workingId === product.id || savingProduct}
                      onClick={() => void runAction(product, 'restore')}
                    >
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
