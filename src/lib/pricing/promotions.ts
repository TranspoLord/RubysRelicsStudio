export interface PromotionLineInput {
  productId: string
  categoryKey: string | null
  quantity: number
  lineTotal: number
  selectedOptions?: Record<string, string>
}

export interface PromoCodeRecord {
  id: string
  code: string
  discount_type: 'percent' | 'fixed_amount' | 'free_shipping'
  discount_value: number
  is_active: boolean
  usage_limit: number | null
  usage_count: number
  valid_from: string | null
  valid_to: string | null
}

export interface BundleDealRecord {
  id: string
  name: string
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

export interface AppliedDealSummary {
  id: string
  name: string
  discountAmount: number
  freeShippingApplied: boolean
}

export interface AppliedPromoSummary {
  id: string
  code: string
  discountType: PromoCodeRecord['discount_type']
  discountAmount: number
  freeShippingApplied: boolean
}

export interface PromotionOutcome {
  lineDiscounts: number[]
  dealDiscount: number
  promoDiscount: number
  shippingDiscount: number
  appliedDeals: AppliedDealSummary[]
  appliedPromo: AppliedPromoSummary | null
}

function toCents(amount: number): number {
  return Math.max(0, Math.round(amount * 100))
}

function fromCents(amount: number): number {
  return amount / 100
}

function asNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => entry !== null)
}

function isActiveInWindow(validFrom: string | null, validTo: string | null, now: Date): boolean {
  const nowMs = now.getTime()
  if (validFrom) {
    const fromMs = new Date(validFrom).getTime()
    if (Number.isFinite(fromMs) && nowMs < fromMs) return false
  }
  if (validTo) {
    const toMs = new Date(validTo).getTime()
    if (Number.isFinite(toMs) && nowMs > toMs) return false
  }
  return true
}

function underUsageLimit(usageLimit: number | null, usageCount: number): boolean {
  if (usageLimit === null) return true
  return usageCount < usageLimit
}

function evaluateRule(rule: Record<string, unknown>, lines: PromotionLineInput[]): boolean {
  const type = asString(rule.type)
  if (!type) return false

  if (type === 'cart_subtotal_min') {
    const minSubtotal = Math.max(0, asNumber(rule.minSubtotal) ?? asNumber(rule.min_subtotal) ?? 0)
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)
    return subtotal >= minSubtotal
  }

  if (type === 'product_qty') {
    const productIds = asStringArray(rule.productIds ?? rule.product_ids)
    const minQty = Math.max(1, Math.trunc(asNumber(rule.minQty ?? rule.min_qty) ?? 1))
    if (productIds.length === 0) return false
    const qty = lines
      .filter((line) => productIds.includes(line.productId))
      .reduce((sum, line) => sum + line.quantity, 0)
    return qty >= minQty
  }

  if (type === 'category_qty') {
    const categoryKeys = asStringArray(rule.categoryKeys ?? rule.category_keys)
    const minQty = Math.max(1, Math.trunc(asNumber(rule.minQty ?? rule.min_qty) ?? 1))
    if (categoryKeys.length === 0) return false
    const qty = lines
      .filter((line) => line.categoryKey !== null && categoryKeys.includes(line.categoryKey))
      .reduce((sum, line) => sum + line.quantity, 0)
    return qty >= minQty
  }

  if (type === 'metadata_match') {
    const field = asString(rule.metadataField ?? rule.metadata_field)
    const expected = asString(rule.value)
    const minQty = Math.max(1, Math.trunc(asNumber(rule.minQty ?? rule.min_qty) ?? 1))
    if (!field || !expected) return false

    let qty = 0
    for (const line of lines) {
      const selected = line.selectedOptions?.[field]
      if (selected && selected === expected) {
        qty += line.quantity
      }
    }
    return qty >= minQty
  }

  return false
}

function evaluateConditions(conditions: Record<string, unknown>, lines: PromotionLineInput[]): boolean {
  const rawRules = Array.isArray(conditions.rules)
    ? (conditions.rules as unknown[])
    : conditions.type
      ? [conditions]
      : []

  if (rawRules.length === 0) return true

  const mode = asString(conditions.mode)?.toLowerCase() ?? 'all'
  const rules = rawRules.filter(
    (rule): rule is Record<string, unknown> => Boolean(rule) && typeof rule === 'object' && !Array.isArray(rule)
  )

  if (rules.length === 0) return true

  const evaluations = rules.map((rule) => evaluateRule(rule, lines))
  return mode === 'any' ? evaluations.some(Boolean) : evaluations.every(Boolean)
}

function applyOrderPercent(remainingCents: number[], percent: number): number[] {
  const subtotalCents = remainingCents.reduce((sum, cents) => sum + cents, 0)
  const target = Math.max(0, Math.round(subtotalCents * (percent / 100)))
  return allocateCents(target, remainingCents)
}

function allocateCents(targetCents: number, basisCents: number[]): number[] {
  const totalBasis = basisCents.reduce((sum, cents) => sum + cents, 0)
  if (targetCents <= 0 || totalBasis <= 0) return basisCents.map(() => 0)

  const cappedTarget = Math.min(targetCents, totalBasis)
  const baseShares = basisCents.map((basis) => Math.floor((cappedTarget * basis) / totalBasis))
  let remainder = cappedTarget - baseShares.reduce((sum, share) => sum + share, 0)

  const indexed = basisCents
    .map((basis, index) => ({
      index,
      frac: ((cappedTarget * basis) / totalBasis) - baseShares[index],
    }))
    .sort((a, b) => b.frac - a.frac)

  let cursor = 0
  while (remainder > 0 && indexed.length > 0) {
    baseShares[indexed[cursor % indexed.length].index] += 1
    cursor += 1
    remainder -= 1
  }

  return baseShares.map((share, index) => Math.min(share, basisCents[index]))
}

function readActions(rewards: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(rewards.actions)) {
    return rewards.actions.filter(
      (action): action is Record<string, unknown> =>
        Boolean(action) && typeof action === 'object' && !Array.isArray(action)
    )
  }
  if (rewards.type && typeof rewards === 'object') {
    return [rewards]
  }
  return []
}

function matchesLineFilter(action: Record<string, unknown>, line: PromotionLineInput): boolean {
  const productIds = asStringArray(action.productIds ?? action.product_ids)
  const categoryKeys = asStringArray(action.categoryKeys ?? action.category_keys)
  const hasProductFilter = productIds.length > 0
  const hasCategoryFilter = categoryKeys.length > 0

  if (!hasProductFilter && !hasCategoryFilter) return true
  if (hasProductFilter && !productIds.includes(line.productId)) return false
  if (hasCategoryFilter) {
    if (!line.categoryKey) return false
    if (!categoryKeys.includes(line.categoryKey)) return false
  }

  return true
}

function applyDeal(
  deal: BundleDealRecord,
  lines: PromotionLineInput[],
  runningDiscountsCents: number[]
): { lineAddsCents: number[]; discountCents: number; freeShippingApplied: boolean } {
  const actions = readActions(deal.rewards_json)
  if (actions.length === 0) {
    return { lineAddsCents: lines.map(() => 0), discountCents: 0, freeShippingApplied: false }
  }

  const lineAddsCents = lines.map(() => 0)
  let freeShippingApplied = false

  const remainingCents = lines.map((line, index) => Math.max(0, toCents(line.lineTotal) - runningDiscountsCents[index]))

  for (const action of actions) {
    const type = (asString(action.type) ?? '').toLowerCase()

    if (type === 'free_shipping') {
      freeShippingApplied = true
      continue
    }

    if (type === 'order_discount_percent' || type === 'discount_percent' || type === 'percent') {
      const percentRaw = asNumber(action.value ?? action.percent ?? action.discount_value)
      const percent = Math.max(0, Math.min(100, percentRaw ?? 0))
      if (percent <= 0) continue
      const allocations = applyOrderPercent(remainingCents, percent)
      for (let i = 0; i < allocations.length; i += 1) {
        lineAddsCents[i] += allocations[i]
        remainingCents[i] = Math.max(0, remainingCents[i] - allocations[i])
      }
      continue
    }

    if (type === 'order_discount_fixed' || type === 'discount_fixed' || type === 'fixed_amount') {
      const fixed = Math.max(0, toCents(asNumber(action.value ?? action.amount ?? action.discount_value) ?? 0))
      const allocations = allocateCents(fixed, remainingCents)
      for (let i = 0; i < allocations.length; i += 1) {
        lineAddsCents[i] += allocations[i]
        remainingCents[i] = Math.max(0, remainingCents[i] - allocations[i])
      }
      continue
    }

    if (type === 'item_discount_percent' || type === 'item_percent') {
      const percentRaw = asNumber(action.value ?? action.percent ?? action.discount_value)
      const percent = Math.max(0, Math.min(100, percentRaw ?? 0))
      if (percent <= 0) continue

      for (let i = 0; i < lines.length; i += 1) {
        if (!matchesLineFilter(action, lines[i])) continue
        const add = Math.min(remainingCents[i], Math.round(remainingCents[i] * (percent / 100)))
        lineAddsCents[i] += add
        remainingCents[i] = Math.max(0, remainingCents[i] - add)
      }
      continue
    }

    if (type === 'item_discount_fixed' || type === 'item_fixed') {
      const fixed = Math.max(0, toCents(asNumber(action.value ?? action.amount ?? action.discount_value) ?? 0))
      const eligibleIndices = lines
        .map((line, index) => (matchesLineFilter(action, line) ? index : -1))
        .filter((index) => index >= 0)

      if (eligibleIndices.length === 0 || fixed <= 0) continue

      const eligibleBasis = eligibleIndices.map((index) => remainingCents[index])
      const eligibleAllocations = allocateCents(fixed, eligibleBasis)
      for (let i = 0; i < eligibleIndices.length; i += 1) {
        const lineIndex = eligibleIndices[i]
        const add = eligibleAllocations[i]
        lineAddsCents[lineIndex] += add
        remainingCents[lineIndex] = Math.max(0, remainingCents[lineIndex] - add)
      }
    }
  }

  const discountCents = lineAddsCents.reduce((sum, cents) => sum + cents, 0)
  return { lineAddsCents, discountCents, freeShippingApplied }
}

interface DealPlan {
  deals: BundleDealRecord[]
  lineDiscountsCents: number[]
  dealDiscountCents: number
  freeShippingApplied: boolean
  appliedDeals: AppliedDealSummary[]
}

function evaluateDealPlan(deals: BundleDealRecord[], lines: PromotionLineInput[]): DealPlan {
  const running = lines.map(() => 0)
  const appliedDeals: AppliedDealSummary[] = []
  let freeShippingApplied = false

  for (const deal of deals) {
    const result = applyDeal(deal, lines, running)
    if (result.discountCents <= 0 && !result.freeShippingApplied) continue

    for (let i = 0; i < running.length; i += 1) {
      running[i] += result.lineAddsCents[i]
    }

    freeShippingApplied = freeShippingApplied || result.freeShippingApplied
    appliedDeals.push({
      id: deal.id,
      name: deal.name,
      discountAmount: fromCents(result.discountCents),
      freeShippingApplied: result.freeShippingApplied,
    })
  }

  const dealDiscountCents = running.reduce((sum, cents) => sum + cents, 0)

  return {
    deals,
    lineDiscountsCents: running,
    dealDiscountCents,
    freeShippingApplied,
    appliedDeals,
  }
}

export function validatePromoCode(
  promo: PromoCodeRecord | null,
  codeInput: string | null,
  now: Date
): { ok: true; promo: PromoCodeRecord | null } | { ok: false; reason: string } {
  if (!codeInput) return { ok: true, promo: null }
  if (!promo) return { ok: false, reason: 'Promo code was not found.' }
  if (!promo.is_active) return { ok: false, reason: 'Promo code is not active.' }
  if (!underUsageLimit(promo.usage_limit, promo.usage_count)) {
    return { ok: false, reason: 'Promo code has reached its usage limit.' }
  }
  if (!isActiveInWindow(promo.valid_from, promo.valid_to, now)) {
    return { ok: false, reason: 'Promo code is outside its valid date range.' }
  }
  return { ok: true, promo }
}

export function resolveEligibleDeals(
  deals: BundleDealRecord[],
  lines: PromotionLineInput[],
  dealCodeInput: string | null,
  now: Date
): { ok: true; deals: BundleDealRecord[] } | { ok: false; reason: string } {
  const normalizedCode = dealCodeInput?.trim().toUpperCase() ?? null

  const activeDeals = deals.filter((deal) => {
    if (!deal.is_active) return false
    if (!underUsageLimit(deal.usage_limit, deal.usage_count)) return false
    return isActiveInWindow(deal.valid_from, deal.valid_to, now)
  })

  const automaticDeals = activeDeals.filter((deal) => deal.trigger_type === 'automatic')
  const codeDeals = activeDeals.filter((deal) => deal.trigger_type === 'code')

  let selectedCodeDeal: BundleDealRecord | null = null
  if (normalizedCode) {
    selectedCodeDeal =
      codeDeals.find((deal) => (deal.code ?? '').trim().toUpperCase() === normalizedCode) ?? null
    if (!selectedCodeDeal) {
      return { ok: false, reason: 'Bundle deal code was not found or is inactive.' }
    }
  }

  const eligible = automaticDeals.filter((deal) => evaluateConditions(deal.conditions_json, lines))
  if (selectedCodeDeal) {
    if (!evaluateConditions(selectedCodeDeal.conditions_json, lines)) {
      return { ok: false, reason: 'Bundle deal code conditions were not met for this cart.' }
    }
    eligible.push(selectedCodeDeal)
  }

  return { ok: true, deals: eligible }
}

export function applyPromotions(args: {
  lines: PromotionLineInput[]
  shippingCost: number
  promo: PromoCodeRecord | null
  deals: BundleDealRecord[]
}): PromotionOutcome {
  const { lines, promo, deals } = args

  const stackableDeals = deals.filter((deal) => deal.is_stackable)
  const nonStackableDeals = deals.filter((deal) => !deal.is_stackable)

  const plans: DealPlan[] = [evaluateDealPlan(stackableDeals, lines)]
  for (const nonStack of nonStackableDeals) {
    plans.push(evaluateDealPlan([...stackableDeals, nonStack], lines))
  }

  const bestPlan = plans.sort((a, b) => {
    if (b.dealDiscountCents !== a.dealDiscountCents) {
      return b.dealDiscountCents - a.dealDiscountCents
    }
    const aFree = a.freeShippingApplied ? 1 : 0
    const bFree = b.freeShippingApplied ? 1 : 0
    return bFree - aFree
  })[0]

  const running = [...bestPlan.lineDiscountsCents]
  let shippingDiscountCents = bestPlan.freeShippingApplied ? toCents(args.shippingCost) : 0
  let appliedPromo: AppliedPromoSummary | null = null

  if (promo) {
    const remainingCents = lines.map((line, index) => Math.max(0, toCents(line.lineTotal) - running[index]))

    if (promo.discount_type === 'percent') {
      const percent = Math.max(0, Math.min(100, Number(promo.discount_value)))
      const adds = applyOrderPercent(remainingCents, percent)
      for (let i = 0; i < adds.length; i += 1) {
        running[i] += adds[i]
      }
      const discountCents = adds.reduce((sum, cents) => sum + cents, 0)
      appliedPromo = {
        id: promo.id,
        code: promo.code,
        discountType: promo.discount_type,
        discountAmount: fromCents(discountCents),
        freeShippingApplied: false,
      }
    } else if (promo.discount_type === 'fixed_amount') {
      const fixedCents = toCents(Number(promo.discount_value))
      const adds = allocateCents(fixedCents, remainingCents)
      for (let i = 0; i < adds.length; i += 1) {
        running[i] += adds[i]
      }
      const discountCents = adds.reduce((sum, cents) => sum + cents, 0)
      appliedPromo = {
        id: promo.id,
        code: promo.code,
        discountType: promo.discount_type,
        discountAmount: fromCents(discountCents),
        freeShippingApplied: false,
      }
    } else if (promo.discount_type === 'free_shipping') {
      const promoShippingCents = toCents(args.shippingCost)
      shippingDiscountCents = Math.max(shippingDiscountCents, promoShippingCents)
      appliedPromo = {
        id: promo.id,
        code: promo.code,
        discountType: promo.discount_type,
        discountAmount: 0,
        freeShippingApplied: promoShippingCents > 0,
      }
    }
  }

  const dealDiscount = fromCents(bestPlan.dealDiscountCents)
  const promoDiscount = appliedPromo ? appliedPromo.discountAmount : 0

  return {
    lineDiscounts: running.map(fromCents),
    dealDiscount,
    promoDiscount,
    shippingDiscount: fromCents(shippingDiscountCents),
    appliedDeals: bestPlan.appliedDeals,
    appliedPromo,
  }
}
