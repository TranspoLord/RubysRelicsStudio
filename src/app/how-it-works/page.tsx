import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { MaterialPreview } from '@/components/how-it-works/MaterialPreview'
import { getCategories, getMaterials } from '@/lib/supabase/queries/homepage'
import { brandTokens } from '@/theme/theme'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'How It Works',
  description:
    'Learn how Ruby\'s Relics Studio handles engraving, sublimation, cutting, quality checks, and shipping before you order.',
}

interface SectionDef {
  id: string
  title: string
  eyebrow: string
  emoji: string
  description: string
}

const HOW_SECTIONS: SectionDef[] = [
  {
    id: 'materials',
    title: 'Materials and Blank Selection',
    eyebrow: 'Step 1',
    emoji: '🧱',
    description:
      'We pick the right blank and finish first: wood, acrylic, leather, powder-coated drinkware, or sublimation-ready surfaces based on your design and use case.',
  },
  {
    id: 'engraving',
    title: 'Engraving Setup',
    eyebrow: 'Step 2A',
    emoji: '🔥',
    description:
      'Laser engraving settings are tuned per material for contrast, detail, and durability. We test alignment and scaling before production runs.',
  },
  {
    id: 'sublimation',
    title: 'Sublimation Workflow',
    eyebrow: 'Step 2B',
    emoji: '🌈',
    description:
      'Artwork is prepped for print, mirrored, and heat transferred into coated substrates so color bonds into the surface instead of sitting on top.',
  },
  {
    id: 'cutting',
    title: 'Cutting and Finishing',
    eyebrow: 'Step 3',
    emoji: '✂️',
    description:
      'Cut paths are optimized for clean edges. We then finish edges, clean residue, and prep attachment hardware or backing when applicable.',
  },
  {
    id: 'production',
    title: 'Production Window',
    eyebrow: 'Step 4',
    emoji: '⏱️',
    description:
      'Most orders move through queue in a few business days, with larger or highly custom runs taking longer. You can see estimate bands on product pages.',
  },
  {
    id: 'quality',
    title: 'Quality Review',
    eyebrow: 'Step 5',
    emoji: '🛡️',
    description:
      'Every order is checked for alignment, readability, edge quality, and overall finish before it is packed.',
  },
  {
    id: 'shipping',
    title: 'Packing and Shipping',
    eyebrow: 'Step 6',
    emoji: '📦',
    description:
      'Items are packed to protect finish and structure in transit. Tracking details are sent once your order leaves the forge.',
  },
]

function normalizeAnchor(input?: string | null): string | null {
  if (!input) return null
  const value = input.trim().replace(/^#/, '')
  return value.length > 0 ? value : null
}

export default async function HowItWorksPage() {
  const [categories, materials] = await Promise.all([getCategories(), getMaterials()])

  const categoriesByAnchor = categories.reduce<Record<string, typeof categories>>((acc, cat) => {
    const anchor = normalizeAnchor(cat.how_it_works_anchor) ?? 'production'
    if (!acc[anchor]) acc[anchor] = []
    acc[anchor].push(cat)
    return acc
  }, {})

  return (
    <>
      <Header currentPath="/how-it-works" />
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'How It Works' }]} />

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
              Process Guide
            </Typography>
            <Typography variant="h1" component="h1" sx={{ mb: 1.5 }}>
              How the Forge Works
            </Typography>
            <Typography
              variant="body1"
              sx={{ color: alpha(brandTokens.parchment, 0.72), maxWidth: 760, mb: 3 }}
            >
              Follow the path from idea to finished piece. Jump to any section, then hop directly into matching shop categories when you are ready to order.
            </Typography>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {HOW_SECTIONS.map((section) => (
                <Box
                  key={section.id}
                  component="a"
                  href={`#${section.id}`}
                  sx={{
                    px: 1.4,
                    py: 0.7,
                    borderRadius: 1,
                    fontSize: '0.75rem',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    color: alpha(brandTokens.parchment, 0.78),
                    border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`,
                    backgroundColor: alpha(brandTokens.parchment, 0.05),
                    '&:hover': {
                      borderColor: alpha(brandTokens.forgeGold, 0.45),
                      color: brandTokens.forgeGold,
                    },
                  }}
                >
                  {section.title}
                </Box>
              ))}
            </Box>
          </Container>
        </Box>

        <Box sx={{ py: { xs: 5, md: 7 }, backgroundColor: brandTokens.bgVoid }}>
          <Container maxWidth="lg">
            <Box
              id="materials"
              sx={{
                scrollMarginTop: 100,
                mb: { xs: 4, md: 5 },
                p: { xs: 2, md: 2.5 },
                borderRadius: 2,
                border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                backgroundColor: alpha(brandTokens.bgSurface, 0.65),
              }}
            >
              <Typography variant="overline" sx={{ color: brandTokens.forgeGold, display: 'block', mb: 0.8 }}>
                Interactive Material Preview
              </Typography>
              <Typography variant="h3" component="h2" sx={{ mb: 1.5 }}>
                Compare Surfaces Before You Pick
              </Typography>
              <Typography sx={{ color: alpha(brandTokens.parchment, 0.72), mb: 2.2 }}>
                Tap through common materials to understand how they behave in engraving, sublimation, and finishing.
              </Typography>
              <MaterialPreview materials={materials} />
            </Box>

            <Box sx={{ display: 'grid', gap: { xs: 2, md: 2.5 } }}>
              {HOW_SECTIONS.filter((s) => s.id !== 'materials').map((section) => {
                const related = categoriesByAnchor[section.id] ?? []

                return (
                  <Box
                    key={section.id}
                    id={section.id}
                    sx={{
                      scrollMarginTop: 100,
                      p: { xs: 2, md: 2.5 },
                      borderRadius: 2,
                      border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                      background: `linear-gradient(135deg, ${alpha(brandTokens.bgSurface, 0.85)} 0%, ${alpha(brandTokens.bgVoid, 0.9)} 100%)`,
                    }}
                  >
                    <Typography variant="overline" sx={{ color: brandTokens.forgeGold, display: 'block', mb: 0.5 }}>
                      {section.eyebrow}
                    </Typography>
                    <Typography variant="h3" component="h2" sx={{ mb: 1 }}>
                      {section.emoji} {section.title}
                    </Typography>
                    <Typography sx={{ color: alpha(brandTokens.parchment, 0.72), mb: related.length > 0 ? 1.6 : 0 }}>
                      {section.description}
                    </Typography>

                    {related.length > 0 && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.9 }}>
                        {related.map((cat) => (
                          <Box
                            key={cat.key}
                            component="a"
                            href={`/shop/categories/${cat.slug}`}
                            sx={{
                              px: 1.2,
                              py: 0.65,
                              borderRadius: 1,
                              fontSize: '0.78rem',
                              textDecoration: 'none',
                              color: brandTokens.forgeGold,
                              backgroundColor: alpha(brandTokens.forgeGold, 0.1),
                              border: `1px solid ${alpha(brandTokens.forgeGold, 0.3)}`,
                              '&:hover': { backgroundColor: alpha(brandTokens.forgeGold, 0.16) },
                            }}
                          >
                            {cat.emoji ? `${cat.emoji} ` : ''}
                            {cat.display_name}
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                )
              })}
            </Box>

            <Box
              sx={{
                mt: { xs: 4, md: 5 },
                p: { xs: 2.4, md: 3 },
                borderRadius: 2,
                border: `1px solid ${alpha(brandTokens.forgeGold, 0.25)}`,
                background: `linear-gradient(135deg, ${alpha(brandTokens.forgeGold, 0.18)} 0%, ${alpha(brandTokens.bgSurface, 0.55)} 100%)`,
              }}
            >
              <Typography variant="h4" component="h2" sx={{ mb: 1 }}>
                Ready to Choose a Path?
              </Typography>
              <Typography sx={{ color: alpha(brandTokens.parchment, 0.72), mb: 2 }}>
                Browse by category, view the full catalog, or submit a custom request if your idea does not fit a standard product yet.
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
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    fontSize: '0.8rem',
                    textTransform: 'uppercase',
                    color: brandTokens.bgVoid,
                    backgroundColor: brandTokens.forgeGold,
                  }}
                >
                  Shop by Category
                </Box>

                <Box
                  component="a"
                  href="/shop/all"
                  sx={{
                    px: 1.8,
                    py: 0.9,
                    borderRadius: 1,
                    textDecoration: 'none',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    fontSize: '0.8rem',
                    textTransform: 'uppercase',
                    color: brandTokens.forgeGold,
                    border: `1px solid ${alpha(brandTokens.forgeGold, 0.4)}`,
                    backgroundColor: alpha(brandTokens.forgeGold, 0.08),
                  }}
                >
                  Shop All
                </Box>

                <Box
                  component="a"
                  href="/custom-orders"
                  sx={{
                    px: 1.8,
                    py: 0.9,
                    borderRadius: 1,
                    textDecoration: 'none',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    fontSize: '0.8rem',
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
