'use client'

import { useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { alpha } from '@mui/material/styles'

import { Analytics } from '@/lib/analytics/events'
import { brandTokens } from '@/theme/theme'

interface RecommendationItem {
  id: string
  title: string
  slug: string
  base_price: number
  category_slug?: string | null
  category_display_name?: string
  category_emoji?: string | null
  category_gradient?: string | null
  featured_media?: {
    url: string
    alt: string
    emoji: string | null
    gradient: string | null
  } | null
}

interface RecommendationRailProps {
  currentProductId: string
  fallbackCategorySlug: string
  algorithm: string
  items: RecommendationItem[]
}

export function RecommendationRail({
  currentProductId,
  fallbackCategorySlug,
  algorithm,
  items,
}: RecommendationRailProps) {
  useEffect(() => {
    if (items.length === 0) return
    Analytics.recommendationsViewed(
      currentProductId,
      items.map((item) => item.id),
      algorithm
    )
  }, [algorithm, currentProductId, items])

  if (items.length === 0) {
    return null
  }

  return (
    <Box
      sx={{
        mt: { xs: 5, md: 8 },
        pt: { xs: 4, md: 6 },
        borderTop: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
      }}
    >
      <Typography variant="h3" component="h2" sx={{ mb: 2 }}>
        You May Also Like
      </Typography>
      <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.62), mb: 3.2 }}>
        Personalized picks based on category fit, product path, and price proximity.
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(4, minmax(0, 1fr))',
          },
          gap: 2,
        }}
      >
        {items.map((item, index) => {
          const image = item.featured_media
          const href = `/shop/categories/${item.category_slug ?? fallbackCategorySlug}/${item.slug}`
          const gradient =
            image?.gradient ??
            item.category_gradient ??
            `linear-gradient(135deg, ${brandTokens.bgSurface} 0%, ${brandTokens.bgVoid} 100%)`

          return (
            <Box
              key={item.id}
              component={Link}
              href={href}
              onClick={() =>
                Analytics.recommendationClicked(currentProductId, item.id, index + 1, algorithm)
              }
              sx={{
                textDecoration: 'none',
                borderRadius: 2,
                overflow: 'hidden',
                background: alpha(brandTokens.bgSurface, 0.72),
                border: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
                transition: 'transform 180ms ease, border-color 180ms ease',
                '&:hover': {
                  transform: 'translateY(-3px)',
                  borderColor: alpha(brandTokens.forgeGold, 0.45),
                },
              }}
            >
              <Box
                sx={{
                  aspectRatio: '4/3',
                  background: gradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {image?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.url}
                    alt={image.alt || item.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <Typography aria-hidden="true" sx={{ fontSize: '2.5rem', opacity: 0.55 }}>
                    {image?.emoji ?? item.category_emoji ?? '✨'}
                  </Typography>
                )}
              </Box>

              <Box sx={{ p: 1.6 }}>
                <Typography sx={{ color: brandTokens.parchment, fontWeight: 600, mb: 0.4 }}>
                  {item.title}
                </Typography>
                <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.85rem', mb: 0.9 }}>
                  {item.category_display_name ?? 'Shop pick'}
                </Typography>
                <Typography sx={{ color: brandTokens.forgeGold, fontWeight: 700 }}>
                  From ${item.base_price.toFixed(2)}
                </Typography>
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
