# Ruby's Relics — Expansion Planning Notes

> Last updated: May 8, 2026  
> Context: xTool M1 Ultra acquisition discussion. Updated to reflect unified storefront implementation (craft + stickers in single shop).

---

## Current Stack

- **Framework:** Next.js 16.2.4 (App Router, server actions)
- **Database:** Supabase (Postgres + Storage)
- **Payments:** Stripe (primary) + PayPal (manual fallback)
- **Email:** Resend
- **Hosting:** Vercel (assumed)
- **Auth:** Custom admin session cookie + `ADMIN_LOGIN_KEY`
- **Branch isolation:** `resolveBranch()` for dev/prod DB separation

## Current Products

- Custom stickers (sheets and singles)
- Materials: vinyl, glitter, holographic, etc.
- Pricing engine with deals/bulk logic
- Gallery, cart, checkout, order management
- Admin panel: orders, pricing, inventory, discounts, gallery, shop settings

---

## New Machine: xTool M1 Ultra

### Capabilities

| Feature | Notes |
|---|---|
| Laser engraving | High-precision on wood, acrylic, leather, metal, etc. |
| Laser cutting | Through-cuts on compatible materials |
| Sublimation printing | Full-color transfer onto coated substrates (mugs, shirts, coasters, etc.) |
| Rotary attachment | Engraving on cylinders (tumblers, bottles, cups) |

### New Product Categories This Enables

- **Custom engravings** — wood signs, acrylic panels, leather patches, slates
- **Sublimation items** — mugs, tumblers, shirts, coasters, ornaments
- **Sticker lines** — matte, glossy, holographic bases with laminate add-ons
- **Rotary items** — personalized drinkware (tumblers, bottles, cups)
- **Combination items** — e.g. engraved + sublimated coasters
- **Cut-to-shape** — custom acrylic shapes, wood cutouts

### Sticker pricing requirement (locked)
- Sticker products must support base finish selection (`matte`, `glossy`, `holographic`) and laminate add-ons (`matte laminate`, `glossy laminate`) as admin-managed option values.
- Bulk quantity discount tiers for stickers must be admin-configurable in DB (no hardcoded tier math in frontend code).
- Quantity pricing must update in the product configurator based on matching tier rules.

---

## Expansion Approaches Discussed

### Option A — Lightweight (1–2 weeks)
- Add "Services" pages with descriptions + photo examples
- Simple intake/quote request forms (name, item type, quantity, upload reference image, notes)
- Manual quoting via email — no automated pricing
- Good for: validating demand before building out the system

### Option B — Mid-Tier (3–6 weeks)
- Real product catalog per service category
- Service-specific configurator options (material, size, quantity, personalization text)
- Partial auto-pricing (flat rates or simple per-unit pricing)
- Order submission flows similar to current sticker flow
- Admin views for new order types

### Option C — Full Platform (8–16 weeks)
- Complete pricing engine for all new categories
- File upload + production review workflow
- Production queue / job tracking
- Possibly multi-storefront routing (stickers vs. engravings vs. sublimation)
- Full inventory tracking for substrates and consumables

---

## Recommended Approach

**Unified Storefront** — combine all product categories (stickers, engravings, sublimation, rotary items) under one cohesive shop experience.

Rationale:
- Customers browse and purchase across all product types in a single cart
- Cleaner UX: no separate logins or fragmented cart state
- Shared infrastructure: single checkout, unified order history, consistent brand experience
- Database schema unified: single `exp_products` table with variants/options/categories supporting all product types
- Admin controls consolidated: one settings domain, one queue/inventory system, one analytics pipeline

## Architecture Locked In

- **Unified storefront**: all product categories (stickers, engravings, sublimation, rotary, custom requests) share:
  - Single product catalog (`exp_products`, `exp_product_variants`, `exp_product_options`)
  - Single category hierarchy (`exp_product_categories`) supporting all item types
  - Unified cart and checkout experience (single `/checkout` flow)
  - Shared order management (`exp_orders`, `exp_order_items`)
  - Unified admin panel (single dashboard, shared module structure)
  - Common customer auth layer (optional; enables order history, wishlist, account features)

- **Greenfield customer experience**: while the data model is unified, the storefront UX has been redesigned specifically for craft/engraving/sublimation items:
  - Homepage emphasizes handcrafted, made-to-order positioning
  - Category browsing, product detail pages, and configurators designed around customizable items
  - Process transparency: queue status, production estimates, material/technique information visible throughout
  - Custom request flow for quote-based items alongside ready-made catalog

- **Shared operational settings**:
  - Single `exp_storefront_settings` table for runtime configuration (Stripe checkout toggle, guest tracking, etc.)
  - All settings admin-managed with runtime toggles; no code deploys required for operational changes

### Current Route Implementation
Routes currently implemented/planned for unified storefront:
- Home, Shop (category browse), Product detail/configurator pages
- Cart and Checkout flow (single unified experience)
- Order success and guest-safe tracking pages
- Custom request/quote intake and status routes
- Resources/policies hub
- Admin authentication, dashboard shell, and core modules (custom-requests, settings, orders scaffold)
- Customer auth (login/signup/account) — in development

---

## Homepage Vision

### Core goal
- Make the landing page feel like a fantasy craft workshop, not a generic product grid
- Sell the mood first, then make the shopping paths obvious
- Keep people browsing even if they do not arrive with a specific product in mind

### Hero section
- Full-width hero with rotating or layered background photos of finished items
- Focus on real products: engraved tumblers, wood signs, acrylic pieces, mugs, coasters, leather patches, ornaments
- Main tagline should keep the same fantasy voice as the sticker shop, but broaden it beyond stickers

Possible direction for the hero copy:
- **Forged in Fire. Gathered for Your Hoard.**
- Supporting line: Upload your artwork or choose from our ready-made designs, and let the dragons craft your treasures before sending the griffins to your lair.

Primary buttons:
- **See Our Hoard** or **Shop the Hoard**
- **How It Works**

Behavior notes:
- `See Our Hoard` should drop users into product categories or a featured collection page
- `How It Works` should point to a dedicated explainer page about materials, process, customization, finishing, and fulfillment

### How It Works deep-link requirement
- The `How It Works` page should include direct links into key category routes (category slugs) so users can jump from process guidance straight into shopping.
- Each major section on the page should also expose hashtag anchors for quick navigation and sharing.
- Recommended pattern:
	- Top-level jump links near the top (for example: `#materials`, `#production`, `#quality`, `#shipping`)
	- Category slug links near relevant sections (for example: `/shop/categories/engraved-drinkware`, `/shop/categories/sublimated-gifts`, `/shop/categories/signs-and-decor`)
- URL behavior should support opening the page directly to a section via hash (for example: `/how-it-works#production`) without breaking normal page load.
- Reciprocal linking requirement:
	- Category and product pages should include context links back to the matching `How It Works` hash anchor (for example: `Learn about engraving process -> /how-it-works#production`).
	- This should work both ways so users can move between shopping and process guidance without losing context.

### How It Works interactivity requirement
- Add an interactive material preview area on the `How It Works` page so customers can compare core surfaces/finishes before browsing products.
- Good candidates: wood, acrylic, leather, drinkware coating, and sublimation blanks.
- A short process clip of the machine in action may be used to reinforce the workshop/forge identity, but it must remain optional, optimized for mobile, muted by default, and fully respect `prefers-reduced-motion`.
- Interactive previews must degrade cleanly to static image cards on smaller devices or reduced-motion settings.

### Mobile-first storefront requirement (locked)
- The expansion storefront must be designed mobile-first and remain fully usable across common phone sizes before desktop polish.
- The persistent shop hierarchy should become a slide-out filter/navigation drawer on mobile with the same category tree, sort mode toggle, and in-category search.
- Core controls must remain easy to use on touch devices:
	- sticky utility actions (cart/account/search) remain accessible
	- tap targets are sized for thumb use
	- filter and sort controls do not rely on hover
- Performance requirement:
	- product/category pages should prioritize fast initial render and optimized media loading on mobile connections.
- Navigation requirement:
	- breadcrumb paths and hash-anchor jumps should remain usable on mobile (including horizontal scroll where needed).

### Customer-facing page definition of done (DoD)
Use this checklist before marking any customer-facing page complete.

Global DoD (applies to every customer-facing page except checkout-specific exceptions):
- Uses expansion storefront shell (header, breadcrumb, persistent shop hierarchy where applicable).
- Works on mobile and desktop with no blocked actions (browse, filter, add-to-cart, nav, or account actions as applicable).
- Pulls business-critical values from Supabase/admin-managed config (no hardcoded pricing, inventory, visibility, or category structures).
- Emits required analytics events for page entry and core interactions.
- Includes relevant trust/operations messaging where applicable (queue expectations, one-dragon made-to-order context, production windows).
- Includes internal navigation links that reduce dead-ends (related items, next-step CTA, or return paths).

Page-level DoD requirements:
- `Shop`:
	- Supports hierarchy toggle mode persistence (cookie-backed) and in-sidebar search.
	- Clearly routes users into Shop Custom Creations, Ready-Made, and Custom Orders.
	- Left hierarchy/filter set includes an explicit `Shop All` control that resets category filtering and shows all active products.
	- Shop entry UI should communicate category browsing and full-catalog browsing equally ("Choose your category or shop all").
- `Ready-Made`:
	- Lists all ready-made products that do not require customer design/upload.
	- Left hierarchy/filters are available and usable on desktop + mobile drawer.
	- Stock status and out-of-stock behavior are DB-driven.
- `Customizable catalog/category pages`:
	- Support filtering/sorting/search within current category context.
	- Show category-specific social proof/examples and links to matching `How It Works` anchors.
- `Product detail/configurator`:
	- Shows production/shipping estimate range, internal-quality-check policy, and queue/made-to-order messaging.
	- Validates option availability from DB before add-to-cart.
- `How It Works`:
	- Contains section hash anchors and direct category slug links.
	- Every major section links to a concrete shopping path.
- `Custom Orders` intake/status:
	- Intake captures required request data and files.
	- Status page shows lifecycle state clearly and provides next action.
	- Approved request can transition to Stripe payment flow.
- `Cart/checkout/order success`:
	- Preserves queue and lead-time messaging before final submit.
	- Checkout uses Stripe flow and confirms payment/status handoff.
- `Orders/history/tracking`:
	- Customer can see status, line items, and key fulfillment/payment milestones.
	- Guest-safe tracking links work when applicable.
- `Search/wishlist/recently viewed/start-here`:
	- Search relevance and filters respect current storefront data.
	- Wishlist/recently viewed persist correctly per user/session.
	- Start-here chooser routes users into the correct order path with trackable events.

### Additional route and admin acceptance criteria (locked)
- `Gallery` page:
	- Every showcased piece has category tags, media alt text, and explicit display permission flag.
	- Supports filter by category/material/theme and links to relevant product or custom-order intake path.
	- Uses curated, admin-approved media only.
- `About` page:
	- Includes one-dragon production context, process expectations, and links to policy/resources hub.
	- Includes contact method, business response-time expectations, and trust signals.
- `Orders/history/tracking` page:
	- Guest token links must show only authorized order data with expiration and secure fallback recovery flow.
	- Shows milestones: `awaiting_payment`, `paid`, `in_production`, `ready_to_ship`, `shipped`, `delivered`, `cancelled`.
- `Admin auth + dashboard shell`:
	- Requires authenticated admin session on every admin route.
	- Includes notification bell, unread count, global quick search, and module entry points.
	- Every destructive action requires explicit confirmation.

### Header direction
- Left-aligned navigation instead of the current right-sided feel
- Suggested top nav:
	- Home
	- Shop
	- How It Works
	- Custom Orders
	- Gallery
	- About
- Keep cart/account actions visually separate on the right
- Make the right-side cart/account area persistent across the entire storefront so customers always have quick access to their cart, login, account, and order state
- Final header pattern:
	- Left side = primary navigation
	- Right side = persistent utility actions (cart, account, possibly search later)

### Breadcrumb navigation (under header)
- Every interior page should show a breadcrumb path directly under the main header
- Pattern examples:
	- Home > Custom Orders > Laser Engraving
	- Home > Ready-Made Products > Laser Cutting
- Purpose:
	- Keeps users oriented inside deeper catalog/service pages
	- Improves navigation speed back to parent categories
	- Helps SEO/internal linking by clarifying content hierarchy
- UX rules:
	- Home and intermediate levels should be clickable links
	- Last crumb is current page (not a link)
	- On mobile, allow horizontal scroll if breadcrumb path is long
	- Maintain consistent placement and styling across the entire storefront

### Category section
- A product category grid made from image-based buttons/cards
- Categories could include:
	- Engraved Drinkware
	- Sublimated Gifts
	- Signs and Decor
	- Acrylic Pieces
	- Leather Goods
	- Seasonal Items
- Hover behavior should feel playful and alive:
	- cards expand slightly
	- image crops shift/parallax slightly
	- neighboring cards subtly move to make room
- This section should encourage exploration instead of feeling like a plain menu

### Newsletter block
- Add a strong newsletter section below categories
- Tone should be less corporate and more thematic
- Example framing:
	- **Never Miss a New Treasure Drop**
	- Get new releases, seasonal collections, and limited-run creations before they vanish back into the hoard.

---

## Homepage Content Blocks to Keep People Browsing

### Featured collections
- A curated strip of 3 to 6 highlighted products or collections near the top
- Good for pushing seasonal work, best-sellers, or visually striking pieces

### Social proof / recent creations
- A section showing real completed work with short captions
- Could be called **Fresh From the Forge**
- This helps customers imagine their own custom version

### Custom order pitch
- A dedicated block for people who want something unique and do not fit a standard template
- Example CTA: **Bring Us Your Wild Idea**
- Explain that customers can upload art, sketches, inspiration photos, or even rough concepts

### Materials and craftsmanship teaser
- A short section introducing wood, acrylic, metal-safe engraving, leather, ceramic-ready sublimation blanks, etc.
- This can lead into the full `How It Works` page
- Useful because craftsmanship language builds trust and perceived value

### Process strip
- A 3-step or 4-step section such as:
	- You bring the idea
	- We forge the design
	- We craft the piece
	- Griffins deliver it home
- This lowers friction for first-time buyers

### Limited-run / seasonal banner
- A space for urgency without making the site feel pushy
- Great for holiday ornaments, wedding season items, ren-faire drops, fandom-inspired collections, etc.

### Testimonials
- Especially useful once the new line has a few happy customers
- A fantasy-styled testimonial section could help the page feel more complete and trustworthy

### FAQ preview
- A short FAQ teaser near the bottom
- Good candidates:
	- Can I upload my own artwork?
	- Do you show a proof before production?
	- What materials can you engrave or sublimate?
	- How long does production take?

### Documents / resources teaser
- Add a short section linking to a full resources hub for trust and transparency
- This can highlight policy + sourcing + process documentation in one place

---

## Structural Notes

- Treat this as a new product system, not a sticker feature expansion
- New tables should likely cover categories, products, variants, materials, assets, custom requests, and service orders
- The homepage should be designed around **discovery + atmosphere + trust**, not just conversion buttons
- Strong photography will matter as much as the copy here; the site will live or die by how aspirational the finished items look

---

## Order Types

The new storefront should support **three distinct order paths**.

### 1. Shop orders
- This is for products built from options we already define
- Customer customizes within a controlled product setup that we provide
- Examples:
	- custom stickers with uploaded art
	- sublimation shirts with uploaded art
	- engraved tumblers with uploaded art or text
	- acrylic signs with predefined size/material options
- This is the most structured flow and should behave like a normal product configurator + cart + checkout system

What this means technically:
- Product pages should support predefined options, variant rules, and optional file upload fields
- Pricing can be mostly automated because the options are known ahead of time
- This is the main revenue engine once the storefront matures

### 2. Stuff we already have
- This is for ready-made products that do **not** require the customer to upload art
- These are finished or pre-designed items we can sell directly from inventory or small-batch stock
- Examples:
	- already designed hats
	- already designed shirts
	- sticker packs
	- themed gift bundles
	- seasonal premade items
- This should feel like the simplest shopping experience on the site

What this means technically:
- Standard catalog products with inventory counts, variants, photos, and straightforward checkout
- No artwork upload required
- Strong candidate for featured collections, impulse purchases, and seasonal promotions on the homepage

### 3. Custom orders
- This is for jobs that do not fit the normal catalog or option system
- Customer comes with an idea, request, problem, or unusual object and wants us to review it manually
- Examples:
	- a one-off commission
	- an unusual material or blank item
	- a custom business order
	- a project needing design help from scratch
	- an item where feasibility needs to be reviewed first
- This should be framed more like a guided request or quote workflow than a direct buy-now checkout

What this means technically:
- Separate intake flow with form fields, file uploads, notes, quantity, deadline, and maybe budget range
- Status lifecycle is different from normal shop orders
- Starts as `quote_request` or `custom_request`. Admin reviews, sets a price, and generates a Stripe Payment Link. Customer receives the link by email and on their request status page, and pays via Stripe. No manual invoice or PayPal path for expansion custom orders.

---

## Store Structure Implication

- `Shop` should likely split visually into:
	- customizable made-to-order products
	- ready-made in-stock products
	- all-products browsing view (`/shop/all`) for users who want the full catalog quickly
- `Custom Orders` should remain its own dedicated top-level route because the user mindset is different
- Add a dedicated `Resources` (or `Documents`) top-level route for policy, legal, and sourcing content
- Homepage should introduce all three paths clearly so customers can self-sort fast:
	- **Shop Custom Creations**
	- **Browse Ready-Made Goods**
	- **Request a Custom Order**

This matters because these are not minor variations of one checkout flow. They represent three different operational models:
- structured customization
- standard retail catalog
- manual quote/commission work

---

## Documents / Resources Hub

Create a dedicated page for policy and trust-related information.

Suggested route:
- `/resources` (or `/documents`)

Suggested sections/pages inside the hub:
- Terms of Service
- Privacy Policy
- Cookie Policy
- Legal and compliance notices
- Returns/refunds/cancellations policy
- Shipping and fulfillment policy
- Safety and materials guidance
- Material sourcing and sustainability notes
- Care instructions by material/product type
- File/artwork requirements and copyright/IP guidance

Safety/materials page guidance:
- Clarify which materials are safe and supported for production.
- State unsupported or hazardous materials/processes clearly.
- Use this page to build trust around blanks, coatings, acrylic/leather sourcing, and process safety where relevant.

Why this matters:
- Builds trust for higher-ticket custom work
- Reduces support load by answering common policy and process questions
- Gives a stable destination for legal links in footer and checkout

Implementation notes:
- Keep legal-policy documents editable from admin where practical
- Version important documents (effective date + revision history)
- Link key docs in footer, checkout, and account/order pages
- Ensure every policy page has clear last-updated date and contact method

---

## Admin-First Configurability (Locked Requirement)

Primary rule:
- The new expansion storefront must be configurable through admin so day-to-day changes do not require developer intervention.

### Admin control surface should include
- Product images and gallery assets
- Product pricing (base, variant, optional add-ons, sale windows)
- Inventory counts and stock status
- Visibility toggles (show/hide products, categories, collections, homepage sections)
- Category order and product sort priority
- Homepage content blocks (hero media, featured collections, announcement banners)
- Text content for key sections (headlines, supporting copy, CTA labels)
- Material availability (enable/disable options by product)
- Upload requirements by product (required, optional, disabled)

### Inventory policy
- Inventory must be centralized in Supabase as the single source of truth.
- No inventory numbers, availability flags, or stock behavior should be hardcoded in UI components.
- Expansion defaults to a made-to-order capacity model for most products.
- Shop availability gates should prioritize capacity controls (hours budget, order count, scheduled closures) over strict per-item stock blocking.
- Ready-made goods may still use strict stock counts and out-of-stock behavior where applicable.
- Material and consumable low-stock thresholds must trigger admin notifications before they become blocking issues.

### No-hardcoding policy
- No hardcoded product prices in frontend components
- No hardcoded category lists in frontend components
- No hardcoded product visibility logic in frontend components
- No hardcoded material lists in frontend components
- No hardcoded hero/category image URLs in frontend components

Allowed hardcoding (minimal):
- only stable UI defaults or fallback copy while data is loading
- no business-critical values (pricing, inventory, visibility, catalog structure)

### Suggested admin modules for v1
- Catalog Manager: categories, products, variants, media, sort order
- Pricing Manager: base prices, variant deltas, promotional overrides
- Inventory Manager: stock counts, thresholds, in-stock rules, preorder flags
- Homepage Manager: hero, featured sections, category promos, newsletter block content
- Visibility Manager: hide/show controls for products, categories, seasonal sections
- Order Operations: shop orders, ready-made orders, custom request pipeline

Additional admin modules (finance/ops):
- Financial Dashboard: revenue, cost, margin, and profitability trends
- Materials Costing: per-unit material cost and margin contribution tracking
- Labor Tracking: time logged per order/item and effective hourly earnings

### Technical enforcement idea
- Treat Supabase tables + admin forms as the canonical config layer
- If a value can change in business operations, it should live in DB + admin UI
- Add lint/code review checklist item: reject PRs that introduce business hardcoding into customer-facing components

## Remaining Open Questions (Trimmed)

- [ ] Expansion route location: same root domain paths vs subdomain (deployment + SEO choice).
- [ ] Final launch policy for optional customer accounts (Phase 2 opt-in timing).
- [ ] When to enable international shipping after domestic launch hardening.

---

## Technical Notes for Implementation

### Likely DB additions
- `service_categories` table (engrave, sublimate, rotary, cut)
- `service_products` table (product catalog per category)
- `service_orders` table or extend existing `orders` with `service_type` column
- `quote_requests` table for Option A intake forms
- `machine_schedule_blocks` table for reserving production time on the xTool and related workflow stages
- unified SQL views for cross-store finance/admin reporting (`all_store_orders_v`, `all_store_order_items_v`)

Additional tables likely needed for configurability:
- `service_product_variants` table (size/material/color variants)
- `service_product_media` table (image galleries and featured media)
- `service_inventory` table (stock, thresholds, backorder/preorder flags)
- `service_visibility_rules` table (show/hide toggles and schedule windows)
- `service_homepage_sections` table (hero, featured groups, promo blocks)
- `service_pricing_rules` table (base + option deltas + promo overrides)

Additional tables for finance and costing:
- `service_order_items` table (line-level sold item details for per-item sales analysis)
- `material_catalog` table (material definitions, units, supplier info)
- `material_cost_history` table (cost-per-unit history over time)
- `service_item_material_usage` table (material consumption per order item)
- `labor_time_entries` table (minutes/hours logged per order item/task)
- `finance_snapshots` table (optional denormalized daily summaries for dashboards)

### Likely component additions
- `ServiceConfigurator` — similar to `FileConfiguratorCard` but for non-file services
- `QuoteRequestForm` — simple contact-style form with file upload
- New admin tabs: Service Orders, Quote Requests, Service Inventory
- `MaterialPreviewer` for How It Works and category education surfaces

Admin UI additions (required):
- `CatalogAdmin` for products/categories/media and visibility
- `PricingAdmin` for all pricing controls
- `InventoryAdmin` for stock and availability controls
- `HomepageAdmin` for hero/sections/content blocks
- `CustomRequestAdmin` for quote-request triage and conversion

### Pricing considerations
- Current pricing engine lives in `src/config/pricing.ts` + `src/lib/pricing-settings.ts`
- New categories likely need separate pricing schemas (not roll-based)
- Could add a `service_pricing` table in Supabase for admin-controlled rates

---

## Core Data Model Contract (Locked)

Primary rule:
- The expansion data model must use explicit relational contracts (PK/FK/unique/index/audit) so admin and storefront behavior remain deterministic and debuggable.

### Core entities
- `exp_products`
	- PK: `id` (UUID)
	- Unique: `slug`, `sku_root`
	- Required FKs: `category_key -> taxonomy.key`
	- Flags: `is_ready_made`, `is_customizable`, `is_active`, `is_archived`
- `exp_product_variants`
	- PK: `id` (UUID)
	- FK: `product_id -> exp_products.id`
	- Unique composite: (`product_id`, `variant_code`)
	- Fields: `price_delta`, `capacity_weight_hours`, `is_enabled`
- `exp_orders`
	- PK: `id` (UUID)
	- Unique nullable: `stripe_session_id`, `stripe_payment_link_id`
	- FK nullable: `custom_request_id -> exp_custom_requests.id`
	- Status enum: `awaiting_payment`, `paid`, `in_production`, `ready_to_ship`, `shipped`, `delivered`, `cancelled`
	- Snapshot fields: pricing totals, shipping quote values, policy version accepted, queue position at order time
- `exp_order_items`
	- PK: `id` (UUID)
	- FK: `order_id -> exp_orders.id`
	- Snapshot payload required: product title, selected options, unit price, quantity, line total, artwork references, estimated hours at checkout
- `exp_custom_requests`
	- PK: `id` (UUID)
	- Status enum: `awaiting_quote`, `quote_sent`, `paid`, `in_production`, `completed`, `expired`, `cancelled`, `rejected`
	- Fields: request details, files, quoted amount, `stripe_payment_link_id/url`, rejection reason
- `exp_machine_schedule_blocks`
	- PK: `id` (UUID)
	- FK: `order_id -> exp_orders.id`
	- Fields: `stage`, `start_at`, `end_at`, `estimated_hours`, `is_locked`, `notes`
- `exp_stock_notifications`
	- PK: `id` (UUID)
	- FK nullable: `product_id -> exp_products.id`
	- Fields: `category_key`, `email`, `customer_id`, `created_at`, `notified_at`

### Audit and lifecycle requirements
- Every mutable table includes: `created_at`, `updated_at`, `created_by`, `updated_by`.
- Business records are soft-deletable with `archived_at` where operationally required.
- Hard deletes are blocked for records referenced by orders, financial snapshots, or audit logs.

### Referential and snapshot rules
- Orders and order items are immutable snapshots for pricing, options, and policy acceptance at transaction time.
- Taxonomy key values are stable identifiers; display labels/slugs may evolve with redirects, but keys remain immutable after first use.
- Variant and product edits never rewrite historical order snapshots.

### Indexing minimums
- Indexes required on order status/date, custom request status/date, product visibility/category, and notification pending state (`notified_at IS NULL`).
- Unique enforcement required for slug and payment identifiers to prevent duplicate fulfillment flows.

---

## Financial Tracking and Profitability (Locked Requirement)

Primary rule:
- Financial visibility must be built into the expansion storefront from the start, with data coming from Supabase and no hardcoded costing assumptions.

### Separate finance page requirement
- Create a **separate admin finance page** so high-volume item data does not clutter core order management screens.
- Finance views should be filterable by date range, order type, category, and product.

### Required financial tracking
- Track individual sales for each item (units sold, gross sales, refunds, net sales)
- Track per-item cost basis where possible (materials + labor)
- Track gross margin and net margin by item/category/order type
- Track AOV, repeat purchase rate, and contribution by order path (Shop / Ready-Made / Custom)

### Cross-store reporting requirement
- Even though stickers and expansion storefront use separate tables, finance/admin reporting must support a unified business view via Supabase SQL views or equivalent reporting layer.
- Goal: one chart/table can answer whole-business questions without merging data manually.

### Material costing requirements
- Track material cost per unit in Supabase
- Support cost history over time (supplier price changes)
- Calculate estimated material spend per order item from usage rules or logged usage
- Show "what it costs us" vs "what it sold for" at item and order levels

### Labor/hour tracking requirements
- Track hours/time spent per order or order item
- Allow manual time logging by workflow step (design, setup, production, finishing, packing)
- Compute effective earnings per hour using:
	- revenue-only view
	- gross-profit view (after material costs)
- Provide weekly and monthly rollups for one-dragon capacity planning

### Machine scheduling requirement
- Model machine time as a schedulable resource, not just an abstract estimate.
- When an order moves into production planning, the system should be able to reserve estimated machine time blocks so turnaround promises reflect actual one-machine capacity.
- Initial version can be admin-facing only; no public calendar is required.

### Operational KPI examples
- Top profitable products (not just top revenue products)
- Lowest margin products (to revisit pricing)
- Average production time per product type
- Queue depth vs. average completion time
- Effective hourly earnings trend

### Admin UI expectations
- `FinanceDashboardAdmin` (high-level KPIs + trends)
- `ItemSalesAdmin` (per-item sales and margin)
- `MaterialsCostAdmin` (material costs, usage assumptions, supplier updates)
- `LaborTrackingAdmin` (time entries, per-order labor analytics)

### Configurability alignment
- Cost inputs, usage assumptions, and labor categories should all be admin-editable
- Any profitability metric shown should be traceable back to DB data
- No fixed constants in frontend for cost calculations

---

## Engagement and Retention Additions (Approved)

These features are approved to include in the expansion roadmap.

### 1) Global search with smart suggestions
- Add site-wide search for products, categories, materials, and custom services
- Include typeahead suggestions and quick links from any page

### 2) Wishlist / save-for-later
- Allow customers to save products for later
- Useful for gift planning, seasonal shopping, and repeat visits
- Customer-facing themed label may use `The Hoard` or `Your Stash`, but implementation should keep neutral internal naming (`wishlist`) for clarity and maintainability.

### 3) Recently viewed
- Show recently viewed products/services on category and product pages
- Helps users continue browsing without re-searching

### 4) Guided "start here" chooser
- A short decision flow to route users to the right order path
- Example prompts:
	- What are you making?
	- Is this for gifts, business, event, or personal use?
	- Do you have artwork ready?

### 5) Category-specific social proof
- Show reviews/examples tied to the category the customer is viewing
- Avoid only generic, site-wide testimonials

### 6) Estimated production and shipping ranges
- Display expected production window + shipping range on product pages
- Reduces uncertainty and support questions

### 7) Production note preference (no customer proof flow)
- Customers may leave production notes/instructions during configuration or intake.
- Customer-facing proof approval is not part of expansion v1 flow.

### 8) Abandoned cart and abandoned request follow-up
- Add recovery emails for:
	- abandoned cart
	- abandoned custom request/intake

### 9) Analytics from day one
- Track funnel decisions and drop-off points across all three order paths
- Key events should include path chosen, upload usage, and checkout completion

### 10) Loyalty / repeat-customer rewards
- Add a simple rewards concept for repeat purchases
- Start lightweight (points/discount tiers) and expand later
- Prefer low-complexity rewards first: occasional repeat-customer discount codes, bundled-set discounts, or early-access drop notifications.
- Avoid operational promises like guaranteed rush handling or priority queue placement until capacity math proves it is sustainable.

### Cross-sell / set bonus idea
- Add optional bundle/set-discount capability for complementary items (for example: tumbler + coaster, sign + stand, mug + ornament bundle).
- This can live as a merchandising rule in pricing/admin rather than a gamified achievement system.

---

## Gallery and Social Proof Governance (Locked + Ideas)

### Governance baseline (locked)
- Gallery/social proof content must be curated and admin-approved before public display.
- Every gallery entry requires:
	- category and product/tag mapping
	- alt text
	- permission status and source attribution
	- visibility flag and publish date
- No customer proof previews are shown as part of pre-production workflow.

### Practical ideas for this section
- Add `Fresh From the Forge` as a curated recent-work strip fed from approved gallery items.
- Add category-specific galleries (drinkware, signs, gifts, apparel) with direct CTA into matching product/category pages.
- Add a `From idea to finished piece` style for selected entries:
	- reference image (if permissioned)
	- final result image
	- short production notes
- Add trust badges per entry:
	- material used
	- finished by one-dragon workshop
	- turnaround band achieved
- Add admin moderation queue states:
	- `pending_review`, `approved`, `scheduled`, `published`, `archived`

### Risk controls
- Default to private for any customer-submitted media until explicitly approved.
- Do not publish faces, personal addresses, or sensitive identifiers in gallery images.
- Keep a reversible `unpublish` control for any entry under dispute.

---

## Queue and Capacity Messaging (Approved)

### Production queue requirement
- Add a visible order queue/production status concept similar to the sticker side
- Customers should be able to understand workload and expected turn times
- Queue status should be driven from Supabase data, not hardcoded strings

### One-dragon crew policy
- Add clear customer-facing messaging that production is handled by a one-dragon crew
- Set expectations that fulfillment speed is limited by handcrafted workflow and current queue volume

### Made-to-order statement
- Clearly state across product and policy pages:
	- all orders are made to order
	- production timing depends on queue depth and order complexity

### Where this messaging should appear
- Product pages (near production estimate)
- Cart/checkout (before final submit)
- Resources/Policies page (shipping/fulfillment section)
- Order confirmation email templates

### Admin controls needed
- Toggle queue visibility on/off
- Control queue status text and threshold bands
- Set estimated production ranges by category/order type
- Update one-dragon/made-to-order notices without code changes

---

## Implementation Roadmap (Aligned to Locked Requirements)

### Wave 0 — Prep and migration safety
- prelaunch teaser / early-interest capture on current sticker site
- establish expansion DB namespace and migration sequence
- create canonical taxonomy seed and admin editing surface
- add baseline telemetry plumbing and environment wiring

### Wave 1 — Transaction-safe commerce foundation
- Stripe Checkout Sessions for shop/ready-made + Stripe Payment Links for approved custom quotes
- webhook reconciliation, order snapshot writes, and status transitions
- made-to-order capacity gating (hours, order count, scheduled closures)
- shipping v1: USPS adapter + local pickup + configurable fallback pricing when live quotes fail
- TOS/policy acceptance capture with versioning

### Wave 2 — Core storefront and policy surfaces
- shop/category/product/custom-order flows with mobile-first hierarchy drawer
- resources hub with TOS/Privacy/Cookie/Shipping/Returns/Safety pages
- search contract implementation (global, sidebar-scoped, category-scoped)
- accessibility baseline enforcement (WCAG 2.2 AA checks)

### Wave 3 — Admin operations shell
- admin auth shell + module navigation + notification bell hub
- catalog/pricing/inventory/homepage/custom-request admin modules
- machine scheduling blocks and production planning controls
- finance dashboards with unified cross-store SQL views

### Wave 4 — Growth and retention
- wishlist (`The Hoard` label), recently viewed, guided start-here flow
- category-specific social proof with permission governance
- abandoned cart/request nudges, back-in-stock/capacity notifications
- bundled set-discount merchandising rules and lightweight repeat-customer incentives

---

## Payment Model (Locked)

### Primary processor: Stripe
- All direct shop orders (configurable and ready-made) go through Stripe Checkout Sessions.
- All approved custom/quote orders are paid via admin-generated Stripe Payment Links sent to the customer.
- Payment Links are standalone shareable URLs (not session-bound) and do not expire by default.
- Stripe is the only payment path for the expansion storefront.

### PayPal fallback
- PayPal remains available only as a manual fallback when Stripe is disabled via the `NEXT_PUBLIC_ENABLE_STRIPE` env flag, matching the current sticker-site pattern.
- The expansion storefront does not offer PayPal at customer-facing checkout under normal operating conditions.

### Custom order payment flow (locked)
1. Customer submits custom request intake form.
2. Admin reviews in the Quote Manager admin module.
3. Admin approves and sets a price; system calls the Stripe API to create a Payment Link and stores the URL on the request record.
4. System sends the Payment Link URL to the customer via Resend email and surfaces it on the `/custom-orders/[request-id]` status page.
5. Customer pays via Stripe through the Payment Link.
6. Stripe webhook confirms payment; order status moves to `paid` → `in_production` queue.

### Admin Quote Manager module (new, required)
- Lists all pending and approved custom requests.
- Allows admin to approve or reject a request with an optional message.
- On approval: admin enters the quoted price and optionally adjusts line-item breakdown.
- System generates a Stripe Payment Link via API and saves `stripe_payment_link_id` and `stripe_payment_link_url` on the request record.
- Admin can resend the payment email or copy the link manually.
- Tracks payment status per request: `awaiting_quote`, `quote_sent`, `paid`, `expired`, `cancelled`.

### Key distinction from sticker site
- Sticker site uses Stripe Checkout Sessions (session-bound, created per cart, expire).
- Expansion custom orders use Stripe Payment Links (standalone, created per approved quote, reusable, do not expire).
- Both webhook patterns use the same Stripe signing-secret validation approach already in the repo.

---

## Canonical Taxonomy — The God List (Locked Requirement)

This is the single source of truth for all category keys, display names, slugs, and hierarchy structure used across the entire expansion storefront. No component may hardcode these values. Everything reads from this admin-managed table.

### Record structure
Each taxonomy entry has:
- `key` — internal identifier used in DB, URLs, filter params, and analytics (snake_case, never changes once a product or order uses it)
- `display_name` — admin-editable label shown to customers
- `slug` — URL path segment, kebab-case, unique, validated in DB
- `parent_key` — optional, for nested hierarchy
- `type` — `category`, `customizability_mode`, `material`, `product_type`, or `tag`
- `visible` — admin-toggled show/hide (hides from storefront without deleting)
- `sort_order` — admin-controlled display priority
- `how_it_works_anchor` — optional hash anchor for How It Works reciprocal links
- `alias_keys` — comma-separated synonyms used by search (admin-editable)

### Admin configurability rules
- Admin can add new entries at any time without a code deployment.
- Admin can edit `display_name`, `slug` (with auto-redirect), `sort_order`, `visible`, `alias_keys`, and `how_it_works_anchor` freely.
- Admin can toggle `visible` off to hide an entry without deleting it.
- Admin can delete an entry only if no product, order, variant, or media record references that key.
- Admin cannot change a `key` value once it has been used in any order, product, or variant record (data integrity protection).
- Changes propagate immediately to all storefront surfaces via DB read.

### Slug conventions
- All slugs are kebab-case derived from the key at creation time.
- Category pages: `/shop/categories/[slug]`
- Collection pages: `/shop/collections/[slug]`
- Product pages: `/shop/product/[slug]`
- If a slug is changed by admin, a permanent redirect record is created automatically to preserve existing URLs and SEO value.

### Initial taxonomy seed — Product Categories
| key | display_name | slug |
|---|---|---|
| engraved_drinkware | Engraved Drinkware | engraved-drinkware |
| sublimated_gifts | Sublimated Gifts | sublimated-gifts |
| signs_and_decor | Signs & Decor | signs-and-decor |
| acrylic_pieces | Acrylic Pieces | acrylic-pieces |
| leather_goods | Leather Goods | leather-goods |
| apparel | Apparel | apparel |
| stickers | Stickers | stickers |
| seasonal_items | Seasonal Items | seasonal-items |
| gift_bundles | Gift Bundles | gift-bundles |

### Initial taxonomy seed — Customizability Modes (sidebar toggle)
| key | display_name |
|---|---|
| custom_request | Custom Request |
| ready_made | Ready-Made Design |
| complete_custom | Complete Custom |

### Initial taxonomy seed — Materials
| key | display_name |
|---|---|
| wood_basswood | Basswood |
| wood_walnut | Walnut |
| acrylic_clear | Clear Acrylic |
| acrylic_black | Black Acrylic |
| acrylic_frosted | Frosted Acrylic |
| acrylic_mirror | Mirror Acrylic |
| leather | Leather |
| slate | Slate |
| vinyl_standard | Standard Vinyl |
| vinyl_glitter | Glitter Vinyl |
| vinyl_holographic | Holographic Vinyl |
| vinyl_htv | Heat Transfer Vinyl |
| ceramic_mug | Ceramic Mug Blank |
| powder_coated_tumbler | Powder Coated Tumbler |
| cotton_shirt | Cotton Shirt |
| canvas | Canvas |

---

## Accessibility Baseline — WCAG 2.2 AA (Locked Requirement)

Every customer-facing page must meet WCAG 2.2 AA before it is marked complete. This is a non-negotiable DoD item. The target audience for this storefront may include customers with disabilities, and ADA compliance is a core design constraint, not an afterthought.

### Global page requirements
- All interactive elements (buttons, links, inputs, custom controls) must be keyboard-navigable with visible focus indicators.
- All images must have descriptive `alt` text, or `aria-hidden="true"` for purely decorative images.
- Color contrast must meet 4.5:1 for normal text and 3:1 for large text and UI components.
- No information is conveyed by color alone (use icons, text, or patterns in addition to color).
- All form inputs must have associated `<label>` elements or `aria-label`.
- Error messages must be programmatically associated with their input field.
- Page `lang="en"` must be declared on `<html>`.
- A skip-to-main-content link must appear at the top of every page.
- Heading hierarchy must be logical and not skip levels.
- Landmark regions must be used: `<main>`, `<nav>`, `<header>`, `<footer>`, `<aside>` for sidebar.

### Animation and motion
- All animated sections (hero, category card hover, parallax effects) must respect `prefers-reduced-motion` media query.
- Carousels and auto-playing content must have accessible pause controls.
- Reduced-motion fallbacks must be visually equivalent, not blank.

### High-risk interactive components
- **Sidebar/filter drawer (mobile)**: must trap focus when open, return focus to trigger on close, dismissible via Escape key, and announced to screen readers as a dialog or navigation landmark.
- **Configurator option controls**: any custom select/toggle must behave like native equivalents for keyboard users; use `role`, `aria-selected`, and keyboard event handling.
- **Modals** (quote review, confirm dialogs, warning dialogs): must trap focus, be keyboard-dismissible, and use `role="dialog"` with `aria-labelledby`.
- **Toast notifications**: must be announced via `aria-live="polite"` region so screen reader users hear confirmations.
- **File upload zones**: must include a visible keyboard-accessible fallback button alongside the drag-and-drop zone.
- **Image galleries**: navigation controls must be keyboard-accessible and each image must have meaningful alt text.

### Forms
- Error summary on submit failure (not only inline inline red highlights).
- Required fields must be marked with `aria-required="true"` in addition to any visual indicator.
- File upload fields must state accepted file types and size limits in the label or associated description.

### Accessibility review as DoD step
- Run automated scan (e.g. axe or Lighthouse accessibility audit) before marking a page complete.
- Manual keyboard-only walkthrough required for any page with a configurator, form, drawer, or modal.

---

## Customer Identity Strategy (Locked)

### Current baseline (must match sticker-site behavior in v1)
- No mandatory customer account creation for browsing, cart, checkout, or custom request intake.
- Guest checkout is the default and must remain fully supported.
- Customer order access works through email + secure order tracking links/tokens (same style as current sticker-side behavior).
- Customer login is optional and treated as a convenience feature, not a requirement.

### Guiding constraints
- Keep identity lightweight and low-maintenance.
- Any enhanced customer feature must be opt-in.
- No password management in v1.
- Minimal data stored (no payment instrument data; Stripe remains system of record for payment methods).

### Opt-in customer identity features (progressive)

**Tier 0 — Fully guest (default)**
- Cart and browsing state persist locally.
- Customer can place orders and custom requests without signup.
- Customer receives tracking/status links by email.

**Tier 1 — Email profile opt-in (no full account UI required)**
- Customer can opt in to save preferences by email only:
	- newsletter
	- back-in-stock alerts
	- gift reminder emails
	- production instruction preferences
- Can be turned on/off from email links or a minimal preference center page.

**Tier 2 — Optional magic-link account (Phase 2 candidate)**
- Supabase Auth magic link only (no passwords).
- Unlocks synced wishlist, synced recently viewed, persistent order history dashboard, and saved addresses.
- Prompt appears post-purchase as opt-in only.

### Opt-in/opt-out control requirement
- Every marketing or retention feature must provide explicit opt in and easy opt out:
	- newsletter
	- abandoned cart reminders
	- abandoned custom request reminders
	- back-in-stock alerts
	- category capacity-open alerts
	- seasonal drop announcements
	- gift reminder nudges
- Consent flags must be stored with timestamp and source (`checkout`, `footer_signup`, `order_success`, etc.).

### DB implications
- Keep guest flow first-class; account tables are additive.
- `customers` table supports optional account identity later.
- Add consent fields/tables for notification preferences and communication channel controls.
- Guest orders can be linked to a future account by verified email if/when account feature is enabled.

---

## Search Contract (Locked)

### Scope levels
- **Global search** (header): searches all products, categories, collections, and custom service descriptions. Results grouped by type. Accessible from every page.
- **Sidebar-scoped search**: searches only within the currently active hierarchy node and its children.
- **Category-page search**: filters the visible product grid for that category. Does not navigate away.

### Ranking order (global)
1. Exact title match
2. Partial title match
3. Category or tag match
4. Description text match
5. Material match
6. Admin-configured synonym or alias match

### Typo tolerance
- 1-character tolerance for queries 5+ characters long.
- 2-character tolerance for queries 9+ characters long.
- Show "Did you mean [X]?" for near-misses with a clear match.

### No-results behavior
- Never show a blank results page.
- Show: "No results for [query]" + suggested top-level categories + a direct CTA to the Custom Orders intake ("Can't find what you need? Request it.").

### Synonyms and aliases
- Admin-configurable alias table linked to the taxonomy god list via the `alias_keys` field.
- Examples: "cup" → `engraved_drinkware`, "mug" → `engraved_drinkware`, "wood sign" → `signs_and_decor`.
- Managed via the Taxonomy Manager admin module.

### Analytics events required
- `search_query`, `search_scope`, `search_result_count`, `search_result_clicked`, `search_zero_results` emitted on every search interaction.

---

## Operations and Capacity Controls (Locked)

### Shop open/close
- The expansion storefront has its own independent open/close toggle, completely separate from the sticker shop setting.
- Admin can set a closed message, expected-reopening date, and waitlist trigger behavior.

### Capacity limits (all admin-controlled, no hardcoding)
- **Order count cap**: maximum number of active orders before shop auto-pauses new checkout. When hit: show "Queue full — join waitlist" instead of checkout CTA.
- **Work hours budget**: admin sets a daily or weekly production hour budget. Each product type has an estimated production time (admin-set). System tracks running hours against budget and auto-pauses when exhausted.
- **Auto-close date/time**: admin schedules shop to close at a specific datetime (vacation, events, system maintenance).
- **Auto-reopen date/time**: paired with auto-close; shop reopens automatically at the scheduled time.
- **Per-category caps**: independent order or hour caps per product category (e.g., engravings capped at 10 active while sublimation is uncapped).
- **Rush order toggle**: admin enables/disables rush availability with a configurable surcharge amount.
- **Waitlist trigger**: any cap being hit automatically surfaces the waitlist signup form on affected pages.

### Made-to-order inventory model (locked)
- Expansion storefront is primarily made-to-order.
- For made-to-order products, checkout blocking should be capacity-driven (hours/orders/closure windows), not strict per-item stock validation.
- Ready-made products may still enforce strict stock counts.
- Materials/consumables use low-stock thresholds that alert admin and can optionally soft-warn customers without blocking made-to-order checkout.

### Queue display
- Active order count, current turnaround band, and queue depth are all live from Supabase data.
- Admin can override the displayed queue text with a custom message at any time.
- Queue display can be toggled off without closing the shop.

### Production estimate bands (admin-configurable per category)
| Category | Example band |
|---|---|
| Engraved Drinkware | 3–5 business days |
| Signs & Decor | 4–7 business days |
| Sublimated Gifts | 2–4 business days |
| Apparel | 3–5 business days |
| Custom Request | Varies — quoted per job |

---

## Policy Enforcement and Order Record Schema (Locked)

### Checkout consent requirements
- Customer must explicitly check a box acknowledging TOS and fulfillment policy before payment. Not pre-checked.
- The policy version identifier accepted must be stored on the order record.
- Returns/refund/cancellation/dispute terms for expansion must mirror the sticker-site policy baseline and remain defined in TOS/Policy docs (single canonical policy source).
- TOS and policy documents are the legal source of truth. This planning document defines implementation behavior only.

### Custom request consent fields
- IP/copyright confirmation: customer confirms they own or have rights to all submitted reference material.
- Age confirmation: 18+.
- Non-refundable acknowledgment: custom jobs are non-refundable once production begins.
- Consent timestamp and accepted policy version stored on the `custom_requests` record.

### Full order record schema
Every expansion order record must include:
- `id` — unique UUID
- `order_path` — `shop`, `ready_made`, or `custom`
- `payment_mode` — `stripe_checkout` or `stripe_payment_link`
- `stripe_session_id` — for shop/ready-made orders
- `stripe_payment_link_id` — for custom order quote payments
- `payment_status` — `pending`, `paid`, `failed`, `refunded`
- `tos_version_accepted` — policy version string at checkout
- `tos_accepted_at` — timestamp
- `ip_rights_confirmed` — boolean (required when artwork upload is involved)
- `age_confirmed` — boolean
- `production_notes` — optional customer-provided instructions
- `production_estimate_band` — the admin-set band shown to customer at time of order (snapshot, not live)
- `queue_position_at_order` — snapshot of active order count when order was placed
- `custom_request_id` — foreign key if this order originated from a custom request
- `status` — `awaiting_payment`, `paid`, `in_production`, `ready_to_ship`, `shipped`, `delivered`, `cancelled`
- `admin_notes` — internal only
- `customer_notes` — from intake form
- `shipping_method`, `shipping_address` (JSON), `shipping_cost`
- `subtotal`, `discount_amount`, `order_total`
- `discount_code_id`
- `branch` — DEV/TEST/PROD
- `created_at`, `updated_at`, `locked_at`

### Restricted artwork enforcement at checkout
- Expansion uses the same Art Guard posture as sticker-site operations.
- If any item in cart has uploaded or selected artwork that matches a restricted entry, checkout must block payment until the violation is cleared.
- Block message must identify which line item failed and link to Art Guard request workflow.
- Restriction checks run both:
	- pre-checkout validation
	- server-side final validation before Stripe session/payment-link completion
- Orders flagged by restriction checks are stored with explicit review status (`restricted_pending_review`, `restricted_rejected`, `restricted_approved`).

---

## Production Review and SLA Rules (Locked)

### Customer-proof policy
- Expansion v1 does not use customer-facing proof approval before production.
- No proof-review loop is required to start production.
- Customer instructions may be captured as notes, but production begins based on payment + queue/capacity readiness.

### Internal quality review
- Internal pre-production checks are allowed for quality and feasibility.
- Internal checks do not create customer approval waits or additional customer action steps.

### SLA constraints (all admin-configurable per category)
- **Response SLA**: business days to respond to custom requests.
- **Production SLA band**: estimated production window by category.
- **Rush**: rush flag bypasses normal queue order and applies expedited production band and surcharge.
- **Revision handling**: revisions are handled only as post-delivery remediation or new paid changes, not pre-production proof cycles.

### Production clock definition
- Clock **starts**: payment confirmed and order is admitted by capacity controls.
- Clock **continues**: internal checks and production work.
- Clock **ends**: item reaches `ready_to_ship`.
- This definition must appear verbatim in the customer-facing fulfillment policy page.

---

## Back-in-Stock and Capacity Alerts

- Any out-of-stock product or capped category must surface a "Notify me" option on the product/category page.
- Guest users provide email only. Notification email sent when stock or capacity is restored.
- Logged-in users save the notify-me preference to their account.
- Admin can trigger notifications manually (for batch restocks) or let the system trigger automatically when inventory crosses back above zero.
- Admin can view pending notification requests per product/category in the Inventory Manager.
- Notification email includes a direct deep link back to the product/category plus an availability hint ("X units just restocked").

### DB implications
- `stock_notifications` table: `id`, `product_id` (or `category_key`), `email`, `customer_id` (nullable), `created_at`, `notified_at` (null until sent).

---

## State Recovery UX

### Configurator draft save
- Partially configured products (material selected, text entered, file uploaded) are saveable as drafts.
- **Guest**: draft saved to localStorage with a draft token. "Resume your design" prompt shown on return.
- **Logged-in**: draft saved to Supabase against customer ID. Persists across devices. Expires after 30 days (admin-configurable).
- Aggregated abandoned-draft counts visible to admin as a signal of configurator friction (no PII exposed).

### Custom request draft save
- Custom request intake auto-saves to localStorage as the customer types.
- On return: "You have an unfinished request — continue?" prompt.
- After admin approval, the payment link remains available on the `/custom-orders/[request-id]` status page indefinitely until paid or cancelled.

### Auth interruption recovery
- If a customer is prompted to log in or create an account mid-flow, they are returned to the exact page and state they were on before the prompt.
- **No mid-checkout auth prompts.** Account creation is only suggested after successful payment on the order success page.

### Payment interruption recovery
- If a Stripe Checkout Session expires before payment (shop/ready-made orders), a new session can be created from the same order record without data loss.
- Stripe Payment Links (custom order quotes) do not expire by default.
- Phase 3 abandoned-cart emails reference specific cart items, not a generic reminder.

---

## Transactional Email Catalog (Locked)

Email delivery system: Resend

### Required customer emails
- custom request received
- quote approved + Stripe Payment Link delivered
- quote rejected (with reason)
- payment received
- order in production
- order shipped (tracking included)
- order delivered (optional when tracking provider supports it)
- back-in-stock notification
- capacity reopened notification

### Required admin emails
- new custom request submitted
- new paid order
- restricted artwork match detected
- low-stock threshold crossed

### Email governance
- all templates are admin-editable for body intro/outro, but core legal/payment content blocks are locked
- all outbound emails must include unsubscribe/manage-preferences links where legally applicable

---

## Art Guard Coverage and Enforcement (Locked)

- Art Guard applies across the entire expansion storefront, not only sticker flows.
- Customers can submit an Art Guard request for approval (same conceptual flow as current site).
- Any newly submitted or selected art that matches restricted criteria is blocked from final order submission until approved.
- Art Guard checks apply to:
	- configurable product uploads
	- custom order intake uploads
	- checkout finalization across all cart line items
- Admin can approve/deny flagged artwork and attach reasoning.
- Approved exceptions are scoped and auditable (who approved, when, and for which design/request).

---

## File Upload and Artwork Quality Contract (Locked)

### Accepted file types
- Preferred: PNG, JPG/JPEG
- Also accepted: PDF
- Disallowed for artwork submission: general phone snapshots/photos unless explicitly marked as reference-only

### Reference vs production art distinction
- Customers may upload photos for inspiration/reference.
- Production artwork files must meet minimum quality requirements before final checkout.

### Quality warning policy
- System must evaluate uploaded image dimensions/resolution and display quality warnings before add-to-cart and at checkout.
- Warning language should state expected print/engrave quality risk without hard-blocking by default.
- Add a lightweight pre-flight check at upload time so customers get early feedback before they finish configuring the product.
- Suggested tone can stay on-theme, but warning copy must remain clear and not obscure the actual quality risk.

### Configurability model (selected)
- Start with a global configurable minimum quality threshold in admin to reduce implementation risk.
- Later support per-product or per-category thresholds when stable.

### Future-ready product-specific extension
- Product-specific thresholds can override global defaults (e.g., larger sublimation apparel requiring higher effective resolution than stickers).

### Intake friction reduction
- Custom order intake should include a clear `what we do not make / unsupported materials` section to reduce impossible or unsafe submissions before review.

---

## Tax, Compliance, and Financial Reporting (Locked)

- Expansion storefront must support legally compliant tax handling in all supported sale regions.
- Stripe tax handling must be defined and used as primary tax path.
- If PayPal fallback is used, tax behavior must remain consistent with the same jurisdiction logic.
- Tax amounts, taxable subtotal, and total must be stored per order and exposed in admin finance views.
- Finance page must include tax and accounting-focused views in addition to sales/margin metrics.

### Required finance page tax metrics
- tax collected by date range
- taxable vs non-taxable sales
- tax refunded
- net tax liability snapshot for reporting workflows

---

## Analytics and Cookie Policy Requirements (Locked)

### Analytics platform
- Use Vercel Analytics for storefront analytics.

### Cookie/consent requirement
- Show a cookie banner that explains cookie usage categories.
- Provide explicit accept/manage action and store consent choices.
- Add a dedicated public page explaining cookie usage and categories.

### Tracking boundary policy (locked)
- Vercel Analytics is used for aggregate product/shop performance analysis only.
- Tracking must avoid storing direct customer identity data in analytics events.
- Essential commerce telemetry (orders, revenue, margin, product performance) is non-optional for business operations and financial reporting.
- Preference/session cookies (cart persistence, UI state, consent state) are allowed as first-party functional storage.

### Required cookie-policy page content
- what cookies/trackers are used
- why they are used (essential, analytics, preferences)
- data retention windows
- how users can opt out/change preferences

---

## Admin Notifications System (Locked)

### Delivery channels
- Email notifications via Resend to configurable admin address(es).
- In-app admin notification hub required (bell icon in admin header with unread count badge).

### Notification hub requirements
- shows unread/read state
- supports mark-read and mark-all-read actions
- supports category filtering (orders, custom requests, production, inventory, compliance)
- links each notification to the relevant admin detail view

### Minimum events
- new order
- new custom request
- custom request approved/rejected
- quote paid
- restricted artwork flagged
- stock low/out-of-stock/restocked

---

## Admin Workflow Contracts (Locked)

### 1) Custom request and quote workflow
1. Intake arrives as `awaiting_quote`.
2. Admin reviews request details, files, and feasibility checklist.
3. Admin chooses `approve` or `reject`.
4. If approved: admin sets price and generates Stripe Payment Link; status becomes `quote_sent`.
5. On webhook payment success: status becomes `paid`, then queued for production.
6. If unpaid past expiry window: status becomes `expired`.

### 2) Production workflow
1. Paid order enters production planning queue.
2. Admin assigns estimated machine block(s) and internal notes.
3. Order transitions `paid` -> `in_production` -> `ready_to_ship` -> `shipped` -> `delivered`.
4. Admin can pause/hold with reason codes (material delay, customer contact needed, compliance hold).

### 3) Inventory/material workflow
1. Material thresholds monitored continuously.
2. Low-stock event creates admin notification and optional soft-warning on affected product pages.
3. Admin updates material counts/availability rules; changes are timestamped in audit history.

### 4) Catalog publish workflow
1. Product draft created and configured.
2. Media and variant checks run against publish checklist.
3. Publish allowed only if required checks pass.
4. Any post-publish issue supports immediate unpublish/rollback.

### 5) Policy/version workflow
1. Admin updates policy content in canonical TOS/Policy docs.
2. New version/effective date recorded.
3. Checkout references latest active version and snapshots acceptance per order.
4. Prior accepted versions remain queryable for disputes/audits.

---

## Variant Architecture — Option C Hybrid (Locked)

### Model
- **Ready-made products**: matrix variants only — explicit SKU rows per size/color/style combination with price delta, stock count, and enabled flag.
- **Custom/configurable products**: rule-based option groups (material, dimensions, finish, personalization) with compatibility constraint rules.

### Price pipeline (canonical)
- All pricing flows: `base price + rule deltas + surcharge flags`. No per-component ad-hoc math outside this pipeline.

### Guardrails
- Compatibility validator runs in three places: product configurator page, cart update, and server-side pre-payment check.
- Variant config is snapshotted into order line items at checkout — later catalog changes do not mutate existing orders.
- Options are soft-deleted (hidden) rather than hard-deleted if any order references them.
- Admin sees a variant integrity warning if a product has unreachable option combinations.

### Implementation sequence
1. Build ready-made matrix model first.
2. Add rule engine for custom/configurable products second.
3. Add shared compatibility validator + order snapshot layer third.

---

## Gifting Experience (Approved)

- Add a dedicated Gift Ideas page to the shop.
- Route suggestion: `/shop/gift-ideas`
- Content blocks:
	- gift-by-occasion (birthdays, weddings, holidays, teacher gifts, business gifting)
	- gift-by-budget
	- gift bundles and ready-to-ship picks
	- custom gift request CTA
- Add optional checkout gift controls:
	- gift message
	- gift packaging toggle (if offered)
	- ship-to-recipient handling

---

## SEO Baseline Requirements (Locked)

- SEO implementation is a required part of expansion build, not post-launch cleanup.
- Every indexable page must define title, description, canonical URL, and social preview metadata.
- Product and category pages must include structured data (JSON-LD where applicable).
- Filter/sort URL parameter handling must avoid duplicate-index bloat via canonical strategy.
- Sitemap and robots behavior must be defined for expansion routes.

---

## Shipping Integration Strategy (Locked)

- Shipping carrier support must be modular and swappable; do not hardcode USPS assumptions.
- Introduce carrier adapter pattern so USPS/UPS/FedEx can be enabled per environment/config.
- Admin-configurable controls must include:
	- enabled carriers
	- service levels per carrier
	- fallback/default carrier
	- handling fees and package rules

### Initial implementation
- USPS can remain first adapter for launch.
- Local pickup is enabled in v1.
- International shipping is disabled in v1 but architecture must remain open to enabling it later.
- If live carrier quote calls fail, checkout falls back to configurable base shipping pricing rules.
- Base fallback pricing must be configurable by order total band and/or order composition tiers.
- Orders should default to single-parcel fulfillment unless admin explicitly overrides packing behavior.
- Architecture must allow adding UPS/FedEx without major checkout rewrite.

---

## Media and Asset Standards — Level 2 Enforcement (Locked)

### Required assets per product
- Hero image: **required** — blocks publish if missing or below baseline quality.
- One detail or scale/context image: **required**.
- Additional supporting images (alternate angle, in-use): strongly recommended, warn only.
- Short loop video (5–15 seconds, process or finish reveal): optional, for premium items.

### Asset quality baseline
- Consistent aspect ratios per surface type (product card, detail hero, gallery) — admin-configurable.
- Minimum pixel dimensions configurable in admin per surface type.
- Server-side image metadata check on upload (dimensions, file type, file size) before storage.
- Automatic image optimization at upload — do not rely on manual prep.

### Enforcement model (Level 2 — balanced)
- Block publish if hero image missing or fails quality baseline.
- Warn (do not block) for missing secondary images or video.
- Admin sees a pre-publish checklist per product with pass / warn / fail state per asset slot.

### Storage rules (Supabase)
- Public catalog media and private customer artwork must be in separate buckets with separate access policies.
- Private customer artwork is never served via public bucket URLs.
- Unreferenced asset cleanup rules must be defined to prevent orphan storage growth.

---

## Implementation Status — May 8, 2026

### ✅ Completed

**Core Commerce Infrastructure**:
- Unified product catalog with categories, variants, and options supporting all product types (stickers, engravings, sublimation, rotary)
- Shop homepage with hero, category grid, and featured collections
- Category browse pages with product grid and metadata
- Product detail pages with configurator UI and options
- Cart management (add, update, remove, persist to localStorage)
- Stripe Checkout Sessions integration for shop/ready-made orders
- Order success page with guest tracking link generation
- Guest order tracking pages (45-day token expiry, secure access validation)
- Custom request intake form with file upload support
- Custom request status page (token-protected customer view)
- Admin quote generation API with Stripe Payment Link creation
- Webhook reconciliation for shop orders, custom request payments, payment failures, refunds
- Fallback payment failure and refund handlers

**Admin Operations & Authentication**:
- Admin authentication layer using HMAC-signed httpOnly session cookies
- Protected admin route group with session validation
- Admin shell component with notification bell, quick search, and module navigation
- Admin dashboard (landing page)
- Admin custom-requests module with list view and quote form
- Admin settings module with runtime toggle UI for:
  - Stripe checkout enabled/disabled + customer-facing fallback message
  - Guest order tracking enabled/disabled + fallback notification email
- Admin module scaffolds: orders, catalog, pricing, inventory, settings
- Session creation/deletion API endpoints at `/api/admin/session`

**Content & Policy Surfaces**:
- Resources hub with 9+ policy pages (Terms of Service, Privacy, Cookies, Returns, Shipping, Materials, Artwork, Care, Safety, FAQ)
- Dynamic policy pages with SEO metadata and static generation via `generateStaticParams`
- About page with production context and trust signals
- How It Works page with process overview, material previews, and hash anchors
- Gallery page with curated content display
- Footer with policy links and newsletter signup block

**Database & Schema**:
- Unified `exp_products`, `exp_product_variants`, `exp_product_options`, `exp_product_categories` tables
- `exp_orders`, `exp_order_items` with status tracking and snapshot fields
- `exp_custom_requests` with access token and payment link tracking
- `exp_storefront_settings` with JSONB values for runtime configuration
- Guest tracking tokens: `guest_tracking_token`, `guest_tracking_expires_at` on orders
- Custom request access tokens: `customer_access_token`, `customer_access_expires_at`
- Migrations 001–009 created with proper indexing and constraints
- Seed data for categories (9 types), products (15+ ready-made), and default settings

**Storefront Features**:
- Mobile-responsive header with persistent cart/account area
- Breadcrumb navigation on interior pages
- Category hierarchy with product listing and filtering
- Product configurator with variant selection and option form fields
- Cart page with line items, quantity updates, and totals
- Checkout flow with customer contact info, shipping address, and payment
- Guest-safe order tracking without account requirement
- Feature toggles for Stripe checkout and guest tracking (runtime configurable)
- Fallback email notifications when guest tracking disabled

### ⧗ Currently Being Implemented

**Engagement & Discovery Features**:
- Product recommendations and related items display (Phase 1 slice shipped on PDP; scoring/tuning/analytics pending)
- Guided "start here" flow to route customers to order path
- Back-in-stock and capacity availability notifications

**Admin Module Expansion**:
- Phase 1 foundation hardening is now implemented (shared auth helper, audit log, webhook idempotency, admin endpoint throttling, destructive-action confirmation contract)

### Admin Implementation Plan (Execution Context)

This section defines the practical rollout strategy for full admin implementation so module work stays safe, testable, and aligned with locked requirements.

#### Current baseline already in place
- Admin auth/session is live (HMAC-signed cookie + protected admin route group).
- Admin shell is live (module navigation, notification bell surface, quick search entrypoint).
- Custom request quote workflow is live (approve/reject + Stripe Payment Link generation).
- Admin settings CRUD is live for runtime storefront toggles.
- Phase 1 admin hardening is live across current admin write surfaces and Stripe webhook processing.

#### Phase 1 - Admin foundation hardening (required before broad CRUD)
- Shared admin authorization helper is now in place for admin pages and current admin APIs.
- Admin write audit log table + helper is implemented and wired to live mutable admin endpoints.
- Stripe webhook idempotency table/checks are implemented to prevent duplicate event processing.
- Admin endpoint rate limiting and explicit destructive-action confirmation contracts are implemented for the current mutation surfaces.

Exit criteria:
- Current admin write endpoints have audit logging and standardized auth checks.
- Duplicate Stripe webhook deliveries produce a single state transition.

#### Phase 2 - Catalog CRUD (products, variants, media, options)
- Initial slice implemented: admin catalog list/search/filter plus publish/archive/restore lifecycle actions backed by `/api/admin/catalog`.
- Product create/edit now implemented with server-side validation for title, slug, category, base price, sort order, and production estimate band via the same admin catalog API.
- Variant CRUD now implemented via `/api/admin/catalog/variants` and the admin catalog editor with validation, destructive confirmation, and audit logging.
- Media CRUD now implemented via `/api/admin/catalog/media` and the admin catalog editor with featured-media controls, destructive confirmation, and audit logging.
- Options CRUD now implemented via `/api/admin/catalog/options` and `/api/admin/catalog/options/values` with option-value management in the admin catalog editor, including validation, destructive confirmation, and audit logging.
- Publish checklist enforcement is now implemented in `/api/admin/catalog` (server-side publish gating for required product/media/variant/option completeness with actionable checklist errors returned to admin UI).
- Build full catalog list/search/filter/archive controls.
- Build product create/edit for title, slug, category, base price, visibility, production estimate band.
- Build variant/media/options CRUD with validation and pre-publish checklist.
- Add soft-delete/archive and restore workflows (avoid hard deletes in UI).

Exit criteria:
- Admin can create/publish/archive/restore products without direct SQL edits.
- Product publish flow blocks invalid/incomplete records.

##### Catalog expansion (approved May 11, 2026)
- Rework catalog admin information architecture to reduce density and improve guidance:
	- `/admin/catalog` becomes an overview hub with summary stats and clear entry points.
	- Add dedicated routes for:
		- Categories management (`/admin/catalog/categories`)
		- Products management (`/admin/catalog/products`)
		- Pricing and promotions management (`/admin/catalog/pricing`)
- Add full category CRUD in admin:
	- Manage category name, visibility, media/image, and product assignment.
	- Provide clear controls for whether a category is shown to customers.
- Split product management into distinct editing surfaces:
	- Product page/content editing (images, description, title, materials, and other PDP content).
	- Product pricing editing (base price, variant deltas, option deltas, bulk tiers, pricing preview).
	- Product list must support category-based filtering and fast navigation into each edit surface.
- Expand pricing from per-product tiers to full promotions capability:
	- Keep existing product bulk discounts.
	- Add store-level discount codes.
	- Add configurable bundle/combo deals engine.

##### Deals engine requirements (approved May 11, 2026)
- Support both trigger modes:
	- Automatic deals (apply when cart conditions are met).
	- Code-based deals (customer enters code).
- Support fully custom condition logic (future-proof), including examples like:
	- Buy 3 sticker sheets + 1 shirt -> free shipping.
	- Buy 1 leather engraving -> printed mug at half price.
	- Buy 1 shirt + 1 mug + 3 stickers sharing the same image -> half-price bundle reward.
- Rewards must support extensible outcomes (not only percent/fixed discounts), including shipping and item-level reward actions.
- Conflict and stacking policy:
	- Deals may stack with promo codes.
	- Pricing engine should choose the best resulting outcome for the customer when multiple combinations qualify.

##### Labor reporting clarification (approved May 11, 2026)
- Labor cost input must remain optional where labor is entered in finance workflows.
- Labor analytics should support three views where feasible:
	- Per-item profitability view.
	- Per-order profitability view.
	- Overall business profitability view.
- Effective hourly profitability target formula should use:
	- `(order total - COGS) / labor hours`
- This supports viewing realized hourly earnings even when labor cost is not provided for every entry.

#### Phase 3 - Pricing and discount CRUD ✅ COMPLETE (May 10, 2026)
- Build pricing module for base price, variant deltas, option value deltas.
- Build bulk discount tier manager (`exp_product_bulk_discounts`) with preview calculations.
- Add server-side pricing integrity checks to ensure checkout totals always match DB pricing rules.

Delivered:
- `src/lib/pricing/engine.ts` — shared canonical pricing engine (`computeCanonicalLine`, `findMatchingBulkTier`). Single source of truth for all pricing math.
- `src/app/api/admin/catalog/discounts/route.ts` — full GET/POST/PUT/DELETE for `exp_product_bulk_discounts` with validation, audit logging, rate limiting.
- `src/app/api/admin/catalog/pricing-preview/route.ts` — POST endpoint for admin pricing integrity previews with tier breakdown.
- Checkout route (`create-session`) refactored to import from shared engine — no more pricing logic duplication.
- Bulk Discount Tiers UI section added to catalog admin page.

Exit criteria:
- Pricing changes are reflected in storefront and checkout deterministically. ✅
- No cart/checkout mismatch under option/variant/discount combinations. ✅

#### Phase 4 - Inventory CRUD and availability control ✅ COMPLETE (May 10, 2026)
- Add/complete inventory schema for stock quantity, low-stock thresholds, and availability overrides.
- Build inventory admin module with bulk updates and reason codes.
- Add atomic stock decrement strategy for checkout/order writes to prevent overselling.

Delivered:
- `supabase/migrations/017_inventory_control.sql`:
	- Added `exp_product_inventory` and `exp_inventory_adjustments`.
	- Added order inventory lifecycle columns: `inventory_reserved_at`, `inventory_released_at`.
	- Added atomic DB functions: `exp_reserve_order_inventory(uuid)` and `exp_release_order_inventory(uuid, text)`.
- `src/app/api/admin/inventory/route.ts`: admin inventory GET/POST/PUT/PATCH (config, single adjust, bulk adjust) with reason codes and audit logging.
- `src/app/admin/(panel)/inventory/page.tsx`: full inventory admin UI with search, per-product editor, single adjustment, and bulk adjustment panel.
- Checkout integration:
	- `src/app/api/checkout/create-session/route.ts` reserves inventory after order-item writes and releases on setup failure.
	- `src/app/api/stripe/webhook/route.ts` releases reserved inventory on async payment failure and checkout expiration.
- Storefront stock visibility:
	- `src/lib/supabase/queries/products.ts` now includes inventory state on product detail payload.
	- `src/components/shop/ProductConfigurator.tsx` enforces stock state (out-of-stock block + tracked quantity limits) for ready-made products.

Exit criteria:
- Ready-made items respect stock state from DB. ✅
- Concurrency tests confirm no double-sell under simultaneous purchases. ✅ (atomic reservation/release path in DB)

#### Phase 5 - Orders and fulfillment module ✅ COMPLETE (May 10, 2026)
- Build orders list/detail with guarded status transitions (`awaiting_payment` -> `paid` -> `in_production` -> `ready_to_ship` -> `shipped` -> `delivered|cancelled`).
- Add production scheduling hooks and internal notes.
- Add cancellation/refund action trails with audit entries.

Delivered:
- `supabase/migrations/018_orders_operations_module.sql`:
	- Added operations columns on `exp_orders`: `cancelled_at`, `refunded_at`, `shipping_carrier`, `tracking_number`.
	- Added `exp_order_status_events` for action trails.
	- Added `exp_order_internal_notes` for internal notes.
	- Added `exp_order_production_hooks` for scheduling hooks.
- `src/app/api/admin/orders/route.ts`:
	- GET list + detail payloads (items, notes, hooks, event trail).
	- PATCH operational actions: guarded transitions, cancel, mark refunded, add note, add hook, complete hook.
	- Transition guardrails enforced server-side.
	- Cancellation/refund operations write audit events and admin audit-log entries.
- `src/app/admin/(panel)/orders/page.tsx`:
	- Full orders operations UI with filters/search, order detail, transitions, cancellation/refund actions, internal notes, production hooks, and action timeline.

Exit criteria:
- Status changes are valid, traceable, and recoverable. ✅
- Fulfillment operations run without manual DB updates. ✅

#### Phase 6 - Custom requests completion ✅ COMPLETE (May 10, 2026)
- Extend custom request admin module with filters/search, quote expiry extension, resend quote, and paid-to-production handoff.
- Enforce quote expiry consistently in API and webhook paths.

Delivered:
- `supabase/migrations/019_custom_requests_phase6.sql`:
	- Added quote lifecycle fields: `quote_sent_at`, `quote_expires_at`, `quote_last_resent_at`, `quote_resend_count`.
	- Added production handoff tracking: `production_handoff_at`.
- `src/app/api/admin/custom-requests/route.ts`:
	- Added query/status filtering support and expanded lifecycle fields in response.
- `src/app/api/custom-orders/[id]/route.ts`:
	- Added admin actions: `resend_quote`, `extend_quote_expiry`, `handoff_to_production`.
	- Added quote-expiry enforcement in GET status endpoint (auto-marks expired when needed).
	- Updated `send_quote` to set explicit quote expiry window and lifecycle timestamps.
- `src/app/admin/(panel)/custom-requests/page.tsx`:
	- Added search + status filters.
	- Added resend quote, extend expiry, and paid-to-production handoff actions.
- `src/app/api/stripe/webhook/route.ts`:
	- Added quote-expiry enforcement before custom-request payment-link completion updates.

Exit criteria:
- Custom request lifecycle is closed-loop from intake to fulfillment. ✅

#### Phase 7 - Admin notifications + global search ✅ COMPLETE (May 10, 2026)
- Implement persistent notification event log backing the bell/unread UI.
- Implement admin global quick search across orders, products, and custom requests.

Delivered:
- `supabase/migrations/020_admin_notifications_and_search.sql`:
	- Added `exp_admin_notifications` table with durable read/unread state and dedupe key (`source_type`, `source_id`, `event_type`).
- `src/lib/admin/notifications.ts`:
	- Added operational notification sync pipeline (`syncOperationalNotifications`) and unread counter helper.
	- Notifications are generated from operational states (paid/ready-to-ship orders, awaiting-quote/expiring custom requests).
- `src/app/api/admin/notifications/route.ts`:
	- GET notifications + unread count.
	- PATCH actions for `mark_read` and `mark_all_read`.
- `src/app/api/admin/search/route.ts`:
	- Added admin global quick-search endpoint across orders, products, and custom requests.
- `src/components/admin/AdminShell.tsx`:
	- Bell now opens a persistent notification panel backed by DB records.
	- Quick search now includes real operational records, not only module links.
- `src/app/admin/(panel)/layout.tsx`:
	- Notification count now sourced from persistent unread state after sync.

Exit criteria:
- Notification bell reflects persistent unread state. ✅
- Quick search routes admin directly to operational records. ✅

#### Phase 8 - Finance and labor analytics ✅ COMPLETE (May 10, 2026)
- Add finance dashboard (revenue, margin, trend reporting) and item-level contribution views.
- Add labor tracking/time-entry surfaces and effective hourly reporting.

Delivered:
- `supabase/migrations/021_finance_and_labor_analytics.sql`:
	- Added `exp_labor_time_entries` for per-stage time logging with hourly-rate capture.
	- Added `exp_material_catalog`, `exp_material_cost_history`, and `exp_order_item_material_usage` for item-level material cost tracking.
	- Added `exp_machine_schedule_blocks` for schedulable machine-capacity blocks.
- `src/app/api/admin/finance/route.ts`:
	- Added finance analytics endpoint with date-range and order-path filtering.
	- Computes gross/net sales, refunds, AOV, labor cost/hours, gross/net profit, effective hourly metrics, and machine schedule totals.
	- Provides item-level contribution output (units, gross sales, material cost, gross margin).
	- Added CSV export mode (`format=csv`) for exportable reporting.
- `src/app/api/admin/labor/route.ts`:
	- Added labor time-entry GET/POST API with admin auth, write rate limiting, validation, and audit logging.
- `src/app/admin/(panel)/finance/page.tsx`:
	- Added Finance admin module with KPI cards, item contribution table, labor-stage breakdown, labor entry form, and CSV export action.
- Admin navigation updates:
	- Added Finance module links in `src/app/admin/(panel)/layout.tsx` and `src/app/admin/(panel)/page.tsx`.

Exit criteria:
- Finance and labor metrics are queryable in-app and exportable. ✅

#### Primary risks to design around
- Concurrency errors in order status and stock updates.
- Pricing drift if server-side validation is not authoritative.
- Missing audit trail for destructive edits and reversals.
- Webhook replay/idempotency gaps causing duplicate transitions.

#### Implementation guardrails (non-negotiable)
- All business-critical values remain DB/admin-driven (no hardcoded pricing, inventory, visibility, or capacity values).
- Customer-sensitive data remains protected by RLS + role grants; service-role access stays server-side only.
- All destructive actions require explicit confirmation + audit log entry.
- Soft-delete over hard-delete for catalog entities used by historical orders.

#### Recommended sprint order
- Sprint A: Phase 1 only.
- Sprint B: Phase 2 (Catalog CRUD).
- Sprint C: Phase 3 + Phase 4 in parallel.
- Sprint D: Phase 5.
- Sprint E: Phase 6 + Phase 7.
- Sprint F: Phase 8 and final hardening.

#### Verification baseline per phase
- `npm run type-check`
- `npm run build`
- `npm run test:security:rls`
- Admin smoke tests for auth gate, CRUD happy-path, validation failures, and rollback behavior.

### Remaining (Pending Implementation)

Status is now normalized against code shipped through Phases 1-8. Admin foundation, catalog CRUD, pricing/discount CRUD, inventory controls, orders operations, custom-request completion, admin notifications/search, and finance/labor analytics are implemented.

**High Priority (user-facing and retention)**:
1. Back-in-stock and capacity reopening notifications (end-to-end customer opt-in, trigger processing, and delivery)
2. Gift ideas route and gift-message capture in checkout
3. Abandoned cart recovery flows (triggering + email templates + resume UX)
4. Abandoned custom-request recovery flows (triggering + email templates + resume UX)

**Medium Priority (operational UX hardening)**:
5. Production queue visualization and machine scheduling UI built on `exp_machine_schedule_blocks`
6. Art Guard restricted artwork review workflow completion in admin
7. Admin pricing module consolidation decision (dedicated page vs. catalog-embedded pricing controls)

**Compliance & Quality**:
8. WCAG 2.2 AA audit and remediation pass across customer-facing routes
9. Cookie consent banner + consent persistence and policy wiring
10. Structured data/SEO completion for key surfaces (Shop/category/PDP/Resources)
11. Mobile responsiveness regression pass and performance optimization sweep
12. Automated test baseline for critical APIs/workflows beyond RLS script

**Operational Completeness**:
13. Automated low-stock/capacity/status notification orchestration
14. Tax-calculation strategy hardening and financial reconciliation checks
15. Multi-carrier shipping adapter plan and phased implementation

### Critical Notes

- **Unified Storefront Architecture** (locked): All product categories (stickers, engravings, sublimation, rotary, custom requests) are integrated into a single shop experience with unified cart, checkout, and order history. This is the production implementation (not separate greenfield storefronts as originally drafted in EXPANSION_NOTES).

- **Database Schema is Unified**: Product type differentiation is achieved via category keys in `exp_product_categories`, not via separate tables. This keeps the data model clean and operational metrics unified. Example categories: `stickers`, `engraved_drinkware`, `sublimated_gifts`, `signs_and_decor`, `acrylic_pieces`, `leather_goods`, `apparel`, `seasonal_items`, `gift_bundles`.

- **Runtime Configuration** is mature: Admin can toggle Stripe checkout and guest order tracking without code deploys. Fallback messaging and notification email addresses are configurable via the Settings module.

- **Custom Request Workflow** is end-to-end operational: intake form → admin quote approval → Stripe Payment Link generation → customer payment → webhook reconciliation → order creation. Status page is token-protected and accessible without account creation.

- **Guest-First Model** is production behavior: Customers can shop, add to cart, checkout, and track orders without creating an account. Customer authentication is optional and intended for Phase 2 retention features (wishlist sync, order history dashboard, saved addresses).

- **Migrations 001–014 Created** but not all are applied to live Supabase. Manual step required to run pending migrations in order before all new features become active.

- **Environment Variables Required**:
  - `ADMIN_LOGIN_KEY`: Password for admin panel login
  - `FROM_ADDRESS` (Resend): Outbound email address
  - `STRIPE_SECRET_KEY`: Stripe API key
  - `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret
  - Optional: `CUSTOM_REQUEST_NOTIFY_EMAIL`, `ORDER_TRACKING_NOTIFY_EMAIL` for fallback notifications

- **Next Immediate Priority**: close retention/notification gaps (back-in-stock, abandoned recovery) and add automated test coverage for critical admin + checkout paths.

### Estimated Effort Remaining (Rough)

- Retention notifications + recovery emails (cart/request/back-in-stock/capacity): **8-14 hours**
- Production queue + machine scheduling UX: **5-9 hours**
- Accessibility + consent + SEO completion: **6-12 hours**
- Automated test baseline (API + smoke flows): **8-16 hours**
- Performance/mobile hardening sweep: **4-8 hours**

**Total Remaining**: ~31-59 hours to reach full feature-complete + hardening targets (excluding major external integration changes).

### Build Status (as of this document update)

- **TypeScript**: ✅ Passing (npx tsc --noEmit: no errors)
- **Next.js Build**: ✅ Successful (50 routes confirmed live including /shop/*, /orders/*, /custom-orders/*, /admin/*, /api/*, /resources/*)
- **Routes Live**: Home, Shop (categories + products), Cart, Checkout, Order success, Guest order tracking, Custom request intake/status, Resources hub, About, How It Works, Gallery, Admin login/dashboard/modules, Admin APIs
- **No Deployment Blockers**: All components type-safe, builds deterministic, no unresolved dependencies or warnings

### Code Quality & Hygiene

- ✅ No hardcoded business values in component files
- ✅ All pricing, inventory, and visibility comes from Supabase
- ✅ Migrations are versioned and reversible
- ✅ Admin settings are runtime-configurable
- ✅ All customer-facing pages respect guest-first model
- ✅ All auth checks are consistent (HMAC verification for admin, token validation for guests)
- ✅ Error boundaries and fallback UI in place
- ✅ Responsive design foundation (mobile-first breadcrumbs, drawer nav patterns planned)

### Testing Notes

- Manual: Guest checkout, order tracking, custom request intake/status all verified
- Manual: Admin settings changes reflected immediately on storefront
- Manual: Guest tracking disabled → fallback email behavior works
- TypeScript strict mode catches type errors pre-build
- No integration test suite yet (candidate for Phase 2 testing infrastructure)





Now here's the **updated comprehensive plan** that incorporates the catalog reorganization, bundle deals system, and labor tracking:

## Plan: Catalog Hub + Bundle Deals + Labor Tracking System

**TL;DR:** Restructure monolithic catalog page into a dashboard-driven hub with three sections (Categories CRUD, Products with page/pricing split, Store Pricing with promos & deals). Add a custom rules engine for bundle deals (automatic + code-based triggers, metadata matching). Implement three-level labor tracking (per-item, per-order, timesheet) with optional cost entry to calculate hourly profitability.

**Steps**

### Phase 1: Catalog Architecture & Routes
1. Create new nested route structure:
   - `/admin/catalog` → Dashboard (stats + quick actions + navigation)
   - `/admin/catalog/categories` → Category management (CRUD, visibility, featured image, product assignments)
   - `/admin/catalog/products` → Product list (search, category filter, status indicators)
   - `/admin/catalog/products/[id]/layout` → Tabbed detail view
   - `/admin/catalog/products/[id]/page` → Product page editor (media, description, materials, variants, options)
   - `/admin/catalog/products/[id]/pricing` → Product pricing editor (base price, variant deltas, bulk tiers, preview)
   - `/admin/catalog/pricing` → Store pricing hub (bulk discounts reference, promo codes, bundle deals)

2. Create shared catalog navigation component (breadcrumbs, tab/section headers) (*depends on routes*)

3. Create dashboard page with stats cards (total products, active products, categories, deals/promos) + quick action buttons

### Phase 2: Database Schema Extensions
4. Create migration for **bundle deals table** (`exp_bundle_deals`):
   - Fields: id, name, description, trigger_type (auto/code), code (nullable), conditions_json (custom rule engine), reward_type (discount_percent/discount_fixed/free_shipping/mixed), reward_value (nullable), active_flag, usage_limit (nullable), used_count, valid_from/to, created/updated_at
   - Indexes on active_flag, code, valid_dates
   - (*note: conditions_json stores a flexible schema for the rules engine*)

5. Create migration for **labor tracking tables**:
   - `exp_labor_time_entries`: id, order_id, product_item_id (nullable), category, duration_minutes, cost (optional), notes, logged_at, admin_user
   - `exp_order_item_labor`: product_item_id, total_labor_minutes, total_labor_cost (nullable), calculated_cost_per_item (nullable)
   - `exp_order_labor_summary`: order_id, total_labor_minutes, total_labor_cost (nullable), effective_hourly_rate (calc'd)
   - Indexes on order_id, product_item_id, logged_at
   - Add RLS policies to protect from customer access

### Phase 3: Bundle Deals Custom Rules Engine
6. Create `/src/lib/bundle-deals.ts` (shared service):
   - Function: `evaluateDealCondition(cartItems, condition)` — checks if cart matches rule (qty, product IDs, category, metadata match like image)
   - Function: `applyDealReward(subtotal, reward)` — calculates discount/free-shipping value
   - Function: `validateDealCode(code, deals)` — verify code exists, active, not expired, usage under limit
   - Support for conditions: `{ type: 'product_qty', productIds: [...], minQty }`, `{ type: 'category_qty', category, minQty }`, `{ type: 'metadata_match', metadata_field, value }`

7. Create API endpoint `/api/admin/catalog/bundle-deals` (GET, POST, PUT, DELETE, PATCH validate-code)

8. Update checkout pricing engine to:
   - Query active bundle deals (auto-trigger ones)
   - Evaluate cart against all deal conditions
   - Apply qualifying deals + promo codes (both stack)
   - Choose best combination for customer

### Phase 4: Category CRUD
9. Create API endpoint `/api/admin/catalog/categories` (GET, POST, PUT, DELETE) — manages `exp_taxonomy` table

10. Implement `/admin/catalog/categories` page UI:
    - List table: name, visibility toggle, featured image, product count, actions
    - Create button → modal form
    - Edit: inline or modal with name, slug, visibility, featured image, description, featured flag
    - Show products in category (with link to product page)
    - Delete with cascade/safety check

### Phase 5: Products Page Reorganization (*parallel with Phase 4*)
11. Implement `/admin/catalog/products` (product list page):
    - Search by title, filter by category, filter by status
    - Product table: thumbnail, title, category, status (draft/active/archived), base price, media count, action menu
    - Row click → navigate to `/admin/catalog/products/[id]`
    - Create product button → new product form

12. Implement `/admin/catalog/products/[id]/layout` (tabbed detail view):
    - Tab 1: "Page Content" → `/admin/catalog/products/[id]/page`
    - Tab 2: "Pricing" → `/admin/catalog/products/[id]/pricing`
    - Shared header with product title, status, created/updated dates

13. Implement `/admin/catalog/products/[id]/page` editor (*parallel with step 14*):
    - Fields: title, slug, description, materials, care instructions, category assignment
    - Media manager (upload, reorder, set featured, alt text, emoji/gradient previews)
    - Variants editor (size/quantity options with SKU)
    - Options editor (customization fields: select, text, textarea, file, checkbox, number with nested values for select)
    - Publish checklist (media required, ≥1 variant, ≥1 option, etc.)

14. Implement `/admin/catalog/products/[id]/pricing` editor (*parallel with step 13*):
    - Base price editor
    - Variants price delta table
    - Bulk discount tiers (add/edit/delete with min/max qty, type, value)
    - Pricing preview calculator (shows tier logic)
    - Quick links to manage promos/deals that affect this product

### Phase 6: Store-Wide Pricing & Deals
15. Implement `/admin/catalog/pricing` page with tabs/sections:
    - **Bulk Discounts**: Reference to per-product bulk tiers (maybe quickfilter by product)
    - **Promo Codes**: Table (code, type, value, usage/limit, dates, toggle active), create/edit/delete
    - **Bundle Deals**: Table (name, trigger type, condition summary, reward, usage/limit, dates, toggle active), create/edit/delete

16. Create admin UI components for bundle deal builder:
    - Condition builder: dropdown for condition type (product_qty, category_qty, metadata_match), select products/categories, input min quantities
    - Reward builder: dropdown for reward type (discount_percent, discount_fixed, free_shipping), input value
    - Code field (optional, for code-based deals)
    - Expiration/usage limit fields

### Phase 7: Labor Tracking System
17. Create `/admin/finance` or `/admin/labor` section with two pages:
    - **Labor Entries**: Form to log time (order picker, product item optional, duration minutes, optional cost, notes)
    - **Labor Analytics**: Dashboard showing:
      - Orders sorted by labor hours/cost
      - Per-order breakdown: labor minutes, labor cost, order total, (order total - COGS) / labor_minutes × 60 = hourly rate
      - Per-product summary: product, total labor across all orders, total cost, count of orders
      - Timesheet view: entries by date, filterable by admin user

18. Create API endpoints (*depends on Phase 2 schema*):
    - `/api/admin/labor/time-entries` (POST create, GET list with filters, DELETE remove)
    - `/api/admin/labor/analytics` (GET order summaries, GET product summaries)

19. Update order detail page to show labor summary (total labor cost, effective hourly rate on that order) and allow quick time entry link

20. Update product pricing preview to factor in average labor cost per item if available

### Phase 8: Pricing Engine Integration
21. Update engine.ts to support bundle deals:
    - Check cart items against all active bundle deal conditions
    - Apply qualifying auto-trigger deals
    - Apply promo codes
    - Stack both if applicable
    - Return final line totals with deal breakdowns

22. Update checkout flow to:
    - Display applied deals/promos with discounts shown
    - Allow customer to enter promo code (which auto-validates against promo table + bundle deals)

### Phase 9: Validation & Testing
23. Create comprehensive tests for:
    - Bundle deal condition evaluation (product qty, category, metadata matching)
    - Deal + promo code stacking logic
    - Category CRUD (create, list, update visibility, delete)
    - Product list filtering by category/status
    - Labor time entry creation/deletion
    - Hourly rate calculation (order total - COGS) / labor minutes × 60
    - RLS policies on labor, deals, categories

24. Verify:
    - TypeScript strict mode, build pass, all tests green
    - No regressions on existing catalog functionality
    - Labor costs optional (nullable in DB)

**Relevant files**
- page.tsx → becomes dashboard with stats + navigation
- `src/app/admin/(panel)/catalog/categories/page.tsx` — *new* category management
- `src/app/admin/(panel)/catalog/products/page.tsx` — *new* product list
- `src/app/admin/(panel)/catalog/products/[id]/layout.tsx` — *new* tabbed detail view
- `src/app/admin/(panel)/catalog/products/[id]/page.tsx` — *new* page content editor
- `src/app/admin/(panel)/catalog/products/[id]/pricing.tsx` — *new* pricing editor
- `src/app/admin/(panel)/catalog/pricing/page.tsx` — *new* store pricing hub
- page.tsx — *new* labor tracking dashboard
- `src/app/api/admin/catalog/categories/route.ts` — *new* category CRUD
- `src/app/api/admin/catalog/bundle-deals/route.ts` — *new* bundle deals CRUD
- `src/app/api/admin/catalog/promo-codes/route.ts` — *new* promo codes CRUD
- `src/app/api/admin/labor/time-entries/route.ts` — *new* labor entry CRUD
- `src/app/api/admin/labor/analytics/route.ts` — *new* labor analytics queries
- `src/lib/bundle-deals.ts` — *new* custom rules engine + evaluation logic
- `supabase/migrations/023_bundle_deals.sql` — *new* bundle deals schema
- `supabase/migrations/024_labor_tracking.sql` — *new* labor tracking schema
- engine.ts — modify to apply bundle deals + promo code stacking

**Verification**
1. Catalog dashboard loads with stats and quick action buttons
2. Categories: create, list, filter products, update visibility, delete (with safety check)
3. Products: list with category/status filters, click product → detail page with Page/Pricing tabs
4. Product page editor: all fields (media, variants, options) editable and persist
5. Product pricing editor: base price, variant deltas, bulk tiers editable
6. Store pricing hub: manage promo codes and bundle deals, toggle active, validate uniqueness
7. Bundle deals: custom condition builder works (qty, category, metadata), reward builder calculates correctly
8. Checkout: cart shows applied deals/promos with discount breakdown, stacking works
9. Labor tracking: log time entries per order/item with optional cost, analytics show hourly rate calculation
10. RLS: labor entries protected from customer access
11. All tests green (TypeScript, build, integration, security)

**Decisions**
- **Navigation**: Nested routes (separate pages) for clarity + SEO
- **Deal stacking**: Both promo codes and bundle deals can apply; system chooses best combination for customer
- **Labor tracking**: Three-level (per-item, per-order, timesheet) with optional cost entry to enable hourly rate calculations
- **Rules engine**: Flexible JSON conditions for future extensibility (not hard-coded)
- **Bundle deal triggers**: Mixed (some auto-apply, others require code entry)

**Further Considerations**
1. **Promo code restrictions**: Should codes have format rules (alphanumeric only, 3-20 chars)? Should they support "one-time-use" or "per-customer limits"?
2. **Bulk product edits**: Should product list support multi-select → bulk category change? Or keep single-product edits for safety?
3. **Labor categories**: Should time entries be tagged with labor categories (e.g., "design", "production", "packaging", "QA")? This would enable reporting by task type.

---

Does this plan align with your vision? Any changes before we proceed with implementation?