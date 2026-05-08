'use client'

import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

interface MaterialItem {
  key: string
  display_name: string
  emoji?: string | null
  gradient?: string | null
  tagline?: string | null
}

interface MaterialPreviewProps {
  materials: MaterialItem[]
}

export function MaterialPreview({ materials }: MaterialPreviewProps) {
  const normalized = useMemo(() => {
    if (materials.length > 0) return materials

    // Fallbacks keep this section useful even before material taxonomy is seeded.
    return [
      {
        key: 'wood',
        display_name: 'Wood',
        emoji: '🪵',
        gradient: 'linear-gradient(135deg, #3E2612 0%, #6A4324 100%)',
        tagline: 'Warm grain, excellent for deep engraving and signs.',
      },
      {
        key: 'acrylic',
        display_name: 'Acrylic',
        emoji: '💎',
        gradient: 'linear-gradient(135deg, #10263A 0%, #1E4A6C 100%)',
        tagline: 'Clean cuts and frosted engraving contrast.',
      },
      {
        key: 'leather',
        display_name: 'Leather',
        emoji: '🪡',
        gradient: 'linear-gradient(135deg, #2B1A12 0%, #5A3725 100%)',
        tagline: 'Rich burn tones that age beautifully.',
      },
      {
        key: 'drinkware',
        display_name: 'Drinkware Coating',
        emoji: '🥤',
        gradient: 'linear-gradient(135deg, #1A140E 0%, #3A2A18 100%)',
        tagline: 'High-contrast reveal through powder coat.',
      },
      {
        key: 'sublimation_blanks',
        display_name: 'Sublimation Blanks',
        emoji: '☕',
        gradient: 'linear-gradient(135deg, #1E1832 0%, #3D2F62 100%)',
        tagline: 'Vibrant full-color transfers fused into coating.',
      },
    ]
  }, [materials])

  const [activeKey, setActiveKey] = useState(normalized[0]?.key ?? '')
  const active = normalized.find((m) => m.key === activeKey) ?? normalized[0]

  return (
    <Box>
      {/* Interactive picker on tablet/desktop */}
      <Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: '220px 1fr', gap: 2.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {normalized.map((item) => {
            const isActive = item.key === active?.key
            return (
              <Box
                key={item.key}
                component="button"
                type="button"
                onClick={() => setActiveKey(item.key)}
                sx={{
                  textAlign: 'left',
                  borderRadius: 1,
                  border: `1px solid ${alpha(brandTokens.parchment, isActive ? 0.35 : 0.14)}`,
                  backgroundColor: isActive
                    ? alpha(brandTokens.forgeGold, 0.1)
                    : alpha(brandTokens.bgSurface, 0.45),
                  color: brandTokens.parchment,
                  px: 1.25,
                  py: 1,
                  cursor: 'pointer',
                  transition: 'border-color 0.2s ease, background-color 0.2s ease',
                  '&:hover': {
                    borderColor: alpha(brandTokens.forgeGold, 0.35),
                  },
                }}
              >
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>
                  {item.emoji ?? '✨'} {item.display_name}
                </Typography>
              </Box>
            )
          })}
        </Box>

        <Box
          sx={{
            borderRadius: 2,
            border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
            overflow: 'hidden',
            background: active?.gradient ?? `linear-gradient(135deg, ${brandTokens.bgSurface} 0%, ${brandTokens.bgVoid} 100%)`,
          }}
        >
          <Box
            sx={{
              minHeight: 220,
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Typography sx={{ fontSize: '2rem', lineHeight: 1 }}>
              {active?.emoji ?? '✨'}
            </Typography>
            <Box>
              <Typography variant="h5" component="h3" sx={{ mb: 0.8 }}>
                {active?.display_name}
              </Typography>
              <Typography sx={{ color: alpha(brandTokens.parchment, 0.75), maxWidth: 520 }}>
                {active?.tagline ?? 'Material profile and process notes will appear here as this catalog grows.'}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Static card list on phones */}
      <Box
        sx={{
          display: { xs: 'grid', md: 'none' },
          gridTemplateColumns: 'repeat(1, 1fr)',
          gap: 1.5,
        }}
      >
        {normalized.map((item) => (
          <Box
            key={item.key}
            sx={{
              borderRadius: 1.5,
              border: `1px solid ${alpha(brandTokens.parchment, 0.14)}`,
              background: item.gradient ?? `linear-gradient(135deg, ${brandTokens.bgSurface} 0%, ${brandTokens.bgVoid} 100%)`,
              p: 1.6,
            }}
          >
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, mb: 0.4 }}>
              {item.emoji ?? '✨'} {item.display_name}
            </Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.72), fontSize: '0.85rem' }}>
              {item.tagline ?? 'Material profile and process notes coming soon.'}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
