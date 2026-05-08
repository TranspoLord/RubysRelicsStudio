import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { getReadyMadeProducts } from '@/lib/supabase/queries/products'
import { brandTokens } from '@/theme/theme'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ready-Made',
  description: 'Browse ready-made products that are pre-designed and do not require artwork upload.',
}

export default async function ReadyMadePage() {
  const products = await getReadyMadeProducts()

  return (
    <>
      <Header currentPath="/shop" />
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Shop', href: '/shop' },
          { label: 'Ready-Made' },
        ]}
      />

      <Box component="main" id="main-content">
        <Box
          sx={{
            background: `linear-gradient(180deg, ${alpha(brandTokens.bgSurface, 0.9)} 0%, ${brandTokens.bgVoid} 100%)`,
            borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
            pt: { xs: 5, md: 7 },
            pb: { xs: 4, md: 6 },
            textAlign: 'center',
          }}
        >
          <Container maxWidth="md">
            <Typography component="p" variant="overline" sx={{ color: '#5A9A3A', mb: 1.2, display: 'block' }}>
              Fastest Path
            </Typography>
            <Typography variant="h1" component="h1" gutterBottom>
              Ready-Made Hoard
            </Typography>
            <Typography
              variant="body1"
              sx={{ color: alpha(brandTokens.parchment, 0.7), maxWidth: 620, mx: 'auto' }}
            >
              Pre-designed products that are ready to claim. No artwork upload required.
            </Typography>
          </Container>
        </Box>

        <Box sx={{ py: { xs: 5, md: 7 }, backgroundColor: brandTokens.bgVoid }}>
          <Container maxWidth="lg">
            <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.5), mb: { xs: 2.5, md: 3 } }}>
              {products.length} ready-made item{products.length !== 1 ? 's' : ''}
            </Typography>

            {products.length === 0 ? (
              <Box
                sx={{
                  py: { xs: 5, md: 6 },
                  px: { xs: 2, md: 3 },
                  border: `1px dashed ${alpha(brandTokens.parchment, 0.16)}`,
                  borderRadius: 2,
                  textAlign: 'center',
                }}
              >
                <Typography sx={{ fontSize: '2rem', mb: 1 }}>📦</Typography>
                <Typography variant="h4" sx={{ mb: 1 }}>
                  No Ready-Made Pieces Listed Yet
                </Typography>
                <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), maxWidth: 560, mx: 'auto', mb: 2.5 }}>
                  New ready-made inventory will appear here as it is released. You can still browse all products or submit a custom request.
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                  <Box
                    component="a"
                    href="/shop/all"
                    sx={{
                      px: 2,
                      py: 0.9,
                      borderRadius: 1,
                      textDecoration: 'none',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: brandTokens.forgeGold,
                      border: `1px solid ${alpha(brandTokens.forgeGold, 0.35)}`,
                      backgroundColor: alpha(brandTokens.forgeGold, 0.08),
                    }}
                  >
                    Shop All Products
                  </Box>
                  <Box
                    component="a"
                    href="/custom-orders"
                    sx={{
                      px: 2,
                      py: 0.9,
                      borderRadius: 1,
                      textDecoration: 'none',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: alpha(brandTokens.parchment, 0.82),
                      border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`,
                      backgroundColor: alpha(brandTokens.parchment, 0.05),
                    }}
                  >
                    Request Custom
                  </Box>
                </Box>
              </Box>
            ) : (
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
                {products.map((product) => {
                  const media = product.featured_media
                  const hasImage = Boolean(media?.url)
                  const cardGradient =
                    media?.gradient ??
                    product.category_gradient ??
                    `linear-gradient(135deg, ${brandTokens.bgSurface} 0%, ${brandTokens.bgVoid} 100%)`

                  const href = product.category_slug
                    ? `/shop/categories/${product.category_slug}/${product.slug}`
                    : '/shop'

                  return (
                    <Box
                      key={product.id}
                      component="a"
                      href={href}
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
                          borderColor: alpha('#5A9A3A', 0.35),
                        },
                        '@media (prefers-reduced-motion: reduce)': {
                          transition: 'none',
                          '&:hover': { transform: 'none' },
                        },
                      }}
                    >
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
                          <Typography aria-hidden="true" sx={{ fontSize: '3.5rem', opacity: 0.6, userSelect: 'none' }}>
                            {media?.emoji ?? product.category_emoji ?? '✨'}
                          </Typography>
                        )}

                        <Chip
                          label="Ready-Made"
                          size="small"
                          sx={{
                            position: 'absolute',
                            top: 10,
                            left: 10,
                            backgroundColor: alpha(brandTokens.bgVoid, 0.9),
                            color: '#5A9A3A',
                            border: `1px solid ${alpha('#5A9A3A', 0.35)}`,
                            fontSize: '0.62rem',
                            height: 20,
                          }}
                        />
                      </Box>

                      <Box sx={{ p: { xs: 2, md: 2.5 }, display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <Typography variant="h6" component="h2" sx={{ mb: 0.75, fontSize: { xs: '0.95rem', md: '1.05rem' } }}>
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
                            <Typography sx={{ color: alpha(brandTokens.parchment, 0.45), fontSize: '0.64rem', mb: 0.15 }}>
                              Price
                            </Typography>
                            <Typography sx={{ fontWeight: 700, color: brandTokens.parchment, fontSize: '1.1rem', fontFamily: 'var(--font-cinzel, serif)' }}>
                              ${product.base_price.toFixed(2)}
                            </Typography>
                          </Box>

                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.45, color: alpha(brandTokens.parchment, 0.45) }}>
                            <AccessTimeIcon sx={{ fontSize: 13 }} />
                            <Typography sx={{ fontSize: '0.7rem' }}>
                              {product.production_estimate_band}
                            </Typography>
                          </Box>
                        </Box>

                        <Box sx={{ mt: 1.2, display: 'inline-flex', alignItems: 'center', gap: 0.4, color: '#5A9A3A', fontSize: '0.78rem', fontWeight: 700 }}>
                          View Product
                          <ArrowForwardIcon sx={{ fontSize: 14 }} />
                        </Box>
                      </Box>
                    </Box>
                  )
                })}
              </Box>
            )}
          </Container>
        </Box>
      </Box>

      <Footer />
    </>
  )
}
