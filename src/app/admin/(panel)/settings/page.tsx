'use client'

import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import TextField from '@mui/material/TextField'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import { brandTokens } from '@/theme/theme'

interface SettingsFormData {
  stripe_checkout_enabled: {
    enabled: boolean
    disabled_message: string
  }
  guest_order_tracking: {
    enabled: boolean
    notify_email: string
  }
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingsFormData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/admin/settings')
        if (!response.ok) {
          throw new Error('Failed to load settings')
        }
        const data = await response.json()
        setSettings(data.settings)
      } catch (error) {
        console.error('Error loading settings:', error)
        setMessage({ type: 'error', text: 'Failed to load settings' })
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [])

  const handleChange = (key: keyof SettingsFormData, nestedKey: string, value: unknown) => {
    if (!settings) return

    setSettings({
      ...settings,
      [key]: {
        ...settings[key],
        [nestedKey]: value,
      },
    })
  }

  const handleSave = async () => {
    if (!settings) return

    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save settings')
      }

      setMessage({ type: 'success', text: 'Settings saved successfully' })

      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Error saving settings:', error)
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save settings',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'grid', gap: 1.1, alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!settings) {
    return (
      <Box sx={{ display: 'grid', gap: 1.1 }}>
        <Typography variant="h4" component="h1">Settings</Typography>
        <Alert severity="error">Failed to load settings</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'grid', gap: 2.2 }}>
      <Box>
        <Typography variant="h4" component="h1">Settings</Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), mt: 0.5 }}>
          Manage storefront operational settings and customer experience toggles.
        </Typography>
      </Box>

      {message && (
        <Alert severity={message.type} onClose={() => setMessage(null)} sx={{ maxWidth: 500 }}>
          {message.text}
        </Alert>
      )}

      {/* Stripe Checkout Section */}
      <Box sx={{ display: 'grid', gap: 1.5, p: 1.5, border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`, borderRadius: 1 }}>
        <Typography variant="h6">Stripe Checkout</Typography>

        <FormControlLabel
          control={
            <Checkbox
              checked={settings.stripe_checkout_enabled.enabled}
              onChange={(e) => handleChange('stripe_checkout_enabled', 'enabled', e.target.checked)}
            />
          }
          label="Enable Stripe Checkout"
        />

        <TextField
          label="Disabled Message"
          multiline
          rows={2}
          fullWidth
          value={settings.stripe_checkout_enabled.disabled_message}
          onChange={(e) => handleChange('stripe_checkout_enabled', 'disabled_message', e.target.value)}
          helperText="Message shown to customers when checkout is disabled"
          disabled={settings.stripe_checkout_enabled.enabled}
          variant="outlined"
        />
      </Box>

      {/* Guest Order Tracking Section */}
      <Box sx={{ display: 'grid', gap: 1.5, p: 1.5, border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`, borderRadius: 1 }}>
        <Typography variant="h6">Guest Order Tracking</Typography>

        <FormControlLabel
          control={
            <Checkbox
              checked={settings.guest_order_tracking.enabled}
              onChange={(e) => handleChange('guest_order_tracking', 'enabled', e.target.checked)}
            />
          }
          label="Enable Guest Order Tracking Links"
        />

        <TextField
          label="Tracking Notification Email"
          type="email"
          fullWidth
          value={settings.guest_order_tracking.notify_email}
          onChange={(e) => handleChange('guest_order_tracking', 'notify_email', e.target.value)}
          helperText="Email address to notify when tracking is disabled and an order is placed"
          variant="outlined"
        />

        <Typography variant="caption" sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
          When disabled, customers won't receive tracking links via email. Instead, a notification will be sent to the specified email address so you can provide manual updates.
        </Typography>
      </Box>

      {/* Save Button */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={20} /> : undefined}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </Box>
    </Box>
  )
}
