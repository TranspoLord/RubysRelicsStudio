import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { RESOURCE_INDEX } from '@/app/resources/content'
import { brandTokens } from '@/theme/theme'

export const metadata: Metadata = {
  title: 'Resources',
  description:
    'Policy, legal, and process guidance for shopping and custom ordering with Ruby\'s Relics Studio.',
}

export default function ResourcesHubPage() {
  return (
    <>
      <Header currentPath="/resources" />
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Resources' }]} />

      <Box component="main" id="main-content">
        <Box
          sx={{
            background: `linear-gradient(180deg, ${alpha(brandTokens.bgSurface, 0.92)} 0%, ${brandTokens.bgVoid} 100%)`,
            borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
            pt: { xs: 5, md: 7 },
            pb: { xs: 4, md: 6 },
          }}
        >
          <Container maxWidth="lg">
            <Typography component="p" variant="overline" sx={{ color: brandTokens.forgeGold, mb: 1.2, display: 'block' }}>
              Trust and Policy Hub
            </Typography>
            <Typography variant="h1" component="h1" sx={{ mb: 1.4 }}>
              The Forge Codex
            </Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.72), maxWidth: 820 }}>
              These documents cover ordering expectations, privacy handling, shipping, returns, artwork requirements, and material guidance. Use them as your single policy reference while browsing or ordering.
            </Typography>
          </Container>
        </Box>

        <Box sx={{ py: { xs: 5, md: 7 }, backgroundColor: brandTokens.bgVoid }}>
          <Container maxWidth="lg">
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                gap: { xs: 2, md: 2.5 },
              }}
            >
              {RESOURCE_INDEX.map((item) => (
                <Box
                  key={item.slug}
                  component="a"
                  href={`/resources/${item.slug}`}
                  sx={{
                    borderRadius: 2,
                    border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
                    backgroundColor: alpha(brandTokens.bgSurface, 0.6),
                    textDecoration: 'none',
                    color: 'inherit',
                    p: { xs: 2, md: 2.2 },
                    transition: 'border-color 0.2s ease, transform 0.2s ease, background-color 0.2s ease',
                    '&:hover': {
                      borderColor: alpha(brandTokens.forgeGold, 0.4),
                      backgroundColor: alpha(brandTokens.bgSurface, 0.82),
                      transform: 'translateY(-2px)',
                    },
                    '@media (prefers-reduced-motion: reduce)': {
                      transition: 'none',
                      '&:hover': { transform: 'none' },
                    },
                  }}
                >
                  <Typography variant="h5" component="h2" sx={{ mb: 0.7 }}>
                    {item.title}
                  </Typography>
                  <Typography sx={{ color: alpha(brandTokens.parchment, 0.66), fontSize: '0.86rem', lineHeight: 1.65, mb: 1.15 }}>
                    {item.summary}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: alpha(brandTokens.parchment, 0.48) }}>
                    Last updated: {item.lastUpdated}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Container>
        </Box>
      </Box>

      <Footer />
    </>
  )
}
