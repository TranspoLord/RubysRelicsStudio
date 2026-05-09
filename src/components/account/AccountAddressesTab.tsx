'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

interface Address {
  id: string
  label: string | null
  full_name: string
  street_1: string
  city: string
  postal_code: string
}

export default function AccountAddressesTab({
  addresses,
  customerId,
}: {
  addresses: Address[]
  customerId: string
}) {
  return (
    <Box sx={{ display: 'grid', gap: 2.2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Saved Addresses</Typography>
        <Button variant="contained" size="small">
          Add Address
        </Button>
      </Box>

      {addresses.length === 0 ? (
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
          No saved addresses yet. Add one to speed up checkout.
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {addresses.map((address) => (
            <Box
              key={address.id}
              sx={{
                p: 1.5,
                border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`,
                borderRadius: 1,
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                {address.label || 'Address'}
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.25 }}>
                {address.full_name}
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.25 }}>
                {address.street_1}
              </Typography>
              <Typography variant="body2">
                {address.city}, {address.postal_code}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
