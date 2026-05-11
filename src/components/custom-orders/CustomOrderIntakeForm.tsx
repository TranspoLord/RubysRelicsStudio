'use client'

import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { Analytics } from '@/lib/analytics/events'
import { brandTokens } from '@/theme/theme'

interface CategoryOption {
  key: string
  display_name: string
  slug: string
}

interface CustomOrderIntakeFormProps {
  categories: CategoryOption[]
}

interface FormState {
  customerName: string
  customerEmail: string
  itemType: string
  quantity: string
  deadline: string
  budgetRange: string
  description: string
  designHelpNeeded: boolean
  ipRightsConfirmed: boolean
  ageConfirmed: boolean
  tosAccepted: boolean
}

interface SubmitResult {
  id: string
  status: string
  accessToken: string | null
}

interface BudgetRangeOption {
  id: string
  label: string
  value: string
}

const DEFAULT_STATE: FormState = {
  customerName: '',
  customerEmail: '',
  itemType: '',
  quantity: '1',
  deadline: '',
  budgetRange: '',
  description: '',
  designHelpNeeded: false,
  ipRightsConfirmed: false,
  ageConfirmed: false,
  tosAccepted: false,
}

export function CustomOrderIntakeForm({ categories }: CustomOrderIntakeFormProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_STATE)
  const [files, setFiles] = useState<File[]>([])
  const [budgetRanges, setBudgetRanges] = useState<BudgetRangeOption[]>([])
  const [maxQuantity, setMaxQuantity] = useState(500)
  const [maxFiles, setMaxFiles] = useState(5)
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<SubmitResult | null>(null)

  useEffect(() => {
    Analytics.customRequestStarted()
  }, [])

  useEffect(() => {
    let active = true

    void (async () => {
      try {
        const response = await fetch('/api/custom-orders/config', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error('Failed to load custom order settings')
        }

        const payload = await response.json()
        if (!active) return

        setBudgetRanges(Array.isArray(payload?.budgetRanges) ? payload.budgetRanges : [])
        setMaxQuantity(
          typeof payload?.maxQuantity === 'number' && payload.maxQuantity > 0
            ? payload.maxQuantity
            : 500
        )
        setMaxFiles(
          typeof payload?.maxFiles === 'number' && payload.maxFiles > 0
            ? payload.maxFiles
            : 5
        )
      } catch (error) {
        console.error('Failed to load custom order settings:', error)
      }
    })()

    return () => {
      active = false
    }
  }, [])

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.slug, label: c.display_name })),
    [categories]
  )

  const canSubmit =
    form.customerName.trim().length > 1 &&
    form.customerEmail.trim().length > 4 &&
    form.itemType.trim().length > 0 &&
    form.description.trim().length > 10 &&
    form.ipRightsConfirmed &&
    form.ageConfirmed &&
    form.tosAccepted

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleFileChange(next: FileList | null) {
    if (!next) return
    const selected = Array.from(next).slice(0, maxFiles)
    setFiles(selected)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit || submitState === 'submitting') return

    const quantityNumber = Number.parseInt(form.quantity || '1', 10)

    setSubmitState('submitting')
    setSubmitError(null)

    void (async () => {
      try {
        const response = await fetch('/api/custom-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: form.customerName,
            customerEmail: form.customerEmail,
            itemType: form.itemType,
            quantity: Number.isFinite(quantityNumber) ? Math.max(1, quantityNumber) : 1,
            deadline: form.deadline || null,
            budgetRange: form.budgetRange || null,
            description: form.description,
            designHelpNeeded: form.designHelpNeeded,
            files: files.map((file) => ({
              name: file.name,
              size: file.size,
              type: file.type,
            })),
            ipRightsConfirmed: form.ipRightsConfirmed,
            ageConfirmed: form.ageConfirmed,
            tosAccepted: form.tosAccepted,
          }),
        })

        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(
            typeof payload?.error === 'string'
              ? payload.error
              : 'Could not submit your request. Please try again.'
          )
        }

        setResult({
          id: payload?.request?.id ?? 'unknown',
          status: payload?.request?.status ?? 'awaiting_quote',
          accessToken:
            typeof payload?.customerAccessToken === 'string'
              ? payload.customerAccessToken
              : null,
        })
        setSubmitState('success')
        Analytics.customRequestSubmitted()
      } catch (error) {
        setSubmitState('error')
        setSubmitError(
          error instanceof Error
            ? error.message
            : 'Could not submit your request. Please try again.'
        )
      }
    })()
  }

  if (submitState === 'success') {
    return (
      <Box
        sx={{
          border: `1px solid ${alpha(brandTokens.forgeGold, 0.3)}`,
          background: `linear-gradient(135deg, ${alpha(brandTokens.forgeGold, 0.14)} 0%, ${alpha(brandTokens.bgSurface, 0.65)} 100%)`,
          borderRadius: 2,
          p: { xs: 2.2, md: 2.8 },
        }}
      >
        <Typography variant="h4" sx={{ mb: 1 }}>
          Request Submitted
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.72), mb: 1.8 }}>
          Your custom order request is in the review queue. We will follow up with next steps and a quote if everything looks feasible.
        </Typography>

        <Typography sx={{ color: alpha(brandTokens.parchment, 0.8), fontSize: '0.9rem', mb: 0.5 }}>
          Name: {form.customerName}
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.8), fontSize: '0.9rem', mb: 0.5 }}>
          Email: {form.customerEmail}
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.8), fontSize: '0.9rem', mb: 0.5 }}>
          Item Type: {form.itemType}
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.8), fontSize: '0.9rem', mb: 0.5 }}>
          Request ID: {result?.id ?? 'pending'}
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.8), fontSize: '0.9rem' }}>
          Current status: {result?.status ?? 'awaiting_quote'}
        </Typography>

        {result?.id && result.accessToken && (
          <Button
            sx={{ mt: 1.1 }}
            variant="contained"
            component="a"
            href={`/custom-orders/${result.id}?access=${encodeURIComponent(result.accessToken)}`}
          >
            View Request Status
          </Button>
        )}

        <Button
          sx={{ mt: 2.2 }}
          variant="outlined"
          onClick={() => {
            setSubmitState('idle')
            setForm(DEFAULT_STATE)
            setFiles([])
            setSubmitError(null)
            setResult(null)
          }}
        >
          Start Another Request
        </Button>
      </Box>
    )
  }

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      noValidate
      sx={{
        border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
        backgroundColor: alpha(brandTokens.bgSurface, 0.65),
        borderRadius: 2,
        p: { xs: 2, md: 2.8 },
      }}
    >
      <Stack spacing={2}>
        {submitState === 'error' && submitError && (
          <Box
            sx={{
              border: `1px solid ${alpha('#CF4040', 0.4)}`,
              backgroundColor: alpha('#CF4040', 0.12),
              borderRadius: 1,
              p: 1.1,
            }}
          >
            <Typography sx={{ fontSize: '0.85rem', color: '#F1B4B4' }}>
              {submitError}
            </Typography>
          </Box>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
            gap: 2,
          }}
        >
          <TextField
            label="Your Name"
            value={form.customerName}
            onChange={(e) => updateField('customerName', e.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Email"
            type="email"
            value={form.customerEmail}
            onChange={(e) => updateField('customerEmail', e.target.value)}
            required
            fullWidth
          />
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          <FormControl fullWidth required>
            <InputLabel id="item-type-label">Item Type</InputLabel>
            <Select
              labelId="item-type-label"
              label="Item Type"
              value={form.itemType}
              onChange={(e) => updateField('itemType', e.target.value)}
            >
              {categoryOptions.map((opt) => (
                <MenuItem key={opt.value} value={opt.label}>
                  {opt.label}
                </MenuItem>
              ))}
              <MenuItem value="Not sure yet">Not sure yet</MenuItem>
              <MenuItem value="Other custom idea">Other custom idea</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Quantity"
            type="number"
            value={form.quantity}
            onChange={(e) => updateField('quantity', e.target.value)}
            inputProps={{ min: 1, max: maxQuantity }}
            fullWidth
          />

          <TextField
            label="Desired Deadline"
            type="date"
            value={form.deadline}
            onChange={(e) => updateField('deadline', e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
        </Box>

        <FormControl fullWidth>
          <InputLabel id="budget-range-label">Budget Range (optional)</InputLabel>
          <Select
            labelId="budget-range-label"
            label="Budget Range (optional)"
            value={form.budgetRange}
            onChange={(e) => updateField('budgetRange', e.target.value)}
          >
            <MenuItem value="">No preference</MenuItem>
            {budgetRanges.map((range) => (
              <MenuItem key={range.id} value={range.label}>
                {range.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="Tell us what you want made"
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Describe materials, style, dimensions, personalization details, and anything we should know."
          multiline
          minRows={5}
          required
          fullWidth
        />

        <Box>
          <Typography sx={{ mb: 0.8, fontSize: '0.86rem', color: alpha(brandTokens.parchment, 0.72) }}>
            Reference files (up to {maxFiles})
          </Typography>
          <Button component="label" variant="outlined" size="small">
            Upload Files
            <input
              hidden
              type="file"
              accept=".png,.jpg,.jpeg,.svg,.pdf"
              multiple
              onChange={(e) => handleFileChange(e.target.files)}
            />
          </Button>
          {files.length > 0 && (
            <Typography sx={{ mt: 0.8, fontSize: '0.78rem', color: alpha(brandTokens.parchment, 0.65) }}>
              {files.map((file) => file.name).join(', ')}
            </Typography>
          )}
        </Box>

        <FormControlLabel
          control={
            <Checkbox
              checked={form.designHelpNeeded}
              onChange={(e) => updateField('designHelpNeeded', e.target.checked)}
            />
          }
          label="I need help finalizing artwork/design"
        />

        <Box sx={{ borderTop: `1px solid ${alpha(brandTokens.parchment, 0.1)}`, pt: 1.4 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={form.ipRightsConfirmed}
                onChange={(e) => updateField('ipRightsConfirmed', e.target.checked)}
                required
              />
            }
            label="I confirm I own or have permission to use submitted artwork"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={form.ageConfirmed}
                onChange={(e) => updateField('ageConfirmed', e.target.checked)}
                required
              />
            }
            label="I confirm I am 18+ or have guardian permission"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={form.tosAccepted}
                onChange={(e) => updateField('tosAccepted', e.target.checked)}
                required
              />
            }
            label="I agree to the current terms and custom order policies"
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.55), fontSize: '0.78rem' }}>
            You will review quote details before any payment is requested.
          </Typography>
          <Button type="submit" variant="contained" disabled={!canSubmit || submitState === 'submitting'}>
            {submitState === 'submitting' ? (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.8 }}>
                <CircularProgress size={16} sx={{ color: brandTokens.bgVoid }} />
                Submitting...
              </Box>
            ) : (
              'Submit Request'
            )}
          </Button>
        </Box>
      </Stack>
    </Box>
  )
}
