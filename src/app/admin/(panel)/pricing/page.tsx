import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

export default function AdminPricingPage() {
  return (
    <Box sx={{ display: 'grid', gap: 1.1 }}>
      <Typography variant="h4" component="h1">Pricing</Typography>
      <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
        Pricing module scaffold for base rates, variant deltas, and discount controls.
      </Typography>
    </Box>
  )
}
