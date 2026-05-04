'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha } from '@mui/material/styles'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined'
import DrawOutlinedIcon from '@mui/icons-material/DrawOutlined'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import Link from 'next/link'
import { brandTokens } from '@/theme/theme'

// ─── Data ─────────────────────────────────────────────────────────────────────

const ORDER_PATHS = [
  {
    key: 'customizable',
    label: 'Customizable Creations',
    tagline: 'Choose a product, configure your options, and we forge it to order.',
    cta: 'Browse Categories',
    href: '#categories',
    chipLabel: 'Most Popular',
    chipColor: brandTokens.forgeGold,
    gradient: `linear-gradient(135deg, #1C1200 0%, #3A2600 60%, #1C1200 100%)`,
    borderColor: alpha(brandTokens.forgeGold, 0.3),
    Icon: AutoFixHighIcon,
  },
  {
    key: 'ready_made',
    label: 'Ready-Made Hoard',
    tagline: "Pre-designed pieces available now — no configuration needed. Just pick and claim.",
    cta: "See What's Ready",
    href: '/shop/ready-made',
    chipLabel: 'Ships Fastest',
    chipColor: '#5A9A3A',
    gradient: `linear-gradient(135deg, #0A1A08 0%, #1A3A10 60%, #0A1A08 100%)`,
    borderColor: alpha('#5A9A3A', 0.3),
    Icon: ShoppingBagOutlinedIcon,
  },
  {
    key: 'custom_order',
    label: 'Custom Orders',
    tagline: "Bring your wild idea. We'll quote it, confirm it, and build it from scratch.",
    cta: 'Submit a Request',
    href: '/custom-orders',
    chipLabel: 'Unique Pieces',
    chipColor: '#8B4FBE',
    gradient: `linear-gradient(135deg, #120A1C 0%, #2A1A3A 60%, #120A1C 100%)`,
    borderColor: alpha('#8B4FBE', 0.3),
    Icon: DrawOutlinedIcon,
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function ShopOrderPaths() {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
        gap: 3,
      }}
    >
      {ORDER_PATHS.map(({ key, Icon, label, tagline, cta, href, chipLabel, chipColor, gradient, borderColor }) => (
        <Box
          key={key}
          component="a"
          href={href}
          sx={{
            display: 'block',
            background: gradient,
            border: `1px solid ${borderColor}`,
            borderRadius: 2,
            p: { xs: 3, md: 4 },
            textDecoration: 'none',
            color: 'inherit',
            cursor: 'pointer',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            '&:hover': {
              transform: 'translateY(-3px)',
              boxShadow: `0 8px 32px ${alpha(chipColor, 0.2)}`,
            },
            '@media (prefers-reduced-motion: reduce)': {
              '&:hover': { transform: 'none' },
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
            <Icon sx={{ fontSize: 32, color: chipColor, flexShrink: 0 }} />
            <Chip
              label={chipLabel}
              size="small"
              sx={{
                backgroundColor: alpha(chipColor, 0.15),
                color: chipColor,
                border: `1px solid ${alpha(chipColor, 0.3)}`,
                fontWeight: 600,
                fontSize: '0.65rem',
                letterSpacing: '0.06em',
              }}
            />
          </Box>
          <Typography variant="h5" component="h3" gutterBottom>
            {label}
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: alpha(brandTokens.parchment, 0.65), mb: 3, lineHeight: 1.6 }}
          >
            {tagline}
          </Typography>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              color: chipColor,
              fontWeight: 600,
              fontSize: '0.875rem',
              letterSpacing: '0.04em',
            }}
          >
            {cta}
            <ArrowForwardIcon sx={{ fontSize: 16 }} />
          </Box>
        </Box>
      ))}
    </Box>
  )
}
