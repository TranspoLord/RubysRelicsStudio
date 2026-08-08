'use client'

import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import FormControlLabel from '@mui/material/FormControlLabel'
import Link from 'next/link'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import type { DbProduct } from '@/lib/supabase/queries/products'
import type { TaxonomyEntry } from '@/types'
import { brandTokens } from '@/theme/theme'
import { filterProductsForShopAll } from '@/lib/catalog/filters'

interface HomepageProductGridProps {
  products: DbProduct[]
  categories: TaxonomyEntry[]
  content: Record<string, unknown> | null | undefined
  sectionKey: string
}

export function HomepageProductGrid({ products, categories, content, sectionKey }: HomepageProductGridProps) {
  const productCount = typeof content?.product_count === 'number' ? content.product_count : 6
  const showFilters = content?.show_filters !== false
  const heading = typeof content?.heading === 'string' && content.heading.trim() ? content.heading : 'Shop All Products'
  const subheading = typeof content?.subheading === 'string' ? content.subheading : ''

  const [category, setCategory] = useState('all')
  const [priceMin, setPriceMin] = useState(0)
  const [priceMax, setPriceMax] = useState(0)
  const [showReadyMade, setShowReadyMade] = useState(true)
  const [showCustomizable, setShowCustomizable] = useState(true)
  const [search, setSearch] = useState('')

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>()
    const options: TaxonomyEntry[] = []
    for (const categoryEntry of categories) {
      if (seen.has(categoryEntry.key)) continue
      seen.add(categoryEntry.key)
      options.push(categoryEntry)
    }
    return options
  }, [categories])

  const minPrice = useMemo(() => Math.min(0, ...products.map((product) => product.base_price)), [products])
  const maxPrice = useMemo(() => Math.max(0, ...products.map((product) => product.base_price)), [products])

  const filteredProducts = useMemo(() => {
    const priceRange = {
      priceMin: priceMin || undefined,
      priceMax: priceMax || undefined,
    }

    const filtered = filterProductsForShopAll(products, {
      category: category === 'all' ? undefined : category,
      priceMin: priceRange.priceMin,
      priceMax: priceRange.priceMax,
      showReadyMade,
      showCustomizable,
      search,
    })

    return filtered.slice(0, productCount)
  }, [category, priceMax, priceMin, productCount, products, search, showCustomizable, showReadyMade])

  const buildViewAllUrl = () => {
    const params = new URLSearchParams()
    if (category !== 'all') params.set('category', category)
    if (priceMin > minPrice) params.set('price_min', String(priceMin))
    if (priceMax < maxPrice) params.set('price_max', String(priceMax))
    if (!showReadyMade) params.set('ready_made', 'false')
    if (!showCustomizable) params.set('customizable', 'false')
    if (search) params.set('search', search)
    const query = params.toString()
    return `/shop/all${query ? `?${query}` : ''}`
  }

  if (!products.length) return null

  return (
    <Box component="section" aria-labelledby={`${sectionKey}-heading`} sx={{ py: { xs: 6, md: 8 }, borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.06)}` }}>
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', gap: 3, mb: 4 }}>
          <Box sx={{ maxWidth: 620 }}>
            <Typography variant="overline" sx={{ color: brandTokens.forgeGold, display: 'block', mb: 1 }}>
              Shop preview
            </Typography>
            <Typography id={`${sectionKey}-heading`} variant="h2" component="h2" sx={{ mb: 1 }}>
              {heading}
            </Typography>
            {subheading && (
              <Typography variant="body1" sx={{ color: alpha(brandTokens.parchment, 0.62) }}>
                {subheading}
              </Typography>
            )}
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Chip component={Link} href={buildViewAllUrl()} label="View All" clickable sx={{ borderRadius: '999px', px: 1.5, py: 0.7, backgroundColor: alpha(brandTokens.forgeGold, 0.16), color: brandTokens.forgeGold }} />
            <Chip component={Link} href="/future-products" label="Future Products" clickable sx={{ borderRadius: '999px', px: 1.5, py: 0.7, backgroundColor: alpha(brandTokens.bgSurface, 0.7), color: brandTokens.parchment }} />
          </Stack>
        </Box>

        {showFilters && (
          <Box sx={{ mb: 4, p: { xs: 2, md: 3 }, borderRadius: 2, backgroundColor: alpha(brandTokens.bgSurface, 0.7), border: `1px solid ${alpha(brandTokens.parchment, 0.08)}` }}>
            <Stack spacing={2}>
              <TextField
                label="Search products"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                size="small"
                fullWidth
              />
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  select
                  SelectProps={{ native: true }}
                  label="Category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  size="small"
                  sx={{ minWidth: 210 }}
                >
                  <option value="all">All categories</option>
                  {categoryOptions.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {entry.display_name}
                    </option>
                  ))}
                </TextField>
                <TextField
                  label="Min price"
                  type="number"
                  value={priceMin}
                  onChange={(event) => setPriceMin(Number(event.target.value))}
                  size="small"
                  inputProps={{ min: 0 }}
                />
                <TextField
                  label="Max price"
                  type="number"
                  value={priceMax}
                  onChange={(event) => setPriceMax(Number(event.target.value))}
                  size="small"
                  inputProps={{ min: 0 }}
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <FormControlLabel control={<Switch checked={showReadyMade} onChange={() => setShowReadyMade((value) => !value)} />} label="Show ready-made" />
                <FormControlLabel control={<Switch checked={showCustomizable} onChange={() => setShowCustomizable((value) => !value)} />} label="Show customizable" />
              </Stack>
            </Stack>
          </Box>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: { xs: 2.5, md: 3 } }}>
          {filteredProducts.map((product) => {
            const media = product.featured_media
            const cardGradient = media?.gradient ?? product.category_gradient ?? `linear-gradient(135deg, ${brandTokens.bgSurface} 0%, ${brandTokens.bgVoid} 100%)`
            const categorySlug = product.category_slug
            const href = categorySlug ? `/shop/categories/${categorySlug}/${product.slug}` : '/shop'

            return (
              <Box key={product.id} component={Link} href={href} sx={{ display: 'flex', flexDirection: 'column', background: brandTokens.bgSurface, border: `1px solid ${alpha(brandTokens.parchment, 0.08)}`, borderRadius: 2, overflow: 'hidden', textDecoration: 'none', color: 'inherit' }}>
                <Box sx={{ aspectRatio: '4/3', background: cardGradient, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                  {media?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={media.url} alt={media.alt || product.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Typography aria-hidden="true" sx={{ fontSize: '3rem', opacity: 0.72 }}>
                      {media?.emoji ?? product.category_emoji ?? '✨'}
                    </Typography>
                  )}
                  {product.category_display_name && (
                    <Chip label={product.category_display_name} size="small" sx={{ position: 'absolute', top: 10, left: 10, backgroundColor: alpha(brandTokens.bgVoid, 0.9), color: alpha(brandTokens.parchment, 0.8) }} />
                  )}
                </Box>
                <Box sx={{ p: { xs: 2, md: 2.5 }, display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <Typography variant="h6" component="h3" sx={{ mb: 0.75 }}>
                    {product.title}
                  </Typography>
                  {product.short_description && (
                    <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.6), mb: 1.5, flex: 1 }}>
                      {product.short_description}
                    </Typography>
                  )}
                  <Typography variant="subtitle1" sx={{ color: brandTokens.forgeGold, fontWeight: 700 }}>
                    ${product.base_price.toFixed(2)}
                  </Typography>
                </Box>
              </Box>
            )
          })}
        </Box>
      </Container>
    </Box>
  )
}
