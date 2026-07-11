import type { ProductOptionType } from '@/lib/catalog/option-templates'

export function makeLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function asNumber(value: string | number, fallback = 0): number {
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(n) ? n : fallback
}

export function optionTypeLabel(value: ProductOptionType): string {
  switch (value) {
    case 'select':
      return 'Single choice'
    case 'text':
      return 'Text'
    case 'textarea':
      return 'Long text'
    case 'file':
      return 'File upload'
    case 'checkbox':
      return 'Toggle'
    case 'number':
      return 'Number'
    default:
      return value
  }
}

export function discountTypeLabel(value: string): string {
  switch (value) {
    case 'percent':
      return 'Percent off'
    case 'fixed_amount':
      return 'Fixed amount off'
    case 'unit_price':
      return 'Unit price'
    case 'cheapest_free':
      return 'Cheapest free'
    default:
      return value
  }
}

// Process type behavior detection for auto-generated options
export function getProcessTypeBehavior(key: string): {
  autoOption: {
    option_key: string
    label: string
    option_type: ProductOptionType
    is_required: boolean
    help_text: string
  } | null
} {
  const lowerKey = key.toLowerCase()

  if (lowerKey.includes('engrav')) {
    return {
      autoOption: {
        option_key: 'engraving_artwork',
        label: 'Engraving Artwork',
        option_type: 'file',
        is_required: true,
        help_text: 'Upload your artwork file for engraving. SVG preferred, PNG/JPG accepted.',
      },
    }
  }

  if (lowerKey.includes('cut')) {
    return {
      autoOption: {
        option_key: 'cut_type',
        label: 'Cut Type',
        option_type: 'select',
        is_required: true,
        help_text: 'Select how you want your item cut.',
      },
    }
  }

  return { autoOption: null }
}

// Check if a process type key would generate auto-options
export function hasAutoOption(key: string): boolean {
  const { autoOption } = getProcessTypeBehavior(key)
  return autoOption !== null
}

// Get the auto-option info for a process type key
export function getProcessAutoOption(key: string) {
  return getProcessTypeBehavior(key).autoOption
}
