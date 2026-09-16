import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import {
  validatePromoCode,
  resolveEligibleDeals,
  applyPromotions,
  PromotionLineInput,
} from '@/lib/pricing/promotions'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { requireCsrfOriginOnly } from '@/lib/security/csrf'
import { parseJsonBodyOrError } from '@/lib/security/body'
import { safeLogError } from '@/lib/security/logger'

interface ValidatePromoRequest {
  code: string
  cartLines?: PromotionLineInput[]
  shippingCost?: number
}

export async function POST(request: Request) {
  try {
    const csrfResponse = requireCsrfOriginOnly(request)
    if (csrfResponse) return csrfResponse

    // SEC-010: Rate limit promo validation — 30 requests/minute per IP
    const ip = getClientIp(request)
    const rl = await rateLimit(`promo-validate:${ip}`, 30, 60_000)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter ?? 60)

    const parsed = await parseJsonBodyOrError<ValidatePromoRequest>(request)
    if (!parsed.ok) return parsed.response

    const body = parsed.body
    const code = typeof body.code === 'string' ? body.code.replace(/[%_\\]/g, '').trim().toUpperCase() : ''

    if (!code || code.length > 40) {
      return NextResponse.json({ error: 'A valid promo code is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const now = new Date()

    // Lookup promo code via service role (RLS no longer allows public reads)
    const { data: promoRows, error: promoError } = await supabase
      .from('exp_promo_codes')
      .select('*')
      .eq('is_active', true)
      .eq('code', code)
      .limit(1)

    if (promoError) {
      safeLogError('[promo:validate:promo-lookup]', promoError)
      return NextResponse.json({ error: 'Could not validate promo code. Please try again.' }, { status: 500 })
    }

    const promoRecord = promoRows?.[0] ?? null
    const promoValidation = validatePromoCode(promoRecord, code, now)

    // Lookup bundle deal code via service role
    const { data: dealRows, error: dealError } = await supabase
      .from('exp_bundle_deals')
      .select('*')
      .eq('is_active', true)
      .eq('trigger_type', 'code')
      .eq('code', code)

    if (dealError) {
      safeLogError('[promo:validate:deal-lookup]', dealError)
      return NextResponse.json({ error: 'Could not validate promo code. Please try again.' }, { status: 500 })
    }

    const lines = Array.isArray(body.cartLines) ? body.cartLines : []
    const shippingCost = Number(body.shippingCost) || 0

    const dealsValidation = resolveEligibleDeals(dealRows ?? [], lines, code, now)

    const appliedPromo = promoValidation.ok ? promoValidation.promo : null
    const appliedDeals = dealsValidation.ok ? dealsValidation.deals : []

    const hasAnyMatch = Boolean(appliedPromo) || appliedDeals.length > 0

    const promotionOutcome = hasAnyMatch
      ? applyPromotions({ lines, shippingCost, promo: appliedPromo, deals: appliedDeals })
      : null

    let reason: string | undefined
    if (!promoValidation.ok && !dealsValidation.ok) {
      reason = promoValidation.reason ?? dealsValidation.reason
    } else if (!promoValidation.ok) {
      reason = promoValidation.reason
    } else if (!dealsValidation.ok) {
      reason = dealsValidation.reason
    } else if (!hasAnyMatch) {
      reason = 'Code was not found.'
    }

    const valid = hasAnyMatch

    return NextResponse.json({
      code,
      valid,
      promo: appliedPromo
        ? {
            id: appliedPromo.id,
            code: appliedPromo.code,
            discountType: appliedPromo.discount_type,
            discountValue: Number(appliedPromo.discount_value),
          }
        : null,
      deals: appliedDeals.map((deal) => ({
        id: deal.id,
        name: deal.name,
        triggerType: deal.trigger_type,
        code: deal.code,
      })),
      promotionOutcome: promotionOutcome
        ? {
            promoDiscount: promotionOutcome.promoDiscount,
            dealDiscount: promotionOutcome.dealDiscount,
            shippingDiscount: promotionOutcome.shippingDiscount,
          }
        : null,
      reason,
    })
  } catch (error) {
    safeLogError('[promo:validate]', error)
    return NextResponse.json({ error: 'Could not validate promo code. Please try again.' }, { status: 500 })
  }
}
