'use client'

import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

interface Customer {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  email_verified: boolean
}

export default function AccountProfileTab({ customer }: { customer: Customer }) {
  const [formData, setFormData] = useState({
    firstName: customer.first_name || '',
    lastName: customer.last_name || '',
    phone: customer.phone || '',
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch('/api/customer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save profile')
      }

      setMessage({ type: 'success', text: 'Profile updated successfully!' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save profile',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 2.2, maxWidth: 600 }}>
      <Typography variant="h6">Profile Information</Typography>

      {message && (
        <Alert severity={message.type} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <TextField
          label="Email"
          value={customer.email}
          disabled
          fullWidth
          helperText={customer.email_verified ? 'Email verified' : 'Email not verified'}
        />

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <TextField
            label="First Name"
            value={formData.firstName}
            onChange={(e) => handleChange('firstName', e.target.value)}
            disabled={loading}
          />
          <TextField
            label="Last Name"
            value={formData.lastName}
            onChange={(e) => handleChange('lastName', e.target.value)}
            disabled={loading}
          />
        </Box>

        <TextField
          label="Phone"
          value={formData.phone}
          onChange={(e) => handleChange('phone', e.target.value)}
          disabled={loading}
          type="tel"
        />

        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : undefined}
          sx={{ mt: 1 }}
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
      </Box>

      <Box sx={{ pt: 2, borderTop: `1px solid ${alpha(brandTokens.parchment, 0.2)}` }}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>
          Account Settings
        </Typography>
        <Box sx={{ display: 'grid', gap: 1 }}>
          <Button variant="outlined" href="/wishlist">
            My Wishlist
          </Button>
          <Button variant="outlined" href="/forgot-password">
            Change Password
          </Button>
          <Button
            variant="outlined"
            color="error"
            onClick={async () => {
              await fetch('/api/customer/logout', { method: 'POST' })
              window.location.href = '/'
            }}
          >
            Log Out
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
