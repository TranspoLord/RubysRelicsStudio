import { getSupabaseAdmin } from '@/lib/supabase/client'

export interface GuestOrderTrackingSettings {
  enabled: boolean
  notify_email: string
}

export interface AdminSessionSettings {
  ttl_hours: number
}

export interface CustomOrderIntakeSettings {
  max_quantity: number
  max_files: number
}

export interface ContactSettings {
  support_email: string
  from_email: string
  from_name: string
}

export interface OperationalNotificationSettings {
  custom_request_notify_email: string
}

export interface RecommendationSettings {
  enabled: boolean
  pinned_global: string[]
  pinned_by_category: Record<string, string[]>
}

export interface BudgetRangeSetting {
  id: string
  label: string
  value: string
  min_amount: number | null
  max_amount: number | null
  sort_order: number
}

export const DEFAULT_SUPPORT_EMAIL = 'orders@rubysrelicsstudio.com'

const DEFAULT_GUEST_ORDER_TRACKING_SETTINGS: GuestOrderTrackingSettings = {
  enabled: true,
  notify_email: DEFAULT_SUPPORT_EMAIL,
}

const DEFAULT_ADMIN_SESSION_SETTINGS: AdminSessionSettings = {
  ttl_hours: 12,
}

const DEFAULT_CUSTOM_ORDER_INTAKE_SETTINGS: CustomOrderIntakeSettings = {
  max_quantity: 500,
  max_files: 5,
}

const DEFAULT_CONTACT_SETTINGS: ContactSettings = {
  support_email: DEFAULT_SUPPORT_EMAIL,
  from_email: 'hello@rubysrelicsstudio.com',
  from_name: "Ruby's Relics",
}

const DEFAULT_OPERATIONAL_NOTIFICATION_SETTINGS: OperationalNotificationSettings = {
  custom_request_notify_email: DEFAULT_SUPPORT_EMAIL,
}

const DEFAULT_RECOMMENDATION_SETTINGS: RecommendationSettings = {
  enabled: true,
  pinned_global: [],
  pinned_by_category: {},
}

export async function getStorefrontSettings(settingKeys: string[]) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('exp_storefront_settings')
    .select('setting_key, setting_value')
    .in('setting_key', settingKeys)

  if (error) {
    console.error('[storefront-settings]', error.message)
    return new Map<string, Record<string, unknown>>()
  }

  return new Map(
    (data ?? []).map((row) => [row.setting_key, (row.setting_value ?? {}) as Record<string, unknown>])
  )
}

export async function getGuestOrderTrackingSettings(): Promise<GuestOrderTrackingSettings> {
  const settings = await getStorefrontSettings(['guest_order_tracking'])
  const value = settings.get('guest_order_tracking')

  return {
    enabled:
      typeof value?.enabled === 'boolean'
        ? value.enabled
        : DEFAULT_GUEST_ORDER_TRACKING_SETTINGS.enabled,
    notify_email:
      typeof value?.notify_email === 'string' && value.notify_email.trim().length > 3
        ? value.notify_email.trim()
        : DEFAULT_GUEST_ORDER_TRACKING_SETTINGS.notify_email,
  }
}

export async function getAdminSessionSettings(): Promise<AdminSessionSettings> {
  const settings = await getStorefrontSettings(['admin_session'])
  const value = settings.get('admin_session')
  const ttlHours = typeof value?.ttl_hours === 'number' ? value.ttl_hours : Number(value?.ttl_hours)

  return {
    ttl_hours:
      Number.isFinite(ttlHours) && ttlHours >= 1 && ttlHours <= 168
        ? ttlHours
        : DEFAULT_ADMIN_SESSION_SETTINGS.ttl_hours,
  }
}

export async function getContactSettings(): Promise<ContactSettings> {
  const settings = await getStorefrontSettings(['contact'])
  const value = settings.get('contact')

  return {
    support_email:
      typeof value?.support_email === 'string' && value.support_email.trim().length > 3
        ? value.support_email.trim()
        : DEFAULT_CONTACT_SETTINGS.support_email,
    from_email:
      typeof value?.from_email === 'string' && value.from_email.trim().length > 3
        ? value.from_email.trim()
        : DEFAULT_CONTACT_SETTINGS.from_email,
    from_name:
      typeof value?.from_name === 'string' && value.from_name.trim().length > 0
        ? value.from_name.trim()
        : DEFAULT_CONTACT_SETTINGS.from_name,
  }
}

export async function getCustomOrderIntakeSettings(): Promise<CustomOrderIntakeSettings> {
  const settings = await getStorefrontSettings(['custom_order_intake'])
  const value = settings.get('custom_order_intake')
  const maxQuantity =
    typeof value?.max_quantity === 'number'
      ? value.max_quantity
      : Number(value?.max_quantity)
  const maxFiles =
    typeof value?.max_files === 'number' ? value.max_files : Number(value?.max_files)

  return {
    max_quantity:
      Number.isFinite(maxQuantity) && maxQuantity >= 1 && maxQuantity <= 10000
        ? Math.floor(maxQuantity)
        : DEFAULT_CUSTOM_ORDER_INTAKE_SETTINGS.max_quantity,
    max_files:
      Number.isFinite(maxFiles) && maxFiles >= 1 && maxFiles <= 20
        ? Math.floor(maxFiles)
        : DEFAULT_CUSTOM_ORDER_INTAKE_SETTINGS.max_files,
  }
}

export async function getOperationalNotificationSettings(): Promise<OperationalNotificationSettings> {
  const settings = await getStorefrontSettings(['operational_notifications'])
  const value = settings.get('operational_notifications')

  return {
    custom_request_notify_email:
      typeof value?.custom_request_notify_email === 'string' &&
      value.custom_request_notify_email.trim().length > 3
        ? value.custom_request_notify_email.trim()
        : DEFAULT_OPERATIONAL_NOTIFICATION_SETTINGS.custom_request_notify_email,
  }
}

export async function getFromAddress(): Promise<string> {
  const contact = await getContactSettings()
  return `${contact.from_name} <${contact.from_email}>`
}

export async function getBudgetRanges(): Promise<BudgetRangeSetting[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('exp_budget_ranges')
    .select('id, label, value, min_amount, max_amount, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[budget-ranges]', error.message)
    return []
  }

  return (data ?? []) as BudgetRangeSetting[]
}

export async function getRecommendationSettings(): Promise<RecommendationSettings> {
  const settings = await getStorefrontSettings(['recommendations'])
  const value = settings.get('recommendations')

  const pinnedGlobal = Array.isArray(value?.pinned_global)
    ? value.pinned_global
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0)
    : DEFAULT_RECOMMENDATION_SETTINGS.pinned_global

  const pinnedByCategory: Record<string, string[]> = {}
  if (value?.pinned_by_category && typeof value.pinned_by_category === 'object') {
    for (const [categoryKey, rawIds] of Object.entries(value.pinned_by_category)) {
      if (!Array.isArray(rawIds)) continue
      const ids = rawIds
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0)
      if (ids.length > 0) {
        pinnedByCategory[categoryKey] = ids
      }
    }
  }

  return {
    enabled:
      typeof value?.enabled === 'boolean'
        ? value.enabled
        : DEFAULT_RECOMMENDATION_SETTINGS.enabled,
    pinned_global: pinnedGlobal,
    pinned_by_category:
      Object.keys(pinnedByCategory).length > 0
        ? pinnedByCategory
        : DEFAULT_RECOMMENDATION_SETTINGS.pinned_by_category,
  }
}