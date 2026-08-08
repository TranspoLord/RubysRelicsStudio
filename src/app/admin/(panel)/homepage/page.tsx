'use client'

import { useCallback, useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import ImageIcon from '@mui/icons-material/Image'
import AddIcon from '@mui/icons-material/Add'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

// ─── Section metadata ─────────────────────────────────────────────────────────

const SECTION_ORDER = [
  'hero',
  'hero_collage',
  'quick_picks',
  'process_picks',
  'order_paths',
  'category_grid',
  'featured_collections',
  'shop_all_preview',
  'future_products_notify',
  'fresh_from_forge',
  'materials_teaser',
  'process_strip',
  'custom_order_pitch',
  'testimonials',
  'faq_preview',
  'newsletter',
  'resources_teaser',
] as const

type SectionKey = (typeof SECTION_ORDER)[number]
type TileKey = 'quick_picks' | 'process_picks'
const TILE_KEYS = new Set<string>(['quick_picks', 'process_picks'])

const SECTION_META: Record<SectionKey, { title: string; description: string }> = {
  hero:                 { title: 'Hero Banner',             description: 'Full-width hero at the very top of the page.' },
  hero_collage:         { title: 'Hero Collage',            description: 'Floating product image cards on the right side of the hero.' },
  quick_picks:          { title: 'Quick Picks',             description: '"What are you here for?!" — product shortcut tiles.' },
  process_picks:        { title: 'Process Picks',           description: '"How shall it be forged?" — shop-by-process tiles.' },
  order_paths:          { title: 'Order Paths',             description: 'Three-column cards: Browse, Custom Order, and Standard Shop.' },
  category_grid:        { title: 'Category Grid',           description: 'Grid of product categories from the catalog.' },
  featured_collections: { title: 'Featured Collections',    description: 'Curated collections — managed in the Catalog module.' },
  shop_all_preview:     { title: 'Shop All Preview',        description: 'Product grid card showing a configurable slice of the shop with filterable links to the full catalog.' },
  future_products_notify: { title: 'Future Products Notify', description: 'Call-to-action card that collects interest for upcoming products and links to the roadmap.' },
  fresh_from_forge:     { title: 'Fresh From the Forge',    description: 'Recent gallery work — managed in the Gallery module.' },
  materials_teaser:     { title: 'Materials Showcase',      description: 'Material cards driven by catalog taxonomy.' },
  process_strip:        { title: 'Process Strip',           description: 'Horizontal overview of how products are made.' },
  custom_order_pitch:   { title: 'Custom Order Pitch',      description: 'Call-to-action block for custom requests.' },
  testimonials:         { title: 'Testimonials',            description: 'Customer quotes — managed in the Settings module.' },
  faq_preview:          { title: 'FAQ Preview',             description: 'Frequently asked questions snippet.' },
  newsletter:           { title: 'Newsletter Signup',       description: 'Email capture block.' },
  resources_teaser:     { title: 'Resources & Policies',    description: 'Links to policy and resource pages.' },
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShortcutItem {
  key: string
  label: string
  emoji: string
  href: string
  image_url: string
  gradient: string
  glow_color: string
  is_visible: boolean
  sort_order: number
}

interface TileSectionState {
  is_visible: boolean
  heading: string
  subheading: string
  items: ShortcutItem[]
}

// ─── Hero Collage Types ───────────────────────────────────────────────────────

interface HeroCollageImage {
  url: string
  alt: string
  href?: string
}

interface HeroCollageState {
  is_enabled: boolean
  is_visible: boolean
  image_count: number
  images: HeroCollageImage[]
}

interface ShopAllPreviewState {
  is_visible: boolean
  product_count: number
  show_filters: boolean
  heading: string
  subheading: string
}

interface FutureProductsNotifyState {
  is_visible: boolean
  heading: string
  subheading: string
  cta_label: string
}

const BLANK_ITEM = (): ShortcutItem => ({
  key: `item_${Date.now()}`,
  label: '',
  emoji: '✨',
  href: '/',
  image_url: '',
  gradient: `linear-gradient(135deg, ${brandTokens.bgSurface} 0%, ${brandTokens.bgVoid} 100%)`,
  glow_color: brandTokens.forgeGold,
  is_visible: true,
  sort_order: 0,
})

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminHomepagePage() {
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})
  const [tileSections, setTileSections] = useState<Record<TileKey, TileSectionState> | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingVisibility, setSavingVisibility] = useState(false)
  const [savingTile, setSavingTile] = useState<TileKey | null>(null)
  const [visibilityMessage, setVisibilityMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [tileMessages, setTileMessages] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({})

  // ── Hero Collage State ─────────────────────────────────────────────────────
  const [heroCollage, setHeroCollage] = useState<HeroCollageState>({
    is_enabled: true,
    is_visible: true,
    image_count: 4,
    images: [
      { url: '', alt: '' },
      { url: '', alt: '' },
      { url: '', alt: '' },
      { url: '', alt: '' },
      { url: '', alt: '' },
      { url: '', alt: '' },
    ],
  })
  const [savingCollage, setSavingCollage] = useState(false)
  const [collageMessage, setCollageMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [shopAllPreview, setShopAllPreview] = useState<ShopAllPreviewState>({
    is_visible: true,
    product_count: 6,
    show_filters: true,
    heading: 'Shop All Products',
    subheading: '',
  })
  const [savingShopAllPreview, setSavingShopAllPreview] = useState(false)
  const [shopAllPreviewMessage, setShopAllPreviewMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [futureProductsNotify, setFutureProductsNotify] = useState<FutureProductsNotifyState>({
    is_visible: true,
    heading: 'Want early access?',
    subheading: 'Share your email and idea so we can keep you posted on future drops.',
    cta_label: 'Notify me',
  })
  const [savingFutureProductsNotify, setSavingFutureProductsNotify] = useState(false)
  const [futureProductsNotifyMessage, setFutureProductsNotifyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/homepage/sections')
        if (!res.ok) throw new Error('Failed to load')
        const { sections: raw } = await res.json() as {
          sections: Record<string, { is_visible: boolean; content?: Record<string, unknown> }>
        }

        const vis: Record<string, boolean> = {}
        for (const key of SECTION_ORDER) vis[key] = raw[key]?.is_visible !== false
        setVisibility(vis)

        // Load hero collage config — always pad images to 6 slots for the editor
        const collageRaw = raw['hero_collage']
        if (collageRaw?.content) {
          const content = collageRaw.content as Record<string, unknown>
          const loadedImages = Array.isArray(content.images) ? content.images as HeroCollageImage[] : []
          // Pad to 6 slots so admin always sees all URL fields
          const paddedImages = Array.from({ length: 6 }, (_, i) =>
            i < loadedImages.length
              ? loadedImages[i]
              : { url: '', alt: '' }
          )
          setHeroCollage({
            is_enabled: content.is_enabled !== false,
            is_visible: collageRaw.is_visible !== false,
            image_count: typeof content.image_count === 'number' ? content.image_count : 4,
            images: paddedImages,
          })
        }

        const shopAllRaw = raw['shop_all_preview']
        if (shopAllRaw?.content) {
          const content = shopAllRaw.content as Record<string, unknown>
          setShopAllPreview({
            is_visible: shopAllRaw.is_visible !== false,
            product_count: typeof content.product_count === 'number' ? content.product_count : 6,
            show_filters: content.show_filters !== false,
            heading: typeof content.heading === 'string' ? content.heading : 'Shop All Products',
            subheading: typeof content.subheading === 'string' ? content.subheading : '',
          })
        }

        const futureProductsNotifyRaw = raw['future_products_notify']
        if (futureProductsNotifyRaw?.content) {
          const content = futureProductsNotifyRaw.content as Record<string, unknown>
          setFutureProductsNotify({
            is_visible: futureProductsNotifyRaw.is_visible !== false,
            heading: typeof content.heading === 'string' ? content.heading : 'Want early access?',
            subheading: typeof content.subheading === 'string' ? content.subheading : 'Share your email and idea so we can keep you posted on future drops.',
            cta_label: typeof content.cta_label === 'string' ? content.cta_label : 'Notify me',
          })
        }

        const tiles = {} as Record<TileKey, TileSectionState>
        for (const key of ['quick_picks', 'process_picks'] as TileKey[]) {
          const row = raw[key]
          tiles[key] = {
            is_visible: row?.is_visible !== false,
            heading: typeof row?.content?.heading === 'string' ? row.content.heading : '',
            subheading: typeof row?.content?.subheading === 'string' ? row.content.subheading : '',
            items: (Array.isArray(row?.content?.items) ? row.content.items as ShortcutItem[] : []).map(
              (item, i) => ({
                key: item.key ?? `item_${i}`,
                label: item.label ?? '',
                emoji: item.emoji ?? '✨',
                href: item.href ?? '/',
                image_url: typeof item.image_url === 'string' ? item.image_url : '',
                gradient: item.gradient ?? `linear-gradient(135deg, ${brandTokens.bgSurface} 0%, ${brandTokens.bgVoid} 100%)`,
                glow_color: item.glow_color ?? brandTokens.forgeGold,
                is_visible: item.is_visible !== false,
                sort_order: typeof item.sort_order === 'number' ? item.sort_order : i,
              })
            ),
          }
        }
        setTileSections(tiles)
      } catch {
        setVisibilityMessage({ type: 'error', text: 'Failed to load homepage sections.' })
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function handleSaveVisibility() {
    setSavingVisibility(true)
    setVisibilityMessage(null)
    try {
      const res = await fetch('/api/admin/homepage/sections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections: SECTION_ORDER.map((key) => ({ key, is_visible: visibility[key] !== false })),
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Save failed.')
      setVisibilityMessage({ type: 'success', text: 'Section visibility saved.' })
      setTimeout(() => setVisibilityMessage(null), 3500)
    } catch (err) {
      setVisibilityMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed.' })
    } finally {
      setSavingVisibility(false)
    }
  }

  const setTileSection = useCallback(
    (key: TileKey, updater: (prev: TileSectionState) => TileSectionState) => {
      setTileSections((prev) => {
        if (!prev) return prev
        return { ...prev, [key]: updater(prev[key]) }
      })
    },
    []
  )

  async function handleSaveCollage() {
    setSavingCollage(true)
    setCollageMessage(null)
    try {
      const res = await fetch('/api/admin/homepage/sections/hero_collage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_enabled: heroCollage.is_enabled,
          is_visible: heroCollage.is_visible,
          image_count: heroCollage.image_count,
          images: heroCollage.images,
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Save failed.')
      setCollageMessage({ type: 'success', text: 'Hero collage settings saved.' })
      setVisibility((prev) => ({ ...prev, hero_collage: heroCollage.is_visible }))
      setTimeout(() => setCollageMessage(null), 3500)
    } catch (err) {
      setCollageMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed.' })
    } finally {
      setSavingCollage(false)
    }
  }

  async function handleSaveShopAllPreview() {
    setSavingShopAllPreview(true)
    setShopAllPreviewMessage(null)
    try {
      const res = await fetch('/api/admin/homepage/sections/shop_all_preview', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_visible: shopAllPreview.is_visible,
          product_count: shopAllPreview.product_count,
          show_filters: shopAllPreview.show_filters,
          heading: shopAllPreview.heading,
          subheading: shopAllPreview.subheading,
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Save failed.')
      setShopAllPreviewMessage({ type: 'success', text: 'Shop All Preview saved.' })
      setVisibility((prev) => ({ ...prev, shop_all_preview: shopAllPreview.is_visible }))
      setTimeout(() => setShopAllPreviewMessage(null), 3500)
    } catch (err) {
      setShopAllPreviewMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed.' })
    } finally {
      setSavingShopAllPreview(false)
    }
  }

  async function handleSaveFutureProductsNotify() {
    setSavingFutureProductsNotify(true)
    setFutureProductsNotifyMessage(null)
    try {
      const res = await fetch('/api/admin/homepage/sections/future_products_notify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_visible: futureProductsNotify.is_visible,
          heading: futureProductsNotify.heading,
          subheading: futureProductsNotify.subheading,
          cta_label: futureProductsNotify.cta_label,
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Save failed.')
      setFutureProductsNotifyMessage({ type: 'success', text: 'Future Products Notify card saved.' })
      setVisibility((prev) => ({ ...prev, future_products_notify: futureProductsNotify.is_visible }))
      setTimeout(() => setFutureProductsNotifyMessage(null), 3500)
    } catch (err) {
      setFutureProductsNotifyMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed.' })
    } finally {
      setSavingFutureProductsNotify(false)
    }
  }

  async function handleSaveTile(key: TileKey) {
    if (!tileSections) return
    const sec = tileSections[key]
    setSavingTile(key)
    setTileMessages((prev) => ({ ...prev, [key]: undefined as unknown as { type: 'success' | 'error'; text: string } }))
    try {
      const res = await fetch(`/api/admin/homepage/sections/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heading: sec.heading,
          subheading: sec.subheading,
          is_visible: sec.is_visible,
          items: sec.items.map((item, i) => ({ ...item, sort_order: i })),
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Save failed.')
      setTileMessages((prev) => ({ ...prev, [key]: { type: 'success', text: 'Section saved!' } }))
      setVisibility((prev) => ({ ...prev, [key]: sec.is_visible }))
      setTimeout(
        () => setTileMessages((prev) => ({ ...prev, [key]: undefined as unknown as { type: 'success' | 'error'; text: string } })),
        3500
      )
    } catch (err) {
      setTileMessages((prev) => ({
        ...prev,
        [key]: { type: 'error', text: err instanceof Error ? err.message : 'Save failed.' },
      }))
    } finally {
      setSavingTile(null)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'grid', gap: 4 }}>
      <Box>
        <Typography variant="h4" component="h1" sx={{ mb: 0.5 }}>
          Homepage
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.6) }}>
          Control which sections appear on the storefront homepage, and configure the shortcut tile editors below.
        </Typography>
      </Box>

      {/* ── Section Visibility Panel ──────────────────────────────────────── */}
      <Box
        sx={{
          border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
          borderRadius: 2,
          p: { xs: 2.5, md: 3 },
          background: alpha(brandTokens.bgSurface, 0.5),
        }}
      >
        <Typography variant="h6" sx={{ mb: 0.4 }}>
          Section Visibility
        </Typography>
        <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.55), mb: 3 }}>
          Toggle which sections appear on the homepage. Sections driven by their own data (gallery, collections, testimonials) must also have published content to show anything.
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
            gap: 1.2,
            mb: 3,
          }}
        >
          {SECTION_ORDER.map((key) => {
            const meta = SECTION_META[key]
            const isTile = TILE_KEYS.has(key)
            const on = visibility[key] !== false
            return (
              <Box
                key={key}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  border: `1px solid ${alpha(brandTokens.parchment, on ? 0.12 : 0.06)}`,
                  borderRadius: 1.5,
                  px: 1.6,
                  py: 1.1,
                  background: alpha(brandTokens.bgVoid, on ? 0.0 : 0.3),
                  transition: 'background 0.2s',
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: on ? brandTokens.parchment : alpha(brandTokens.parchment, 0.45),
                    }}
                  >
                    {meta.title}
                    {isTile && (
                      <Typography
                        component="span"
                        sx={{ ml: 0.8, fontSize: '0.68rem', color: alpha(brandTokens.forgeGold, 0.8), fontWeight: 400 }}
                      >
                        tile editor ↓
                      </Typography>
                    )}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '0.72rem',
                      color: alpha(brandTokens.parchment, on ? 0.48 : 0.3),
                      mt: 0.1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {meta.description}
                  </Typography>
                </Box>
                <Switch
                  size="small"
                  checked={on}
                  onChange={(e) => setVisibility((prev) => ({ ...prev, [key]: e.target.checked }))}
                  sx={{ flexShrink: 0 }}
                />
              </Box>
            )
          })}
        </Box>

        {visibilityMessage && (
          <Alert severity={visibilityMessage.type} sx={{ mb: 2 }}>
            {visibilityMessage.text}
          </Alert>
        )}

        <Button
          variant="contained"
          startIcon={savingVisibility ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />}
          onClick={() => void handleSaveVisibility()}
          disabled={savingVisibility}
        >
          Save Visibility
        </Button>
      </Box>

      {/* ── Hero Collage Editor ───────────────────────────────────────────── */}
      <Box
        sx={{
          border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
          borderRadius: 2,
          p: { xs: 2.5, md: 3 },
          background: alpha(brandTokens.bgSurface, 0.5),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3, gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h6" sx={{ mb: 0.25, display: 'flex', alignItems: 'center', gap: 1 }}>
              <AutoFixHighIcon sx={{ fontSize: '1.2rem', color: 'primary.main' }} />
              Hero Collage
            </Typography>
            <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.55) }}>
              Floating product image cards on the right side of the hero section. Configure images, toggle visibility, and set how many to display.
            </Typography>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={heroCollage.is_enabled}
                onChange={(e) => setHeroCollage((prev) => ({ ...prev, is_enabled: e.target.checked }))}
                size="small"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="body2" sx={{ color: heroCollage.is_enabled ? 'primary.main' : alpha(brandTokens.parchment, 0.4) }}>
                  {heroCollage.is_enabled ? 'Enabled' : 'Disabled'}
                </Typography>
              </Box>
            }
            labelPlacement="start"
          />
        </Box>

        <Stack spacing={2} sx={{ mb: 3 }}>
          <TextField
            size="small"
            type="number"
            label="Number of images to display (1–6)"
            value={heroCollage.image_count}
            onChange={(e) => {
              const val = Math.min(6, Math.max(1, Number(e.target.value) || 1))
              setHeroCollage((prev) => ({ ...prev, image_count: val }))
            }}
            inputProps={{ min: 1, max: 6 }}
            sx={{ width: 260 }}
          />
        </Stack>

        <Divider sx={{ mb: 3, borderColor: alpha(brandTokens.parchment, 0.08) }} />

        <Typography variant="overline" sx={{ color: 'primary.main', display: 'block', mb: 2 }}>
          Image URLs ({heroCollage.images.length})
        </Typography>

        <Stack spacing={2} sx={{ mb: 2 }}>
          {heroCollage.images.map((image, index) => (
            <Box
              key={index}
              sx={{
                border: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
                borderRadius: 1.5,
                p: 2,
                background: alpha(brandTokens.bgVoid, 0.4),
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, color: alpha(brandTokens.parchment, 0.6), mb: 1.5 }}>
                Image {index + 1}
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                <TextField
                  size="small"
                  label="Image URL"
                  value={image.url}
                  onChange={(e) => {
                    const newImages = [...heroCollage.images]
                    newImages[index] = { ...newImages[index], url: e.target.value }
                    setHeroCollage((prev) => ({ ...prev, images: newImages }))
                  }}
                  placeholder="https://example.com/image.jpg"
                  inputProps={{ maxLength: 500 }}
                />
<TextField
                  size="small"
                  label="Alt text"
                  value={image.alt}
                  onChange={(e) => {
                    const newImages = [...heroCollage.images]
                    newImages[index] = { ...newImages[index], alt: e.target.value }
                    setHeroCollage((prev) => ({ ...prev, images: newImages }))
                  }}
                  placeholder="Engraved tumbler"
                  inputProps={{ maxLength: 200 }}
                />
                <TextField
                  size="small"
                  label="Link URL (optional)"
                  value={image.href}
                  onChange={(e) => {
                    const newImages = [...heroCollage.images]
                    newImages[index] = { ...newImages[index], href: e.target.value }
                    setHeroCollage((prev) => ({ ...prev, images: newImages }))
                  }}
                  placeholder="/shop/all?process=sublimation"
                  inputProps={{ maxLength: 200 }}
                />
              </Box>
            </Box>
          ))}
        </Stack>

        <Divider sx={{ mb: 2.5, borderColor: alpha(brandTokens.parchment, 0.08) }} />

        {collageMessage && <Alert severity={collageMessage.type} sx={{ mb: 2 }}>{collageMessage.text}</Alert>}

        <Button
          variant="contained"
          startIcon={savingCollage ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />}
          onClick={() => void handleSaveCollage()}
          disabled={savingCollage}
        >
          Save Collage Settings
        </Button>
      </Box>

      {/* ── Tile Section Editors ──────────────────────────────────────────── */}
      <Box>
        <Typography variant="h6" sx={{ mb: 0.4 }}>
          Shortcut Tile Editors
        </Typography>
        <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.55), mb: 0 }}>
          Configure the heading, subheading, and individual tiles for the two shortcut sections. Saving here also syncs the visibility toggle above.
        </Typography>
      </Box>

      {tileSections &&
        (['quick_picks', 'process_picks'] as TileKey[]).map((key) => (
          <TileSectionEditor
            key={key}
            section={tileSections[key]}
            meta={SECTION_META[key]}
            saving={savingTile === key}
            message={tileMessages[key]}
            onChange={(updater) => setTileSection(key, updater)}
            onSave={() => void handleSaveTile(key)}
          />
        ))}
    </Box>
  )
}

// ─── Tile section editor ──────────────────────────────────────────────────────

interface TileSectionEditorProps {
  section: TileSectionState
  meta: { title: string; description: string }
  saving: boolean
  message: { type: 'success' | 'error'; text: string } | undefined
  onChange: (updater: (prev: TileSectionState) => TileSectionState) => void
  onSave: () => void
}

function TileSectionEditor({ section, meta, saving, message, onChange, onSave }: TileSectionEditorProps) {
  const updateItem = (index: number, field: keyof ShortcutItem, value: string | boolean | number) => {
    onChange((prev) => {
      const items = [...prev.items]
      items[index] = { ...items[index], [field]: value }
      return { ...prev, items }
    })
  }

  const addItem = () =>
    onChange((prev) => ({
      ...prev,
      items: [...prev.items, { ...BLANK_ITEM(), sort_order: prev.items.length }],
    }))

  const removeItem = (index: number) =>
    onChange((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }))

  const moveItem = (index: number, direction: 'up' | 'down') => {
    onChange((prev) => {
      const items = [...prev.items]
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= items.length) return prev
      ;[items[index], items[target]] = [items[target], items[index]]
      return { ...prev, items }
    })
  }

  return (
    <Box
      sx={{
        border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
        borderRadius: 2,
        p: { xs: 2.5, md: 3 },
        background: alpha(brandTokens.bgSurface, 0.5),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h6" sx={{ mb: 0.25 }}>{meta.title}</Typography>
          <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.55) }}>{meta.description}</Typography>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={section.is_visible}
              onChange={(e) => onChange((prev) => ({ ...prev, is_visible: e.target.checked }))}
              size="small"
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {section.is_visible ? (
                <VisibilityOutlinedIcon sx={{ fontSize: '1rem', color: 'primary.main' }} />
              ) : (
                <VisibilityOffOutlinedIcon sx={{ fontSize: '1rem', color: alpha(brandTokens.parchment, 0.4) }} />
              )}
              <Typography variant="body2" sx={{ color: section.is_visible ? 'primary.main' : alpha(brandTokens.parchment, 0.4) }}>
                {section.is_visible ? 'Visible' : 'Hidden'}
              </Typography>
            </Box>
          }
          labelPlacement="start"
        />
      </Box>

      <Stack spacing={2} sx={{ mb: 3 }}>
        <TextField
          label="Section heading"
          value={section.heading}
          onChange={(e) => onChange((prev) => ({ ...prev, heading: e.target.value }))}
          fullWidth
          size="small"
          inputProps={{ maxLength: 100 }}
        />
        <TextField
          label="Subheading (optional)"
          value={section.subheading}
          onChange={(e) => onChange((prev) => ({ ...prev, subheading: e.target.value }))}
          fullWidth
          size="small"
          inputProps={{ maxLength: 200 }}
        />
      </Stack>

      <Divider sx={{ mb: 3, borderColor: alpha(brandTokens.parchment, 0.08) }} />

      <Typography variant="overline" sx={{ color: 'primary.main', display: 'block', mb: 2 }}>
        Tiles ({section.items.length})
      </Typography>

      <Stack spacing={2} sx={{ mb: 2 }}>
        {section.items.map((item, index) => (
          <TileEditor
            key={item.key}
            item={item}
            index={index}
            total={section.items.length}
            onChange={(field, value) => updateItem(index, field, value)}
            onRemove={() => removeItem(index)}
            onMove={(dir) => moveItem(index, dir)}
          />
        ))}
      </Stack>

      <Button startIcon={<AddIcon />} size="small" variant="outlined" onClick={addItem} sx={{ mb: 3 }}>
        Add tile
      </Button>

      <Divider sx={{ mb: 2.5, borderColor: alpha(brandTokens.parchment, 0.08) }} />

      {message && <Alert severity={message.type} sx={{ mb: 2 }}>{message.text}</Alert>}

      <Button
        variant="contained"
        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />}
        onClick={onSave}
        disabled={saving}
      >
        Save section
      </Button>
    </Box>
  )
}

// ─── Single tile editor row ───────────────────────────────────────────────────

interface TileEditorProps {
  item: ShortcutItem
  index: number
  total: number
  onChange: (field: keyof ShortcutItem, value: string | boolean | number) => void
  onRemove: () => void
  onMove: (direction: 'up' | 'down') => void
}

function TileEditor({ item, index, total, onChange, onRemove, onMove }: TileEditorProps) {
  return (
    <Box
      sx={{
        border: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
        borderRadius: 1.5,
        p: 2,
        background: alpha(brandTokens.bgVoid, 0.4),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: alpha(brandTokens.parchment, 0.6) }}>
          Tile {index + 1}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Move up">
            <span>
              <IconButton size="small" disabled={index === 0} onClick={() => onMove('up')}>
                <ArrowUpwardIcon sx={{ fontSize: '1rem' }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Move down">
            <span>
              <IconButton size="small" disabled={index === total - 1} onClick={() => onMove('down')}>
                <ArrowDownwardIcon sx={{ fontSize: '1rem' }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={item.is_visible ? 'Hide tile' : 'Show tile'}>
            <IconButton size="small" onClick={() => onChange('is_visible', !item.is_visible)}>
              {item.is_visible ? (
                <VisibilityOutlinedIcon sx={{ fontSize: '1rem', color: 'primary.main' }} />
              ) : (
                <VisibilityOffOutlinedIcon sx={{ fontSize: '1rem', color: alpha(brandTokens.parchment, 0.4) }} />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip title="Remove tile">
            <IconButton size="small" color="error" onClick={onRemove}>
              <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        <TextField
          label="Emoji"
          value={item.emoji}
          onChange={(e) => onChange('emoji', e.target.value)}
          size="small"
          inputProps={{ maxLength: 8 }}
        />
        <TextField
          label="Label"
          value={item.label}
          onChange={(e) => onChange('label', e.target.value)}
          size="small"
          inputProps={{ maxLength: 60 }}
        />
        <TextField
          label="Link (href)"
          value={item.href}
          onChange={(e) => onChange('href', e.target.value)}
          size="small"
          placeholder="/shop/all?process=sublimation"
          inputProps={{ maxLength: 200 }}
        />
        <TextField
          label="Glow colour (hex)"
          value={item.glow_color}
          onChange={(e) => onChange('glow_color', e.target.value)}
          size="small"
          inputProps={{ maxLength: 30 }}
        />
        <TextField
          label="Gradient (CSS)"
          value={item.gradient}
          onChange={(e) => onChange('gradient', e.target.value)}
          size="small"
          sx={{ gridColumn: { sm: 'span 2' } }}
          inputProps={{ maxLength: 300 }}
        />
        <Box sx={{ gridColumn: { sm: 'span 2' }, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            label="Image URL (optional — replaces emoji)"
            value={item.image_url}
            onChange={(e) => onChange('image_url', e.target.value)}
            size="small"
            fullWidth
            placeholder="https://example.com/tile-image.jpg"
            inputProps={{ maxLength: 500 }}
          />
          <Button
            variant="outlined"
            size="small"
            component="label"
            sx={{ flexShrink: 0, mt: 0.5 }}
            startIcon={<ImageIcon />}
          >
            Upload
            <input
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const formData = new FormData()
                formData.set('file', file)
                try {
                  const res = await fetch('/api/admin/homepage/upload', {
                    method: 'POST',
                    body: formData,
                  })
                  const data = await res.json() as { url?: string; error?: string }
                  if (!res.ok) throw new Error(data.error ?? 'Upload failed.')
                  onChange('image_url', data.url ?? '')
                } catch (err) {
                  console.error('Tile image upload failed:', err)
                }
                // Reset so the same file can be re-selected
                e.target.value = ''
              }}
            />
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
