import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { ClearCartOnSuccess } from '@/components/checkout/ClearCartOnSuccess'
import { brandTokens } from '@/theme/theme'

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const params = await searchParams
  const sessionId = typeof params.session_id === 'string' ? params.session_id : ''

  return (
    <>
      <ClearCartOnSuccess />
      <Header currentPath="/checkout" />
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Checkout', href: '/checkout' },
          { label: 'Success' },
        ]}
      />

      <Box component="main" id="main-content" sx={{ py: { xs: 6, md: 8 }, backgroundColor: brandTokens.bgVoid }}>
        <Container maxWidth="md">
          <Box
            sx={{
              borderRadius: 2,
              border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
              backgroundColor: alpha(brandTokens.bgSurface, 0.62),
              p: { xs: 2, md: 3 },
              textAlign: 'center',
            }}
          >
            <Typography sx={{ fontSize: '2.2rem', mb: 0.8 }}>✅</Typography>
            <Typography variant="h2" component="h1" sx={{ mb: 1 }}>
              Payment Received
            </Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.72), maxWidth: 620, mx: 'auto', mb: 2 }}>
              Your order is now in our forge queue. You will receive updates as it moves into production and shipping.
            </Typography>
            {sessionId && (
              <Typography sx={{ fontSize: '0.75rem', color: alpha(brandTokens.parchment, 0.52), mb: 2 }}>
                Session: {sessionId}
              </Typography>
            )}

            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1 }}>
              <Button component="a" href="/shop" variant="contained">
                Continue Shopping
              </Button>
              <Button component="a" href="/custom-orders" variant="outlined">
                Request Another Project
              </Button>
            </Box>
          </Box>
        </Container>
      </Box>

      <Footer />
    </>
  )
}
