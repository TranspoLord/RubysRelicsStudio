import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

export default function AdminCatalogPage() {
  return (
    <Box sx={{ display: 'grid', gap: 1.1 }}>
      <Typography variant="h4" component="h1">Catalog</Typography>
      <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
        Catalog manager scaffold for products, category assignment, and visibility controls.
      </Typography>
    </Box>
  )
}
