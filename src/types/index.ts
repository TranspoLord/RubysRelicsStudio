// ─── Taxonomy ─────────────────────────────────────────────────────────────────

export type TaxonomyType =
  | 'category'
  | 'customizability_mode'
  | 'material'
  | 'product_type'
  | 'tag'

export interface TaxonomyEntry {
  key: string
  display_name: string
  slug: string
  parent_key?: string
  type: TaxonomyType
  visible: boolean
  sort_order: number
  how_it_works_anchor?: string
  alias_keys?: string
  // Extended fields for special taxonomy entries (categories, materials)
  emoji?: string | null
  gradient?: string | null
  glow_color?: string | null
  tagline?: string | null
  created_at: string
  updated_at: string
}

// ─── Products ─────────────────────────────────────────────────────────────────

export interface Product {
  id: string
  title: string
  slug: string
  description: string
  category_key: string
  is_ready_made: boolean
  is_customizable: boolean
  is_active: boolean
  is_archived: boolean
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
  archived_at?: string
}

export interface ProductVariant {
  id: string
  product_id: string
  label: string
  price_delta: number
  capacity_weight_hours: number
  is_enabled: boolean
  created_at: string
  updated_at: string
}

export interface ProductMedia {
  id: string
  product_id: string
  url: string
  alt: string
  is_featured: boolean
  sort_order: number
  created_at: string
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'awaiting_payment'
  | 'paid'
  | 'in_production'
  | 'ready_to_ship'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

export type OrderPath = 'shop' | 'ready_made' | 'custom'
export type PaymentMode = 'stripe_checkout' | 'stripe_payment_link'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'
export type Branch = 'DEV' | 'TEST' | 'PROD'

export interface ShippingAddress {
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  zip: string
  country: string
}

export interface Order {
  id: string
  order_path: OrderPath
  payment_mode: PaymentMode
  stripe_session_id?: string
  stripe_payment_link_id?: string
  payment_status: PaymentStatus
  tos_version_accepted: string
  tos_accepted_at: string
  ip_rights_confirmed: boolean
  age_confirmed: boolean
  production_notes?: string
  production_estimate_band: string
  queue_position_at_order: number
  custom_request_id?: string
  status: OrderStatus
  admin_notes?: string
  customer_notes?: string
  shipping_method: string
  shipping_address: ShippingAddress
  shipping_cost: number
  subtotal: number
  discount_amount: number
  order_total: number
  discount_code_id?: string
  branch: Branch
  created_at: string
  updated_at: string
  locked_at?: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  product_title: string
  selected_options: Record<string, string>
  unit_price: number
  quantity: number
  line_total: number
  artwork_references: string[]
  estimated_hours_at_checkout: number
  created_at: string
}

// ─── Custom Requests ──────────────────────────────────────────────────────────

export type CustomRequestStatus =
  | 'awaiting_quote'
  | 'quote_sent'
  | 'paid'
  | 'expired'
  | 'cancelled'
  | 'restricted_pending_review'
  | 'restricted_rejected'
  | 'restricted_approved'

export interface CustomRequest {
  id: string
  status: CustomRequestStatus
  customer_email: string
  customer_name: string
  description: string
  quantity: number
  deadline?: string
  budget_range?: string
  files: string[]
  quoted_amount?: number
  stripe_payment_link_id?: string
  stripe_payment_link_url?: string
  rejection_reason?: string
  ip_rights_confirmed: boolean
  age_confirmed: boolean
  non_refundable_acknowledged: boolean
  tos_version_accepted?: string
  created_at: string
  updated_at: string
  created_by?: string
  updated_by?: string
}

// ─── Inventory / Notifications ────────────────────────────────────────────────

export interface StockNotification {
  id: string
  product_id?: string
  category_key?: string
  email: string
  customer_id?: string
  created_at: string
  notified_at?: string
}

// ─── Homepage CMS ─────────────────────────────────────────────────────────────

export interface HomepageSection {
  id: string
  section_key: string
  is_visible: boolean
  sort_order: number
  content: Record<string, unknown>
}

export interface CategoryCard {
  key: string
  display_name: string
  slug: string
  tagline: string
  gradient: string
  emoji: string
  sort_order: number
  visible: boolean
  how_it_works_anchor?: string
}

export interface FeaturedCollection {
  id: string
  title: string
  tagline: string
  slug: string
  image_url?: string
  gradient: string
  sort_order: number
}

export interface GalleryItem {
  id: string
  title: string
  caption?: string
  category_key: string
  media_url: string
  media_alt: string
  display_permission: boolean
  visible: boolean
  publish_date: string
  tags: string[]
  material_used?: string
  turnaround_band?: string
  moderation_status: 'pending_review' | 'approved' | 'scheduled' | 'published' | 'archived'
}

// ─── Product Process Pricing ─────────────────────────────────────────────────

export type ComboDiscountType = 'percent' | 'fixed_amount' | 'cheapest_free'

export interface ProductProcessPricing {
  id: string
  product_id: string
  process_type_key: string
  price_delta: number
  is_enabled: boolean
  created_at: string
  updated_at: string
}

export interface ProductComboDiscount {
  id: string
  product_id: string
  min_processes: number
  discount_type: ComboDiscountType
  discount_value: number | null
  label: string | null
  is_enabled: boolean
  created_at: string
  updated_at: string
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export type OrderPathAnalytic = 'shop' | 'ready_made' | 'custom_order'
export type SearchScope = 'global' | 'sidebar' | 'category'

export interface SearchEvent {
  query: string
  scope: SearchScope
  result_count: number
}

// ─── Machine Scheduling ───────────────────────────────────────────────────────

export type MachineStage = 'design' | 'setup' | 'production' | 'finishing' | 'packing'

export interface MachineScheduleBlock {
  id: string
  order_id?: string
  order_item_id?: string
  custom_request_id?: string
  stage: MachineStage
  start_at: string
  end_at: string
  estimated_hours: number
  is_locked: boolean
  notes?: string
  created_at: string
  updated_at: string
}

// ─── Finance ──────────────────────────────────────────────────────────────────

export interface LaborTimeEntry {
  id: string
  order_id?: string
  order_item_id?: string
  stage: MachineStage
  minutes: number
  logged_by: string
  logged_at: string
  notes?: string
}
