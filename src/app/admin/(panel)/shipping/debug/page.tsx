'use client'

import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Alert from '@mui/material/Alert'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

const COUNTRY_OPTIONS = ['US', 'CA', 'MX']

interface ShippingAddress {
  name?: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
}

export default function AdminShippingDebugPage() {
  const [address, setAddress] = useState<ShippingAddress>({
    street1: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
  })
  const [packageWeight, setPackageWeight] = useState(1)
  const [loading, setLoading] = useState(false)
  const [responseData, setResponseData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleInputChange = (field: keyof ShippingAddress, value: string) => {
    setAddress({ ...address, [field]: value })
  }

  const testGetRates = async () => {
    setLoading(true)
    setError(null)
    setResponseData(null)

    try {
      const params = new URLSearchParams({
        street1: address.street1,
        city: address.city,
        state: address.state,
        zip: address.zip,
        country: address.country,
        weight: String(packageWeight),
      })
      if (address.street2) params.set('street2', address.street2)
      
      const res = await fetch(`/api/admin/shipping/debug?${params}`)

      const data = (await res.json()) as Record<string, unknown>
      
      if (!res.ok) {
        setError(`HTTP ${res.status}: ${String(data.error || JSON.stringify(data))}`)
      }
      
      setResponseData(data)
    } catch (err) {
      console.error('[admin:shipping:debug] Rates error:', err)
      const errorMessage = err instanceof Error 
        ? `${err.name}: ${err.message}` 
        : String(err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 2.2 }}>
      <Box>
        <Typography variant="h5" component="h2">Shipping Debug Tool</Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), mt: 0.5 }}>
          Test Shippo rate calculations and address validation. All requests are logged.
        </Typography>
      </Box>

      <Alert severity="warning">
        This tool sends live API requests to Shippo. Use only for testing and debugging.
        Ensure SHIPPO_API_TOKEN and SHIPPO_TEST_MODE are configured correctly.
      </Alert>

      <Card>
        <CardContent sx={{ display: 'grid', gap: 1.5 }}>
          <Typography variant="h6" gutterBottom>Shipping Address</Typography>
          
          <TextField
            label="Street Address"
            value={address.street1}
            onChange={(e) => handleInputChange('street1', e.target.value)}
            fullWidth
            margin="dense"
            size="small"
          />
          
          <TextField
            label="Apartment, Suite, etc."
            value={address.street2 || ''}
            onChange={(e) => handleInputChange('street2', e.target.value)}
            fullWidth
            margin="dense"
            size="small"
          />
          
          <TextField
            label="City"
            value={address.city}
            onChange={(e) => handleInputChange('city', e.target.value)}
            fullWidth
            margin="dense"
            size="small"
          />
          
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <TextField
              label="State"
              value={address.state}
              onChange={(e) => handleInputChange('state', e.target.value)}
              size="small"
              sx={{ flex: 1 }}
            />
            
            <TextField
              label="ZIP"
              value={address.zip}
              onChange={(e) => handleInputChange('zip', e.target.value)}
              size="small"
              sx={{ flex: 1 }}
            />
            
            <Select
              value={address.country}
              onChange={(e) => handleInputChange('country', e.target.value)}
              size="small"
              sx={{ minWidth: 100 }}
            >
              {COUNTRY_OPTIONS.map((country) => (
                <MenuItem key={country} value={country}>{country}</MenuItem>
              ))}
            </Select>
          </Box>

          <TextField
            label="Package Weight (lbs)"
            type="number"
            value={packageWeight}
            onChange={(e) => setPackageWeight(Number(e.target.value) || 1)}
            margin="dense"
            size="small"
            sx={{ mt: 1 }}
          />
        </CardContent>
      </Card>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          onClick={testGetRates}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={18} /> : undefined}
        >
          {loading ? 'Testing...' : 'Get Shipping Rates'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error">
          <strong>Error:</strong> {error}
        </Alert>
      )}

      {responseData && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Response</Typography>
            <Box
              sx={{
                p: 2,
                bgcolor: alpha(brandTokens.bgCard, 0.6),
                borderRadius: 1,
                overflow: 'auto',
                fontSize: '0.75rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 500,
              }}
            >
              {JSON.stringify(responseData, null, 2)}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}