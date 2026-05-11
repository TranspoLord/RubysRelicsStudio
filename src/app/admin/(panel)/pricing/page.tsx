import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import Button from '@mui/material/Button'
import Link from 'next/link'
import { brandTokens } from '@/theme/theme'

export default function AdminPricingPage() {
  return (
    <Box sx={{ display: 'grid', gap: 1.3 }}>
      <Typography variant="h4" component="h1">Pricing</Typography>
      <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
        Pricing controls are currently managed from Catalog product editing, including
        base prices, variant deltas, option value deltas, bulk tiers, and server-side
        pricing preview checks.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button component={Link} href="/admin/catalog" variant="contained">
          Open Catalog Pricing Controls
        </Button>
      </Box>

      <Typography sx={{ color: alpha(brandTokens.parchment, 0.58), fontSize: '0.88rem' }}>
        This page is intentionally lightweight until/unless pricing is split into a dedicated
        standalone module.
      </Typography>
    </Box>
  )
}
