import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { getCategories } from '@/lib/supabase/queries/homepage'
import { brandTokens } from '@/theme/theme'
import { CustomOrderIntakeForm } from '@/components/custom-orders/CustomOrderIntakeForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Custom Orders',
  description:
    'Submit a custom request for one-off commissions, unusual blanks, and made-for-you pieces that do not fit standard catalog options.',
}

export default async function CustomOrdersPage() {
  const categories = await getCategories()

  return (
    <>
      <Header currentPath="/custom-orders" />
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Custom Orders' }]} />

      <Box component="main" id="main-content">
        <Box
          sx={{
            background: `linear-gradient(180deg, ${alpha(brandTokens.bgSurface, 0.9)} 0%, ${brandTokens.bgVoid} 100%)`,
            borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
            pt: { xs: 5, md: 7 },
            pb: { xs: 4, md: 6 },
          }}
        >
          <Container maxWidth="lg">
            <Typography component="p" variant="overline" sx={{ color: brandTokens.forgeGold, mb: 1.2, display: 'block' }}>
              Guided Quote Request
            </Typography>
            <Typography variant="h1" component="h1" sx={{ mb: 1.4 }}>
              Bring Us Your Wild Idea
            </Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.72), maxWidth: 800 }}>
              Use this intake when your project does not fit normal product options. Share what you need, upload references, and we will review feasibility before quoting.
            </Typography>
          </Container>
        </Box>

        <Box sx={{ py: { xs: 5, md: 7 }, backgroundColor: brandTokens.bgVoid }}>
          <Container maxWidth="lg">
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 320px' },
                gap: { xs: 2.5, md: 3 },
                alignItems: 'start',
              }}
            >
              <CustomOrderIntakeForm
                categories={categories.map((c) => ({
                  key: c.key,
                  display_name: c.display_name,
                  slug: c.slug,
                }))}
              />

              <Box
                sx={{
                  border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                  backgroundColor: alpha(brandTokens.bgSurface, 0.62),
                  borderRadius: 2,
                  p: { xs: 2, md: 2.2 },
                  position: { lg: 'sticky' },
                  top: { lg: 92 },
                }}
              >
                <Typography variant="h5" component="h2" sx={{ mb: 1.2 }}>
                  What Happens Next
                </Typography>

                <Box sx={{ display: 'grid', gap: 1.4 }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.8rem', color: brandTokens.forgeGold, mb: 0.3 }}>1. Intake Review</Typography>
                    <Typography sx={{ fontSize: '0.84rem', color: alpha(brandTokens.parchment, 0.72) }}>
                      We confirm scope, materials, and feasibility.
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.8rem', color: brandTokens.forgeGold, mb: 0.3 }}>2. Quote + Timeline</Typography>
                    <Typography sx={{ fontSize: '0.84rem', color: alpha(brandTokens.parchment, 0.72) }}>
                      You receive pricing and estimated production window.
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.8rem', color: brandTokens.forgeGold, mb: 0.3 }}>3. Approval + Payment</Typography>
                    <Typography sx={{ fontSize: '0.84rem', color: alpha(brandTokens.parchment, 0.72) }}>
                      Once approved, payment link and production slot are issued.
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${alpha(brandTokens.parchment, 0.1)}` }}>
                  <Typography sx={{ fontSize: '0.75rem', color: alpha(brandTokens.parchment, 0.55), lineHeight: 1.6 }}>
                    Tip: Include dimensions, target use case, and any must-have constraints to speed up review.
                  </Typography>
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
