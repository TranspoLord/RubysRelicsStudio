'use client'

import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid2'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import NextLink from 'next/link'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

const SHOP_LINKS = [
  { label: 'Stickers', href: '/shop/categories/stickers' },
  { label: 'Engraved Drinkware', href: '/shop/categories/engraved-drinkware' },
  { label: 'Sublimated Gifts', href: '/shop/categories/sublimated-gifts' },
  { label: 'Signs & Decor', href: '/shop/categories/signs-and-decor' },
  { label: 'Acrylic Pieces', href: '/shop/categories/acrylic-pieces' },
  { label: 'Leather Goods', href: '/shop/categories/leather-goods' },
  { label: 'Ready-Made', href: '/shop/ready-made' },
]

const COMPANY_LINKS = [
  { label: 'About', href: '/about' },
  { label: 'Custom Orders', href: '/custom-orders' },
]

const LEGAL_LINKS = [
  { label: 'Terms of Service', href: '/resources/terms' },
  { label: 'Privacy Policy', href: '/resources/privacy' },
  { label: 'Cookie Policy', href: '/resources/cookies' },
  { label: 'Returns & Refunds', href: '/resources/returns' },
  { label: 'Shipping Policy', href: '/resources/shipping' },
]

const RESOURCE_LINKS = [
  { label: 'Materials Guide', href: '/resources/materials' },
  { label: 'Artwork Requirements', href: '/resources/artwork' },
  { label: 'Care Instructions', href: '/resources/care' },
  { label: 'Safety & Sourcing', href: '/resources/safety' },
  { label: 'FAQ', href: '/resources/faq' },
]

function FooterColumn({
  heading,
  links,
}: {
  heading: string
  links: { label: string; href: string }[]
}) {
  return (
    <Box>
      <Typography
        variant="overline"
        component="h3"
        sx={{ color: 'primary.main', mb: 2, display: 'block' }}
      >
        {heading}
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {links.map((link) => (
          <li key={link.href}>
            <Link
              component={NextLink}
              href={link.href}
              sx={{
                color: 'text.secondary',
                textDecoration: 'none',
                fontSize: '0.875rem',
                '&:hover': { color: 'text.primary' },
              }}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </Box>
    </Box>
  )
}

export function Footer() {
  return (
    <Box
      component="footer"
      role="contentinfo"
      sx={{
        backgroundColor: alpha(brandTokens.bgSurface, 0.98),
        borderTop: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
        pt: { xs: 6, md: 8 },
        pb: 4,
        mt: 'auto',
      }}
    >
      <Container maxWidth="lg">
        {/* ── Brand + tagline ──────────────────────────────────────────────── */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            gap: { xs: 2, md: 6 },
            mb: 6,
            alignItems: { md: 'flex-start' },
          }}
        >
          <Box sx={{ flexShrink: 0, maxWidth: 260 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
              <Box aria-hidden="true" sx={{ fontSize: '1.4rem' }}>
                🔥
              </Box>
              <Typography
                sx={{
                  fontFamily: 'var(--font-cinzel, serif)',
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  background: `linear-gradient(135deg, ${brandTokens.forgeGoldDark}, ${brandTokens.forgeGold}, ${brandTokens.forgeGoldLight})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Ruby&apos;s Relics Studio
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
              Handcrafted treasures forged with laser precision. Custom engravings, sublimation,
              and made-to-order creations — each one made by one dragon, with care.
            </Typography>
          </Box>

          {/* ── Nav columns ─────────────────────────────────────────────────── */}
          <Grid container spacing={4} sx={{ flex: 1 }}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <FooterColumn heading="Shop" links={SHOP_LINKS} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <FooterColumn heading="Studio" links={COMPANY_LINKS} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <FooterColumn heading="Legal" links={LEGAL_LINKS} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <FooterColumn heading="Resources" links={RESOURCE_LINKS} />
            </Grid>
          </Grid>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* ── Bottom bar ───────────────────────────────────────────────────── */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { sm: 'center' },
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.03em' }}>
            © {new Date().getFullYear()} Ruby&apos;s Relics Studio. All rights reserved.
            &nbsp;|&nbsp; Handcrafted with 🔥 by one dragon.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Link
              component={NextLink}
              href="/resources/cookies"
              sx={{ fontSize: '0.75rem', color: 'text.secondary', textDecoration: 'none', '&:hover': { color: 'text.primary' } }}
            >
              Cookie Settings
            </Link>
            <Link
              component={NextLink}
              href="/resources/terms"
              sx={{ fontSize: '0.75rem', color: 'text.secondary', textDecoration: 'none', '&:hover': { color: 'text.primary' } }}
            >
              Terms
            </Link>
            <Link
              component={NextLink}
              href="/resources/privacy"
              sx={{ fontSize: '0.75rem', color: 'text.secondary', textDecoration: 'none', '&:hover': { color: 'text.primary' } }}
            >
              Privacy
            </Link>
          </Box>
        </Box>
      </Container>
    </Box>
  )
}
