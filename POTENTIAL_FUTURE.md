# Potential Future Plans

> Design/planning notes for **unbuilt** work. Nothing in this file is implemented.
>
> **Index:** [1. Bulk Product Creation API](#1-bulk-product-creation-api) ·
> [2. Automatic Supabase Database Backup](#2-automatic-supabase-database-backup) ·
> [3. PBR materials for the Product Design Studio](#3-pbr-materials-for-the-product-design-studio)

---

## 1. Bulk Product Creation API

> Status: **Not implemented.** This is a design/planning note for a future
> scriptable "create a bunch of products" command. Nothing here is built yet.

### 1.1 What exists today

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

### 1.2 Data model a "complete" product spans

| Table | Key columns |
|---|---|
| `exp_products` | `title`, `slug` (unique), `short_description`, `description`, `category_key` (FK `exp_taxonomy`), `base_price`, `is_ready_made`, `is_customizable`, `is_active`, `is_archived`, `sort_order`, `production_estimate_band`, `how_it_works_anchor`, `seo_title`, `seo_description`, `weight_lb` (059), `has_designer` / `designer_mockup_url` (035) |
| `exp_product_variants` | `product_id`, `label`, `sku`, `price_delta`, `capacity_weight`, `weight_lb`, `is_enabled`, `sort_order` |
| `exp_product_media` | `product_id`, `url`, `alt`, `emoji`, `gradient`, `is_featured`, `sort_order` |
| `exp_product_options` | `product_id`, `option_key`, `label`, `option_type` (select/text/textarea/file/checkbox/number), `placeholder`, `help_text`, `is_required`, `sort_order` |
| `exp_product_option_values` | `option_id`, `label`, `value`, `price_delta`, `is_enabled`, `sort_order` |
| `exp_product_bulk_discounts` | `product_id`, `min_qty`, `max_qty`, `discount_type` (percent/fixed_amount/unit_price/stepped), `discount_value`, `step_qty`, `label`, `description`, `sort_order`, `is_enabled` |
| `exp_product_process_types` + `exp_product_process_pricing` | ready-made "process" (engraving/sublimation/etc.) associations + per-product pricing |

### 1.3 What the "command" would look like

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

### 1.4 Implementation checklist

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

### 1.5 Open decisions

1. **Auth for the scripted command** — (a) reuse the admin session (UI import
   button), (b) a dedicated `CATALOG_IMPORT_TOKEN` secret (machine-to-machine,
   rate-limited), or (c) both?
2. **Semantics** — upsert-by-slug (idempotent) vs create-only? Atomic all-or-nothing
   vs per-product partial success?
3. **Tree scope** — variants + media + options/values + bulk discounts in v1? Include
   ready-made process types, or leave those out?
4. **Mechanism** — app-level sequential inserts vs a single
   `exp_bulk_upsert_products(jsonb)` RPC?

---

## 2. Automatic Supabase Database Backup

> Status: **Not implemented.** The database has no automated, restorable backup today. This is a
> design/planning note.

### 2.1 What exists today

- **Schema** is versioned in git: `supabase/migrations/*.sql` (001→067), plus `supabase/seed/*.sql` and
  `supabase/verification/*.sql`. That is a *schema* history, not a data backup — it cannot restore rows.
- **Data** (orders, custom requests, customers, inventory, CMS content) lives only in the hosted Supabase
  project. Nothing copies it anywhere automatically.
- Supabase's own **daily backups** (Pro plan and above) and **Point-in-Time Recovery** (paid add-on) are the
  plan-gated built-ins; this project's plan tier is **unverified**.
- `OCT_IMPLEMENTATION_PLAN.md` → OCT-13 records that the live project has **no migration-history baseline**, so
  a restore cannot currently be driven by the CLI either.
- There is no `scripts/backup*` and no backup job in CI.

### 2.2 Options

| # | Approach | Restores | Plan-gated | Code | Notes |
|---|---|---|---|---|---|
| A | Supabase daily backups / PITR | full DB to a point in time | **yes** | none | zero effort; verify the tier; PITR is the gold standard for "oops" |
| B | Scheduled logical `pg_dump` → private bucket | full logical dump (schema + data) | no | a cron job + a script | portable, plan-independent, offsite if the bucket is separate |
| C | Manual `pg_dump` run by the owner | full dump | no | a `scripts/` helper | an escape hatch, not a policy |

### 2.3 Recommended

- **Enable A if the plan allows** (PITR first, else daily backups) — the only option that restores to an
  arbitrary minute without a job to babysit.
- **Add B regardless** as the always-on, plan-independent baseline: a nightly `pg_dump --format=custom`,
  encrypted, uploaded to a **private** bucket with a retention window. B also survives a Supabase-account-level
  problem, which A does not.
- **C** stays as a documented manual escape hatch.

### 2.4 Implementation checklist (for B)

1. **Connection** — a dedicated backup role, or the direct (non-pooler) connection string from
   Supabase → Settings → Database. Store it as a CI secret (`SUPABASE_DB_URL`), never in a committed `.env`.
2. **Script** — `scripts/backup-db.mjs`: `pg_dump --format=custom --no-owner --no-privileges` → timestamped
   file → `gzip` → upload to the private bucket; exit non-zero on any failure so the job can alert.
3. **Schedule** — a GitHub Actions workflow on `schedule: cron` (daily) on the default branch (Vercel Hobby
   crons are daily-only and cannot run `pg_dump`; a runner can). Add `workflow_dispatch` for on-demand runs.
4. **Storage & retention** — a **private** bucket `db-backups/` (or external S3/R2); lifecycle-delete older
   than N days; keep at least one monthly for a year.
5. **Encryption** — encrypt the dump before upload (`age`/`openssl`) with a key held outside the bucket, so a
   bucket leak is not a full data leak. Supabase Storage is at-rest encrypted, but the dump contains PII.
6. **Restore path, tested** — `scripts/restore-db.mjs` (`pg_restore`) documented in `docs/Database.md`, and a
   **quarterly restore drill** into a scratch project. An untested backup is not a backup.
7. **Alerting** — a failed job emails the owner (reuse the Resend wrapper, remediation #14) or opens an issue.
8. **Documentation** — a "Backups & restore" section in `docs/Database.md`, and the retention window in the
   privacy policy (remediation #40).

### 2.5 Open decisions

1. **Plan tier** — does the Supabase plan include daily backups / PITR? (Determines whether A is even on the
   table.) *Owner.*
2. **Destination** — Supabase Storage vs external S3/R2; and whether it must live in a different account/region
   from the database (a same-account bucket does not survive an account compromise).
3. **Retention** — daily × 30, weekly × 12, monthly × 12? Depends on the RPO/RTO the owner wants.
4. **Scope** — whole-DB logical dump, or PII-scrubbed dumps for anything stored offsite? (Orders and custom
   requests carry customer PII; the privacy policy would need to name the retention.)
5. **Frequency** — nightly is the default; is hourly needed given the order volume?
6. **Who owns the encryption key**, and where is it stored (so a restore is possible without the person who
   set it up)?

### 2.6 Security notes

- The dump contains customer PII and (hashed) consent IPs — treat it as production data: private bucket,
  encrypted, least-privilege access, retention enforced.
- Use a dedicated backup credential rather than the service-role key where possible.
- Never write a dump into the repo; ensure `.gitignore` covers `*.dump` and `*.sql.gz` (it does not today).
- Coordinate with remediation **#40** (retention/privacy) and **OCT-13** (migration-history baseline) — a
  scriptable restore needs the baseline first.

### 2.7 Home-server destination (option D — recommended long-term home)

Keep a copy on a **home server / NAS** as well. This is the strongest option because it is **off-account
and off-cloud**: it survives both a Supabase-account compromise *and* a provider outage, which neither A
(built-in backups) nor B (a same-account bucket) does.

- **Pull, not push (recommended).** A home server sits behind **NAT**, so have *it* run the nightly job and
  pull from Supabase — the home network opens **no inbound ports**. A push model (cloud → home) would need a
  forwarded port or a VPN/Tailscale overlay for the same result, with more attack surface.
- **Transport:** `rclone` (one tool, many remotes — SFTP / SMB / WebDAV / S3-compatible / NAS) or `rsync`
  over SSH. Both are scriptable from a `cron` job or a systemd timer on the home box.
- **Security:** SSH-key auth; **encrypted dumps** (`age` / `openssl`) with the key held **on the home
  server** (so a cloud-side leak is not a data leak); no plaintext PII at rest.
- **Retention:** the home server holds the **long-term** archive (e.g. daily × 30, monthly × 12 forever);
  the cloud copy stays short-term.
- **Restore drill must include it** — restore once from the *home* copy, not just the cloud copy; an
  untested backup is not a backup.
- **Practical shape:** a small script on the NAS — `pg_dump --format=custom` → `age`-encrypt → write to a
  dated file → prune by retention → optionally `rclone copy` to a second NAS/disk for 3-2-1.

---

## 3. PBR materials for the Product Design Studio

> Status: **Not implemented — deliberately deferred.** The hook exists; the feature is not built.

The 3D mockup in the design studio (`OCT_IMPLEMENTATION_PLAN.md` → §6, batch DS-3) renders **parametric
primitives** with flat colour. **Physically-based materials** (metal / glass / wood / plastic / brushed
steel) would make the mockup look real instead of flat CG.

- **How it slots in — low effort, no API change.** `DesignTemplate` already reserves a `material?: string`
  field (§6.2). Populate it per product/template and map the id to a three.js
  `MeshStandardMaterial` / `MeshPhysicalMaterial` (metalness, roughness, clearcoat, transmission).
- **Lighting is the other half.** A PBR material only looks real with an environment map. Prefer three's
  **`RoomEnvironment`** — it is **generated in code**, so it needs **no file, no fetch, and no CSP change**.
  An HDRI file would have to be **bundled or served from Supabase Storage** (a CDN origin would need a new
  `connect-src`/`img-src` entry, which fights OCT §4/#69).
- **Why it is deferred:** it is a *visual polish* item, not a correctness one — the studio is fully usable
  with flat materials, and adding PBR multiplies the material/environment tuning surface. Implement it once
  DS-3 has stabilised.
- **Coordinate with:** OCT §6 DS-3 (the renderer) and #62 (bundle size — a material library + HDRI must stay
  out of the critical path).


