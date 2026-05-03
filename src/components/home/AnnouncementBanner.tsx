'use client'

import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Link from 'next/link'
import CloseIcon from '@mui/icons-material/Close'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

const STORAGE_KEY = 'rr_announcement_dismissed_v1'

// TODO: Replace static content with admin-managed HomepageSection record from Supabase.
const ANNOUNCEMENT = {
  text: '✨ New: Laser Engraved Tumblers now available — personalized treasures for your hoard.',
  cta: { label: 'Shop Drinkware', href: '/shop/categories/engraved-drinkware' },
}

export function AnnouncementBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (!dismissed) setVisible(true)
  }, [])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <Box
      role="region"
      aria-label="Announcement"
      sx={{
        backgroundColor: alpha(brandTokens.rubyRed, 0.85),
        backdropFilter: 'blur(8px)',
        borderBottom: `1px solid ${alpha(brandTokens.forgeGold, 0.25)}`,
        py: 1,
        px: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        position: 'relative',
      }}
    >
      <AutoAwesomeIcon sx={{ fontSize: '0.9rem', color: brandTokens.forgeGoldLight, flexShrink: 0 }} aria-hidden="true" />
      <Typography
        sx={{
          fontSize: { xs: '0.78rem', sm: '0.85rem' },
          color: brandTokens.parchment,
          textAlign: 'center',
          lineHeight: 1.5,
        }}
      >
        {ANNOUNCEMENT.text}{' '}
        <Box
          component={Link}
          href={ANNOUNCEMENT.cta.href}
          sx={{
            color: brandTokens.forgeGoldLight,
            fontWeight: 600,
            textDecoration: 'underline',
            textUnderlineOffset: 2,
            '&:hover': { color: brandTokens.forgeGold },
          }}
        >
          {ANNOUNCEMENT.cta.label}
        </Box>
      </Typography>
      <IconButton
        size="small"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        sx={{ color: alpha(brandTokens.parchment, 0.7), ml: 1, '&:hover': { color: brandTokens.parchment } }}
      >
        <CloseIcon sx={{ fontSize: '0.9rem' }} />
      </IconButton>
    </Box>
  )
}
