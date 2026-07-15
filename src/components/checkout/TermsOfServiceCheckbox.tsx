'use client'

import { FormControlLabel, Checkbox, Typography, Link } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

interface TermsOfServiceCheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
}

export function TermsOfServiceCheckbox({ checked, onChange }: TermsOfServiceCheckboxProps) {
  return (
    <FormControlLabel
      control={
        <Checkbox
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          sx={{ color: alpha(brandTokens.parchment, 0.4) }}
        />
      }
      label={
        <Typography variant="body2">
          I agree to the{' '}
          <Link
            href="/resources/terms"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: brandTokens.forgeGold }}
          >
            Terms of Service
          </Link>
          , including the custom art rights policy and refund policy for personalized goods.
        </Typography>
      }
    />
  )
}