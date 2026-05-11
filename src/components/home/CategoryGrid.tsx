'use client'

import { useState } from 'react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'
import { Analytics } from '@/lib/analytics/events'

import type { TaxonomyEntry } from '@/types'

export interface CategoryDisplayItem {
  key: string
  display_name: string
  slug: string
  tagline?: string | null
  emoji?: string | null
  gradient?: string | null
  glow_color?: string | null
}

interface CategoryGridProps {
  categories?: CategoryDisplayItem[]
}

export function CategoryGrid({ categories }: CategoryGridProps = {}) {
  const items = (categories ?? []).map((cat) => ({
    key: cat.key,
    display_name: cat.display_name,
    slug: cat.slug,
    tagline: cat.tagline ?? '',
    emoji: cat.emoji ?? '🔥',
    gradient: cat.gradient ?? `linear-gradient(135deg, #1A1410, #2A2018)`,
    glowColor: cat.glow_color ?? brandTokens.forgeGold,
  }))

  if (items.length === 0) {
    return null
  }

  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  return (
    <Box
      component="section"
      aria-labelledby="categories-heading"
      sx={{ py: { xs: 8, md: 10 } }}
    >
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: { xs: 5, md: 6 } }}>
          <Typography
            variant="overline"
            sx={{ color: 'primary.main', display: 'block', mb: 1 }}
          >
            Browse the Hoard
          </Typography>
          <Typography
            id="categories-heading"
            variant="h2"
            component="h2"
            sx={{ color: 'text.primary' }}
          >
            Explore Our Craft Categories
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              sm: 'repeat(3, 1fr)',
              md: 'repeat(4, 1fr)',
            },
            gap: { xs: 2, md: 2.5 },
          }}
        >
          {items.map((cat) => {
            const isHovered = hoveredKey === cat.key
            const isNeighbor = hoveredKey !== null && hoveredKey !== cat.key

            return (
              <Box
                key={cat.key}
                component={Link}
                href={`/shop/categories/${cat.slug}`}
                aria-label={`${cat.display_name} — ${cat.tagline}`}
                onClick={() => Analytics.categoryClicked(cat.key, cat.slug)}
                onMouseEnter={() => setHoveredKey(cat.key)}
                onMouseLeave={() => setHoveredKey(null)}
                onFocus={() => setHoveredKey(cat.key)}
                onBlur={() => setHoveredKey(null)}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                  p: { xs: 2.5, md: 3 },
                  background: cat.gradient,
                  border: `1px solid ${isHovered ? alpha(cat.glowColor, 0.5) : alpha(brandTokens.parchment, 0.06)}`,
                  borderRadius: 2,
                  textDecoration: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'transform 0.25s ease, box-shadow 0.25s ease, opacity 0.2s ease, border-color 0.2s ease',
                  transform: isHovered ? 'scale(1.045)' : isNeighbor ? 'scale(0.97)' : 'scale(1)',
                  opacity: isNeighbor ? 0.7 : 1,
                  boxShadow: isHovered
                    ? `0 8px 32px ${alpha(cat.glowColor, 0.3)}, 0 0 0 1px ${alpha(cat.glowColor, 0.2)}`
                    : 'none',
                  zIndex: isHovered ? 1 : 0,
                  '&:focus-visible': {
                    outline: `2px solid ${brandTokens.forgeGold}`,
                    outlineOffset: '3px',
                  },
                  '@media (prefers-reduced-motion: reduce)': {
                    transition: 'none',
                    transform: 'none',
                    opacity: 1,
                  },
                }}
              >
                {/* Glow overlay on hover */}
                <Box
                  aria-hidden="true"
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    background: `radial-gradient(ellipse at top left, ${alpha(cat.glowColor, 0.12)} 0%, transparent 70%)`,
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 0.25s ease',
                    pointerEvents: 'none',
                    '@media (prefers-reduced-motion: reduce)': {
                      display: 'none',
                    },
                  }}
                />

                <Box
                  aria-hidden="true"
                  sx={{ fontSize: { xs: '1.8rem', md: '2.2rem' }, lineHeight: 1 }}
                >
                  {cat.emoji}
                </Box>

                <Box>
                  <Typography
                    variant="h6"
                    component="h3"
                    sx={{
                      fontSize: { xs: '0.9rem', md: '1rem' },
                      color: 'text.primary',
                      mb: 0.5,
                      lineHeight: 1.3,
                    }}
                  >
                    {cat.display_name}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: { xs: '0.75rem', md: '0.8rem' },
                      color: 'text.secondary',
                      lineHeight: 1.5,
                      display: { xs: 'none', sm: 'block' },
                    }}
                  >
                    {cat.tagline}
                  </Typography>
                </Box>

                <Box
                  aria-hidden="true"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    color: alpha(cat.glowColor, isHovered ? 0.9 : 0.4),
                    transition: 'color 0.2s ease',
                    mt: 'auto',
                  }}
                >
                  <Typography sx={{ fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Explore
                  </Typography>
                  <ArrowForwardIcon sx={{ fontSize: '0.75rem', transition: 'transform 0.2s ease', transform: isHovered ? 'translateX(3px)' : 'none' }} />
                </Box>
              </Box>
            )
          })}
        </Box>
      </Container>
    </Box>
  )
}
