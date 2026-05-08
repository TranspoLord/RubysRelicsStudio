import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha } from '@mui/material/styles'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import TuneIcon from '@mui/icons-material/Tune'
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { getProductsByCategory } from '@/lib/supabase/queries/products'
import type { DbProduct } from '@/lib/supabase/queries/products'
import { brandTokens } from '@/theme/theme'

export const dynamic = 'force-dynamic'

// ─── Metadata ─────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const { category } = await getProductsByCategory(slug)

  if (!category) {
    return { title: 'Category Not Found' }
  }

  return {
    title: category.display_name,
    description: category.tagline ?? `Browse ${category.display_name} — handcrafted by Ruby's Relics Studio.`,
    openGraph: {
      title: `${category.display_name} | Ruby's Relics Studio`,
      description: category.tagline ?? undefined,
    },
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params
  const { category, products } = await getProductsByCategory(slug)

  if (!category) notFound()

  const customizableCount = products.filter((p) => p.is_customizable).length
  const readyMadeCount = products.filter((p) => p.is_ready_made).length

  return (
    <>
      <Header currentPath={`/shop/categories/${slug}`} />
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Shop', href: '/shop' },
          { label: category.display_name },
        ]}
      />

      <Box component="main" id="main-content">
        {/* ── Category hero ───────────────────────────────────────────── */}
        <Box
          sx={{
            background:
              category.gradient ??
              `linear-gradient(135deg, ${brandTokens.bgSurface} 0%, ${brandTokens.bgVoid} 100%)`,
            borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
            pt: { xs: 5, md: 7 },
            pb: { xs: 4, md: 6 },
          }}
        >
          <Container maxWidth="lg">
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, flexWrap: 'wrap' }}>
              {/* Emoji icon */}
              <Typography
                aria-hidden="true"
                sx={{ fontSize: { xs: '3rem', md: '4rem' }, lineHeight: 1, flexShrink: 0 }}
              >
                {category.emoji ?? '✨'}
              </Typography>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h1" component="h1" gutterBottom>
                  {category.display_name}
                </Typography>
                {category.tagline && (
                  <Typography
                    variant="body1"
                    sx={{ color: alpha(brandTokens.parchment, 0.7), mb: 2 }}
                  >
                    {category.tagline}
                  </Typography>
                )}

                {/* Product type pills */}
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 2 }}>
                  {customizableCount > 0 && (
                    <Chip
                      icon={<TuneIcon sx={{ fontSize: '0.9rem !important' }} />}
                      label={`${customizableCount} Customizable`}
                      size="small"
                      sx={{
                        backgroundColor: alpha(brandTokens.forgeGold, 0.12),
                        color: brandTokens.forgeGold,
                        border: `1px solid ${alpha(brandTokens.forgeGold, 0.25)}`,
                      }}
                    />
                  )}
                  {readyMadeCount > 0 && (
                    <Chip
                      icon={<InventoryOutlinedIcon sx={{ fontSize: '0.9rem !important' }} />}
                      label={`${readyMadeCount} Ready-Made`}
                      size="small"
                      sx={{
                        backgroundColor: alpha('#5A9A3A', 0.12),
                        color: '#5A9A3A',
                        border: `1px solid ${alpha('#5A9A3A', 0.25)}`,
                      }}
                    />
                  )}
                  {category.how_it_works_anchor && (
                    <Chip
                      component="a"
                      href={`/how-it-works${category.how_it_works_anchor}`}
                      label="How It Works →"
                      size="small"
                      clickable
                      sx={{
                        backgroundColor: alpha(brandTokens.parchment, 0.06),
                        color: alpha(brandTokens.parchment, 0.55),
                        border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
                        '&:hover': {
                          backgroundColor: alpha(brandTokens.parchment, 0.1),
                        },
                      }}
                    />
                  )}
                </Box>
              </Box>
            </Box>
          </Container>
        </Box>

        {/* ── Product grid ────────────────────────────────────────────── */}
        <Box
          sx={{
            py: { xs: 5, md: 7 },
            backgroundColor: brandTokens.bgVoid,
          }}
        >
          <Container maxWidth="lg">
            {products.length === 0 ? (
              <EmptyCategory categoryName={category.display_name} />
            ) : (
              <>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: { xs: 3, md: 4 },
                    flexWrap: 'wrap',
                    gap: 2,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ color: alpha(brandTokens.parchment, 0.5) }}
                  >
                    {products.length} product{products.length !== 1 ? 's' : ''}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: 'repeat(1, 1fr)',
                      sm: 'repeat(2, 1fr)',
                      md: 'repeat(3, 1fr)',
                    },
                    gap: { xs: 2.5, md: 3 },
                  }}
                >
                  {products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      categorySlug={slug}
                    />
                  ))}
                </Box>
              </>
            )}
          </Container>
        </Box>

        {/* ── Custom order CTA ────────────────────────────────────────── */}
        <CustomOrderCTA categoryName={category.display_name} />
      </Box>

      <Footer />
    </>
  )
}

// ─── Product card ──────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: DbProduct
  categorySlug: string
}

function ProductCard({ product, categorySlug }: ProductCardProps) {
  const media = product.featured_media
  const hasImage = media?.url && media.url.length > 0
  const cardGradient =
    media?.gradient ??
    product.category_gradient ??
    `linear-gradient(135deg, ${brandTokens.bgSurface} 0%, ${brandTokens.bgVoid} 100%)`

  return (
    <Box
      component="a"
      href={`/shop/categories/${categorySlug}/${product.slug}`}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        background: brandTokens.bgSurface,
        border: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
        borderRadius: 2,
        overflow: 'hidden',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: `0 8px 28px ${alpha(brandTokens.bgVoid, 0.7)}`,
          borderColor: alpha(brandTokens.forgeGold, 0.25),
        },
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
          '&:hover': { transform: 'none' },
        },
      }}
    >
      {/* ── Product image / placeholder ── */}
      <Box
        sx={{
          aspectRatio: '4/3',
          background: cardGradient,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media!.url}
            alt={media!.alt || product.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Typography
            aria-hidden="true"
            sx={{ fontSize: '3.5rem', opacity: 0.6, userSelect: 'none' }}
          >
            {media?.emoji ?? '✨'}
          </Typography>
        )}

        {/* Type badge */}
        <Box sx={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 0.75 }}>
          {product.is_customizable && (
            <Chip
              label="Custom"
              size="small"
              sx={{
                backgroundColor: alpha(brandTokens.bgVoid, 0.85),
                color: brandTokens.forgeGold,
                border: `1px solid ${alpha(brandTokens.forgeGold, 0.3)}`,
                fontSize: '0.6rem',
                height: 20,
                backdropFilter: 'blur(6px)',
              }}
            />
          )}
          {product.is_ready_made && (
            <Chip
              label="Ready"
              size="small"
              sx={{
                backgroundColor: alpha(brandTokens.bgVoid, 0.85),
                color: '#5A9A3A',
                border: `1px solid ${alpha('#5A9A3A', 0.3)}`,
                fontSize: '0.6rem',
                height: 20,
                backdropFilter: 'blur(6px)',
              }}
            />
          )}
        </Box>
      </Box>

      {/* ── Product info ── */}
      <Box sx={{ p: { xs: 2, md: 2.5 }, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <Typography
          variant="h6"
          component="h3"
          sx={{ mb: 0.75, fontSize: { xs: '0.95rem', md: '1.05rem' } }}
        >
          {product.title}
        </Typography>

        {product.short_description && (
          <Typography
            variant="body2"
            sx={{
              color: alpha(brandTokens.parchment, 0.55),
              fontSize: '0.8rem',
              lineHeight: 1.55,
              mb: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {product.short_description}
          </Typography>
        )}

        <Box
          sx={{
            mt: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pt: 1.5,
            borderTop: `1px solid ${alpha(brandTokens.parchment, 0.06)}`,
          }}
        >
          <Box>
            <Typography
              variant="body2"
              sx={{ color: alpha(brandTokens.parchment, 0.4), fontSize: '0.65rem', mb: 0.15 }}
            >
              Starting from
            </Typography>
            <Typography
              sx={{
                fontWeight: 700,
                color: brandTokens.parchment,
                fontSize: '1.1rem',
                fontFamily: 'var(--font-cinzel, serif)',
              }}
            >
              ${product.base_price.toFixed(2)}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: alpha(brandTokens.parchment, 0.35) }}>
            <AccessTimeIcon sx={{ fontSize: 13 }} />
            <Typography sx={{ fontSize: '0.7rem' }}>
              {product.production_estimate_band}
            </Typography>
          </Box>
        </Box>

        {/* Hover CTA */}
        <Box
          sx={{
            mt: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            color: brandTokens.forgeGold,
            fontSize: '0.8rem',
            fontWeight: 600,
            opacity: 0,
            transform: 'translateY(4px)',
            transition: 'opacity 0.2s, transform 0.2s',
            'a:hover &, a:focus-visible &': {
              opacity: 1,
              transform: 'translateY(0)',
            },
          }}
        >
          Configure & Order
          <ArrowForwardIcon sx={{ fontSize: 14 }} />
        </Box>
      </Box>
    </Box>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyCategory({ categoryName }: { categoryName: string }) {
  return (
    <Box
      sx={{
        py: { xs: 6, md: 10 },
        textAlign: 'center',
        border: `1px dashed ${alpha(brandTokens.parchment, 0.12)}`,
        borderRadius: 2,
      }}
    >
      <Typography sx={{ fontSize: '2.5rem', mb: 2 }}>🔨</Typography>
      <Typography variant="h4" gutterBottom>
        Forging in Progress
      </Typography>
      <Typography
        variant="body1"
        sx={{ color: alpha(brandTokens.parchment, 0.55), maxWidth: 480, mx: 'auto', mb: 3 }}
      >
        No products listed yet in <strong>{categoryName}</strong>. Check back soon — or submit a
        custom order request if you already know what you want.
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Box
          component="a"
          href="/custom-orders"
          sx={{
            px: 3,
            py: 1.25,
            borderRadius: 1,
            backgroundColor: alpha(brandTokens.forgeGold, 0.12),
            color: brandTokens.forgeGold,
            border: `1px solid ${alpha(brandTokens.forgeGold, 0.3)}`,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.875rem',
            '&:hover': { backgroundColor: alpha(brandTokens.forgeGold, 0.18) },
          }}
        >
          Submit a Custom Request
        </Box>
        <Box
          component="a"
          href="/shop"
          sx={{
            px: 3,
            py: 1.25,
            borderRadius: 1,
            backgroundColor: 'transparent',
            color: alpha(brandTokens.parchment, 0.6),
            border: `1px solid ${alpha(brandTokens.parchment, 0.15)}`,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.875rem',
            '&:hover': { backgroundColor: alpha(brandTokens.parchment, 0.05) },
          }}
        >
          Back to Shop
        </Box>
      </Box>
    </Box>
  )
}

// ─── Custom order CTA ─────────────────────────────────────────────────────────

function CustomOrderCTA({ categoryName }: { categoryName: string }) {
  return (
    <Box
      sx={{
        py: { xs: 5, md: 7 },
        borderTop: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
        background: `linear-gradient(135deg, #120A1C 0%, #1C0E24 60%, #0C0A07 100%)`,
      }}
    >
      <Container maxWidth="md" sx={{ textAlign: 'center' }}>
        <Typography sx={{ fontSize: '2.25rem', mb: 1.5 }}>🐉</Typography>
        <Typography variant="h3" gutterBottom>
          Don't See What You're After?
        </Typography>
        <Typography
          variant="body1"
          sx={{ color: alpha(brandTokens.parchment, 0.65), mb: 3.5, maxWidth: 520, mx: 'auto' }}
        >
          Not every treasure fits a template. Tell us what you have in mind and we will forge
          something unique — starting from{' '}
          <strong style={{ color: brandTokens.parchment }}>your idea</strong>, not ours.
        </Typography>
        <Box
          component="a"
          href="/custom-orders"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: 4,
            py: 1.5,
            borderRadius: 1,
            backgroundColor: alpha('#8B4FBE', 0.15),
            color: '#8B4FBE',
            border: `1px solid ${alpha('#8B4FBE', 0.35)}`,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
            letterSpacing: '0.04em',
            transition: 'background-color 0.2s',
            '&:hover': { backgroundColor: alpha('#8B4FBE', 0.25) },
          }}
        >
          Bring Us Your Wild Idea
          <ArrowForwardIcon sx={{ fontSize: 18 }} />
        </Box>
      </Container>
    </Box>
  )
}
