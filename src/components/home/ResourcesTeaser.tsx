'use client'

import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import Link from 'next/link'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

const RESOURCE_LINKS = [
  {
    emoji: '📋',
    title: 'Terms of Service',
    description: 'Our full usage terms and customer agreement.',
    href: '/resources/terms',
  },
  {
    emoji: '🔒',
    title: 'Privacy Policy',
    description: 'How we handle your data and protect your privacy.',
    href: '/resources/privacy',
  },
  {
    emoji: '↩️',
    title: 'Returns & Refunds',
    description: 'What\'s covered, what\'s not, and how to start a return.',
    href: '/resources/returns',
  },
  {
    emoji: '📦',
    title: 'Shipping Policy',
    description: 'Carriers, timelines, and how we handle lost or damaged packages.',
    href: '/resources/shipping',
  },
  {
    emoji: '🎨',
    title: 'Artwork Requirements',
    description: 'File types, resolution minimums, and IP / copyright guidance.',
    href: '/resources/artwork',
  },
  {
    emoji: '🛡️',
    title: 'Safety & Materials',
    description: 'Supported materials, hazardous material policy, and sourcing notes.',
    href: '/resources/safety',
  },
]

export function ResourcesTeaser() {
  return (
    <Box
      component="section"
      aria-labelledby="resources-heading"
      sx={{
        py: { xs: 8, md: 10 },
        backgroundColor: alpha(brandTokens.bgSurface, 0.5),
        borderTop: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
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
              Policies & Trust
            </Typography>
            <Typography
              id="resources-heading"
              variant="h2"
              component="h2"
              sx={{ color: 'text.primary', mb: 1 }}
            >
              The Forge&apos;s Codex
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 440 }}>
              Everything you need to shop and order with confidence — policies, materials guidance,
              and legal documents all in one place.
            </Typography>
          </Box>
          <Button
            component={Link}
            href="/resources"
            variant="outlined"
            color="primary"
            size="small"
            endIcon={<ArrowForwardIcon />}
            sx={{ flexShrink: 0 }}
          >
            Full Resource Hub
          </Button>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          {RESOURCE_LINKS.map((res) => (
            <Box
              key={res.href}
              component={Link}
              href={res.href}
              aria-label={`${res.title} — ${res.description}`}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 2,
                p: 2.5,
                borderRadius: 2,
                border: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
                backgroundColor: alpha(brandTokens.bgCard, 0.5),
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'border-color 0.2s ease, background-color 0.2s ease',
                '&:hover': {
                  borderColor: alpha(brandTokens.forgeGold, 0.25),
                  backgroundColor: alpha(brandTokens.bgCard, 0.8),
                },
                '&:focus-visible': {
                  outline: `2px solid ${brandTokens.forgeGold}`,
                  outlineOffset: '2px',
                },
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  borderRadius: 1.5,
                  backgroundColor: alpha(brandTokens.forgeGold, 0.08),
                  border: `1px solid ${alpha(brandTokens.forgeGold, 0.15)}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem',
                }}
              >
                {res.emoji}
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography
                  variant="subtitle2"
                  sx={{ color: 'text.primary', mb: 0.5, fontSize: '0.9rem' }}
                >
                  {res.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', lineHeight: 1.6 }}>
                  {res.description}
                </Typography>
              </Box>
              <ArrowForwardIcon
                aria-hidden="true"
                sx={{ fontSize: '0.9rem', color: alpha(brandTokens.parchment, 0.3), flexShrink: 0, mt: 0.5 }}
              />
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  )
}
