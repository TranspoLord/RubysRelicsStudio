import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { brandTokens } from '@/theme/theme'

export const metadata: Metadata = {
  title: 'About',
  description:
    'Meet Ruby\'s Relics Studio: one-dragon production, crafted process standards, and what to expect when ordering.',
}

export default function AboutPage() {
  return (
    <>
      <Header currentPath="/about" />
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'About' }]} />

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
              Studio Story
            </Typography>
            <Typography variant="h1" component="h1" sx={{ mb: 1.5 }}>
              One Dragon. Real Craft. No Assembly Line.
            </Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.72), maxWidth: 760 }}>
              Ruby&apos;s Relics Studio is built around intentional, small-batch production. Every piece is reviewed by a real person from setup to packing.
            </Typography>
          </Container>
        </Box>

        <Box sx={{ py: { xs: 5, md: 7 }, backgroundColor: brandTokens.bgVoid }}>
          <Container maxWidth="lg">
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1.15fr 0.85fr' },
                gap: { xs: 2.4, md: 3 },
                mb: { xs: 3.5, md: 4.5 },
              }}
            >
              <InfoCard
                title="How We Work"
                body="Most orders move through a focused path: design prep, machine setup, production, finish work, quality review, and packing. Queue windows are visible on product pages so expectations stay clear."
              />
              <InfoCard
                title="Response Times"
                body="Custom request reviews are typically answered within 1-2 business days. If a project needs feasibility checks, we communicate that before issuing a quote."
              />
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                gap: 1.5,
                mb: { xs: 3.5, md: 4 },
              }}
            >
              <Signal emoji="🛡️" title="Quality First" detail="Every order is inspected before it ships." />
              <Signal emoji="⏱️" title="Queue Transparency" detail="Production windows are called out upfront." />
              <Signal emoji="📬" title="Direct Communication" detail="Questions and approvals stay human, not automated fog." />
            </Box>

            <Box
              sx={{
                p: { xs: 2.3, md: 2.8 },
                borderRadius: 2,
                border: `1px solid ${alpha(brandTokens.parchment, 0.11)}`,
                backgroundColor: alpha(brandTokens.bgSurface, 0.62),
              }}
            >
              <Typography variant="h4" component="h2" sx={{ mb: 1 }}>
                Ready to Start?
              </Typography>
              <Typography sx={{ color: alpha(brandTokens.parchment, 0.7), mb: 2 }}>
                Pick the ordering path that matches your project: category shopping, full catalog browsing, or custom quote intake.
              </Typography>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Action href="/shop">Shop Categories</Action>
                <Action href="/shop/all" muted>
                  Shop All
                </Action>
                <Action href="/custom-orders" muted>
                  Custom Orders
                </Action>
              </Box>
            </Box>
          </Container>
        </Box>
      </Box>

      <Footer />
    </>
  )
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <Box
      sx={{
        p: { xs: 2.1, md: 2.5 },
        borderRadius: 2,
        border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
        backgroundColor: alpha(brandTokens.bgSurface, 0.62),
      }}
    >
      <Typography variant="h5" component="h2" sx={{ mb: 0.8 }}>
        {title}
      </Typography>
      <Typography sx={{ color: alpha(brandTokens.parchment, 0.7) }}>{body}</Typography>
    </Box>
  )
}

function Signal({ emoji, title, detail }: { emoji: string; title: string; detail: string }) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 1.3,
        border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
        backgroundColor: alpha(brandTokens.bgSurface, 0.55),
        textAlign: 'center',
      }}
    >
      <Typography sx={{ fontSize: '1.5rem', mb: 0.55 }} aria-hidden="true">
        {emoji}
      </Typography>
      <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', mb: 0.35 }}>{title}</Typography>
      <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.78rem' }}>{detail}</Typography>
    </Box>
  )
}

function Action({
  href,
  children,
  muted = false,
}: {
  href: string
  children: React.ReactNode
  muted?: boolean
}) {
  return (
    <Box
      component="a"
      href={href}
      sx={{
        px: 1.8,
        py: 0.9,
        borderRadius: 1,
        textDecoration: 'none',
        fontSize: '0.8rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: muted ? alpha(brandTokens.parchment, 0.8) : brandTokens.bgVoid,
        border: muted ? `1px solid ${alpha(brandTokens.parchment, 0.2)}` : 'none',
        backgroundColor: muted ? alpha(brandTokens.parchment, 0.05) : brandTokens.forgeGold,
      }}
    >
      {children}
    </Box>
  )
}
