'use client'

import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import NextLink from 'next/link'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  if (items.length === 0) return null

  return (
    <Box
      component="nav"
      aria-label="Breadcrumb"
      sx={{
        borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.07)}`,
        backgroundColor: alpha(brandTokens.bgSurface, 0.5),
        overflowX: 'auto',
      }}
    >
      <Container maxWidth="lg">
        <Box
          component="ol"
          aria-label="You are here"
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            py: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {items.map((item, index) => {
            const isLast = index === items.length - 1
            return (
              <Box key={`${item.label}-${index}`} component="li" sx={{ display: 'flex', alignItems: 'center' }}>
                {index > 0 && (
                  <NavigateNextIcon
                    aria-hidden="true"
                    sx={{ color: alpha(brandTokens.parchment, 0.3), fontSize: '0.9rem', mx: 0.25 }}
                  />
                )}
                {isLast || !item.href ? (
                  <Typography
                    component="span"
                    aria-current={isLast ? 'page' : undefined}
                    sx={{
                      fontSize: '0.78rem',
                      color: isLast ? 'primary.light' : 'text.secondary',
                      fontWeight: isLast ? 500 : 400,
                      letterSpacing: '0.02em',
                    }}
                  >
                    {item.label}
                  </Typography>
                ) : (
                  <Link
                    component={NextLink}
                    href={item.href}
                    sx={{
                      fontSize: '0.78rem',
                      color: 'text.secondary',
                      textDecoration: 'none',
                      letterSpacing: '0.02em',
                      '&:hover': { color: 'text.primary' },
                      '&:focus-visible': {
                        outline: `2px solid ${brandTokens.forgeGold}`,
                        outlineOffset: '2px',
                        borderRadius: 1,
                      },
                    }}
                  >
                    {item.label}
                  </Link>
                )}
              </Box>
            )
          })}
        </Box>
      </Container>
    </Box>
  )
}
