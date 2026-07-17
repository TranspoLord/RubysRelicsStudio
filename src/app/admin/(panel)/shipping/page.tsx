'use client'

import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'
import { ShippoSettings } from '@/lib/shippo/settings'

interface ShippingPageData {
  settings: ShippoSettings
  webhookUrl: string
  isTestMode: boolean
}

export default function AdminShippingPage() {
  const [data, setData] = useState<ShippingPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/admin/shipping')
        if (!response.ok) {
          throw new Error('Failed to load shipping settings')
        }
        const result = await response.json()
        setData(result)
      } catch (error) {
        console.error('Error loading shipping settings:', error)
        setMessage({ type: 'error', text: 'Failed to load shipping settings' })
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [])

  const handleChange = (key: keyof ShippoSettings, value: unknown) => {
    if (!data) return

    setData({
      ...data,
      settings: {
        ...data.settings,
        [key]: value,
      },
    })
  }

  const handleCarrierChange = (carrier: keyof ShippoSettings['carriers'], checked: boolean) => {
    if (!data) return

    setData({
      ...data,
      settings: {
        ...data.settings,
        carriers: {
          ...data.settings.carriers,
          [carrier]: checked,
        },
      },
    })
  }

  const handleSave = async () => {
    if (!data) return

    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/admin/shipping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: data.settings }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save shipping settings')
      }

      setMessage({ type: 'success', text: 'Shipping settings saved successfully' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Error saving shipping settings:', error)
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save shipping settings',
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

  if (!data) {
    return (
      <Box sx={{ display: 'grid', gap: 1.1 }}>
        <Typography variant="h4" component="h1">Shipping</Typography>
        <Alert severity="error">Failed to load shipping settings</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'grid', gap: 2.2 }}>
      <Box>
        <Typography variant="h4" component="h1">Shipping</Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), mt: 0.5 }}>
          Configure Shippo integration for shipping rate calculations and tracking.
        </Typography>
      </Box>

      {message && (
        <Alert severity={message.type} onClose={() => setMessage(null)} sx={{ maxWidth: 500 }}>
          {message.text}
        </Alert>
      )}

      {/* Shippo Status Section */}
      <Box sx={{ display: 'grid', gap: 1.5, p: 1.5, border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`, borderRadius: 1 }}>
        <Typography variant="h6">Shippo Integration</Typography>

        <FormControlLabel
          control={
            <Checkbox
              checked={data.settings.enabled}
              onChange={(e) => handleChange('enabled', e.target.checked)}
            />
          }
          label="Enable Shippo Shipping Calculations"
        />

        <Typography variant="caption" sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
          Requires SHIPPO_API_TOKEN environment variable to be set.
        </Typography>

        {data.isTestMode && (
          <Alert severity="info" sx={{ mt: 0.5 }}>
            Shippo is in test mode. Rates will be from Shippo's test carriers.
          </Alert>
        )}
      </Box>

      {/* Carriers Section */}
      <Box sx={{ display: 'grid', gap: 1.5, p: 1.5, border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`, borderRadius: 1 }}>
        <Typography variant="h6">Enabled Carriers</Typography>

        <FormControlLabel
          control={
            <Checkbox
              checked={data.settings.carriers.usps}
              onChange={(e) => handleCarrierChange('usps', e.target.checked)}
              disabled={!data.settings.enabled}
            />
          }
          label="USPS"
        />

        <FormControlLabel
          control={
            <Checkbox
              checked={data.settings.carriers.ups}
              onChange={(e) => handleCarrierChange('ups', e.target.checked)}
              disabled={!data.settings.enabled}
            />
          }
          label="UPS"
        />

        <FormControlLabel
          control={
            <Checkbox
              checked={data.settings.carriers.fedex}
              onChange={(e) => handleCarrierChange('fedex', e.target.checked)}
              disabled={!data.settings.enabled}
            />
          }
          label="FedEx"
        />
      </Box>

      {/* Webhook Configuration */}
      <Box sx={{ display: 'grid', gap: 1.5, p: 1.5, border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`, borderRadius: 1 }}>
        <Typography variant="h6">Webhook Configuration</Typography>

        <Typography sx={{ fontSize: '0.85rem' }}>
          Configure this URL in your Shippo dashboard for automatic tracking updates:
        </Typography>

        <TextField
          label="Webhook URL"
          value={data.webhookUrl}
          InputProps={{ readOnly: true }}
          helperText="Copy this URL to Shippo's webhook settings"
          variant="outlined"
        />

        <Typography variant="caption" sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
          Ensure SHIPPO_WEBHOOK_SECRET is set for webhook verification.
        </Typography>
      </Box>

      {/* Package Defaults */}
      <Box sx={{ display: 'grid', gap: 1.5, p: 1.5, border: `1px solid ${alpha(brandTokens.parchment, 0.2)}`, borderRadius: 1 }}>
        <Typography variant="h6">Package Defaults</Typography>

        <Typography sx={{ fontSize: '0.85rem' }}>
          All shipments use default package dimensions: <strong>8 × 6 × 2 inches</strong>
        </Typography>

        <Typography variant="caption" sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
          Product weights are taken from variant capacity_weight in the catalog.
          Orders ship to North America only (US, Canada, Mexico).
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