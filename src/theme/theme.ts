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
    },
    warning: {
      main: '#C97B22',
    },
    success: {
      main: '#4A7C3F',
    },
    info: {
      main: '#3A6B8A',
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
      fontSize: '0.7rem',
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
        },
        outlinedPrimary: {
          borderColor: alpha(FORGE_GOLD, 0.6),
          color: FORGE_GOLD,
          '&:hover': {
            borderColor: FORGE_GOLD,
            backgroundColor: alpha(FORGE_GOLD, 0.08),
          },
        },
        sizeLarge: {
          padding: '14px 32px',
          fontSize: '1rem',
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
  copper: COPPER,
  parchment: PARCHMENT,
  parchmentMuted: PARCHMENT_MUTED,
  bgVoid: BG_VOID,
  bgSurface: BG_SURFACE,
  bgElevated: BG_ELEVATED,
  bgCard: BG_CARD,
}

export default theme
