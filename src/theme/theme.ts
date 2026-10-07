import { createTheme, alpha } from '@mui/material/styles'

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const FORGE_GOLD = '#C4921A'
const FORGE_GOLD_LIGHT = '#E8B84A'
const FORGE_GOLD_DARK = '#8A6510'
const RUBY_RED = '#9B1C1C'
const RUBY_RED_LIGHT = '#C44040'
const RUBY_RED_DARK = '#6B1010'
const COPPER = '#B87333'
const PARCHMENT = '#EDE0CC'
const PARCHMENT_MUTED = '#9E8A6A'
const BG_VOID = '#0C0A07'
const BG_SURFACE = '#161210'
const BG_ELEVATED = '#1E1A15'
const BG_CARD = '#231F19'

// ─── Contrast floors (SEPT_IMPLEMENTATION_PLAN §8.1 / §8.3 / §9.5 / §9.12) ─────

/**
 * Text-safe semantic tones.
 *
 * The vivid `main` values above are for *surfaces* (filled buttons and chips).
 * Used as **text** on a dark card they measure only 2.9–3.5:1 — error `#CF4040`
 * is 3.48:1 on `BG_CARD` — so labels, glyphs and outlined/text variants use these
 * lighter tones instead. All four clear 5:1 on `BG_CARD`, the app's lightest
 * surface. Asserted in `src/theme/theme.test.ts`.
 */
const RUBY_RED_TEXT = '#E0706F'
const WARNING_TEXT = '#E0A24A'
const SUCCESS_TEXT = '#7FB86E'
const INFO_TEXT = '#6FA6C9'

/**
 * The minimum alpha for muted text (the helper/instruction tier).
 *
 * `alpha(parchment, 0.35…0.5)` was the de-facto helper-text tier and measured
 * 2.72–4.36:1 — below the 4.5:1 floor for text at these sizes. 0.62 keeps every
 * site at ≥5.6:1 on `BG_CARD` and ≥6:1 on the storefront void, which is why this
 * single value is the whole fix for §8.3.
 *
 * Components pass the value inline (`sx={{ color: alpha(parchment, 0.62) }}`);
 * `src/theme/contrast-floor.test.ts` enforces the floor across `src/` so a new
 * component cannot quietly reintroduce a lower one.
 */
export const MIN_MUTED_TEXT_ALPHA = 0.62

/**
 * §8.5 — the 12px text floor, in rem.
 *
 * The audit's sub-12px tier (§8.5 / P3: 10.4px badges, 11.2px overlines) is a
 * *size* problem, not a colour problem: no readable text below 12px (0.75rem).
 * §7.12 lifted `overline` to it; Batch 9 swept the remaining ~50 `0.6–0.74rem`
 * sites across 26 files up to it. `src/theme/font-floor.test.ts` walks `src/` and
 * fails on any new `fontSize: '0.NNrem'` below this value, so a future component
 * cannot quietly reintroduce a smaller one.
 */
export const MIN_TEXT_SIZE_REM = 0.75

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: FORGE_GOLD,
      light: FORGE_GOLD_LIGHT,
      dark: FORGE_GOLD_DARK,
      contrastText: '#0C0A07',
    },
    secondary: {
      main: RUBY_RED,
      light: RUBY_RED_LIGHT,
      dark: RUBY_RED_DARK,
      contrastText: PARCHMENT,
    },
    background: {
      default: BG_VOID,
      paper: BG_SURFACE,
    },
    text: {
      primary: PARCHMENT,
      secondary: PARCHMENT_MUTED,
    },
    error: {
      main: '#CF4040',
      // Explicit, because MUI derives `contrastText` with a 3:1 threshold and
      // can therefore choose an unreadable pairing (§9.5: white on warning, and
      // the `Pending` chips measured 1.84:1).
      light: RUBY_RED_TEXT,
      contrastText: '#FFFFFF',
    },
    warning: {
      main: '#C97B22',
      light: WARNING_TEXT,
      // 5.97:1 — MUI's auto-derivation picked white here, which is 3.31:1.
      contrastText: '#0C0A07',
    },
    success: {
      main: '#4A7C3F',
      light: SUCCESS_TEXT,
      contrastText: '#FFFFFF',
    },
    info: {
      main: '#3A6B8A',
      light: INFO_TEXT,
      contrastText: '#FFFFFF',
    },
    divider: alpha(PARCHMENT, 0.12),
  },

  typography: {
    fontFamily: 'var(--font-inter, Inter, system-ui, sans-serif)',
    h1: {
      fontFamily: 'var(--font-cinzel, Cinzel, Georgia, serif)',
      fontWeight: 700,
      fontSize: 'clamp(2rem, 5vw, 3.5rem)',
      lineHeight: 1.15,
      letterSpacing: '0.02em',
    },
    h2: {
      fontFamily: 'var(--font-cinzel, Cinzel, Georgia, serif)',
      fontWeight: 600,
      fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)',
      lineHeight: 1.2,
      letterSpacing: '0.02em',
    },
    h3: {
      fontFamily: 'var(--font-cinzel, Cinzel, Georgia, serif)',
      fontWeight: 600,
      fontSize: 'clamp(1.25rem, 2.5vw, 1.875rem)',
      lineHeight: 1.25,
      letterSpacing: '0.01em',
    },
    h4: {
      fontFamily: 'var(--font-cinzel, Cinzel, Georgia, serif)',
      fontWeight: 600,
      fontSize: 'clamp(1.1rem, 2vw, 1.5rem)',
      lineHeight: 1.3,
    },
    h5: {
      fontFamily: 'var(--font-cinzel, Cinzel, Georgia, serif)',
      fontWeight: 600,
      fontSize: '1.25rem',
      lineHeight: 1.35,
    },
    h6: {
      fontFamily: 'var(--font-cinzel, Cinzel, Georgia, serif)',
      fontWeight: 600,
      fontSize: '1.1rem',
      lineHeight: 1.4,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.7,
      letterSpacing: '0.01em',
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.6,
    },
    caption: {
      fontSize: '0.75rem',
      letterSpacing: '0.04em',
      textTransform: 'uppercase' as const,
    },
    overline: {
      // §7.12: was 0.7rem (11.2px), below the 12px floor the audit measures. One
      // theme edit fixes all 11 overline sites on the homepage at once.
      fontSize: '0.75rem',
      letterSpacing: '0.12em',
      textTransform: 'uppercase' as const,
      fontWeight: 600,
    },
    button: {
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'none' as const,
    },
  },

  shape: {
    borderRadius: 6,
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { scrollBehavior: 'smooth' },
        body: {
          backgroundColor: BG_VOID,
          color: PARCHMENT,
          overflowX: 'hidden',
        },
        '::selection': {
          backgroundColor: alpha(FORGE_GOLD, 0.35),
          color: PARCHMENT,
        },
        ':focus-visible': {
          outline: `2px solid ${FORGE_GOLD}`,
          outlineOffset: '3px',
        },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 4,
          padding: '10px 24px',
          transition: 'all 0.2s ease',
          '&:focus-visible': {
            outline: `2px solid ${FORGE_GOLD}`,
            outlineOffset: '3px',
          },
          // §8.1 / §9.12 — the disabled floor, in one place.
          //
          // MUI's dark default is `color: rgba(255,255,255,0.3)`, which is ≈2.3:1
          // on a card, and `opacity` is left to the component — so a disabled
          // primary CTA kept painting the gold gradient with a near-invisible
          // label and still read as the live action. Both halves are fixed here:
          // a readable muted label and no fade.
          '&.Mui-disabled': {
            opacity: 1,
            color: alpha(PARCHMENT, MIN_MUTED_TEXT_ALPHA),
            borderColor: alpha(PARCHMENT, 0.18),
          },
        },
        containedPrimary: {
          background: `linear-gradient(135deg, ${FORGE_GOLD_DARK} 0%, ${FORGE_GOLD} 60%, ${FORGE_GOLD_LIGHT} 100%)`,
          color: '#0C0A07',
          fontWeight: 700,
          '&:hover': {
            background: `linear-gradient(135deg, ${FORGE_GOLD} 0%, ${FORGE_GOLD_LIGHT} 100%)`,
            transform: 'translateY(-1px)',
            boxShadow: `0 4px 20px ${alpha(FORGE_GOLD, 0.4)}`,
          },
          '@media (prefers-reduced-motion: reduce)': {
            '&:hover': { transform: 'none' },
          },
          // Stop the *gradient*, not the label: an explicit surface keeps the
          // computed contrast deterministic (5.6:1 for the label) instead of
          // depending on what is painted underneath.
          '&.Mui-disabled': {
            background: 'none',
            backgroundColor: BG_ELEVATED,
            color: alpha(PARCHMENT, MIN_MUTED_TEXT_ALPHA),
            boxShadow: `inset 0 0 0 1px ${alpha(PARCHMENT, 0.18)}`,
            '&:hover': { transform: 'none', boxShadow: `inset 0 0 0 1px ${alpha(PARCHMENT, 0.18)}` },
          },
        },
        outlinedPrimary: {
          borderColor: alpha(FORGE_GOLD, 0.6),
          color: FORGE_GOLD,
          '&:hover': {
            borderColor: FORGE_GOLD,
            backgroundColor: alpha(FORGE_GOLD, 0.08),
          },
          '&.Mui-disabled': {
            color: alpha(PARCHMENT, MIN_MUTED_TEXT_ALPHA),
            borderColor: alpha(PARCHMENT, 0.18),
          },
        },
        // §9.5: destructive actions are outlined/text more often than filled, and
        // `error.main` (#CF4040) is only 3.48:1 as text on a card.
        textError: { color: RUBY_RED_TEXT },
        outlinedError: { color: RUBY_RED_TEXT, borderColor: alpha(RUBY_RED_TEXT, 0.6) },
        sizeLarge: {
          padding: '14px 32px',
          fontSize: '1rem',
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          // §9.12: the disabled `Add Media` / `Upload file` controls were 30 %
          // white on a card (≈2.3:1). Same floor as text.
          '&.Mui-disabled': {
            color: alpha(PARCHMENT, MIN_MUTED_TEXT_ALPHA),
          },
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: BG_CARD,
          backgroundImage: 'none',
          border: `1px solid ${alpha(PARCHMENT, 0.08)}`,
          transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',
          },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 4,
        },
        colorPrimary: {
          backgroundColor: alpha(FORGE_GOLD, 0.15),
          color: FORGE_GOLD_LIGHT,
          border: `1px solid ${alpha(FORGE_GOLD, 0.3)}`,
        },
      },
    },

    MuiTextField: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '& fieldset': { borderColor: alpha(PARCHMENT, 0.2) },
            '&:hover fieldset': { borderColor: alpha(PARCHMENT, 0.4) },
            '&.Mui-focused fieldset': { borderColor: FORGE_GOLD },
          },
          '& label.Mui-focused': { color: FORGE_GOLD },
        },
      },
    },

    MuiLink: {
      styleOverrides: {
        root: {
          color: FORGE_GOLD_LIGHT,
          textDecorationColor: alpha(FORGE_GOLD_LIGHT, 0.4),
          '&:hover': { color: FORGE_GOLD, textDecorationColor: FORGE_GOLD },
          '&:focus-visible': {
            outline: `2px solid ${FORGE_GOLD}`,
            outlineOffset: '3px',
            borderRadius: 2,
          },
        },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: { borderColor: alpha(PARCHMENT, 0.1) },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: BG_ELEVATED,
          border: `1px solid ${alpha(PARCHMENT, 0.15)}`,
          color: PARCHMENT,
          fontSize: '0.8rem',
        },
      },
    },
  },
})

// Named exports for use in sx props / styled components
export const brandTokens = {
  forgeGold: FORGE_GOLD,
  forgeGoldLight: FORGE_GOLD_LIGHT,
  forgeGoldDark: FORGE_GOLD_DARK,
  rubyRed: RUBY_RED,
  /**
   * Text-safe ruby red (§9.5). Use this — not `rubyRed`/`#CF4040` — whenever the
   * colour is a label or glyph on a dark surface (3.48:1 vs 5.24:1 on BG_CARD).
   */
  rubyRedText: RUBY_RED_TEXT,
  warningText: WARNING_TEXT,
  successText: SUCCESS_TEXT,
  infoText: INFO_TEXT,
  copper: COPPER,
  parchment: PARCHMENT,
  parchmentMuted: PARCHMENT_MUTED,
  bgVoid: BG_VOID,
  bgSurface: BG_SURFACE,
  bgElevated: BG_ELEVATED,
  bgCard: BG_CARD,
}

export default theme
