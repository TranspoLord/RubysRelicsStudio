'use client'

import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { alpha } from '@mui/material/styles'
import ArrowBack from '@mui/icons-material/ArrowBack'
import Link from 'next/link'

import { brandTokens } from '@/theme/theme'

export default function ProductDetailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box>
        <IconButton component={Link} href="/admin/catalog/products" sx={{ p: 0.5, ml: -0.5 }}>
          <ArrowBack />
        </IconButton>
      </Box>

      <Box sx={{ pt: 1 }}>{children}</Box>
    </Box>
  )
}