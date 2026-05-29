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
  const pathname = usePathname()
  const productId = typeof params?.id === 'string' ? params.id : ''
  const builderHref = `/admin/catalog/products/${productId}/builder`
  const isBuilderRoute = pathname?.endsWith('/builder')

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
          Legacy Product Editor
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), fontSize: '0.875rem' }}>
          This screen is retained for compatibility. Use the unified Product Builder for day-to-day editing.
        </Typography>
      </Box>

      <Box sx={{ borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.16)}` }}>
        <Stack direction="row" spacing={1} sx={{ pb: 1, flexWrap: 'wrap' }}>
          <Link href={builderHref} style={{ textDecoration: 'none' }}>
            <Button variant="contained">Open Product Builder</Button>
          </Link>
          {isBuilderRoute && (
            <Button variant="outlined" form="product-builder-form" type="submit">
              Save
            </Button>
          )}
        </Stack>
      </Box>

      <Box sx={{ pt: 1 }}>{children}</Box>
    </Box>
  )
}
