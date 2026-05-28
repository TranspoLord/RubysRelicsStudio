import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import { alpha } from '@mui/material/styles'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { getProductBySlug, getProductsByCategory, getRecommendedProducts } from '@/lib/supabase/queries/products'
import { ProductConfigurator } from '@/components/shop/ProductConfigurator'
import { ProductMediaGallery } from '@/components/shop/ProductMediaGallery'
import { RecommendationRail } from '@/components/shop/RecommendationRail'
import { brandTokens } from '@/theme/theme'

export const dynamic = 'force-dynamic'

// ─── Metadata ─────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ slug: string; productSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { productSlug } = await params
  const product = await getProductBySlug(productSlug)

  if (!product) return { title: 'Product Not Found' }

  return {
    title: product.seo_title ?? product.title,
    description:
      product.seo_description ??
      product.short_description ??
      `${product.title} — custom laser engraved or sublimated by Ruby's Relics Studio.`,
    openGraph: {
      title: `${product.title} | Ruby's Relics Studio`,
      description: product.short_description ?? undefined,
    },
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ProductDetailPage({ params }: Props) {
  const { slug, productSlug } = await params

  // Fetch product detail and category info in parallel
  const [product, categoryData] = await Promise.all([
    getProductBySlug(productSlug),
    getProductsByCategory(slug),
  ])

  if (!product) notFound()

  const category = categoryData.category
  const recommendations = await getRecommendedProducts(
    product.id,
    product.category_key,
    product.base_price,
    product.is_ready_made,
    product.is_customizable,
    4
  )
  const featuredMedia = product.media.find((m) => m.is_featured) ?? product.media[0] ?? null
  const cardGradient =
    featuredMedia?.gradient ??
    product.category_gradient ??
    `linear-gradient(135deg, ${brandTokens.bgSurface} 0%, ${brandTokens.bgVoid} 100%)`

  return (
    <>
      <Header currentPath={`/shop/categories/${slug}/${productSlug}`} />
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Shop', href: '/shop' },
          { label: category?.display_name ?? 'Category', href: `/shop/categories/${slug}` },
          { label: product.title },
        ]}
      />

      <Box component="main" id="main-content">
        <Container maxWidth="lg" sx={{ py: { xs: 4, md: 7 } }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: { xs: 4, md: 6 },
              alignItems: 'start',
            }}
          >
            {/* ── Left: Image / gallery ───────────────────────────────── */}
            <Box>
              <ProductMediaGallery
                productTitle={product.title}
                media={product.media}
                fallbackGradient={cardGradient}
                fallbackEmoji={category?.emoji ?? '✨'}
              />

              {/* Production + trust messaging (desktop: below image) */}
              <Box
                sx={{
                  mt: 3,
                  p: 2.5,
                  borderRadius: 2,
                  background: alpha(brandTokens.bgSurface, 0.7),
                  border: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
                  display: { xs: 'none', md: 'block' },
                }}
              >
                <ProductTrustBlock
                  estimateBand={product.production_estimate_band}
                />
              </Box>
            </Box>

            {/* ── Right: Info + configurator ──────────────────────────── */}
            <Box>
              {/* Type badges */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                {product.is_customizable && (
                  <Chip
                    label="Customizable"
                    size="small"
                    sx={{
                      backgroundColor: alpha(brandTokens.forgeGold, 0.12),
                      color: brandTokens.forgeGold,
                      border: `1px solid ${alpha(brandTokens.forgeGold, 0.25)}`,
                      fontWeight: 600,
                    }}
                  />
                )}
                {product.is_ready_made && (
                  <Chip
                    label="Ready-Made"
                    size="small"
                    sx={{
                      backgroundColor: alpha('#5A9A3A', 0.12),
                      color: '#5A9A3A',
                      border: `1px solid ${alpha('#5A9A3A', 0.25)}`,
                      fontWeight: 600,
                    }}
                  />
                )}
              </Box>

              <Typography variant="h1" component="h1" sx={{ mb: 1 }}>
                {product.title}
              </Typography>

              {product.short_description && (
                <Typography
                  variant="body1"
                  sx={{ color: alpha(brandTokens.parchment, 0.7), mb: 2.5 }}
                >
                  {product.short_description}
                </Typography>
              )}

              {/* Price */}
              <Box sx={{ mb: 3 }}>
                <Typography
                  variant="caption"
                  sx={{ color: alpha(brandTokens.parchment, 0.4), display: 'block', mb: 0.25 }}
                >
                  Starting from
                </Typography>
                <Typography
                  sx={{
                    fontFamily: 'var(--font-cinzel, serif)',
                    fontWeight: 700,
                    fontSize: '2rem',
                    color: brandTokens.parchment,
                  }}
                >
                  ${product.base_price.toFixed(2)}
                </Typography>
              </Box>

              <Divider sx={{ borderColor: alpha(brandTokens.parchment, 0.08), mb: 3 }} />

              {/* Configurator (client component) */}
              <ProductConfigurator product={product} />

              {/* Production + trust messaging (mobile: below configurator) */}
              <Box
                sx={{
                  mt: 3,
                  p: 2.5,
                  borderRadius: 2,
                  background: alpha(brandTokens.bgSurface, 0.7),
                  border: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
                  display: { xs: 'block', md: 'none' },
                }}
              >
                <ProductTrustBlock
                  estimateBand={product.production_estimate_band}
                />
              </Box>
            </Box>
          </Box>

          {/* ── Full description ───────────────────────────────────────── */}
          {product.description && product.description !== product.short_description && (
            <Box
              sx={{
                mt: { xs: 5, md: 8 },
                pt: { xs: 4, md: 6 },
                borderTop: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
              }}
            >
              <Typography variant="h3" component="h2" gutterBottom>
                About This Product
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  color: alpha(brandTokens.parchment, 0.75),
                  maxWidth: 720,
                  lineHeight: 1.8,
                  whiteSpace: 'pre-line',
                }}
              >
                {product.description}
              </Typography>
            </Box>
          )}

          <RecommendationRail
            currentProductId={product.id}
            fallbackCategorySlug={slug}
            algorithm="v2-score-category-price-path"
            items={recommendations}
          />
        </Container>
      </Box>

      <Footer />
    </>
  )
}

// ─── Trust / production block ─────────────────────────────────────────────────

interface TrustBlockProps {
  estimateBand: string
}

function ProductTrustBlock({ estimateBand }: TrustBlockProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <AccessTimeIcon sx={{ fontSize: 18, color: brandTokens.forgeGold, flexShrink: 0, mt: 0.1 }} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.1 }}>
            Production time
          </Typography>
          <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.55) }}>
            {estimateBand} after order confirmation
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <VerifiedOutlinedIcon sx={{ fontSize: 18, color: '#5A9A3A', flexShrink: 0, mt: 0.1 }} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.1 }}>
            Quality review
          </Typography>
          <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.55) }}>
            Every piece is inspected before it ships
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <InfoOutlinedIcon sx={{ fontSize: 18, color: alpha(brandTokens.parchment, 0.4), flexShrink: 0, mt: 0.1 }} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.1 }}>
            Made to order
          </Typography>
          <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.55) }}>
            One-dragon studio — nothing sits in a warehouse
          </Typography>
        </Box>
      </Box>

    </Box>
  )
}
