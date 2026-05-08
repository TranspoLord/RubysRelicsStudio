import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { CartPageView } from '@/components/cart/CartPageView'
import { brandTokens } from '@/theme/theme'

export const metadata: Metadata = {
  title: 'Cart',
  description: 'Review selected products and continue to checkout.',
}

export default function CartPage() {
  return (
    <>
      <Header currentPath="/cart" />
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Cart' }]} />

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
            <Typography component="p" variant="overline" sx={{ color: brandTokens.forgeGold, mb: 1.2, display: 'block' }}>
              Review Your Hoard
            </Typography>
            <Typography variant="h1" component="h1">
              Cart
            </Typography>
          </Container>
        </Box>

        <Box sx={{ py: { xs: 4, md: 6 }, backgroundColor: brandTokens.bgVoid }}>
          <Container maxWidth="lg">
            <CartPageView />
          </Container>
        </Box>
      </Box>

      <Footer />
    </>
  )
}
