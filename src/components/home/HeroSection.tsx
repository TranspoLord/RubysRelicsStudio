'use client'

import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Link from 'next/link'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'
import { Analytics } from '@/lib/analytics/events'

// TODO: Replace hero copy with admin-managed HomepageSection content from Supabase.

export function HeroSection() {
  return (
    <Box
      component="section"
      aria-label="Hero"
      sx={{
        position: 'relative',
        minHeight: { xs: '88vh', md: '90vh' },
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        // Animated forge gradient — no images needed at this stage
        background: `linear-gradient(
          135deg,
          #0C0A07 0%,
          #1A0F04 18%,
          #2A1400 35%,
          #1E0A00 52%,
          #120E08 70%,
          #0A0C10 85%,
          #0C0A07 100%
        )`,
        backgroundSize: '400% 400%',
        animation: 'forgeShift 14s ease infinite',
        '@media (prefers-reduced-motion: reduce)': {
          animation: 'none',
          backgroundSize: '100% 100%',
        },
      }}
    >
      {/* Forge ember particles (CSS-only, purely decorative) */}
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 60% 50% at 50% 100%, ${alpha(brandTokens.rubyRed, 0.18)} 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 70% 80%, ${alpha(brandTokens.forgeGold, 0.1)} 0%, transparent 60%),
            radial-gradient(ellipse 30% 20% at 30% 90%, ${alpha(brandTokens.copper, 0.08)} 0%, transparent 50%)
          `,
        }}
      />

      {/* Vignette overlay */}
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, ${alpha(brandTokens.bgVoid, 0.6)} 100%)`,
          pointerEvents: 'none',
        }}
      />

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1, py: { xs: 10, md: 14 } }}>
        <Box sx={{ maxWidth: 720 }}>
          {/* Eyebrow */}
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              mb: 3,
              px: 2,
              py: 0.75,
              borderRadius: 1,
              backgroundColor: alpha(brandTokens.forgeGold, 0.1),
              border: `1px solid ${alpha(brandTokens.forgeGold, 0.25)}`,
            }}
          >
            <Box component="span" aria-hidden="true" sx={{ fontSize: '0.9rem' }}>
              🔥
            </Box>
            <Typography
              variant="overline"
              sx={{ color: 'primary.light', letterSpacing: '0.1em', lineHeight: 1 }}
            >
              Handcrafted · Made to Order · One Dragon Crew
            </Typography>
          </Box>

          {/* Main headline */}
          <Typography
            variant="h1"
            component="h1"
            sx={{
              mb: 2.5,
              fontSize: { xs: '2.4rem', sm: '3.2rem', md: '4rem' },
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '0.02em',
              background: `linear-gradient(135deg, 
                ${brandTokens.forgeGoldDark} 0%, 
                ${brandTokens.forgeGold} 35%, 
                ${brandTokens.forgeGoldLight} 60%, 
                ${brandTokens.copper} 80%,
                ${brandTokens.forgeGold} 100%
              )`,
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'forgeShift 8s ease infinite',
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
                backgroundSize: '100% auto',
              },
            }}
          >
            Forged in Fire.
            <br />
            Gathered for Your Hoard.
          </Typography>

          {/* Supporting line */}
          <Typography
            variant="body1"
            sx={{
              color: alpha(brandTokens.parchment, 0.82),
              fontSize: { xs: '1rem', md: '1.15rem' },
              lineHeight: 1.75,
              maxWidth: 580,
              mb: 5,
            }}
          >
            Upload your artwork or choose from our ready-made designs, and let the dragons
            craft your treasures — then send the griffins to your lair.
          </Typography>

          {/* CTA row */}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              alignItems: 'center',
            }}
          >
            <Button
              component={Link}
              href="/shop"
              variant="contained"
              color="primary"
              size="large"
              endIcon={<ArrowForwardIcon />}
              onClick={() => Analytics.categoryClicked('all', 'shop')}
              sx={{ px: 4, py: 1.75, fontSize: '1rem' }}
            >
              Shop the Hoard
            </Button>

            <Button
              component={Link}
              href="/shop"
              variant="outlined"
              color="primary"
              size="large"
              startIcon={<InfoOutlinedIcon />}
              sx={{ px: 3, py: 1.75, fontSize: '1rem' }}
            >
              Browse Shop
            </Button>
          </Box>

          {/* Trust signals */}
          <Box
            sx={{
              mt: 5,
              display: 'flex',
              flexWrap: 'wrap',
              gap: { xs: 2, sm: 4 },
              alignItems: 'center',
            }}
          >
            {[
              { icon: '⚒️', label: 'Made to Order' },
              { icon: '🐉', label: 'One-Dragon Studio' },
              { icon: '📦', label: 'Shipped with Care' },
            ].map(({ icon, label }) => (
              <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box component="span" aria-hidden="true" sx={{ fontSize: '1rem' }}>
                  {icon}
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: alpha(brandTokens.parchment, 0.6),
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    fontSize: '0.72rem',
                  }}
                >
                  {label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Container>

      {/* Scroll indicator */}
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.5,
          opacity: 0.4,
          animation: 'none',
          '@media (prefers-reduced-motion: no-preference)': {
            animation: 'bounce 2s ease-in-out infinite',
            '@keyframes bounce': {
              '0%, 100%': { transform: 'translateX(-50%) translateY(0)' },
              '50%': { transform: 'translateX(-50%) translateY(6px)' },
            },
          },
        }}
      >
        <Box
          sx={{
            width: 20,
            height: 32,
            borderRadius: 10,
            border: `2px solid ${alpha(brandTokens.parchment, 0.4)}`,
            position: 'relative',
            '&::after': {
              content: '""',
              position: 'absolute',
              top: 4,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 4,
              height: 4,
              borderRadius: '50%',
              backgroundColor: alpha(brandTokens.parchment, 0.6),
            },
          }}
        />
      </Box>
    </Box>
  )
}
