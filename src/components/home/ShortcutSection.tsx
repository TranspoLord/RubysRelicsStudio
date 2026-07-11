'use client'

import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import Link from 'next/link'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShortcutItem {
  key?: string
  label: string
  emoji: string
  href: string
  image_url?: string
  gradient?: string
  glow_color?: string
  is_visible?: boolean
  sort_order?: number
}

export interface ShortcutSectionContent {
  heading?: string
  subheading?: string
  items?: ShortcutItem[]
}

interface ShortcutSectionProps {
  /** CMS content from exp_homepage_sections.content JSONB */
  content: ShortcutSectionContent | Record<string, unknown> | null | undefined
  /** Shown when content.heading is absent */
  fallbackHeading: string
  /** Shown when content.subheading is absent */
  fallbackSubheading: string
  /** Section aria-label */
  ariaLabel: string
  /** Accent color for the overline label, defaults to primary.main */
  accentColor?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ShortcutSection({
  content,
  fallbackHeading,
  fallbackSubheading,
  ariaLabel,
  accentColor,
}: ShortcutSectionProps) {
  const c = content as ShortcutSectionContent | null | undefined

  const heading = c?.heading || fallbackHeading
  const subheading = c?.subheading || fallbackSubheading

  const items = (c?.items ?? [])
    .filter((item) => item.is_visible !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  if (items.length === 0) {
    return null
  }

  return (
    <Box
      component="section"
      aria-labelledby={`shortcut-heading-${ariaLabel.replace(/\s+/g, '-').toLowerCase()}`}
      sx={{
        py: { xs: 6, md: 8 },
        borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.06)}`,
      }}
    >
      <Container maxWidth="lg">
        {/* Section header */}
        <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 5 } }}>
          <Typography
            variant="overline"
            sx={{
              color: accentColor ?? 'primary.main',
              display: 'block',
              mb: 1,
            }}
          >
            {ariaLabel}
          </Typography>
          <Typography
            id={`shortcut-heading-${ariaLabel.replace(/\s+/g, '-').toLowerCase()}`}
            variant="h2"
            component="h2"
            sx={{ color: 'text.primary', mb: 1 }}
          >
            {heading}
          </Typography>
          {subheading && (
            <Typography
              variant="body1"
              sx={{ color: alpha(brandTokens.parchment, 0.6), maxWidth: 520, mx: 'auto' }}
            >
              {subheading}
            </Typography>
          )}
        </Box>

        {/* Tile grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(1, 1fr)',
              sm: `repeat(${Math.min(items.length, 3)}, 1fr)`,
            },
            gap: { xs: 2, md: 3 },
          }}
        >
          {items.map((item) => (
            <ShortcutCard key={item.key ?? item.label} item={item} />
          ))}
        </Box>
      </Container>
    </Box>
  )
}

// ─── Single tile card ─────────────────────────────────────────────────────────

function ShortcutCard({ item }: { item: ShortcutItem }) {
  const gradient =
    item.gradient ?? `linear-gradient(135deg, ${brandTokens.bgSurface} 0%, ${brandTokens.bgVoid} 100%)`
  const glowColor = item.glow_color ?? brandTokens.forgeGold

  return (
    <Box
      component={Link}
      href={item.href}
      aria-label={item.label}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        p: { xs: 3, md: 3.5 },
        background: gradient,
        border: `1px solid ${alpha(glowColor, 0.2)}`,
        borderRadius: 2,
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: `0 12px 40px ${alpha(glowColor, 0.28)}`,
          borderColor: alpha(glowColor, 0.45),
        },
        '&:focus-visible': {
          outline: `2px solid ${brandTokens.forgeGold}`,
          outlineOffset: '3px',
        },
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
          '&:hover': { transform: 'none' },
        },
      }}
    >
      {/* Image or Emoji */}
      {item.image_url ? (
        <Box
          component="img"
          src={item.image_url}
          alt=""
          aria-hidden="true"
          sx={{
            width: '100%',
            aspectRatio: '16 / 9',
            objectFit: 'cover',
            borderRadius: 1,
          }}
        />
      ) : (
        <Typography aria-hidden="true" sx={{ fontSize: '2.4rem', lineHeight: 1 }}>
          {item.emoji}
        </Typography>
      )}

      {/* Label */}
      <Typography
        variant="h5"
        component="span"
        sx={{ color: 'text.primary', fontWeight: 700 }}
      >
        {item.label}
      </Typography>

      {/* Arrow CTA */}
      <Box
        sx={{
          mt: 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          color: glowColor,
          fontWeight: 600,
          fontSize: '0.85rem',
        }}
      >
        Shop now
        <ArrowForwardIcon sx={{ fontSize: '1rem' }} />
      </Box>
    </Box>
  )
}
