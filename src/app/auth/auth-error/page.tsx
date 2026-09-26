import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { brandTokens } from '@/theme/theme'

export const metadata: Metadata = {
  title: 'Sign-in problem',
  robots: { index: false, follow: false },
}

const FALLBACK_MESSAGE =
  'Something went wrong while completing sign-in. Please try again with Google.'

const MAX_REASON_LENGTH = 300

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams
  const message =
    typeof reason === 'string' && reason.trim()
      ? reason.trim().slice(0, MAX_REASON_LENGTH)
      : FALLBACK_MESSAGE

  return (
    <>
      <Header currentPath="/sign-in" />

      <Box component="main" id="main-content" sx={{ py: { xs: 6, md: 8 }, backgroundColor: brandTokens.bgVoid }}>
        <Container maxWidth="sm">
          <Box
            sx={{
              borderRadius: 2,
              border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
              backgroundColor: alpha(brandTokens.bgSurface, 0.62),
              p: { xs: 2.2, md: 2.8 },
              textAlign: 'center',
            }}
          >
            <Typography sx={{ fontSize: '2rem', mb: 0.8 }} aria-hidden>
              🔒
            </Typography>
            <Typography variant="h3" component="h1" sx={{ mb: 1.2 }}>
              We could not sign you in
            </Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.68), mb: 2 }}>
              {message}
            </Typography>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1 }}>
              <Button component="a" href="/sign-in" variant="contained">
                Try again
              </Button>
              <Button component="a" href="/" variant="outlined">
                Back to the shop
              </Button>
            </Box>
          </Box>
        </Container>
      </Box>

      <Footer />
    </>
  )
}
