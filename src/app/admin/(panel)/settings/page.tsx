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
  guest_order_tracking: {
    enabled: boolean
    notify_email: string
  }
  contact: {
    support_email: string
    from_email: string
    from_name: string
  }
  operational_notifications: {
    custom_request_notify_email: string
  }
  admin_session: {
    ttl_hours: number
  }
  recommendations: {
    enabled: boolean
    pinned_global: string[]
    pinned_by_category: Record<string, string[]>
  }
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingsFormData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pinnedByCategoryInput, setPinnedByCategoryInput] = useState('')
  const [pinnedByCategoryError, setPinnedByCategoryError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/admin/settings')
        if (!response.ok) {
          throw new Error('Failed to load settings')
        }
        const data = await response.json()
        setSettings(data.settings)
        setPinnedByCategoryInput(
          JSON.stringify(data.settings?.recommendations?.pinned_by_category ?? {}, null, 2)
        )
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

    if (pinnedByCategoryError) {
      setMessage({
        type: 'error',
        text: 'Fix invalid recommendation JSON before saving settings.',
      })
      return
    }

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

  const pinnedGlobalText = settings.recommendations.pinned_global.join(', ')

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

      <Box sx={{ display: 'grid', gap: 1.5, p: 1.5, border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`, borderRadius: 1 }}>
        <Typography variant="h6">Contact and Email Sender</Typography>

        <TextField
          label="Support Email"
          type="email"
          fullWidth
          value={settings.contact.support_email}
          onChange={(e) => handleChange('contact', 'support_email', e.target.value)}
          helperText="Customer-facing support address used in policy pages and operational fallbacks"
          variant="outlined"
        />

        <TextField
          label="From Name"
          fullWidth
          value={settings.contact.from_name}
          onChange={(e) => handleChange('contact', 'from_name', e.target.value)}
          helperText="Display name for transactional email sender"
          variant="outlined"
        />

        <TextField
          label="From Email"
          type="email"
          fullWidth
          value={settings.contact.from_email}
          onChange={(e) => handleChange('contact', 'from_email', e.target.value)}
          helperText="Transactional email address used by Resend"
          variant="outlined"
        />
      </Box>

      <Box sx={{ display: 'grid', gap: 1.5, p: 1.5, border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`, borderRadius: 1 }}>
        <Typography variant="h6">Operational Notifications</Typography>

        <TextField
          label="Custom Request Notification Email"
          type="email"
          fullWidth
          value={settings.operational_notifications.custom_request_notify_email}
          onChange={(e) => handleChange('operational_notifications', 'custom_request_notify_email', e.target.value)}
          helperText="Internal recipient for new custom-order intake notifications"
          variant="outlined"
        />
      </Box>

      <Box sx={{ display: 'grid', gap: 1.5, p: 1.5, border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`, borderRadius: 1 }}>
        <Typography variant="h6">Admin Session Security</Typography>

        <TextField
          label="Session TTL (hours)"
          type="number"
          fullWidth
          value={settings.admin_session.ttl_hours}
          onChange={(e) => handleChange('admin_session', 'ttl_hours', Number(e.target.value) || 1)}
          inputProps={{ min: 1, max: 168 }}
          helperText="Controls how long an admin login remains valid before re-authentication is required"
          variant="outlined"
        />
      </Box>

      <Box sx={{ display: 'grid', gap: 1.5, p: 1.5, border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`, borderRadius: 1 }}>
        <Typography variant="h6">Recommendations</Typography>

        <FormControlLabel
          control={
            <Checkbox
              checked={settings.recommendations.enabled}
              onChange={(e) => handleChange('recommendations', 'enabled', e.target.checked)}
            />
          }
          label="Enable recommendation scoring"
        />

        <TextField
          label="Pinned Global Product IDs"
          fullWidth
          multiline
          minRows={2}
          value={pinnedGlobalText}
          onChange={(e) => {
            const parsed = e.target.value
              .split(',')
              .map((item) => item.trim())
              .filter((item) => item.length > 0)
            handleChange('recommendations', 'pinned_global', parsed)
          }}
          helperText="Comma-separated product UUIDs that should always rank at the top when active."
          variant="outlined"
        />

        <TextField
          label="Pinned by Category JSON"
          fullWidth
          multiline
          minRows={5}
          value={pinnedByCategoryInput}
          error={Boolean(pinnedByCategoryError)}
          onChange={(e) => {
            const next = e.target.value
            setPinnedByCategoryInput(next)
            try {
              const parsed = JSON.parse(next) as Record<string, string[]>
              handleChange('recommendations', 'pinned_by_category', parsed)
              setPinnedByCategoryError(null)
            } catch {
              setPinnedByCategoryError('Invalid JSON. Example: { "category_key": ["product_uuid"] }')
            }
          }}
          helperText={pinnedByCategoryError ?? 'JSON object: { "category_key": ["product_uuid"] }'}
          variant="outlined"
        />
      </Box>

      {/* Save Button */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || Boolean(pinnedByCategoryError)}
          startIcon={saving ? <CircularProgress size={20} /> : undefined}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </Box>
    </Box>
  )
}