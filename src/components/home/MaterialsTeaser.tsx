'use client'

import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import Link from 'next/link'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'
import { Analytics } from '@/lib/analytics/events'

// TODO: Materials list reads from exp_taxonomy (type = 'material') in production.
const MATERIALS = [
  {
    key: 'wood_basswood',
    name: 'Basswood',
    description: 'Lightweight, fine-grained wood ideal for detailed engravings, signs, and ornaments.',
    bestFor: ['Signs', 'Ornaments', 'Portraits'],
    emoji: '🪵',
    gradient: `linear-gradient(160deg, #2A1800 0%, #4A2E0A 100%)`,
  },
  {
    key: 'acrylic_frosted',
    name: 'Frosted Acrylic',
    description: 'Semi-transparent acrylic that diffuses light beautifully — perfect for glowing panels and keychains.',
    bestFor: ['Panels', 'Keychains', 'Lighting'],
    emoji: '🧊',
    gradient: `linear-gradient(160deg, #001A2A 0%, #003A4A 100%)`,
  },
  {
    key: 'leather',
    name: 'Leather',
    description: 'Natural leather accepts deep, high-contrast engravings that age beautifully over time.',
    bestFor: ['Patches', 'Wallets', 'Bookmarks'],
    emoji: '🪡',
    gradient: `linear-gradient(160deg, #1A0E00 0%, #3A2010 100%)`,
  },
  {
    key: 'powder_coated_tumbler',
    name: 'Powder Coated Tumblers',
    description: 'The classic — engraving cuts through the coating to reveal gleaming metal beneath.',
    bestFor: ['Drinkware', 'Gifts', 'Personalization'],
    emoji: '🥤',
    gradient: `linear-gradient(160deg, #2A1800 0%, #4A3000 100%)`,
  },
  {
    key: 'ceramic_mug',
    name: 'Ceramic Blanks',
    description: 'Specially coated ceramics accept full-color sublimation prints that last a lifetime.',
    bestFor: ['Mugs', 'Coasters', 'Photo gifts'],
    emoji: '☕',
    gradient: `linear-gradient(160deg, #1A0A2A 0%, #2E1A3A 100%)`,
  },
  {
    key: 'slate',
    name: 'Slate',
    description: 'Rustic and weighty — slate engraves with a striking natural contrast and works as serveware or décor.',
    bestFor: ['Coasters', 'Plaques', 'Cheese boards'],
    emoji: '🪨',
    gradient: `linear-gradient(160deg, #121212 0%, #282828 100%)`,
  },
]

export function MaterialsTeaser() {
  return (
    <Box
      component="section"
      aria-labelledby="materials-heading"
      sx={{
        py: { xs: 8, md: 10 },
        backgroundColor: alpha(brandTokens.bgSurface, 0.6),
        borderTop: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
        borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: { xs: 5, md: 7 } }}>
          <Typography variant="overline" sx={{ color: 'primary.main', display: 'block', mb: 1 }}>
            The Forge&apos;s Palette
          </Typography>
          <Typography
            id="materials-heading"
            variant="h2"
            component="h2"
            sx={{ color: 'text.primary', mb: 1.5 }}
          >
            Materials & Craftsmanship
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 540, mx: 'auto', lineHeight: 1.75 }}>
            Every material we work with is chosen for quality, character, and how it responds to the
            forge. Here&apos;s what we keep in the workshop.
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
            gap: 2,
            mb: 6,
          }}
        >
          {MATERIALS.map((mat) => (
            <Box
              key={mat.key}
              sx={{
                background: mat.gradient,
                border: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
                borderRadius: 2,
                p: { xs: 2.5, md: 3 },
                transition: 'border-color 0.2s ease, transform 0.2s ease',
                '&:hover': {
                  borderColor: alpha(brandTokens.forgeGold, 0.25),
                  transform: 'translateY(-2px)',
                },
                '@media (prefers-reduced-motion: reduce)': {
                  '&:hover': { transform: 'none' },
                },
              }}
            >
              <Box aria-hidden="true" sx={{ fontSize: '1.8rem', mb: 1.5, lineHeight: 1 }}>
                {mat.emoji}
              </Box>
              <Typography variant="h6" component="h3" sx={{ color: 'text.primary', mb: 0.75, fontSize: { xs: '0.9rem', md: '1rem' } }}>
                {mat.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65, fontSize: '0.8rem', mb: 1.5 }}>
                {mat.description}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {mat.bestFor.map((use) => (
                  <Box
                    key={use}
                    sx={{
                      px: 1,
                      py: 0.25,
                      borderRadius: 0.75,
                      backgroundColor: alpha(brandTokens.forgeGold, 0.08),
                      border: `1px solid ${alpha(brandTokens.forgeGold, 0.15)}`,
                    }}
                  >
                    <Typography sx={{ fontSize: '0.65rem', color: alpha(brandTokens.forgeGoldLight, 0.8), letterSpacing: '0.04em' }}>
                      {use}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>

        {/* Lead-in to How It Works */}
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            Want to understand how these materials come to life in the forge?
          </Typography>
          <Button
            component={Link}
            href="/how-it-works#materials"
            variant="outlined"
            color="primary"
            endIcon={<ArrowForwardIcon />}
            onClick={() => Analytics.howItWorksAnchorClicked('materials')}
          >
            Explore the Full Materials Guide
          </Button>
        </Box>
      </Container>
    </Box>
  )
}
