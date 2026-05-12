'use client'

import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'

interface PromoCodeRow {
  id: string
  code: string
  description: string
  discount_type: 'percent' | 'fixed_amount' | 'free_shipping'
  discount_value: number
  is_active: boolean
  usage_limit: number | null
  usage_count: number
  valid_from: string | null
  valid_to: string | null
}

interface BundleDealRow {
  id: string
  name: string
  description: string
  trigger_type: 'automatic' | 'code'
  code: string | null
  conditions_json: Record<string, unknown>
  rewards_json: Record<string, unknown>
  is_active: boolean
  is_stackable: boolean
  usage_limit: number | null
  usage_count: number
  valid_from: string | null
  valid_to: string | null
}

type PromoDiscountType = PromoCodeRow['discount_type']
type TriggerType = BundleDealRow['trigger_type']

const DISCOUNT_TYPE_CHOICES: PromoDiscountType[] = ['percent', 'fixed_amount', 'free_shipping']
const TRIGGER_TYPE_CHOICES: TriggerType[] = ['automatic', 'code']

export default function StorePricingPage() {
  const [promoCodes, setPromoCodes] = useState<PromoCodeRow[]>([])
  const [bundleDeals, setBundleDeals] = useState<BundleDealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [promoCode, setPromoCode] = useState('')
  const [promoDescription, setPromoDescription] = useState('')
  const [promoDiscountType, setPromoDiscountType] = useState<PromoDiscountType>('percent')
  const [promoDiscountValue, setPromoDiscountValue] = useState('10')
  const [promoUsageLimit, setPromoUsageLimit] = useState('')
  const [promoValidFrom, setPromoValidFrom] = useState('')
  const [promoValidTo, setPromoValidTo] = useState('')

  const [dealName, setDealName] = useState('')
  const [dealDescription, setDealDescription] = useState('')
  const [dealTriggerType, setDealTriggerType] = useState<TriggerType>('automatic')
  const [dealCode, setDealCode] = useState('')
  const [dealConditionsJson, setDealConditionsJson] = useState('{"rules": []}')
  const [dealRewardsJson, setDealRewardsJson] = useState('{"actions": []}')
  const [dealUsageLimit, setDealUsageLimit] = useState('')
  const [dealValidFrom, setDealValidFrom] = useState('')
  const [dealValidTo, setDealValidTo] = useState('')

  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      const [promoRes, dealsRes] = await Promise.all([
        fetch('/api/admin/catalog/promo-codes', { cache: 'no-store' }),
        fetch('/api/admin/catalog/bundle-deals', { cache: 'no-store' }),
      ])

      const promoPayload = await promoRes.json().catch(() => ({}))
      const dealsPayload = await dealsRes.json().catch(() => ({}))

      if (!promoRes.ok) {
        throw new Error(typeof promoPayload?.error === 'string' ? promoPayload.error : 'Failed to load promo codes.')
      }

      if (!dealsRes.ok) {
        throw new Error(typeof dealsPayload?.error === 'string' ? dealsPayload.error : 'Failed to load bundle deals.')
      }

      setPromoCodes(Array.isArray(promoPayload?.promoCodes) ? promoPayload.promoCodes : [])
      setBundleDeals(Array.isArray(dealsPayload?.bundleDeals) ? dealsPayload.bundleDeals : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load pricing hub.')
      setPromoCodes([])
      setBundleDeals([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  async function createPromoCode() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: promoCode,
          description: promoDescription,
          discount_type: promoDiscountType,
          discount_value: Number(promoDiscountValue),
          is_active: true,
          usage_limit: promoUsageLimit.trim() ? Number(promoUsageLimit) : null,
          valid_from: promoValidFrom || null,
          valid_to: promoValidTo || null,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to create promo code.')
      }

      setSuccess('Promo code created.')
      setPromoCode('')
      setPromoDescription('')
      setPromoDiscountType('percent')
      setPromoDiscountValue('10')
      setPromoUsageLimit('')
      setPromoValidFrom('')
      setPromoValidTo('')
      await loadData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to create promo code.')
    } finally {
      setSaving(false)
    }
  }

  async function deletePromoCode(promoId: string) {
    const confirmed = window.confirm('Delete this promo code?')
    if (!confirmed) return

    setBusyId(promoId)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/promo-codes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promoId,
          confirmAction: 'delete_promo_code',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete promo code.')
      }

      setSuccess('Promo code deleted.')
      await loadData()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete promo code.')
    } finally {
      setBusyId(null)
    }
  }

  async function togglePromoCode(promo: PromoCodeRow) {
    setBusyId(promo.id)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/promo-codes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promoId: promo.id,
          code: promo.code,
          description: promo.description,
          discount_type: promo.discount_type,
          discount_value: promo.discount_value,
          is_active: !promo.is_active,
          usage_limit: promo.usage_limit,
          valid_from: promo.valid_from,
          valid_to: promo.valid_to,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to update promo code.')
      }

      setSuccess('Promo code updated.')
      await loadData()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update promo code.')
    } finally {
      setBusyId(null)
    }
  }

  async function createBundleDeal() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    let conditions: Record<string, unknown>
    let rewards: Record<string, unknown>

    try {
      conditions = JSON.parse(dealConditionsJson) as Record<string, unknown>
    } catch {
      setSaving(false)
      setError('Conditions JSON is invalid.')
      return
    }

    try {
      rewards = JSON.parse(dealRewardsJson) as Record<string, unknown>
    } catch {
      setSaving(false)
      setError('Rewards JSON is invalid.')
      return
    }

    try {
      const response = await fetch('/api/admin/catalog/bundle-deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: dealName,
          description: dealDescription,
          trigger_type: dealTriggerType,
          code: dealTriggerType === 'code' ? dealCode : null,
          conditions_json: conditions,
          rewards_json: rewards,
          is_active: true,
          is_stackable: true,
          usage_limit: dealUsageLimit.trim() ? Number(dealUsageLimit) : null,
          valid_from: dealValidFrom || null,
          valid_to: dealValidTo || null,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to create bundle deal.')
      }

      setSuccess('Bundle deal created.')
      setDealName('')
      setDealDescription('')
      setDealTriggerType('automatic')
      setDealCode('')
      setDealConditionsJson('{"rules": []}')
      setDealRewardsJson('{"actions": []}')
      setDealUsageLimit('')
      setDealValidFrom('')
      setDealValidTo('')
      await loadData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to create bundle deal.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteBundleDeal(dealId: string) {
    const confirmed = window.confirm('Delete this bundle deal?')
    if (!confirmed) return

    setBusyId(dealId)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/bundle-deals', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId,
          confirmAction: 'delete_bundle_deal',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete bundle deal.')
      }

      setSuccess('Bundle deal deleted.')
      await loadData()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete bundle deal.')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleBundleDeal(deal: BundleDealRow) {
    setBusyId(deal.id)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/bundle-deals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId: deal.id,
          name: deal.name,
          description: deal.description,
          trigger_type: deal.trigger_type,
          code: deal.code,
          conditions_json: deal.conditions_json,
          rewards_json: deal.rewards_json,
          is_active: !deal.is_active,
          is_stackable: deal.is_stackable,
          usage_limit: deal.usage_limit,
          valid_from: deal.valid_from,
          valid_to: deal.valid_to,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to update bundle deal.')
      }

      setSuccess('Bundle deal updated.')
      await loadData()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update bundle deal.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ mb: 0.5 }}>
          Store Pricing & Promotions
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
          Manage store-wide discount codes, bundle deals, and promotional pricing
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      {loading ? (
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>Loading pricing hub...</Typography>
      ) : (
        <>
          <Box
            sx={{
              borderRadius: 1.4,
              border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`,
              backgroundColor: alpha(brandTokens.bgSurface, 0.52),
              p: 1.3,
              display: 'grid',
              gap: 1,
            }}
          >
            <Typography variant="h6">Promo Codes</Typography>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField size="small" label="Code" value={promoCode} onChange={(event) => setPromoCode(event.target.value)} sx={{ width: 180 }} />
              <TextField size="small" label="Description" value={promoDescription} onChange={(event) => setPromoDescription(event.target.value)} fullWidth />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <Select size="small" value={promoDiscountType} onChange={(event) => setPromoDiscountType(event.target.value as PromoDiscountType)} sx={{ minWidth: 180 }}>
                {DISCOUNT_TYPE_CHOICES.map((kind) => (
                  <MenuItem key={kind} value={kind}>{kind}</MenuItem>
                ))}
              </Select>
              <TextField size="small" type="number" label="Value" value={promoDiscountValue} onChange={(event) => setPromoDiscountValue(event.target.value)} sx={{ width: 140 }} />
              <TextField size="small" type="number" label="Usage limit" value={promoUsageLimit} onChange={(event) => setPromoUsageLimit(event.target.value)} sx={{ width: 160 }} />
              <TextField size="small" type="datetime-local" label="Valid from" value={promoValidFrom} onChange={(event) => setPromoValidFrom(event.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: 210 }} />
              <TextField size="small" type="datetime-local" label="Valid to" value={promoValidTo} onChange={(event) => setPromoValidTo(event.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: 210 }} />
              <Button variant="outlined" disabled={saving} onClick={() => void createPromoCode()}>
                Create
              </Button>
            </Stack>

            {promoCodes.length === 0 ? (
              <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.82rem' }}>
                No promo codes yet.
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.7 }}>
                {promoCodes.map((promo) => (
                  <Box
                    key={promo.id}
                    sx={{
                      borderRadius: 1,
                      border: `1px solid ${alpha(brandTokens.parchment, 0.14)}`,
                      p: 0.8,
                      backgroundColor: alpha(brandTokens.bgSurface, 0.38),
                    }}
                  >
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                      <Typography sx={{ color: alpha(brandTokens.parchment, 0.7), fontSize: '0.8rem' }}>
                        {promo.code} | {promo.discount_type} {promo.discount_value} | usage {promo.usage_count}
                        {promo.usage_limit ? `/${promo.usage_limit}` : ''} | {promo.is_active ? 'Active' : 'Inactive'}
                      </Typography>
                      <Stack direction="row" spacing={0.8}>
                        <Button size="small" variant="text" disabled={busyId === promo.id} onClick={() => void togglePromoCode(promo)}>
                          {promo.is_active ? 'Disable' : 'Enable'}
                        </Button>
                        <Button size="small" variant="outlined" color="error" disabled={busyId === promo.id} onClick={() => void deletePromoCode(promo.id)}>
                          Delete
                        </Button>
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          <Box
            sx={{
              borderRadius: 1.4,
              border: `1px solid ${alpha(brandTokens.parchment, 0.16)}`,
              backgroundColor: alpha(brandTokens.bgSurface, 0.52),
              p: 1.3,
              display: 'grid',
              gap: 1,
            }}
          >
            <Typography variant="h6">Bundle Deals</Typography>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField size="small" label="Name" value={dealName} onChange={(event) => setDealName(event.target.value)} sx={{ minWidth: 220 }} />
              <TextField size="small" label="Description" value={dealDescription} onChange={(event) => setDealDescription(event.target.value)} fullWidth />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <Select size="small" value={dealTriggerType} onChange={(event) => setDealTriggerType(event.target.value as TriggerType)} sx={{ minWidth: 160 }}>
                {TRIGGER_TYPE_CHOICES.map((kind) => (
                  <MenuItem key={kind} value={kind}>{kind}</MenuItem>
                ))}
              </Select>
              <TextField
                size="small"
                label="Code (for code trigger)"
                value={dealCode}
                onChange={(event) => setDealCode(event.target.value)}
                sx={{ width: 220 }}
                disabled={dealTriggerType !== 'code'}
              />
              <TextField size="small" type="number" label="Usage limit" value={dealUsageLimit} onChange={(event) => setDealUsageLimit(event.target.value)} sx={{ width: 160 }} />
              <TextField size="small" type="datetime-local" label="Valid from" value={dealValidFrom} onChange={(event) => setDealValidFrom(event.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: 210 }} />
              <TextField size="small" type="datetime-local" label="Valid to" value={dealValidTo} onChange={(event) => setDealValidTo(event.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: 210 }} />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                multiline
                minRows={3}
                size="small"
                label="Conditions JSON"
                value={dealConditionsJson}
                onChange={(event) => setDealConditionsJson(event.target.value)}
                fullWidth
              />
              <TextField
                multiline
                minRows={3}
                size="small"
                label="Rewards JSON"
                value={dealRewardsJson}
                onChange={(event) => setDealRewardsJson(event.target.value)}
                fullWidth
              />
              <Button variant="outlined" disabled={saving} onClick={() => void createBundleDeal()}>
                Create
              </Button>
            </Stack>

            {bundleDeals.length === 0 ? (
              <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.82rem' }}>
                No bundle deals yet.
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.7 }}>
                {bundleDeals.map((deal) => (
                  <Box
                    key={deal.id}
                    sx={{
                      borderRadius: 1,
                      border: `1px solid ${alpha(brandTokens.parchment, 0.14)}`,
                      p: 0.8,
                      backgroundColor: alpha(brandTokens.bgSurface, 0.38),
                    }}
                  >
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                      <Typography sx={{ color: alpha(brandTokens.parchment, 0.7), fontSize: '0.8rem' }}>
                        {deal.name} | trigger {deal.trigger_type}
                        {deal.code ? ` (${deal.code})` : ''} | usage {deal.usage_count}
                        {deal.usage_limit ? `/${deal.usage_limit}` : ''} | {deal.is_active ? 'Active' : 'Inactive'}
                      </Typography>
                      <Stack direction="row" spacing={0.8}>
                        <Button size="small" variant="text" disabled={busyId === deal.id} onClick={() => void toggleBundleDeal(deal)}>
                          {deal.is_active ? 'Disable' : 'Enable'}
                        </Button>
                        <Button size="small" variant="outlined" color="error" disabled={busyId === deal.id} onClick={() => void deleteBundleDeal(deal.id)}>
                          Delete
                        </Button>
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </>
      )}
    </Box>
  )
}
