'use client'

import Box from '@mui/material/Box'
import Link from '@mui/material/Link'

export function SkipToMain() {
  return (
    <Box
      component="a"
      href="#main-content"
      sx={{
        position: 'absolute',
        top: '-100px',
        left: 16,
        zIndex: 9999,
        px: 3,
        py: 1.5,
        backgroundColor: 'primary.main',
        color: '#0C0A07',
        fontWeight: 700,
        fontSize: '0.875rem',
        borderRadius: 1,
        textDecoration: 'none',
        transition: 'top 0.2s',
        '&:focus': {
          top: 16,
        },
      }}
    >
      Skip to main content
    </Box>
  )
}
