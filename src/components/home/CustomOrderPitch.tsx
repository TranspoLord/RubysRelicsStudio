'use client'

import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import Link from 'next/link'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'
import { Analytics } from '@/lib/analytics/events'

const IDEA_TYPES = [
  'A one-of-a-kind commission',
  'Something you sketched on a napkin',
  'An unusual material or object',
  'A piece that needs feasibility review',
  'A bulk order with unique requirements',
]

export function CustomOrderPitch() {
  return (
    <Box
      component="section"
      aria-labelledby="custom-pitch-heading"
      sx={{
        py: { xs: 8, md: 10 },
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(135deg, 
          ${alpha(brandTokens.rubyRed, 0.12)} 0%, 
          ${alpha(brandTokens.bgSurface, 0.95)} 40%, 
          ${alpha(brandTokens.forgeGoldDark, 0.1)} 100%
        )`,
        borderTop: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
        borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
      }}
    >
      {/* Background glow */}
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 50% 60% at 80% 50%, ${alpha(brandTokens.rubyRed, 0.08)} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: { xs: 5, md: 8 },
            alignItems: 'center',
          }}
        >
          {/* Left — pitch copy */}
          <Box>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                mb: 3,
                px: 2,
                py: 0.75,
                borderRadius: 1,
                backgroundColor: alpha(brandTokens.rubyRed, 0.1),
                border: `1px solid ${alpha(brandTokens.rubyRed, 0.3)}`,
              }}
            >
              <Box component="span" aria-hidden="true" sx={{ fontSize: '0.9rem' }}>🪄</Box>
              <Typography
                variant="overline"
                sx={{ color: 'secondary.light', letterSpacing: '0.1em', lineHeight: 1 }}
              >
                Custom Commissions Open
              </Typography>
            </Box>

            <Typography
              id="custom-pitch-heading"
              variant="h2"
              component="h2"
              sx={{ color: 'text.primary', mb: 2 }}
            >
              Bring Us Your Wild Idea
            </Typography>

            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.8, mb: 3 }}>
              If your vision doesn&apos;t fit our standard catalog — or you&apos;re not sure what&apos;s
              possible — bring it to the forge anyway. We love unusual briefs, strange materials, and
              ideas that live outside the box.
            </Typography>

            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.8, mb: 4 }}>
              Upload your artwork, sketches, or inspiration photos. We&apos;ll review it, let you know
              what&apos;s feasible, and send you a quote. If you love it — we make it.
            </Typography>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
              <Button
                component={Link}
                href="/custom-orders"
                variant="contained"
                color="secondary"
                size="large"
                endIcon={<ArrowForwardIcon />}
                onClick={() => Analytics.pathChosen('custom_order')}
                sx={{ px: 4 }}
              >
                Start a Custom Request
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No commitment until you approve the quote.
              </Typography>
            </Box>
          </Box>

          {/* Right — idea types */}
          <Box>
            <Box
              sx={{
                p: { xs: 3, md: 4 },
                borderRadius: 2,
                backgroundColor: alpha(brandTokens.bgCard, 0.85),
                border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
              }}
            >
              <Typography
                variant="overline"
                sx={{ color: 'primary.main', display: 'block', mb: 2 }}
              >
                Good candidates for custom orders
              </Typography>

              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {IDEA_TYPES.map((idea) => (
                  <Box
                    key={idea}
                    component="li"
                    sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}
                  >
                    <Box
                      aria-hidden="true"
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        backgroundColor: alpha(brandTokens.rubyRed, 0.2),
                        border: `1px solid ${alpha(brandTokens.rubyRed, 0.4)}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        mt: 0.2,
                        fontSize: '0.6rem',
                        color: 'secondary.light',
                      }}
                    >
                      ✓
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                      {idea}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Box
                sx={{
                  mt: 3,
                  pt: 3,
                  borderTop: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                }}
              >
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', lineHeight: 1.7 }}>
                  💡 Not sure if your idea qualifies? Submit anyway — the worst we can say is
                  it&apos;s not something we can do right now, and we&apos;ll tell you why.
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  )
}
