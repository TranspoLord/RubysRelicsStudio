# Product Builder Refactor Plan

> Last updated: 2026-07-11
> For the RubysRelicsStudio admin catalog redesign

## Overview

The Product Builder (`src/app/admin/(panel)/catalog/products/[id]/builder/page.tsx`) is a 1850-line monolithic component that has been refactored for maintainability.

## Changes Completed

| Action | File | Description |
|--------|------|-------------|
| 🆕 CREATED | `supabase/migrations/034_split_process_types.sql` | Adds separate `engraving` and `cutting` process types |
| 🆕 CREATED | `src/app/admin/(panel)/catalog/products/new/page.tsx` | New product creation page (minimal form → redirect to builder) |
| 🆕 CREATED | `src/app/admin/(panel)/catalog/processes/page.tsx` | Processes management page for CRUD operations |
| 🆕 CREATED | `src/app/api/admin/catalog/processes/route.ts` | API endpoint for processes management |
| 🆕 CREATED | `src/components/admin/product-builder/utils/helpers.ts` | Shared helper utilities |
| ✏️ MODIFIED | `src/app/admin/(panel)/catalog/page.tsx` | Added "Manage Processes" button |
| ✏️ MODIFIED | `src/app/admin/(panel)/catalog/products/page.tsx` | Removed draft section, added "Add Product" button, fixed back button |
| ✏️ MODIFIED | `src/app/admin/(panel)/catalog/categories/page.tsx` | Fixed back button to use ArrowBack icon |
| ✏️ MODIFIED | `src/app/admin/(panel)/catalog/products/[id]/layout.tsx` | Simplified to just show builder content with back button |
| ✏️ REWRITTEN | `src/app/admin/(panel)/catalog/products/[id]/builder/page.tsx` | Clean structure with full API integration |
| 🗑️ DELETED | `src/app/admin/(panel)/catalog/products/[id]/page.tsx` | Legacy editor removed |

---

## Phase 1: Products List Page (`/admin/catalog/products`)

### Changes to `src/app/admin/(panel)/catalog/products/page.tsx`
- Remove the "Create Draft Product" section (lines 407-661) - the inline form with add-ons/values
- Add an "Add Product" button at the top that navigates to `/admin/catalog/products/new`
- Fix the `<- Back` button to use a proper `ArrowBack` icon button for consistency

### New File: `src/app/admin/(panel)/catalog/products/new/page.tsx`
- Minimal form: title, slug (auto-generated), category, base price
- "Create" button → creates product via API → redirects to `/admin/catalog/products/{id}/builder`

---

## Phase 2: Categories Page (`/admin/catalog/categories`)

### Changes to `src/app/admin/(panel)/catalog/categories/page.tsx`
- Fix the `<- Back` button (line 208-212) to use a proper `ArrowBack` icon button

---

## Phase 3: Processes Management Page (NEW)

### Database: New Migration `supabase/migrations/034_split_process_types.sql`
- Add `engraving` and `cutting` as separate process_type taxonomy entries
- Keep `engraving_cutting` for backward compatibility but mark it invisible
- Migrate existing `engraving_cutting` assignments to `engraving`

### New File: `src/app/admin/(panel)/catalog/processes/page.tsx`
- Lists all process types from `exp_taxonomy` where `type = 'process_type'`
- CRUD for process types: key, display_name, emoji, sort_order, visible
- Each process type has a "Behavior" field controlling auto-generated options:
  - `none` - No auto-options
  - `engraving` - Auto-generates a required file upload option
  - `cutting` - Auto-generates a "Cut Type" select option with sub-options

### New File: `src/app/api/admin/catalog/processes/route.ts`
- GET: List all process types
- POST: Create new process type
- PUT: Update process type
- DELETE: Delete process type (blocked if assigned to products)

### Update: `src/app/admin/(panel)/catalog/page.tsx`
- Add "Manage Processes" button to the quick actions

---

## Phase 4: Product Builder - Complete Restructure

### New File Structure
```
src/components/admin/product-builder/
├── ProductBuilderPage.tsx          (orchestrator, ~100 lines)
├── sections/
│   ├── ProductDescription.tsx      (title, slug, category, sort, estimate, descriptions, checkboxes)
│   ├── ProductMedia.tsx            (image gallery with previews, add media form)
│   ├── Variants.tsx                (variant CRUD)
│   ├── ProcessTypes.tsx            (process type toggles + combo discounts)
│   ├── PricingSection.tsx          (base price, bulk discounts, variant pricing)
│   └── OptionsSection.tsx          (options CRUD with side-panel preview)
├── components/
│   ├── MediaCard.tsx               (single media item with <img> preview)
│   ├── VariantRow.tsx              (single variant display)
│   ├── DiscountRow.tsx             (single discount tier)
│   ├── OptionCard.tsx              (single option with its values)
│   ├── OptionPreview.tsx           (live interactive preview in side panel)
│   └── ProcessTypeToggle.tsx       (toggle button for process types)
├── hooks/
│   ├── useProductData.ts           (all data fetching)
│   ├── useMediaManager.ts          (media CRUD)
│   ├── useOptionsManager.ts        (options CRUD with conditional logic)
│   └── usePricingManager.ts        (variants, discounts, combo discounts)
└── utils/
    └── helpers.ts                  (shared helpers)
```

### Section Layout Order (top to bottom)
1. **Product Description** - Core product info (no base price)
2. **Product Media** - Image gallery with previews
3. **Variants** - Variant management
4. **Process Types & Pricing** - Process assignment + combo discounts
5. **Pricing Section** - Base price, bulk discounts, variant pricing
6. **Options** - Full options with side-panel preview

### Process Type → Auto-generated Options (via key matching)
| Key Pattern | Auto-generated Option |
|-------------|----------------------|
| Contains `engrav` | Required file upload: "Engraving Artwork" |
| Contains `cut` | Single choice "Cut Type": Kiss cut, Die cut, Custom cut width (→ number input), Custom cut file upload (→ file upload) |
| Other | Nothing |

### When a process type is toggled OFF → its auto-generated options are removed from the Options section.

### Validation Rules
- If `is_customizable` is checked → at least one process type must be assigned
- Save button in Process Types section shows warnings for violations

### Side Panel Preview (Options)
- "Add Choice" opens a Drawer from the right
- Left: option editing form
- Right: live interactive preview card
- Preview is interactive: can select choices, type text, check checkboxes
- File uploads show a disabled button (preview only)

---

## Phase 5: Cleanup

1. **Delete** `src/app/admin/(panel)/catalog/products/[id]/page.tsx` (legacy editor)
2. **Update** `src/app/admin/(panel)/catalog/products/[id]/layout.tsx`:
   - Remove "Legacy Product Editor" text
   - Remove "Open Product Builder" button
   - Just show the builder content directly
3. **Rewrite** `src/app/admin/(panel)/catalog/products/[id]/builder/page.tsx` to use new components
4. **Fix all `<- Back` buttons** across admin catalog pages to use `ArrowBack` icon button

---

## Implementation Order

1. Migration (split process types) - `034_split_process_types.sql`
2. Categories page (back button fix)
3. Products list page (remove draft section, add "Add Product" button)
4. New product creation page
5. Processes management page + API
6. Product builder components (all new files in `components/admin/product-builder/`)
7. Product builder page rewrite
8. Layout cleanup + delete legacy editor
9. Back button consistency pass

---

## Notes

- The `exp_taxonomy` table stores process types with `type = 'process_type'`
- The `exp_product_process_pricing` table stores per-product pricing deltas
- The `exp_product_combo_discounts` table stores multi-process discounts
- The current `engraving_cutting` process type is combined; we'll split it into separate `engraving` and `cutting` entries