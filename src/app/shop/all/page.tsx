import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { getAllActiveProducts } from '@/lib/supabase/queries/products'
import { brandTokens } from '@/theme/theme'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'All Products',
  description: 'Browse every active product currently available in the hoard.',
}

export default async function ShopAllPage() {
  const products = await getAllActiveProducts()

  return (
    <>
      <Header currentPath="/shop" />
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Shop', href: '/shop' },
          { label: 'All Products' },
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
            <Typography component="p" variant="overline" sx={{ color: brandTokens.forgeGold, mb: 1.5, display: 'block' }}>
              Full Hoard View
            </Typography>
            <Typography variant="h1" component="h1" gutterBottom>
              Shop All Products
            </Typography>
            <Typography variant="body1" sx={{ color: alpha(brandTokens.parchment, 0.7), maxWidth: 620, mx: 'auto' }}>
              Everything currently available across every category. Jump into any product and customize from there.
            </Typography>
          </Container>
        </Box>

        <Box sx={{ py: { xs: 5, md: 7 }, backgroundColor: brandTokens.bgVoid }}>
          <Container maxWidth="lg">
            <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.5), mb: { xs: 2.5, md: 3 } }}>
              {products.length} product{products.length !== 1 ? 's' : ''} available
            </Typography>

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

                const categorySlug = product.category_slug
                const href = categorySlug
                  ? `/shop/categories/${categorySlug}/${product.slug}`
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
                        borderColor: alpha(brandTokens.forgeGold, 0.25),
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

                      {product.category_display_name && (
                        <Chip
                          label={product.category_display_name}
                          size="small"
                          sx={{
                            position: 'absolute',
                            top: 10,
                            left: 10,
                            backgroundColor: alpha(brandTokens.bgVoid, 0.88),
                            color: alpha(brandTokens.parchment, 0.78),
                            border: `1px solid ${alpha(brandTokens.parchment, 0.18)}`,
                            fontSize: '0.62rem',
                            height: 20,
                          }}
                        />
                      )}
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
                        <Typography sx={{ fontWeight: 700, color: brandTokens.parchment, fontSize: '1.1rem', fontFamily: 'var(--font-cinzel, serif)' }}>
                          ${product.base_price.toFixed(2)}
                        </Typography>

                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: brandTokens.forgeGold, fontSize: '0.78rem', fontWeight: 600 }}>
                          View
                          <ArrowForwardIcon sx={{ fontSize: 14 }} />
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                )
              })}
            </Box>
          </Container>
        </Box>
      </Box>

      <Footer />
    </>
  )
}
