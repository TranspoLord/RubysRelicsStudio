import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SignIn } from '@/components/auth/SignIn'
import { sanitizeAuthNextPath } from '@/lib/auth/redirect'
import { brandTokens } from '@/theme/theme'

export const metadata: Metadata = {
  title: 'Sign in',
  description: "Sign in to Ruby's Relics Studio with your Google account.",
  robots: { index: false, follow: false },
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  // `next` arrives from the URL, so it is sanitized before it reaches the
  // OAuth `redirectTo` builder.
  const next = sanitizeAuthNextPath(params.next)

  return (
    <>
      <Header currentPath="/sign-in" />

      <Box component="main" id="main-content" sx={{ py: { xs: 6, md: 8 }, backgroundColor: brandTokens.bgVoid }}>
        <Container maxWidth="sm">
          <SignIn next={next} />
        </Container>
      </Box>

      <Footer />
    </>
  )
}
