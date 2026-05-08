import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { CheckoutPageView } from '@/components/checkout/CheckoutPageView'
import { brandTokens } from '@/theme/theme'

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Review order totals and continue to secure Stripe checkout.',
}

export default function CheckoutPage() {
  return (
    <>
      <Header currentPath="/checkout" />
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Cart', href: '/cart' },
          { label: 'Checkout' },
        ]}
      />

      <Box component="main" id="main-content">
        <Box
          sx={{
            background: `linear-gradient(180deg, ${alpha(brandTokens.bgSurface, 0.9)} 0%, ${brandTokens.bgVoid} 100%)`,
            borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
            pt: { xs: 5, md: 7 },
            pb: { xs: 4, md: 5 },
          }}
        >
          <Container maxWidth="lg">
            <Typography
              component="p"
              variant="overline"
              sx={{ color: brandTokens.forgeGold, mb: 1.2, display: 'block' }}
            >
              Secure Payment
            </Typography>
            <Typography variant="h1" component="h1">
              Checkout
            </Typography>
          </Container>
        </Box>

        <Box sx={{ py: { xs: 4, md: 6 }, backgroundColor: brandTokens.bgVoid }}>
          <Container maxWidth="lg">
            <CheckoutPageView />
          </Container>
        </Box>
      </Box>

      <Footer />
    </>
  )
}
