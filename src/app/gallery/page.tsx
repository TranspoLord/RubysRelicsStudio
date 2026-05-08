import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { getPublishedGallery } from '@/lib/supabase/queries/homepage'
import { brandTokens } from '@/theme/theme'
import { GalleryExplorer } from '@/components/gallery/GalleryExplorer'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Gallery',
  description:
    'Explore finished pieces from Ruby\'s Relics Studio and filter by category, material, and theme before you shop.',
}

export default async function GalleryPage() {
  const gallery = await getPublishedGallery(120)

  return (
    <>
      <Header currentPath="/gallery" />
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Gallery' }]} />

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
              Curated Showcase
            </Typography>
            <Typography variant="h1" component="h1" sx={{ mb: 1.5 }}>
              Fresh from the Forge
            </Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.72), maxWidth: 760 }}>
              Browse approved pieces and find your style direction before placing an order. Filter by category, material, or theme mood.
            </Typography>
          </Container>
        </Box>

        <Box sx={{ py: { xs: 5, md: 7 }, backgroundColor: brandTokens.bgVoid }}>
          <Container maxWidth="lg">
            <GalleryExplorer items={gallery} />

            <Box
              sx={{
                mt: { xs: 4, md: 5 },
                p: { xs: 2.3, md: 2.8 },
                borderRadius: 2,
                border: `1px solid ${alpha(brandTokens.parchment, 0.11)}`,
                backgroundColor: alpha(brandTokens.bgSurface, 0.6),
              }}
            >
              <Typography variant="h4" component="h2" sx={{ mb: 1 }}>
                See Something Close to Your Vision?
              </Typography>
              <Typography sx={{ color: alpha(brandTokens.parchment, 0.7), mb: 2 }}>
                Use a matching category for faster checkout, or submit a custom request if you need a one-off adaptation.
              </Typography>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Box
                  component="a"
                  href="/shop"
                  sx={{
                    px: 1.8,
                    py: 0.9,
                    borderRadius: 1,
                    textDecoration: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: brandTokens.bgVoid,
                    backgroundColor: brandTokens.forgeGold,
                  }}
                >
                  Shop Categories
                </Box>

                <Box
                  component="a"
                  href="/custom-orders"
                  sx={{
                    px: 1.8,
                    py: 0.9,
                    borderRadius: 1,
                    textDecoration: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: alpha(brandTokens.parchment, 0.8),
                    border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`,
                    backgroundColor: alpha(brandTokens.parchment, 0.05),
                  }}
                >
                  Request Custom Order
                </Box>
              </Box>
            </Box>
          </Container>
        </Box>
      </Box>

      <Footer />
    </>
  )
}
