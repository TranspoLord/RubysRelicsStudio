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

// TODO: Replace with approved gallery items from Supabase (moderation_status = 'published').
// Gallery items are admin-curated only — no customer submissions shown without approval.
const FORGE_ITEMS = [
  {
    id: 'fg-001',
    title: 'Walnut Tumbler — Dragon Motif',
    caption: 'Deep engraving on a powder-coated tumbler with a custom dragon scale pattern.',
    category: 'Engraved Drinkware',
    categorySlug: 'engraved-drinkware',
    material: 'Powder Coated Tumbler',
    turnaround: '4 days',
    emoji: '🐉',
    gradient: `linear-gradient(135deg, #2A1800, #4A2E00)`,
  },
  {
    id: 'fg-002',
    title: 'Leather Patch — Runic Lettering',
    caption: 'Engraved leather patch with custom runic script and a reinforced border.',
    category: 'Leather Goods',
    categorySlug: 'leather-goods',
    material: 'Leather',
    turnaround: '3 days',
    emoji: '⚔️',
    gradient: `linear-gradient(135deg, #1A0E00, #3A2010)`,
  },
  {
    id: 'fg-003',
    title: 'Sublimated Mug — Watercolor Mountains',
    caption: 'Full-color sublimation transfer of a watercolor mountain landscape on ceramic.',
    category: 'Sublimated Gifts',
    categorySlug: 'sublimated-gifts',
    material: 'Ceramic Mug Blank',
    turnaround: '3 days',
    emoji: '🏔️',
    gradient: `linear-gradient(135deg, #1A0A2A, #2E1A4A)`,
  },
  {
    id: 'fg-004',
    title: 'Basswood Sign — "Here Be Cozy"',
    caption: 'Cut and engraved basswood wall sign with a hand-styled lettering layout.',
    category: 'Signs & Decor',
    categorySlug: 'signs-and-decor',
    material: 'Basswood',
    turnaround: '5 days',
    emoji: '🏡',
    gradient: `linear-gradient(135deg, #0A1A0A, #1A3A10)`,
  },
  {
    id: 'fg-005',
    title: 'Frosted Acrylic Lantern Panel',
    caption: 'Custom-cut frosted acrylic panel with an intricate geometric pattern for a lantern frame.',
    category: 'Acrylic Pieces',
    categorySlug: 'acrylic-pieces',
    material: 'Frosted Acrylic',
    turnaround: '4 days',
    emoji: '🔮',
    gradient: `linear-gradient(135deg, #001A2A, #003A4A)`,
  },
  {
    id: 'fg-006',
    title: 'Sublimated Coaster Set',
    caption: 'Set of four full-color sublimated coasters featuring a tarot card art series.',
    category: 'Sublimated Gifts',
    categorySlug: 'sublimated-gifts',
    material: 'Ceramic Mug Blank',
    turnaround: '3 days',
    emoji: '🎴',
    gradient: `linear-gradient(135deg, #2A001A, #4A1030)`,
  },
]

export function FreshFromTheForge() {
  return (
    <Box
      component="section"
      aria-labelledby="forge-heading"
      sx={{ py: { xs: 8, md: 10 } }}
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
              Recent Work
            </Typography>
            <Typography id="forge-heading" variant="h2" component="h2" sx={{ color: 'text.primary' }}>
              Fresh From the Forge
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1, maxWidth: 500 }}>
              Actual finished pieces, each one made to order. Let these inspire your own creation.
            </Typography>
          </Box>
          <Button
            component={Link}
            href="/gallery"
            variant="outlined"
            color="primary"
            size="small"
            endIcon={<ArrowForwardIcon />}
            sx={{ flexShrink: 0 }}
          >
            Full Gallery
          </Button>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
            },
            gap: 2.5,
          }}
        >
          {FORGE_ITEMS.map((item) => (
            <Box
              key={item.id}
              sx={{
                borderRadius: 2,
                overflow: 'hidden',
                border: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
                transition: 'border-color 0.25s ease, transform 0.25s ease',
                '&:hover': {
                  borderColor: alpha(brandTokens.forgeGold, 0.3),
                  transform: 'translateY(-3px)',
                },
                '@media (prefers-reduced-motion: reduce)': {
                  '&:hover': { transform: 'none' },
                },
              }}
            >
              {/* Image placeholder — replace with <Image> once gallery assets exist */}
              <Box
                aria-label={item.title}
                role="img"
                sx={{
                  height: 200,
                  background: item.gradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '4rem',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <Box aria-hidden="true">{item.emoji}</Box>
                {/* Material badge */}
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 10,
                    right: 10,
                    px: 1.25,
                    py: 0.4,
                    borderRadius: 0.75,
                    backgroundColor: alpha(brandTokens.bgVoid, 0.75),
                    border: `1px solid ${alpha(brandTokens.parchment, 0.15)}`,
                  }}
                >
                  <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', letterSpacing: '0.04em' }}>
                    {item.material}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ p: 2.5, backgroundColor: alpha(brandTokens.bgCard, 0.9) }}>
                <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Chip
                    label={item.category}
                    size="small"
                    component={Link}
                    href={`/shop/categories/${item.categorySlug}`}
                    clickable
                    sx={{ fontSize: '0.65rem', height: 20 }}
                    color="primary"
                  />
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem' }}>
                    ⏱ {item.turnaround}
                  </Typography>
                </Box>
                <Typography variant="subtitle2" sx={{ color: 'text.primary', mb: 0.5, fontSize: '0.9rem' }}>
                  {item.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', lineHeight: 1.6 }}>
                  {item.caption}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  )
}
