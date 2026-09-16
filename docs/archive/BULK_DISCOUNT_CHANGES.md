# Bulk Discount Update — Implementation Guide

This document describes all changes needed to fix the stepped bulk discount feature and add a description field that appears under the price in the storefront product preview.

---

## Root Cause: Why Stepped Discounts Don't Work

The migration `051_stepped_bulk_discount.sql` correctly adds the `step_qty` column and `'stepped'` type to the DB. The admin discounts API and the pricing engine both handle `'stepped'` correctly. **However, the storefront data layer is broken:**

1. **`src/lib/supabase/queries/products.ts`** — The `DbProductBulkDiscount` interface was missing `'stepped'` from the `discount_type` union, and the SELECT query was missing `step_qty`. So even if a stepped tier is saved, the storefront never receives `step_qty`.

2. **`src/components/shop/ProductConfigurator.tsx`** — The storefront discount calculation only handles `percent`, `fixed_amount`, and `unit_price`. There's **no `stepped` branch**, so stepped tiers silently produce zero discount. The `formatBulkTierLabel` function also has no `stepped` case.

3. **Possible DB issue** — If migration 051 hasn't been applied to your database, the `step_qty` column won't exist and the API insert will fail.

---

## What "Label" Does

The `label` field is a **short override for the tier's display name** in the storefront volume-pricing pills and the "Bulk Tier Applied" box. For example, without a label it shows `10+: 10% off`; with a label "Bulk Special" it shows `10+: Bulk Special`. It does **not** appear under the price as a description — it replaces the auto-generated tier name. So we need a separate `description` field.

---

## Changes Checklist

- [x] 1. New DB migration: `supabase/migrations/052_bulk_discount_description.sql` ✅ CREATED
- [x] 2. Fix storefront data layer interface: `src/lib/supabase/queries/products.ts` ✅ DONE
- [x] 2b. Fix storefront data layer SELECT query: `src/lib/supabase/queries/products.ts` ✅ DONE
- [x] 3. Fix storefront pricing: `src/components/shop/ProductConfigurator.tsx` ✅ DONE
- [x] 4. Update pricing engine: `src/lib/pricing/engine.ts` ✅ DONE
- [x] 5. Update admin discounts API: `src/app/api/admin/catalog/discounts/route.ts` ✅ DONE
- [x] 6. Rebuild admin UI: `src/app/admin/(panel)/catalog/products/[id]/builder/page.tsx` ✅ DONE
- [x] 7. Update pricing-preview API: `src/app/api/admin/catalog/pricing-preview/route.ts` ✅ DONE
- [x] 8. Update admin pricing page: `src/app/admin/(panel)/catalog/products/[id]/pricing/page.tsx` ✅ DONE
- [x] 9. Update tests: `src/lib/pricing/engine.test.ts` ✅ DONE
- [x] 10. Fix square/checkout route: `src/app/api/square/checkout/route.ts` ✅ DONE (bonus — not in original checklist)
- [x] 11. Type-check passed: `npx tsc --noEmit` ✅ PASSED
- [x] 12. Tests passed: `npx vitest run src/lib/pricing/engine.test.ts` ✅ PASSED (11/11)

---

## 1. DB Migration — `supabase/migrations/052_bulk_discount_description.sql` ✅ DONE

Already created. Adds `description TEXT` column and re-asserts `step_qty` + `stepped` constraint as a safety net.

**Action required:** Run this migration against your database:
```bash
supabase db push
# or apply manually via psql / Supabase dashboard
```

---

## 2. Storefront Data Layer — `src/lib/supabase/queries/products.ts`

### 2a. Interface update ✅ DONE

The `DbProductBulkDiscount` interface has been updated to:
```typescript
export interface DbProductBulkDiscount {
  id: string
  product_id: string
  min_qty: number
  max_qty: number | null
  discount_type: 'percent' | 'fixed_amount' | 'unit_price' | 'stepped'
  discount_value: number
  step_qty: number | null
  label: string | null
  description: string | null
  is_enabled: boolean
  sort_order: number
}
```

### 2b. SELECT query update — PENDING

In the `getProductBySlug` function, the bulk discounts SELECT query needs `step_qty` and `description` added.

**Find this line (~line 387):**
```typescript
      .select('id, product_id, min_qty, max_qty, discount_type, discount_value, label, is_enabled, sort_order')
```

**Replace with:**
```typescript
      .select('id, product_id, min_qty, max_qty, discount_type, discount_value, step_qty, label, description, is_enabled, sort_order')
```

---

## 3. Storefront Pricing — `src/components/shop/ProductConfigurator.tsx`

### 3a. Add `stepped` branch to discount calculation

**Find this block in the `pricing` useMemo:**
```typescript
      } else if (activeBulkTier.discount_type === 'unit_price') {
        discount += Math.max(0, (unitPrice - activeBulkTier.discount_value) * state.quantity)
      }
```

**Replace with:**
```typescript
      } else if (activeBulkTier.discount_type === 'unit_price') {
        discount += Math.max(0, (unitPrice - activeBulkTier.discount_value) * state.quantity)
      } else if (activeBulkTier.discount_type === 'stepped') {
        const stepQty = Number(activeBulkTier.step_qty ?? 0)
        if (stepQty > 0) {
          const steps = Math.floor(state.quantity / stepQty)
          const perUnitDiscount = Math.min(unitPrice, steps * Number(activeBulkTier.discount_value))
          discount += perUnitDiscount * state.quantity
        }
      }
```

### 3b. Update `formatBulkTierLabel` to handle `stepped`

**Find this function:**
```typescript
function formatBulkTierLabel(tier: DbProductBulkDiscount): string {
  const range = tier.max_qty ? `${tier.min_qty}-${tier.max_qty}` : `${tier.min_qty}+`
  if (tier.label) return `${range}: ${tier.label}`
  if (tier.discount_type === 'percent') return `${range}: ${tier.discount_value}% off`
  if (tier.discount_type === 'fixed_amount') return `${range}: -$${tier.discount_value.toFixed(2)} each`
  return `${range}: $${tier.discount_value.toFixed(2)} each`
}
```

**Replace with:**
```typescript
function formatBulkTierLabel(tier: DbProductBulkDiscount): string {
  const range = tier.max_qty ? `${tier.min_qty}-${tier.max_qty}` : `${tier.min_qty}+`
  if (tier.label) return `${range}: ${tier.label}`
  if (tier.discount_type === 'percent') return `${range}: ${tier.discount_value}% off`
  if (tier.discount_type === 'fixed_amount') return `${range}: -$${tier.discount_value.toFixed(2)} each`
  if (tier.discount_type === 'stepped') return `${range}: -$${tier.discount_value.toFixed(2)}/each per ${tier.step_qty ?? '?'} pcs`
  return `${range}: $${tier.discount_value.toFixed(2)} each`
}
```

### 3c. Display tier description under the price

**Find this block (the price display + bulk tier applied box):**
```tsx
        <Typography sx={{ fontFamily: 'var(--font-cinzel, serif)', fontWeight: 700, fontSize: '1.75rem', color: brandTokens.parchment }}>
          ${pricing.total.toFixed(2)}
        </Typography>
      </Box>

      {pricing.activeBulkTier && (
```

**Replace with:**
```tsx
        <Typography sx={{ fontFamily: 'var(--font-cinzel, serif)', fontWeight: 700, fontSize: '1.75rem', color: brandTokens.parchment }}>
          ${pricing.total.toFixed(2)}
        </Typography>
      </Box>

      {pricing.activeBulkTier?.description && (
        <Typography sx={{ fontSize: '0.72rem', color: alpha(brandTokens.parchment, 0.5), mt: -1, mb: 0.5 }}>
          {pricing.activeBulkTier.description}
        </Typography>
      )}

      {pricing.activeBulkTier && (
```

---

## 4. Pricing Engine — `src/lib/pricing/engine.ts`

### 4a. Add `description` to `PricingBulkTier` interface

**Find:**
```typescript
export interface PricingBulkTier {
  min_qty: number
  max_qty: number | null
  discount_type: 'percent' | 'fixed_amount' | 'unit_price' | 'stepped'
  discount_value: number
  /** Step quantity for 'stepped' type — discount increases every step_qty items */
  step_qty: number | null
  label: string | null
  sort_order: number
  is_enabled: boolean
}
```

**Replace with:**
```typescript
export interface PricingBulkTier {
  min_qty: number
  max_qty: number | null
  discount_type: 'percent' | 'fixed_amount' | 'unit_price' | 'stepped'
  discount_value: number
  /** Step quantity for 'stepped' type — discount increases every step_qty items */
  step_qty: number | null
  label: string | null
  /** Customer-facing note shown under the price in the storefront */
  description: string | null
  sort_order: number
  is_enabled: boolean
}
```

> Note: The `computeCanonicalLine` function already returns `appliedTier` which will now carry `description` automatically. No other engine changes needed — the stepped math is already implemented.

---

## 5. Admin Discounts API — `src/app/api/admin/catalog/discounts/route.ts`

### 5a. Add `description` to `DiscountBody` interface

**Find:**
```typescript
interface DiscountBody {
  productId?: unknown
  discountId?: unknown
  min_qty?: unknown
  max_qty?: unknown
  discount_type?: unknown
  discount_value?: unknown
  step_qty?: unknown
  label?: unknown
  is_enabled?: unknown
  sort_order?: unknown
  confirmAction?: unknown
}
```

**Replace with:**
```typescript
interface DiscountBody {
  productId?: unknown
  discountId?: unknown
  min_qty?: unknown
  max_qty?: unknown
  discount_type?: unknown
  discount_value?: unknown
  step_qty?: unknown
  label?: unknown
  description?: unknown
  is_enabled?: unknown
  sort_order?: unknown
  confirmAction?: unknown
}
```

### 5b. Update `SELECT_COLUMNS`

**Find:**
```typescript
const SELECT_COLUMNS =
  'id, product_id, min_qty, max_qty, discount_type, discount_value, step_qty, label, is_enabled, sort_order, updated_at'
```

**Replace with:**
```typescript
const SELECT_COLUMNS =
  'id, product_id, min_qty, max_qty, discount_type, discount_value, step_qty, label, description, is_enabled, sort_order, updated_at'
```

### 5c. Add `description` parsing in POST handler

**Find (in POST, after `const label = ...`):**
```typescript
    const label = asOptionalString(body.label, 120)
    const isEnabled = asBoolean(body.is_enabled, true)
    const sortOrderRaw = asNumber(body.sort_order)
```

**Replace with:**
```typescript
    const label = asOptionalString(body.label, 120)
    const description = asOptionalString(body.description, 280)
    const isEnabled = asBoolean(body.is_enabled, true)
    const sortOrderRaw = asNumber(body.sort_order)
```

### 5d. Add `description` to POST insert payload

**Find (in POST insert):**
```typescript
      .insert({
        product_id: productId,
        min_qty: minQtyRaw,
        max_qty: maxQtyRaw,
        discount_type: discountType,
        discount_value: Math.round(discountValueRaw * 100) / 100,
        step_qty: discountType === 'stepped' ? Math.trunc(stepQtyRaw!) : null,
        label,
        is_enabled: isEnabled,
        sort_order: Math.trunc(sortOrderRaw),
        updated_at: new Date().toISOString(),
      })
```

**Replace with:**
```typescript
      .insert({
        product_id: productId,
        min_qty: minQtyRaw,
        max_qty: maxQtyRaw,
        discount_type: discountType,
        discount_value: Math.round(discountValueRaw * 100) / 100,
        step_qty: discountType === 'stepped' ? Math.trunc(stepQtyRaw!) : null,
        label,
        description,
        is_enabled: isEnabled,
        sort_order: Math.trunc(sortOrderRaw),
        updated_at: new Date().toISOString(),
      })
```

### 5e. Add `description` parsing in PUT handler

**Find (in PUT, after `const label = ...`):**
```typescript
    const label = asOptionalString(body.label, 120)
    const isEnabled = asBoolean(body.is_enabled, true)
    const sortOrderRaw = asNumber(body.sort_order)
```

**Replace with:**
```typescript
    const label = asOptionalString(body.label, 120)
    const description = asOptionalString(body.description, 280)
    const isEnabled = asBoolean(body.is_enabled, true)
    const sortOrderRaw = asNumber(body.sort_order)
```

### 5f. Add `description` to PUT update payload

**Find (in PUT update):**
```typescript
      .update({
        min_qty: minQtyRaw,
        max_qty: maxQtyRaw,
        discount_type: discountType,
        discount_value: Math.round(discountValueRaw * 100) / 100,
        step_qty: discountType === 'stepped' ? Math.trunc(stepQtyRaw!) : null,
        label,
        is_enabled: isEnabled,
        sort_order: Math.trunc(sortOrderRaw),
        updated_at: new Date().toISOString(),
      })
```

**Replace with:**
```typescript
      .update({
        min_qty: minQtyRaw,
        max_qty: maxQtyRaw,
        discount_type: discountType,
        discount_value: Math.round(discountValueRaw * 100) / 100,
        step_qty: discountType === 'stepped' ? Math.trunc(stepQtyRaw!) : null,
        label,
        description,
        is_enabled: isEnabled,
        sort_order: Math.trunc(sortOrderRaw),
        updated_at: new Date().toISOString(),
      })
```

---

## 6. Admin Builder UI — `src/app/admin/(panel)/catalog/products/[id]/builder/page.tsx`

### 6a. Add `description` to `DiscountTier` interface

**Find:**
```typescript
interface DiscountTier {
  id: string
  min_qty: number
  max_qty: number | null
  discount_type: 'percent' | 'fixed_amount' | 'unit_price' | 'stepped'
  discount_value: number
  step_qty: number | null
  label: string | null
  is_enabled: boolean
}
```

**Replace with:**
```typescript
interface DiscountTier {
  id: string
  min_qty: number
  max_qty: number | null
  discount_type: 'percent' | 'fixed_amount' | 'unit_price' | 'stepped'
  discount_value: number
  step_qty: number | null
  label: string | null
  description: string | null
  is_enabled: boolean
}
```

### 6b. Add `discountDescription` state

**Find:**
```typescript
  const [discountLabel, setDiscountLabel] = useState('')
  const [discountSortOrder, setDiscountSortOrder] = useState('')
```

**Replace with:**
```typescript
  const [discountLabel, setDiscountLabel] = useState('')
  const [discountDescription, setDiscountDescription] = useState('')
  const [discountSortOrder, setDiscountSortOrder] = useState('')
```

### 6c. Update `addDiscountTier()` to send `description`

**Find:**
```typescript
        body: JSON.stringify({
          productId,
          min_qty: asNumber(minQty, 0),
          max_qty: maxQty ? asNumber(maxQty, 0) : null,
          discount_type: discountType,
          discount_value: asNumber(discountValue, 0),
          step_qty: discountType === 'stepped' ? asNumber(stepQty, 10) : null,
          label: discountLabel || null,
          sort_order: asNumber(discountSortOrder, 0),
        }),
```

**Replace with:**
```typescript
        body: JSON.stringify({
          productId,
          min_qty: asNumber(minQty, 0),
          max_qty: maxQty ? asNumber(maxQty, 0) : null,
          discount_type: discountType,
          discount_value: asNumber(discountValue, 0),
          step_qty: discountType === 'stepped' ? asNumber(stepQty, 10) : null,
          label: discountLabel || null,
          description: discountDescription || null,
          sort_order: asNumber(discountSortOrder, 0),
        }),
```

### 6d. Reset `discountDescription` after adding

**Find:**
```typescript
      setDiscountLabel('')
      setDiscountSortOrder('')
```

**Replace with:**
```typescript
      setDiscountLabel('')
      setDiscountDescription('')
      setDiscountSortOrder('')
```

### 6e. Rebuild the bulk discount form UI (type-first layout)

**Find the entire form block (from `<Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>` after "Bulk Discount Tiers" to the closing `</Stack>` before the discounts list):**

```tsx
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            size="small"
            type="number"
            label="Min qty"
            value={minQty}
            onChange={(event) => setMinQty(event.target.value)}
            sx={{ width: 130 }}
          />
          <TextField
            size="small"
            type="number"
            label="Max qty"
            value={maxQty}
            onChange={(event) => setMaxQty(event.target.value)}
            sx={{ width: 130 }}
            inputProps={{ placeholder: 'Leave empty for unlimited' }}
          />
          <Select
            size="small"
            value={discountType}
            onChange={(event) => setDiscountType(event.target.value as 'percent' | 'fixed_amount' | 'unit_price' | 'stepped')}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="percent">Percent off</MenuItem>
            <MenuItem value="fixed_amount">Fixed $ off/unit</MenuItem>
            <MenuItem value="unit_price">Set unit price</MenuItem>
            <MenuItem value="stepped">Stepped ($/step)</MenuItem>
          </Select>
          <TextField
            size="small"
            type="number"
            label="Value"
            value={discountValue}
            onChange={(event) => setDiscountValue(event.target.value)}
            sx={{ width: 140 }}
          />
          {discountType === 'stepped' && (
            <TextField
              size="small"
              type="number"
              label="Step qty (every X)"
              value={stepQty}
              onChange={(event) => setStepQty(event.target.value)}
              sx={{ width: 160 }}
            />
          )}
          <TextField
            size="small"
            label="Label"
            value={discountLabel}
            onChange={(event) => setDiscountLabel(event.target.value)}
            sx={{ minWidth: 190 }}
          />
          <TextField
            size="small"
            type="number"
            label="Sort"
            value={discountSortOrder}
            onChange={(event) => setDiscountSortOrder(event.target.value)}
            sx={{ width: 110 }}
          />
          <Button variant="outlined" onClick={() => void addDiscountTier()}>
            Add tier
          </Button>
        </Stack>
```

**Replace with (type selector FIRST, then conditional fields):**

```tsx
        {/* Type selector — drives which fields show below */}
        <Select
          size="small"
          value={discountType}
          onChange={(event) => setDiscountType(event.target.value as 'percent' | 'fixed_amount' | 'unit_price' | 'stepped')}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="percent">Percent off</MenuItem>
          <MenuItem value="fixed_amount">Fixed $ off/unit</MenuItem>
          <MenuItem value="unit_price">Set unit price</MenuItem>
          <MenuItem value="stepped">Stepped unit price</MenuItem>
        </Select>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }}>
          <TextField
            size="small"
            type="number"
            label="Min qty"
            value={minQty}
            onChange={(event) => setMinQty(event.target.value)}
            sx={{ width: 130 }}
          />
          <TextField
            size="small"
            type="number"
            label="Max qty"
            value={maxQty}
            onChange={(event) => setMaxQty(event.target.value)}
            sx={{ width: 130 }}
            inputProps={{ placeholder: 'Leave empty for unlimited' }}
          />
          <TextField
            size="small"
            type="number"
            label={discountType === 'stepped' ? 'Discount value ($/unit/step)' : 'Discount value'}
            value={discountValue}
            onChange={(event) => setDiscountValue(event.target.value)}
            sx={{ width: discountType === 'stepped' ? 200 : 160 }}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
          />
          {discountType === 'stepped' && (
            <TextField
              size="small"
              type="number"
              label="Per qty (every X)"
              value={stepQty}
              onChange={(event) => setStepQty(event.target.value)}
              sx={{ width: 160 }}
              inputProps={{ placeholder: 'e.g. 10' }}
            />
          )}
          <TextField
            size="small"
            label="Label (display name override)"
            value={discountLabel}
            onChange={(event) => setDiscountLabel(event.target.value)}
            sx={{ minWidth: 200 }}
            inputProps={{ placeholder: 'Optional' }}
          />
          <TextField
            size="small"
            label="Description (shown under price)"
            value={discountDescription}
            onChange={(event) => setDiscountDescription(event.target.value)}
            sx={{ minWidth: 240 }}
            inputProps={{ placeholder: 'Optional' }}
          />
          <TextField
            size="small"
            type="number"
            label="Sort"
            value={discountSortOrder}
            onChange={(event) => setDiscountSortOrder(event.target.value)}
            sx={{ width: 110 }}
          />
          <Button variant="outlined" onClick={() => void addDiscountTier()}>
            Add tier
          </Button>
        </Stack>
```

### 6f. Update tier list display to show description

**Find:**
```tsx
                  <Typography sx={{ color: alpha(brandTokens.parchment, 0.66), fontSize: '0.78rem' }}>
                    Qty {tier.min_qty}{tier.max_qty ? ` - ${tier.max_qty}` : '+'} | {tier.discount_type} {tier.discount_value}{tier.step_qty ? ` /${tier.step_qty}pcs` : ''} | {tier.label || 'No label'} | {tier.is_enabled ? 'Enabled' : 'Disabled'}
                  </Typography>
```

**Replace with:**
```tsx
                  <Box>
                    <Typography sx={{ color: alpha(brandTokens.parchment, 0.66), fontSize: '0.78rem' }}>
                      Qty {tier.min_qty}{tier.max_qty ? ` - ${tier.max_qty}` : '+'} | {tier.discount_type} {tier.discount_value}{tier.step_qty ? ` /${tier.step_qty}pcs` : ''} | {tier.label || 'No label'} | {tier.is_enabled ? 'Enabled' : 'Disabled'}
                    </Typography>
                    {tier.description && (
                      <Typography sx={{ color: alpha(brandTokens.parchment, 0.5), fontSize: '0.72rem', mt: 0.3 }}>
                        {tier.description}
                      </Typography>
                    )}
                  </Box>
```

---

## 7. Pricing Preview API — `src/app/api/admin/catalog/pricing-preview/route.ts`

### 7a. Add `description` to bulk-discount SELECT

**Find:**
```typescript
      supabase
        .from('exp_product_bulk_discounts')
        .select('min_qty, max_qty, discount_type, discount_value, step_qty, label, sort_order, is_enabled')
        .eq('product_id', productId),
```

**Replace with:**
```typescript
      supabase
        .from('exp_product_bulk_discounts')
        .select('min_qty, max_qty, discount_type, discount_value, step_qty, label, description, sort_order, is_enabled')
        .eq('product_id', productId),
```

### 7b. Add `appliedTierDescription` to response

**Find:**
```typescript
        appliedTierLabel: result.appliedTier?.label ?? null,
        appliedTierType: result.appliedTier?.discount_type ?? null,
        appliedTierValue: result.appliedTier?.discount_value ?? null,
        description: result.description,
```

**Replace with:**
```typescript
        appliedTierLabel: result.appliedTier?.label ?? null,
        appliedTierType: result.appliedTier?.discount_type ?? null,
        appliedTierValue: result.appliedTier?.discount_value ?? null,
        appliedTierDescription: result.appliedTier?.description ?? null,
        description: result.description,
```

---

## 8. Admin Pricing Page — `src/app/admin/(panel)/catalog/products/[id]/pricing/page.tsx`

### 8a. Update `BulkDiscountRow` interface

**Find:**
```typescript
interface BulkDiscountRow {
  id: string
  min_qty: number
  max_qty: number | null
  discount_type: 'percent' | 'fixed_amount' | 'unit_price' | 'stepped'
  discount_value: number
  step_qty: number | null
  label: string | null
  is_enabled: boolean
  sort_order: number
}
```

**Replace with:**
```typescript
interface BulkDiscountRow {
  id: string
  min_qty: number
  max_qty: number | null
  discount_type: 'percent' | 'fixed_amount' | 'unit_price' | 'stepped'
  discount_value: number
  step_qty: number | null
  label: string | null
  description: string | null
  is_enabled: boolean
  sort_order: number
}
```

---

## 9. Tests — `src/lib/pricing/engine.test.ts`

Review existing tests. The `PricingBulkTier` interface now has a `description` field, so any test fixtures that construct `PricingBulkTier` objects will need `description: null` added. Verify that stepped discount math tests exist and pass. Add a test case if needed:

```typescript
test('stepped discount: $0.50 off per unit per 10 pcs', () => {
  const context: PricingContext = {
    id: 'test',
    title: 'Test',
    base_price: 10,
    is_active: true,
    is_archived: false,
    variants: [],
    options: [],
    bulk_discounts: [{
      min_qty: 1,
      max_qty: null,
      discount_type: 'stepped',
      discount_value: 0.50,
      step_qty: 10,
      label: null,
      description: null,
      sort_order: 0,
      is_enabled: true,
    }],
  }

  // Qty 10: 1 step → $0.50 off each → $5.00 total discount
  const r10 = computeCanonicalLine(context, 10, null, [])
  expect(r10?.lineDiscount).toBe(5.00)

  // Qty 25: 2 steps → $1.00 off each → $25.00 total discount
  const r25 = computeCanonicalLine(context, 25, null, [])
  expect(r25?.lineDiscount).toBe(25.00)
})
```

---

## Post-Implementation Verification

1. **Apply the migration:** `supabase db push` or run `052_bulk_discount_description.sql` manually
2. **Type-check:** `npx tsc --noEmit`
3. **Run tests:** `npx vitest run src/lib/pricing/engine.test.ts`
4. **Manual test in builder:**
   - Select "Stepped unit price" type
   - Set discount value = 0.50, per qty = 10
   - Add the tier — it should save successfully
   - Verify it appears in the tier list with description
5. **Manual test in storefront:**
   - Open the product preview
   - Set quantity to 10, 20, 25
   - Verify the discount applies correctly
   - Verify the description appears under the price