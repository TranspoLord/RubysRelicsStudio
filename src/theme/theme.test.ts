import { describe, expect, it } from 'vitest'

import theme from '@/theme/theme'

/**
 * The gold CTA is the site's primary conversion action, so its label colour is a
 * brand invariant, not a styling detail. §8.2/§9.2 measured two places that
 * bypassed it with `color: '#fff'` (2.81:1 on the storefront banner, 1.67:1 in
 * the panel, where the banner sits on a darker backdrop) — the theme's own
 * `primary.contrastText` was already correct.
 *
 * Asserting the *palette* here means any hard-coded override elsewhere is
 * measurably wrong rather than a matter of taste, and the ratio check below
 * fails if a future palette edit lightens either side.
 */

function channelToLinear(channel: number): number {
  const srgb = channel / 255
  return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4)
}

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((offset) =>
    channelToLinear(Number.parseInt(value.slice(offset, offset + 2), 16))
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a
  )
  return (lighter + 0.05) / (darker + 0.05)
}

const containedPrimary = theme.components?.MuiButton?.styleOverrides?.containedPrimary as
  | Record<string, unknown>
  | undefined

describe('primary CTA label colour (§8.2 / §9.2)', () => {
  it('uses the palette contrastText token, not a hard-coded white', () => {
    expect(theme.palette.primary.contrastText).toBe('#0C0A07')
    expect(containedPrimary?.color).toBe(theme.palette.primary.contrastText)
  })

  it('clears WCAG AA against the lightest stop of the gold gradient', () => {
    const label = String(containedPrimary?.color)
    // The gradient runs dark → main → light, so the lightest stop is the worst
    // case for a dark label.
    expect(contrastRatio(label, '#E8B84A')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(label, '#C4921A')).toBeGreaterThanOrEqual(4.5)
  })

  it('shows why the old override failed — white on the same gold is under 3:1', () => {
    // Keeps the measurement in the repo: this is the ratio §8.2 filed.
    expect(contrastRatio('#FFFFFF', '#C4921A')).toBeLessThan(3)
  })
})

// ─── §8.1 / §8.3 / §9.5 / §9.12 contrast floor ─────────────────────────────────

/**
 * §8.1's defect was a *composite*: the gold gradient kept painting behind a
 * 30 %-white label, so no single palette value described what the user saw. The
 * theme-level assertions below therefore resolve alpha over the surface the token
 * is actually painted on — the same computation the audit did by sampling pixels
 * — instead of trusting a value in isolation.
 */
function parseColor(value: string): { r: number; g: number; b: number; a: number } {
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value)
  if (rgba) {
    const [r, g, b, a = '1'] = rgba[1].split(',').map((part) => part.trim())
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) }
  }
  const hex = value.replace('#', '')
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
    a: 1,
  }
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
}

/** Resolves a possibly-translucent colour over an opaque surface. */
function alphaOver(foreground: string, background: string): string {
  const fg = parseColor(foreground)
  const bg = parseColor(background)
  if (fg.a >= 1) return toHex(fg)
  return toHex({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  })
}

/** The app's surfaces, lightest first — worst case for light-on-dark text. */
const SURFACES_BY_LIGHTNESS = ['#231F19', '#1E1A15', '#161210', '#0C0A07']

const mutedTextRule = (
  theme.components?.MuiButton?.styleOverrides?.root as Record<string, unknown> | undefined
)?.['&.Mui-disabled'] as Record<string, unknown> | undefined

const containedDisabled = containedPrimary?.['&.Mui-disabled'] as
  | Record<string, unknown>
  | undefined

describe('muted text floor (§8.3 / §9.5)', () => {
  it('keeps the floor at or above 0.62 — it may only move up', async () => {
    const { MIN_MUTED_TEXT_ALPHA } = await import('@/theme/theme')
    expect(MIN_MUTED_TEXT_ALPHA).toBeGreaterThanOrEqual(0.62)
  })

  it('clears 4.5:1 on every surface, composited', () => {
    const muted = String(mutedTextRule?.color)
    expect(muted).toMatch(/^rgba?\(/)
    for (const surface of SURFACES_BY_LIGHTNESS) {
      expect(contrastRatio(alphaOver(muted, surface), surface)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('shows the old tier failed on the card, which is why it was raised', () => {
    // 0.4 was the most common value in the sweep (e.g. ProductConfigurator help text).
    const old = alphaOver('rgba(237, 224, 204, 0.4)', '#231F19')
    expect(contrastRatio(old, '#231F19')).toBeLessThan(4.5)
  })
})

describe('disabled state (§8.1 / §9.12)', () => {
  it('stops painting the gradient and gives the disabled CTA its own surface', () => {
    expect(containedDisabled?.background).toBe('none')
    expect(containedDisabled?.backgroundColor).toBe('#1E1A15')
    // opacity 1 is intentional: the old 30 %-white label was invisible *and* the
    // fading made the button look like the live action.
    expect(mutedTextRule?.opacity).toBe(1)
  })

  it('keeps the disabled label legible on that surface', () => {
    const label = alphaOver(String(containedDisabled?.color), '#1E1A15')
    expect(contrastRatio(label, '#1E1A15')).toBeGreaterThanOrEqual(4.5)
  })

  it('shows the defect it replaces — white at 30 % on the live gradient', () => {
    // ≈1.4:1 at the gradient's light end, the value §8.1 filed.
    const ghostLabel = alphaOver('rgba(255, 255, 255, 0.3)', '#C4921A')
    expect(contrastRatio(ghostLabel, '#C4921A')).toBeLessThan(2)
  })

  it('gives the disabled icon button the same floor', () => {
    const iconButtonRoot = theme.components?.MuiIconButton?.styleOverrides?.root as
      | Record<string, unknown>
      | undefined
    const iconDisabled = iconButtonRoot?.['&.Mui-disabled'] as Record<string, unknown> | undefined
    const icon = alphaOver(String(iconDisabled?.color), '#231F19')
    expect(contrastRatio(icon, '#231F19')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('semantic colours (§9.5)', () => {
  it('pins contrastText so MUI cannot derive an unreadable pairing', () => {
    // The `Pending` chip was white on warning (3.31:1) purely because MUI's
    // auto-derivation uses a 3:1 threshold.
    expect(theme.palette.warning.contrastText).toBe('#0C0A07')
    expect(contrastRatio(theme.palette.warning.contrastText, theme.palette.warning.main)).toBeGreaterThanOrEqual(4.5)
    for (const key of ['error', 'success', 'info'] as const) {
      expect(
        contrastRatio(theme.palette[key].contrastText, theme.palette[key].main)
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('gives every semantic colour a text-safe tone for dark surfaces', () => {
    for (const key of ['error', 'warning', 'success', 'info'] as const) {
      expect(contrastRatio(theme.palette[key].light, '#231F19')).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('shows why the vivid tones cannot be used as text', () => {
    expect(contrastRatio('#CF4040', '#231F19')).toBeLessThan(4.5)
    expect(contrastRatio('#4A7C3F', '#231F19')).toBeLessThan(4.5)
    expect(contrastRatio('#3A6B8A', '#231F19')).toBeLessThan(4.5)
  })

  it('routes destructive text buttons through the text-safe red', () => {
    const textError = theme.components?.MuiButton?.styleOverrides?.textError as
      | Record<string, unknown>
      | undefined
    expect(textError?.color).toBe(theme.palette.error.light)
  })
})


describe('text size floor (§8.5)', () => {
  it('keeps the floor at 0.75rem — it may only move up', async () => {
    const { MIN_TEXT_SIZE_REM } = await import('@/theme/theme')
    expect(MIN_TEXT_SIZE_REM).toBeGreaterThanOrEqual(0.75)
  })
})

