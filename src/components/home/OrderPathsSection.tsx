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
import { StartHereChooser } from '@/components/home/StartHereChooser'

const ORDER_PATHS = [
  {
    key: 'shop' as const,
    icon: '⚙️',
    title: 'Shop Custom Creations',
    description:
      'Pick your product, choose your options, upload your artwork. We handle the rest — precision-crafted to your exact specs.',
    cta: 'Browse the Catalog',
    href: '/shop',
    gradient: `linear-gradient(135deg, ${alpha(brandTokens.forgeGoldDark, 0.15)} 0%, ${alpha(brandTokens.copper, 0.1)} 100%)`,
    borderColor: alpha(brandTokens.forgeGold, 0.3),
    ctaVariant: 'contained' as const,
  },
  {
    key: 'ready_made' as const,
    icon: '🏺',
    title: 'Ready-Made Hoard',
    description:
      'Pre-designed treasures ready to ship. No artwork needed — just pick your favorite and claim it for your collection.',
    cta: 'See What\'s Available',
    href: '/shop/ready-made',
    gradient: `linear-gradient(135deg, ${alpha(brandTokens.rubyRed, 0.12)} 0%, ${alpha(brandTokens.rubyRed, 0.06)} 100%)`,
    borderColor: alpha(brandTokens.rubyRed, 0.3),
    ctaVariant: 'outlined' as const,
  },
  {
    key: 'custom_order' as const,
    icon: '🪄',
    title: 'Request a Custom Order',
    description:
      'Have an unusual idea? Bring us your wildest vision — a sketch, a photo, a dream — and we\'ll consult the forge.',
    cta: 'Bring Us Your Idea',
    href: '/custom-orders',
    gradient: `linear-gradient(135deg, ${alpha(brandTokens.copper, 0.12)} 0%, ${alpha(brandTokens.bgElevated, 0.5)} 100%)`,
    borderColor: alpha(brandTokens.copper, 0.3),
    ctaVariant: 'outlined' as const,
  },
]

export function OrderPathsSection() {
  return (
    <Box
      component="section"
      aria-labelledby="order-paths-heading"
      sx={{
        py: { xs: 8, md: 10 },
        backgroundColor: alpha(brandTokens.bgSurface, 0.6),
        borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: { xs: 5, md: 6 } }}>
          <Typography
            variant="overline"
            sx={{ color: 'primary.main', display: 'block', mb: 1 }}
          >
            Find Your Path
          </Typography>
          <Typography
            id="order-paths-heading"
            variant="h2"
            component="h2"
            sx={{ color: 'text.primary', mb: 1.5 }}
          >
            Three Ways to Claim Your Treasure
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 520, mx: 'auto' }}
          >
            Whether you have a design ready, want something off the shelf, or need a one-of-a-kind
            creation — there&apos;s a path for you.
          </Typography>

          <Box sx={{ mt: 2 }}>
            <StartHereChooser />
          </Box>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            gap: 3,
          }}
        >
          {ORDER_PATHS.map((path) => (
            <Box
              key={path.key}
              sx={{
                background: path.gradient,
                border: `1px solid ${path.borderColor}`,
                borderRadius: 2,
                p: { xs: 3, md: 4 },
                display: 'flex',
                flexDirection: 'column',
                gap: 2.5,
                transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: `0 12px 40px ${alpha(brandTokens.bgVoid, 0.6)}`,
                },
                '@media (prefers-reduced-motion: reduce)': {
                  '&:hover': { transform: 'none' },
                },
              }}
            >
              <Box aria-hidden="true" sx={{ fontSize: '2.5rem', lineHeight: 1 }}>
                {path.icon}
              </Box>

              <Box sx={{ flex: 1 }}>
                <Typography
                  variant="h5"
                  component="h3"
                  sx={{ mb: 1.5, color: 'text.primary' }}
                >
                  {path.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                  {path.description}
                </Typography>
              </Box>

              <Button
                component={Link}
                href={path.href}
                variant={path.ctaVariant}
                color="primary"
                endIcon={<ArrowForwardIcon />}
                onClick={() => Analytics.pathChosen(path.key)}
                sx={{ alignSelf: 'flex-start' }}
              >
                {path.cta}
              </Button>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  )
}
