export type ProductOptionType = 'select' | 'text' | 'textarea' | 'file' | 'checkbox' | 'number'

export interface OptionValueBlueprint {
  label: string
  value: string
  price_delta?: number
  is_enabled?: boolean
  sort_order?: number
}

export interface OptionBlueprint {
  option_key: string
  label: string
  option_type: ProductOptionType
  placeholder?: string | null
  help_text?: string | null
  is_required?: boolean
  sort_order?: number
  values?: OptionValueBlueprint[]
}

export function normalizeOptionKey(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

const CATEGORY_OPTION_TEMPLATES: Record<string, OptionBlueprint[]> = {
  signs_and_decor: [
    {
      option_key: 'sign_size',
      label: 'Sign Size',
      option_type: 'select',
      is_required: true,
      sort_order: 1,
      help_text: 'Choose the final slate/sign dimensions.',
      values: [
        { label: 'Small (6 x 8)', value: 'small_6x8', price_delta: 0, sort_order: 1 },
        { label: 'Medium (8 x 10)', value: 'medium_8x10', price_delta: 8, sort_order: 2 },
        { label: 'Large (12 x 16)', value: 'large_12x16', price_delta: 16, sort_order: 3 },
      ],
    },
    {
      option_key: 'sign_text',
      label: 'Text or Message',
      option_type: 'textarea',
      is_required: false,
      sort_order: 2,
      placeholder: 'Example: The Henderson Family - Est. 2018',
      help_text: 'Provide line breaks exactly as you want them engraved.',
    },
    {
      option_key: 'artwork_file',
      label: 'Artwork or Logo Upload',
      option_type: 'file',
      is_required: false,
      sort_order: 3,
      help_text: 'SVG is preferred. PNG/JPG/PDF accepted at 300 DPI or higher.',
    },
    {
      option_key: 'finish',
      label: 'Finish',
      option_type: 'select',
      is_required: true,
      sort_order: 4,
      values: [
        { label: 'Natural (default)', value: 'natural', price_delta: 0, sort_order: 1 },
        { label: 'Clear coat', value: 'clear_coat', price_delta: 0, sort_order: 2 },
        { label: 'Dark walnut', value: 'dark_walnut', price_delta: 3, sort_order: 3 },
      ],
    },
  ],
  stickers: [
    {
      option_key: 'sticker_size_type',
      label: 'Sticker Size',
      option_type: 'select',
      is_required: true,
      sort_order: 1,
      values: [
        { label: '1 x 1', value: '1x1', price_delta: 0, sort_order: 1 },
        { label: '2 x 2', value: '2x2', price_delta: 0, sort_order: 2 },
        { label: '3 x 3', value: '3x3', price_delta: 1.2, sort_order: 3 },
        { label: '4 x 4', value: '4x4', price_delta: 2.4, sort_order: 4 },
        { label: 'Custom', value: 'custom', price_delta: 0, sort_order: 5 },
      ],
    },
    {
      option_key: 'base_finish',
      label: 'Base Finish',
      option_type: 'select',
      is_required: true,
      sort_order: 2,
      values: [
        { label: 'Matte base', value: 'matte_base', price_delta: 0, sort_order: 1 },
        { label: 'Glossy base', value: 'glossy_base', price_delta: 0.2, sort_order: 2 },
        { label: 'Holographic base', value: 'holographic_base', price_delta: 0.75, sort_order: 3 },
      ],
    },
    {
      option_key: 'laminate_addon',
      label: 'Laminate Add-on',
      option_type: 'select',
      is_required: false,
      sort_order: 3,
      values: [
        { label: 'None', value: 'none', price_delta: 0, sort_order: 1 },
        { label: 'Matte laminate', value: 'matte_laminate', price_delta: 0.25, sort_order: 2 },
        { label: 'Gloss laminate', value: 'gloss_laminate', price_delta: 0.25, sort_order: 3 },
      ],
    },
    {
      option_key: 'artwork_file',
      label: 'Artwork Upload',
      option_type: 'file',
      is_required: true,
      sort_order: 4,
      help_text: 'Upload SVG, PNG, JPG, or PDF for your sticker artwork.',
    },
  ],
}

export function getCategoryOptionTemplate(categoryKey: string): OptionBlueprint[] {
  return CATEGORY_OPTION_TEMPLATES[categoryKey]?.map((entry) => ({
    ...entry,
    values: entry.values?.map((value) => ({ ...value })),
  })) ?? []
}
