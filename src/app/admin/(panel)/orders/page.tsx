import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

export default function AdminOrdersPage() {
  return (
    <Box sx={{ display: 'grid', gap: 1.1 }}>
      <Typography variant="h4" component="h1">Orders</Typography>
      <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
        Orders operations module scaffold. Next pass will add status transitions, shipment milestones, and filters.
      </Typography>
    </Box>
  )
}
