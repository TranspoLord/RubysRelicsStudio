import { getSupabaseAdmin } from '@/lib/supabase/client'

export interface ShippoSettings {
  enabled: boolean
  carriers: {
    usps: boolean
    ups: boolean
    fedex: boolean
  }
  testMode: boolean
}

const DEFAULT_SHIPPO_SETTINGS: ShippoSettings = {
  enabled: false,
  carriers: {
    usps: true,
    ups: true,
    fedex: true,
  },
  testMode: false,
}

export async function getShippoSettings(): Promise<ShippoSettings> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('exp_storefront_settings')
    .select('setting_value')
    .eq('setting_key', 'shippo')
    .single()

  if (error || !data) {
    return DEFAULT_SHIPPO_SETTINGS
  }

  const saved = data.setting_value as Partial<ShippoSettings>

  return {
    enabled: saved.enabled ?? DEFAULT_SHIPPO_SETTINGS.enabled,
    carriers: {
      usps: saved.carriers?.usps ?? DEFAULT_SHIPPO_SETTINGS.carriers.usps,
      ups: saved.carriers?.ups ?? DEFAULT_SHIPPO_SETTINGS.carriers.ups,
      fedex: saved.carriers?.fedex ?? DEFAULT_SHIPPO_SETTINGS.carriers.fedex,
    },
    testMode: saved.testMode ?? DEFAULT_SHIPPO_SETTINGS.testMode,
  }
}

export function getCarrierTrackingUrl(carrier: string, trackingNumber: string): string {
  const urls: Record<string, string> = {
    usps: `https://tools.usps.com/go/TrackConfirmAction_input?qtc_tLabels1=${trackingNumber}`,
    ups: `https://www.ups.com/track?track=yes&trackNums=${trackingNumber}`,
    fedex: `https://www.fedex.com/apps/fedextrack/?tracknumbers=${trackingNumber}`,
  }
  return urls[carrier.toLowerCase()] || `https://www.google.com/search?q=${carrier}+${trackingNumber}`
}