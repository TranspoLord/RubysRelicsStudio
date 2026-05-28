'use client'

import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import Link from 'next/link'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

const STEPS = [
  {
    step: '01',
    icon: '💡',
    title: 'You Bring the Idea',
    description:
      'Upload your design, describe your vision, or simply pick from our ready-made hoard. Reference photos, rough sketches, and big ideas are all welcome.',
    color: brandTokens.forgeGold,
  },
  {
    step: '02',
    icon: '🔮',
    title: 'We Consult the Forge',
    description:
      'We review your request, confirm the details, and add your order to the production queue. For custom commissions, we\'ll send a quote for approval first.',
    color: brandTokens.copper,
  },
  {
    step: '03',
    icon: '🐉',
    title: 'One Dragon Crafts It',
    description:
      'Your piece is handcrafted on the xTool M1 Ultra with precision care. Every order is made to order — no mass production, no shortcuts.',
    color: brandTokens.rubyRed,
  },
  {
    step: '04',
    icon: '📦',
    title: 'Griffins Deliver It Home',
    description:
      'We pack your treasure with care and send it flying to your lair via USPS. You\'ll receive tracking updates along the way.',
    color: '#5A9A3A',
  },
]

export function ProcessStrip() {
  return (
    <Box
      component="section"
      aria-labelledby="process-heading"
      sx={{ py: { xs: 8, md: 10 } }}
    >
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: { xs: 6, md: 8 } }}>
          <Typography variant="overline" sx={{ color: 'primary.main', display: 'block', mb: 1 }}>
            The Craft Journey
          </Typography>
          <Typography
            id="process-heading"
            variant="h2"
            component="h2"
            sx={{ color: 'text.primary', mb: 1.5 }}
          >
            From Idea to Your Door
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 480, mx: 'auto' }}>
            Every piece follows the same path through the forge. Here&apos;s what to expect.
          </Typography>
        </Box>

        {/* Steps */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
            gap: 3,
            position: 'relative',
          }}
        >
          {/* Connector line (desktop) */}
          <Box
            aria-hidden="true"
            sx={{
              display: { xs: 'none', md: 'block' },
              position: 'absolute',
              top: 36,
              left: '12.5%',
              right: '12.5%',
              height: 1,
              background: `linear-gradient(90deg, ${alpha(brandTokens.forgeGold, 0.3)}, ${alpha(brandTokens.rubyRed, 0.3)})`,
              zIndex: 0,
            }}
          />

          {STEPS.map((step, index) => (
            <Box
              key={step.step}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: { xs: 'flex-start', sm: 'center' },
                textAlign: { xs: 'left', sm: 'center' },
                gap: 2,
                position: 'relative',
                zIndex: 1,
              }}
            >
              {/* Step bubble */}
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: `radial-gradient(circle, ${alpha(step.color, 0.25)} 0%, ${alpha(step.color, 0.08)} 100%)`,
                  border: `2px solid ${alpha(step.color, 0.45)}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0,
                  flexShrink: 0,
                  position: 'relative',
                }}
              >
                <Box aria-hidden="true" sx={{ fontSize: '1.6rem', lineHeight: 1 }}>
                  {step.icon}
                </Box>
                {/* Step number */}
                <Box
                  aria-hidden="true"
                  sx={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    backgroundColor: step.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#0C0A07', lineHeight: 1 }}>
                    {index + 1}
                  </Typography>
                </Box>
              </Box>

              <Box>
                <Typography variant="h6" component="h3" sx={{ mb: 1, color: 'text.primary', fontSize: '1rem' }}>
                  {step.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                  {step.description}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Button
            component={Link}
            href="/shop"
            variant="outlined"
            color="primary"
            endIcon={<ArrowForwardIcon />}
          >
            Explore Products
          </Button>
        </Box>
      </Container>
    </Box>
  )
}
