'use client'

import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

// TODO: Replace with approved testimonials from Supabase (admin-moderated gallery entries or a
// dedicated testimonials table). Display only explicitly permissioned reviews.
const TESTIMONIALS = [
  {
    id: 't-001',
    quote:
      'My tumbler arrived with the most intricate dragon engraving I\'ve ever seen. The forge gods have truly blessed this shop.',
    author: 'Mira T.',
    location: 'Pacific Northwest',
    product: 'Engraved Drinkware',
    stars: 5,
    emoji: '🐉',
  },
  {
    id: 't-002',
    quote:
      'Ordered a full set of leather patches for my LARP kit. They look like actual artifacts — like they were pulled from a prop master\'s collection.',
    author: 'Bren K.',
    location: 'Austin, TX',
    product: 'Leather Goods',
    stars: 5,
    emoji: '⚔️',
  },
  {
    id: 't-003',
    quote:
      'The basswood sign for my home office is absolutely stunning. Communication was clear, production was faster than I expected, and the quality is unmatched.',
    author: 'Lily W.',
    location: 'Vermont',
    product: 'Signs & Decor',
    stars: 5,
    emoji: '🪵',
  },
]

function StarRating({ count }: { count: number }) {
  return (
    <Box
      aria-label={`${count} out of 5 stars`}
      sx={{ display: 'flex', gap: 0.25 }}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Box
          key={i}
          aria-hidden="true"
          sx={{
            fontSize: '0.85rem',
            color: i < count ? brandTokens.forgeGold : alpha(brandTokens.parchment, 0.2),
          }}
        >
          ★
        </Box>
      ))}
    </Box>
  )
}

export function TestimonialsSection() {
  return (
    <Box
      component="section"
      aria-labelledby="testimonials-heading"
      sx={{
        py: { xs: 8, md: 10 },
        backgroundColor: alpha(brandTokens.bgSurface, 0.6),
        borderTop: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
        borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: { xs: 5, md: 6 } }}>
          <Typography variant="overline" sx={{ color: 'primary.main', display: 'block', mb: 1 }}>
            From the Hoard Keepers
          </Typography>
          <Typography
            id="testimonials-heading"
            variant="h2"
            component="h2"
            sx={{ color: 'text.primary' }}
          >
            What the Adventurers Say
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            gap: 3,
          }}
        >
          {TESTIMONIALS.map((t) => (
            <Box
              key={t.id}
              sx={{
                p: { xs: 3, md: 3.5 },
                borderRadius: 2,
                backgroundColor: alpha(brandTokens.bgCard, 0.85),
                border: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                transition: 'border-color 0.2s ease',
                '&:hover': {
                  borderColor: alpha(brandTokens.forgeGold, 0.2),
                },
              }}
            >
              {/* Quote mark */}
              <Box
                aria-hidden="true"
                sx={{
                  fontSize: '3rem',
                  lineHeight: 0.8,
                  color: alpha(brandTokens.forgeGold, 0.3),
                  fontFamily: 'Georgia, serif',
                  fontWeight: 900,
                  userSelect: 'none',
                }}
              >
                &ldquo;
              </Box>

              <Typography
                variant="body1"
                sx={{
                  color: alpha(brandTokens.parchment, 0.88),
                  fontStyle: 'italic',
                  lineHeight: 1.75,
                  flex: 1,
                  fontSize: '0.95rem',
                }}
              >
                {t.quote}
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 'auto' }}>
                <Box
                  aria-hidden="true"
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: alpha(brandTokens.forgeGold, 0.12),
                    border: `1px solid ${alpha(brandTokens.forgeGold, 0.25)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem',
                    flexShrink: 0,
                  }}
                >
                  {t.emoji}
                </Box>
                <Box>
                  <StarRating count={t.stars} />
                  <Typography sx={{ fontSize: '0.85rem', color: 'text.primary', fontWeight: 500 }}>
                    {t.author}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t.product} · {t.location}
                  </Typography>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  )
}
