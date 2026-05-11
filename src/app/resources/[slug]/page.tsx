import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { getResourcePages } from '@/app/resources/content'
import { getContactSettings } from '@/lib/storefront-settings'
import { brandTokens } from '@/theme/theme'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return Object.keys(getResourcePages('support@example.com')).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const routeParams = await params
  const page = getResourcePages('support@example.com')[routeParams.slug]

  if (!page) {
    return {
      title: 'Resource Not Found',
      description: 'Requested resource document could not be found.',
    }
  }

  return {
    title: page.title,
    description: page.summary,
  }
}

export default async function ResourceDocumentPage({ params }: Props) {
  const routeParams = await params
  const contact = await getContactSettings()
  const page = getResourcePages(contact.support_email)[routeParams.slug]

  if (!page) notFound()

  return (
    <>
      <Header currentPath="/resources" />
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Resources', href: '/resources' },
          { label: page.title },
        ]}
      />

      <Box component="main" id="main-content">
        <Box
          sx={{
            background: `linear-gradient(180deg, ${alpha(brandTokens.bgSurface, 0.92)} 0%, ${brandTokens.bgVoid} 100%)`,
            borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
            pt: { xs: 5, md: 7 },
            pb: { xs: 4, md: 6 },
          }}
        >
          <Container maxWidth="md">
            <Typography component="p" variant="overline" sx={{ color: brandTokens.forgeGold, mb: 1.2, display: 'block' }}>
              Resource Document
            </Typography>
            <Typography variant="h1" component="h1" sx={{ mb: 1.2 }}>
              {page.title}
            </Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.72), maxWidth: 740, mb: 1.25 }}>
              {page.summary}
            </Typography>
            <Typography sx={{ fontSize: '0.74rem', color: alpha(brandTokens.parchment, 0.5) }}>
              Last updated: {page.lastUpdated}
            </Typography>
          </Container>
        </Box>

        <Box sx={{ py: { xs: 5, md: 7 }, backgroundColor: brandTokens.bgVoid }}>
          <Container maxWidth="md">
            <Box sx={{ display: 'grid', gap: { xs: 2, md: 2.5 } }}>
              {page.sections.map((section) => (
                <Box
                  key={section.heading}
                  sx={{
                    borderRadius: 2,
                    border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
                    backgroundColor: alpha(brandTokens.bgSurface, 0.62),
                    p: { xs: 2, md: 2.3 },
                  }}
                >
                  <Typography variant="h4" component="h2" sx={{ mb: 1 }}>
                    {section.heading}
                  </Typography>

                  <Box sx={{ display: 'grid', gap: 0.85 }}>
                    {section.body.map((paragraph, index) => (
                      <Typography key={`${section.heading}-${index}`} sx={{ color: alpha(brandTokens.parchment, 0.74) }}>
                        {paragraph}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              ))}

              <Box
                sx={{
                  mt: 0.5,
                  borderRadius: 1.5,
                  border: `1px solid ${alpha(brandTokens.forgeGold, 0.3)}`,
                  backgroundColor: alpha(brandTokens.forgeGold, 0.1),
                  p: { xs: 1.6, md: 1.9 },
                }}
              >
                <Typography sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.8) }}>
                  Questions about this policy can be sent to {contact.support_email}.
                </Typography>
              </Box>
            </Box>
          </Container>
        </Box>
      </Box>

      <Footer />
    </>
  )
}
