'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HeroCollageImage {
  url: string
  alt: string
  href?: string
}

export interface HeroCollageConfig {
  is_enabled: boolean
  image_count: number
  images: HeroCollageImage[]
}

// ─── Default placeholder images (used when no admin images configured) ─────────

const DEFAULT_IMAGES: HeroCollageImage[] = [
  { url: '', alt: 'Engraved tumbler' },
  { url: '', alt: 'Leather patch' },
  { url: '', alt: 'Sublimated mug' },
  { url: '', alt: 'Wood sign' },
  { url: '', alt: 'Acrylic piece' },
  { url: '', alt: 'Coaster set' },
]

// ─── Layout positions for the floating cards ──────────────────────────────────

interface CardLayout {
  top: string
  left: string
  width: string
  height: string
  rotate: string
  zIndex: number
}

function generateLayouts(count: number): CardLayout[] {
  const layouts: CardLayout[] = [
    { top: '5%',   left: '10%',  width: '45%', height: '38%', rotate: '-6deg',  zIndex: 3 },
    { top: '8%',   left: '45%',  width: '40%', height: '32%', rotate: '4deg',   zIndex: 2 },
    { top: '35%',  left: '5%',   width: '38%', height: '30%', rotate: '3deg',   zIndex: 1 },
    { top: '32%',  left: '38%',  width: '50%', height: '35%', rotate: '-4deg',  zIndex: 4 },
    { top: '58%',  left: '15%',  width: '42%', height: '34%', rotate: '5deg',   zIndex: 2 },
    { top: '60%',  left: '50%',  width: '38%', height: '30%', rotate: '-3deg',  zIndex: 1 },
  ]
  return layouts.slice(0, Math.min(count, layouts.length))
}

// ─── Component ────────────────────────────────────────────────────────────────

interface HeroCollageProps {
  config?: HeroCollageConfig | null
}

export function HeroCollage({ config }: HeroCollageProps) {
  const [visibleIndices, setVisibleIndices] = useState<number[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isEnabled = config?.is_enabled ?? true
  const imageCount = config?.image_count ?? 4
  const images = config?.images?.length ? config.images : DEFAULT_IMAGES
  const count = Math.min(imageCount, images.length, 6)

  const layouts = useMemo(() => generateLayouts(count), [count])

  // Staggered entrance animation
  useEffect(() => {
    if (!isEnabled) return

    const timers: ReturnType<typeof setTimeout>[] = []
    layouts.forEach((_, index) => {
      const timer = setTimeout(() => {
        setVisibleIndices((prev) => [...prev, index])
      }, 400 + index * 200)
      timers.push(timer)
    })

    return () => timers.forEach(clearTimeout)
  }, [isEnabled, layouts.length])

  // Random shuffle animation every 8 seconds
  useEffect(() => {
    if (!isEnabled || count < 2) return

    intervalRef.current = setInterval(() => {
      setVisibleIndices((prev) => {
        // Shuffle the visible indices
        const shuffled = [...prev].sort(() => Math.random() - 0.5)
        return shuffled
      })
    }, 8000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isEnabled, count])

  if (!isEnabled) return null

  return (
    <Box
      aria-hidden="true"
      sx={{
        position: 'absolute',
        right: { xs: '-5%', md: '2%' },
        top: '5%',
        width: { xs: '50%', sm: '45%', md: '42%' },
        height: '90%',
        pointerEvents: 'none',
        display: { xs: 'none', lg: 'block' },
      }}
    >
      {images.slice(0, count).map((image, index) => {
        const layout = layouts[index]
        const isVisible = visibleIndices.includes(index)
        const hasLink = Boolean(image.href)

        return (
          <Box
            key={index}
            sx={{
              position: 'absolute',
              top: layout.top,
              left: layout.left,
              width: layout.width,
              height: layout.height,
              zIndex: layout.zIndex,
              opacity: isVisible ? 1 : 0,
              transform: isVisible
                ? `rotate(${layout.rotate}) translateY(0) scale(1)`
                : `rotate(${layout.rotate}) translateY(20px) scale(0.9)`,
              transition: 'opacity 0.6s ease, transform 0.6s ease',
              borderRadius: 2,
              overflow: 'hidden',
              border: `1px solid ${alpha(brandTokens.forgeGold, 0.15)}`,
              boxShadow: `0 8px 32px ${alpha('#000', 0.5)}, 0 0 0 1px ${alpha(brandTokens.forgeGold, 0.08)}`,
              background: alpha(brandTokens.bgCard, 0.85),
              backdropFilter: 'blur(4px)',
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(135deg, ${alpha(brandTokens.forgeGold, 0.05)} 0%, transparent 50%)`,
                pointerEvents: 'none',
              },
              ...(hasLink && { pointerEvents: 'auto' }),
            }}
          >
            {image.url ? (
              image.href ? (
                <Box
                  component="a"
                  href={image.href}
                  sx={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                  }}
                >
                  <Box
                    component="img"
                    src={image.url}
                    alt={image.alt}
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </Box>
              ) : (
                <Box
                  component="img"
                  src={image.url}
                  alt={image.alt}
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              )
            ) : (
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `linear-gradient(135deg, ${alpha(brandTokens.bgSurface, 0.6)} 0%, ${alpha(brandTokens.bgVoid, 0.8)} 100%)`,
                  color: alpha(brandTokens.parchment, 0.3),
                  fontSize: '2rem',
                }}
              >
                {['🥤', '🪡', '☕', '🪵', '💎', '🎴'][index] ?? '✨'}
              </Box>
            )}

            {/* Subtle overlay gradient */}
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '40%',
                background: `linear-gradient(to top, ${alpha(brandTokens.bgVoid, 0.6)} 0%, transparent 100%)`,
                pointerEvents: 'none',
              }}
            />
          </Box>
        )
      })}
    </Box>
  )
}