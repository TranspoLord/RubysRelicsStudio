'use client'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'

import { brandTokens } from '@/theme/theme'

export default function ProductDetailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams<{ id: string }>()
  const productId = typeof params?.id === 'string' ? params.id : ''
  const pathname = usePathname()
  const pageHref = `/admin/catalog/products/${productId}`
  const pricingHref = `/admin/catalog/products/${productId}/pricing`
  const isPricing = pathname?.endsWith('/pricing')

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
          Product Editor
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), fontSize: '0.875rem' }}>
          Edit product page content and pricing separately
        </Typography>
      </Box>

      <Box sx={{ borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.16)}` }}>
        <Stack direction="row" spacing={1} sx={{ pb: 1 }}>
          <Link href={pageHref} style={{ textDecoration: 'none' }}>
            <Button variant={isPricing ? 'outlined' : 'contained'}>Page Content</Button>
          </Link>
          <Link href={pricingHref} style={{ textDecoration: 'none' }}>
            <Button variant={isPricing ? 'contained' : 'outlined'}>Pricing</Button>
          </Link>
        </Stack>
      </Box>

      <Box sx={{ pt: 1 }}>{children}</Box>
    </Box>
  )
}
