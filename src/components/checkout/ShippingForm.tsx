'use client'

import { useState, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'
import { ShippingRate } from '@/lib/shippo/client'

interface ShippingAddress {
  name?: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
}

interface ShippingFormProps {
  onAddressChange: (address: ShippingAddress | null) => void
  onRateSelect: (rate: ShippingRate | null) => void
  packageWeight: number
  autoCalculate?: boolean
}

const COUNTRY_OPTIONS = ['US', 'CA', 'MX']

export function ShippingForm({ onAddressChange, onRateSelect, packageWeight, autoCalculate = false }: ShippingFormProps) {
  const [address, setAddress] = useState<ShippingAddress>({
    street1: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
  })
  const [validating, setValidating] = useState(false)
  const [rates, setRates] = useState<ShippingRate[]>([])
  const [loadingRates, setLoadingRates] = useState(false)
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasValidatedRef = useRef(false)

  // Auto-calculate when we have a complete address and autoCalculate is true
  useEffect(() => {
    if (autoCalculate && hasValidatedRef.current) {
      void validateAndGetRates()
    }
  }, [autoCalculate])

  const handleInputChange = (field: keyof ShippingAddress, value: string) => {
    const newAddress = { ...address, [field]: value }
    setAddress(newAddress)
    
    // Clear any existing selection when address changes
    if (selectedRateId) {
      setSelectedRateId(null)
      onRateSelect(null)
    }
    
    // Check if address is complete
    const isComplete = Boolean(
      newAddress.street1 && newAddress.city && newAddress.state && newAddress.zip && newAddress.country
    )
    
    if (isComplete) {
      onAddressChange(newAddress)
    } else {
      onAddressChange(null)
    }
  }

  const validateAndGetRates = async () => {
    setValidating(true)
    setError(null)

    try {
      // Validate address
      const validateResponse = await fetch('/api/shippo/validate-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })

      if (!validateResponse.ok) {
        throw new Error('Address validation failed. Please check your address.')
      }

      const validateData = await validateResponse.json()
      
      // Even if validation warning, continue to get rates if we have an address
      setLoadingRates(true)
      const ratesResponse = await fetch('/api/shippo/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, weight: packageWeight }),
      })

      if (!ratesResponse.ok) {
        const errorData = await ratesResponse.json()
        throw new Error(errorData.error || 'Could not calculate shipping rates.')
      }

      const ratesData = await ratesResponse.json()
      setRates(ratesData.rates || [])
      hasValidatedRef.current = true
      
      if (ratesData.rates?.length === 0) {
        setError('No shipping options available for this location.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Shipping calculation failed. Please try again.')
      setRates([])
    } finally {
      setValidating(false)
      setLoadingRates(false)
    }
  }

  const handleRateSelect = (rateId: string | null) => {
    if (!rateId) {
      setSelectedRateId(null)
      onRateSelect(null)
      return
    }
    setSelectedRateId(rateId)
    const selectedRate = rates.find(r => r.id === rateId) || null
    onRateSelect(selectedRate)
  }

  // Auto-select cheapest rate if only one or if user hasn't selected
  useEffect(() => {
    if (rates.length > 0 && !selectedRateId) {
      // Auto-select the cheapest option
      const cheapest = rates[0] // Already sorted by price
      handleRateSelect(cheapest.id)
    }
  }, [rates])

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Typography variant="h6">Shipping Address</Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <TextField
        label="Street Address"
        value={address.street1}
        onChange={(e) => handleInputChange('street1', e.target.value)}
        required
        size="small"
      />

      <TextField
        label="Apartment, Suite, etc. (optional)"
        value={address.street2 || ''}
        onChange={(e) => handleInputChange('street2', e.target.value)}
        size="small"
      />

      <TextField
        label="City"
        value={address.city}
        onChange={(e) => handleInputChange('city', e.target.value)}
        required
        size="small"
      />

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label="State / Province"
          value={address.state}
          onChange={(e) => handleInputChange('state', e.target.value)}
          required
          size="small"
          sx={{ flex: 1 }}
        />

        <TextField
          label="ZIP / Postal Code"
          value={address.zip}
          onChange={(e) => handleInputChange('zip', e.target.value)}
          required
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

      <Button
        variant="outlined"
        onClick={validateAndGetRates}
        disabled={validating || loadingRates || !address.street1 || !address.city || !address.state || !address.zip}
        startIcon={validating || loadingRates ? <CircularProgress size={18} /> : undefined}
      >
        {validating || loadingRates ? 'Calculating...' : 'Calculate Shipping'}
      </Button>

      {rates.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="h6">Shipping Options</Typography>
          <Select
            value={selectedRateId || ''}
            onChange={(e) => handleRateSelect(e.target.value || null)}
            size="small"
            fullWidth
            displayEmpty
          >
            <MenuItem value="" disabled>Select a shipping method</MenuItem>
            {rates.map((rate) => (
              <MenuItem key={rate.id} value={rate.id}>
                {rate.name} - ${rate.amount.toFixed(2)} {rate.estimatedDays && `(${rate.estimatedDays} days)`}
              </MenuItem>
            ))}
          </Select>
        </Box>
      )}

      {packageWeight > 0 && (
        <Typography sx={{ fontSize: '0.75rem', color: alpha(brandTokens.parchment, 0.6) }}>
          Package weight: {packageWeight.toFixed(2)} lbs
        </Typography>
      )}
    </Box>
  )
}