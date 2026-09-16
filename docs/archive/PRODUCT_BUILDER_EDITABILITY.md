# Product Catalog Builder — Editability Analysis & Plan

> **Scope:** Make **Option items**, **Media items**, and **Variant items** editable in the product catalog builder.
> **Date:** 2026-08-02
> **Status:** Plan only — not yet implemented.

---

## TL;DR

- **Backend:** ✅ Fully ready — all PUT endpoints already exist and accept the full field set.
- **Frontend:** Gaps in `src/app/admin/(panel)/catalog/products/[id]/builder/page.tsx`:
  - **Media items** → already editable ✅
  - **Variant items** → add + delete only ❌
  - **Option items** → broken Save button (sends no field data) ❌
  - **Option value items** → add + delete only ❌
- **All work is UI-only in a single file.** No migrations, no new files, no backend changes.

---

## Backend Status (No Changes Needed)

All four PUT endpoints exist, validate input, enforce uniqueness, and write audit logs.

### `PUT /api/admin/catalog/options`
File: `src/app/api/admin/catalog/options/route.ts` (lines 225–344)

Accepts:
| Field | Type | Validation |
|-------|------|------------|
| `optionId` | string | required |
| `option_key` | string | required, ≥2 chars, normalized, unique per product |
| `label` | string | required, ≥2 chars, max 120 |
| `option_type` | enum | `select\|text\|textarea\|file\|checkbox\|number` |
| `placeholder` | string\|null | max 180; forced `null` for `select`/`checkbox` |
| `help_text` | string\|null | max 500 |
| `is_required` | boolean | default false |
| `sort_order` | integer | -10000 to 10000 |

Updates `exp_product_options`. Returns `{ option }`.

### `PUT /api/admin/catalog/options/values`
File: `src/app/api/admin/catalog/options/values/route.ts` (lines 139–254)

Accepts:
| Field | Type | Validation |
|-------|------|------------|
| `optionValueId` | string | required |
| `label` | string | required, ≥1 char, max 120 |
| `value` | string | required, ≥1 char, max 120, unique per option |
| `price_delta` | number | -100000 to 100000 |
| `is_enabled` | boolean | default true |
| `sort_order` | integer | -10000 to 10000 |

Updates `exp_product_option_values`. Returns `{ optionValue }`.

### `PUT /api/admin/catalog/media`
File: `src/app/api/admin/catalog/media/route.ts`

Accepts:
| Field | Type | Validation |
|-------|------|------------|
| `mediaId` | string | required |
| `url` | string | required, URL-safety check |
| `alt` | string | max length enforced |
| `emoji` | string\|null | optional |
| `gradient` | string\|null | optional |
| `is_featured` | boolean | default false |
| `sort_order` | number | numeric |

Updates the media row. Returns updated media.

### `PUT /api/admin/catalog/variants`
File: `src/app/api/admin/catalog/variants/route.ts` (lines 165–256)

Accepts:
| Field | Type | Validation |
|-------|------|------------|
| `variantId` | string | required |
| `label` | string | required, ≥1 char, max 120 |
| `sku` | string\|null | max 120 |
| `price_delta` | number | -100000 to 100000 |
| `capacity_weight` | number\|null | 0 to 1000 |
| `is_enabled` | boolean | default true |
| `sort_order` | integer | -10000 to 10000 |

Updates `exp_product_variants`. Returns `{ variant }`.

---

## Frontend Status & Gaps

**File:** `src/app/admin/(panel)/catalog/products/[id]/builder/page.tsx` (1965 lines)

### 1. Media Items — ✅ Already Editable

The builder already has a complete media edit flow:
- **State:** `editingMediaId`, `editMediaUrl`, `editMediaAlt`, `editMediaEmoji`, `editMediaGradient`, `editMediaSortOrder`, `editMediaFeatured` (lines 155–161)
- **Function:** `updateMedia(mediaId)` → `PUT /api/admin/catalog/media` with all fields (lines 463–499)
- **UI:** Inline edit form with Edit/Save/Cancel buttons (rendered when `editingMediaId === media.id`)

**No work needed.**

### 2. Variant Items — ❌ Not Editable

**Current behavior:** Add + Delete only.

**What's missing:**
- No edit state variables (only add-state: `variantLabel`, `variantSku`, etc. at lines 164–170)
- No `updateVariant(variantId)` function
- No "Edit" button in the Variants section UI
- No inline edit form

**Required additions:**
- [ ] Add edit state: `editingVariantId`, `editVariantLabel`, `editVariantSku`, `editVariantPriceDelta`, `editVariantWeight`, `editVariantSortOrder`, `editVariantEnabled`
- [ ] Add `updateVariant(variantId)` function → `PUT /api/admin/catalog/variants` with `{ variantId, label, sku, price_delta, capacity_weight, is_enabled, sort_order }`
- [ ] Add "Edit" button next to each variant that populates edit state from the variant row
- [ ] Add inline edit form (TextFields for label/sku/price_delta/weight/sort_order + Checkbox for enabled) with Save/Cancel buttons
- [ ] Pattern: mirror the existing media edit UI

### 3. Option Items — ❌ Broken Save

**Current behavior:** A "Save" button exists and calls `saveOption(optionId)`, but the function is broken:

```tsx
// lines 717-745 — CURRENT (broken)
async function saveOption(optionId: string) {
  // ...
  body: JSON.stringify({ optionId }),  // ← sends NO field data!
  // ...
}
```

The PUT endpoint requires `option_key`, `label`, `option_type`, etc. — but the client sends only `{ optionId }`, so the request will always fail validation.

**What's missing:**
- No edit state variables for options (only add-state: `newOptionKey`, `newOptionLabel`, etc. at lines 193–199)
- `saveOption()` doesn't send any editable fields
- No "Edit" button in the Options section UI
- No inline edit form

**Required additions:**
- [ ] Add edit state: `editingOptionId`, `editOptionKey`, `editOptionLabel`, `editOptionType`, `editOptionPlaceholder`, `editOptionHelpText`, `editOptionRequired`, `editOptionSortOrder`
- [ ] **Fix `saveOption()`** to send all fields: `{ optionId, option_key, label, option_type, placeholder, help_text, is_required, sort_order }`
- [ ] Add "Edit" button next to each option that populates edit state from the option row
- [ ] Add inline edit form (TextField for key/label/help_text, Select for option_type, TextField for placeholder/sort_order, Checkbox for is_required) with Save/Cancel buttons

### 4. Option Value Items — ❌ Not Editable

**Current behavior:** Add + Delete only.

**What's missing:**
- No edit state variables for option values (only add-state: `newValueLabel`, `newValueValue`, etc. at lines 711–715)
- No `updateOptionValue(valueId)` function
- No "Edit" button next to option values
- No inline edit form

**Required additions:**
- [ ] Add edit state: `editingValueId`, `editValueLabel`, `editValueValue`, `editValuePriceDelta`, `editValueSort`, `editValueEnabled`
- [ ] Add `updateOptionValue(valueId)` function → `PUT /api/admin/catalog/options/values` with `{ optionValueId, label, value, price_delta, is_enabled, sort_order }`
- [ ] Add "Edit" button next to each option value that populates edit state
- [ ] Add inline edit form (TextFields for label/value/price_delta/sort_order + Checkbox for is_enabled) with Save/Cancel buttons

---

## Implementation Plan

**Single file affected:** `src/app/admin/(panel)/catalog/products/[id]/builder/page.tsx`

### Step 1 — Variant item inline editing
1. Add edit-state `useState` declarations (near line 170, after the add-variant state)
2. Add `updateVariant(variantId)` async function (after `deleteVariant`, ~line 569) — mirror `updateMedia()` structure
3. In the Variants section render block, add an "Edit" button per variant and a conditional inline edit form (mirror the media edit form pattern)

### Step 2 — Fix Option item save + add inline editing
1. Add edit-state `useState` declarations (near line 199, after the add-option state)
2. **Rewrite `saveOption(optionId)`** (lines 717–745) to accept and send all editable fields
3. In the Options section render block, add an "Edit" button per option and a conditional inline edit form

### Step 3 — Option Value item inline editing
1. Add edit-state `useState` declarations (near line 715, after the add-value state)
2. Add `updateOptionValue(valueId)` async function (after `deleteOptionValue`, ~line 886)
3. In the option values render block (inside each option card), add an "Edit" button per value and a conditional inline edit form

### Step 4 — Verify
- Run `npm run build` or `npx tsc --noEmit` to confirm no type errors
- Optionally run `npm run lint`

---

## Risks & Notes

- **Low risk:** All changes are UI-only in a single client component; the backend already supports every operation.
- **Pattern consistency:** The media edit flow is the reference pattern — variants and option values should mirror it (edit state → Edit button populates state → inline form → Save calls PUT → refresh list → Cancel clears state).
- **No schema changes:** No Supabase migrations needed.
- **No new files:** Everything fits in the existing builder page.
- **Audit logs:** Already written by the backend PUT handlers — no client-side action needed.
- **Rate limiting:** Already configured on all PUT endpoints (`admin-catalog-option-write`, `admin-catalog-option-value-write`, `admin-catalog-variant-write`).

---

## Reference: Existing Media Edit Pattern (to mirror)

```tsx
// State (lines 155-161)
const [editingMediaId, setEditingMediaId] = useState<string | null>(null)
const [editMediaUrl, setEditMediaUrl] = useState('')
// ... etc

// Function (lines 463-499)
async function updateMedia(mediaId: string) {
  setMediaBusyId(mediaId)
  // PUT /api/admin/catalog/media with { mediaId, url, alt, ... }
  // on success: setEditingMediaId(null), refresh list
}

// UI — Edit button populates state
onClick={() => {
  setEditingMediaId(media.id)
  setEditMediaUrl(media.url)
  // ... etc
}}

// UI — Conditional inline form
{editingMediaId === media.id ? (
  <Box sx={{ display: 'grid', gap: 1 }}>
    {/* TextFields bound to editMedia* state */}
    <Button onClick={() => void updateMedia(media.id)}>Save</Button>
    <Button onClick={() => setEditingMediaId(null)}>Cancel</Button>
  </Box>
) : (
  <Button onClick={/* populate edit state */}>Edit</Button>
)}