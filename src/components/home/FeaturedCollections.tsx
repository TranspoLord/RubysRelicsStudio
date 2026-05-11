'use client'

import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import Link from 'next/link'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'
import { Analytics } from '@/lib/analytics/events'

export interface FeaturedCollectionItem {
  id: string
  title: string
  tagline: string
  description: string
  slug: string
  emoji?: string | null
  tag_label?: string | null
  gradient: string
  border_color: string
}

interface FeaturedCollectionsProps {
  collections?: FeaturedCollectionItem[]
}

export function FeaturedCollections({ collections }: FeaturedCollectionsProps = {}) {
  const items = collections ?? []
  if (items.length === 0) {
    return null
  }
  return (
    <Box
      component="section"
      aria-labelledby="featured-heading"
      sx={{
        py: { xs: 8, md: 10 },
        backgroundColor: alpha(brandTokens.bgSurface, 0.5),
        borderTop: `1px solid ${alpha(brandTokens.parchment, 0.06)}`,
        borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.06)}`,
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { sm: 'flex-end' },
            justifyContent: 'space-between',
            gap: 2,
            mb: { xs: 5, md: 6 },
          }}
        >
          <Box>
            <Typography variant="overline" sx={{ color: 'primary.main', display: 'block', mb: 1 }}>
              Curated for You
            </Typography>
            <Typography id="featured-heading" variant="h2" component="h2" sx={{ color: 'text.primary' }}>
              Featured Collections
            </Typography>
          </Box>
          <Button
            component={Link}
            href="/shop"
            variant="outlined"
            color="primary"
            size="small"
            endIcon={<ArrowForwardIcon />}
            sx={{ flexShrink: 0 }}
          >
            View All
          </Button>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            gap: 3,
          }}
        >
          {items.map((col) => (
            <Box
              key={col.id}
              component={Link}
              href={`/shop/${col.slug}`}
              onClick={() => Analytics.collectionClicked(col.id, col.title)}
              aria-label={`${col.title} collection — ${col.tagline}`}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                p: 3.5,
                background: col.gradient,
                border: `1px solid ${col.border_color}`,
                borderRadius: 2,
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: `0 16px 48px ${alpha(brandTokens.bgVoid, 0.7)}`,
                  borderColor: alpha(brandTokens.forgeGold, 0.4),
                },
                '&:focus-visible': {
                  outline: `2px solid ${brandTokens.forgeGold}`,
                  outlineOffset: '3px',
                },
                '@media (prefers-reduced-motion: reduce)': {
                  '&:hover': { transform: 'none' },
                },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 1,
                }}
              >
                <Box aria-hidden="true" sx={{ fontSize: '2.5rem', lineHeight: 1 }}>
                  {col.emoji}
                </Box>
                {col.tag_label && (
                  <Chip
                    label={col.tag_label}
                    size="small"
                    color="primary"
                    sx={{ fontSize: '0.68rem', height: 22 }}
                  />
                )}
              </Box>

              <Box sx={{ flex: 1 }}>
                <Typography variant="h5" component="h3" sx={{ mb: 1, color: 'text.primary' }}>
                  {col.title}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: 'primary.light', fontStyle: 'italic', mb: 1.5, fontSize: '0.85rem' }}
                >
                  {col.tagline}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                  {col.description}
                </Typography>
              </Box>

              <Box
                aria-hidden="true"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  color: 'primary.main',
                  mt: 1,
                }}
              >
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>Explore Collection</Typography>
                <ArrowForwardIcon sx={{ fontSize: '0.9rem' }} />
              </Box>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  )
}
