# Potential Future — Bulk Product Creation API

> Status: **Not implemented.** This is a design/planning note for a future
> scriptable "create a bunch of products" command. Nothing here is built yet.

## 1. What exists today

- **Product create** is `POST /api/admin/catalog` (the catalog collection route).
  It creates only the `exp_products` row — title, slug, `category_key`,
  `base_price`, sort order, production band, short/long description, and the
  `is_ready_made` / `is_customizable` flags — and can optionally auto-generate
  options via `apply_category_template` / `option_blueprint`. It validates slug
  format, category FK, slug uniqueness, and price/sort bounds, then writes an
  audit log.
- **Child entities are separate one-at-a-time endpoints** (no bulk):
  `/api/admin/catalog/variants`, `/options`, `/options/values`, `/media`,
  `/discounts`.
- **Auth pattern** for admin writes:
  `requireAdminApiSession(request, { key, maxRequests, windowMs })` →
  `if (!auth.ok) return auth.response` → `getSupabaseAdmin()` → validate → write →
  `writeAdminAuditLog`.

There is **no bulk/import endpoint**, and no single call that creates a full
product tree (variants + media + options + discounts) atomically.

## 2. Data model a "complete" product spans

| Table | Key columns |
|---|---|
| `exp_products` | `title`, `slug` (unique), `short_description`, `description`, `category_key` (FK `exp_taxonomy`), `base_price`, `is_ready_made`, `is_customizable`, `is_active`, `is_archived`, `sort_order`, `production_estimate_band`, `how_it_works_anchor`, `seo_title`, `seo_description`, `weight_lb` (059), `has_designer` / `designer_mockup_url` (035) |
| `exp_product_variants` | `product_id`, `label`, `sku`, `price_delta`, `capacity_weight`, `weight_lb`, `is_enabled`, `sort_order` |
| `exp_product_media` | `product_id`, `url`, `alt`, `emoji`, `gradient`, `is_featured`, `sort_order` |
| `exp_product_options` | `product_id`, `option_key`, `label`, `option_type` (select/text/textarea/file/checkbox/number), `placeholder`, `help_text`, `is_required`, `sort_order` |
| `exp_product_option_values` | `option_id`, `label`, `value`, `price_delta`, `is_enabled`, `sort_order` |
| `exp_product_bulk_discounts` | `product_id`, `min_qty`, `max_qty`, `discount_type` (percent/fixed_amount/unit_price/stepped), `discount_value`, `step_qty`, `label`, `description`, `sort_order`, `is_enabled` |
| `exp_product_process_types` + `exp_product_process_pricing` | ready-made "process" (engraving/sublimation/etc.) associations + per-product pricing |

## 3. What the "command" would look like

New endpoint: `POST /api/admin/catalog/import`, accepting one JSON document of
full product trees:

```json
{
  "mode": "upsert",
  "products": [
    {
      "title": "Engraved Slate Coaster",
      "slug": "engraved-slate-coaster",
      "category_key": "home-decor",
      "base_price": 24.00,
      "short_description": "4\" natural slate coaster",
      "description": "Genuine slate, laser-engraved.",
      "is_ready_made": true,
      "is_customizable": false,
      "is_active": true,
      "weight_lb": 0.75,
      "production_estimate_band": "3–5 business days",
      "variants": [
        { "label": "Single", "sku": "SC-S", "price_delta": 0, "weight_lb": 0.75 },
        { "label": "Set of 4", "sku": "SC-4", "price_delta": 60, "weight_lb": 3.0 }
      ],
      "media": [
        { "url": "https://.../coaster.jpg", "alt": "Engraved coaster", "is_featured": true }
      ],
      "options": [
        {
          "option_key": "finish",
          "label": "Finish",
          "option_type": "select",
          "is_required": true,
          "values": [
            { "label": "Gloss", "value": "gloss", "price_delta": 0 },
            { "label": "Matte", "value": "matte", "price_delta": 1 }
          ]
        }
      ],
      "bulk_discounts": [
        { "min_qty": 5, "max_qty": null, "discount_type": "percent", "discount_value": 10 }
      ]
    }
  ]
}
```

## 4. Implementation checklist

1. **New route + types** — `src/app/api/admin/catalog/import/route.ts` with a strict
   `BulkImportBody` / `ProductTree` TypeScript schema (mirror the existing
   `unknown`-field + `asString`/`asNumber`/`asBoolean` validation style).
2. **Auth** — decide the model (open decision #1 below).
3. **Limits (DoS)** — `parseJsonBodyOrError` with a sensible cap (e.g. 5 MB) and a
   max batch size (e.g. 100 products/request), plus a low rate-limit key.
4. **Validation** — per product and child: title/slug format, `category_key` exists
   in `exp_taxonomy` (`type='category'`), slug uniqueness (respecting upsert),
   `base_price`/`price_delta`/`weight_lb` bounds, option `type` enum, discount
   `discount_type` enum, numeric rounding (`Math.round(x*100)/100`).
5. **Upsert vs create-only + idempotency** — key by `slug`; `mode: "upsert"` so
   re-sending the same command is safe.
6. **Atomicity** — sequential app-level (per-product error report + dry-run) versus
   a Postgres RPC `exp_bulk_upsert_products(jsonb)` (`SECURITY DEFINER`,
   `SET search_path = ''`, **schema-qualified** `public.*`) for true all-or-nothing.
7. **Automatic category option templates** — reuse `getCategoryOptionTemplate` /
   `parseOptionBlueprint` (already in `catalog/route.ts`).
8. **Ready-made processes** — if `is_ready_made`, optionally attach process types /
   pricing in the same command (possible v2).
9. **Media** — accept external `url` (or `emoji`/`gradient` placeholder); real file
   upload stays a separate Supabase Storage step.
10. **Audit + response** — one `writeAdminAuditLog` entry; return
    `{ created, updated, errors: [{ slug, error }] }`.
11. **Tests** — validation, slug upsert, category FK, atomic failure, batch-size limit.
12. **Client/script** — `scripts/import-products.mjs` reading a JSON file + a `curl`
    example (note the CSRF/session friction for headless use).

## 5. Open decisions

1. **Auth for the scripted command** — (a) reuse the admin session (UI import
   button), (b) a dedicated `CATALOG_IMPORT_TOKEN` secret (machine-to-machine,
   rate-limited), or (c) both?
2. **Semantics** — upsert-by-slug (idempotent) vs create-only? Atomic all-or-nothing
   vs per-product partial success?
3. **Tree scope** — variants + media + options/values + bulk discounts in v1? Include
   ready-made process types, or leave those out?
4. **Mechanism** — app-level sequential inserts vs a single
   `exp_bulk_upsert_products(jsonb)` RPC?
