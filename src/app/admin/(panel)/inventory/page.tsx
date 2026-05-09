import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

export default function AdminInventoryPage() {
  return (
    <Box sx={{ display: 'grid', gap: 1.1 }}>
      <Typography variant="h4" component="h1">Inventory</Typography>
      <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
        Inventory module scaffold for ready-made stock, threshold warnings, and availability controls.
      </Typography>
    </Box>
  )
}
