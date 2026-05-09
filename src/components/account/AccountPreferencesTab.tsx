'use client'

import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'

interface Customer {
  id: string
  receives_newsletter: boolean
  receives_order_updates: boolean
  receives_marketing: boolean
}

export default function AccountPreferencesTab({ customer }: { customer: Customer }) {
  const [preferences, setPreferences] = useState({
    newsletter: customer.receives_newsletter,
    orderUpdates: customer.receives_order_updates,
    marketing: customer.receives_marketing,
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleChange = (field: string, checked: boolean) => {
    setPreferences((prev) => ({ ...prev, [field]: checked }))
  }

  const handleSave = async () => {
    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch('/api/customer/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsletter: preferences.newsletter,
          orderUpdates: preferences.orderUpdates,
          marketing: preferences.marketing,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save preferences')
      }

      setMessage({ type: 'success', text: 'Preferences updated successfully!' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save preferences',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 2.2, maxWidth: 600 }}>
      <Typography variant="h6">Email Preferences</Typography>

      {message && (
        <Alert severity={message.type} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={preferences.newsletter}
              onChange={(e) => handleChange('newsletter', e.target.checked)}
              disabled={loading}
            />
          }
          label="New releases and seasonal collections (highly recommended!)"
        />

        <FormControlLabel
          control={
            <Checkbox
              checked={preferences.orderUpdates}
              onChange={(e) => handleChange('orderUpdates', e.target.checked)}
              disabled={loading}
            />
          }
          label="Order status updates (production, shipping, etc.)"
        />

        <FormControlLabel
          control={
            <Checkbox
              checked={preferences.marketing}
              onChange={(e) => handleChange('marketing', e.target.checked)}
              disabled={loading}
            />
          }
          label="Promotions, special offers, and announcements"
        />

        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : undefined}
          sx={{ mt: 1, alignSelf: 'start' }}
        >
          {loading ? 'Saving...' : 'Save Preferences'}
        </Button>
      </Box>
    </Box>
  )
}
