'use client'

import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Badge from '@mui/material/Badge'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined'
import SearchIcon from '@mui/icons-material/Search'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import { alpha } from '@mui/material/styles'
import { useRouter } from 'next/navigation'
import { usePathname } from 'next/navigation'

import { brandTokens } from '@/theme/theme'

export interface AdminModuleLink {
  label: string
  href: string
  description: string
}

interface AdminShellProps {
  children: React.ReactNode
  notificationCount: number
  moduleLinks: AdminModuleLink[]
}

export function AdminShell({ children, notificationCount, moduleLinks }: AdminShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return moduleLinks.filter((mod) => {
      const hay = `${mod.label} ${mod.description} ${mod.href}`.toLowerCase()
      return hay.includes(q)
    })
  }, [query, moduleLinks])

  async function signOut() {
    await fetch('/api/admin/session', { method: 'DELETE' })
    router.replace('/admin/login')
    router.refresh()
  }

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: brandTokens.bgVoid }}>
      <Box
        component="header"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
          backgroundColor: alpha(brandTokens.bgSurface, 0.94),
          backdropFilter: 'blur(10px)',
        }}
      >
        <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, md: 3 }, py: 1.4, display: 'grid', gap: 1.2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.2, flexWrap: 'wrap' }}>
            <Typography sx={{ fontFamily: 'var(--font-cinzel, serif)', fontWeight: 700, color: brandTokens.forgeGold, fontSize: '1.02rem' }}>
              Admin Dashboard
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <IconButton aria-label="Notifications" sx={{ color: alpha(brandTokens.parchment, 0.8) }}>
                <Badge badgeContent={notificationCount > 0 ? notificationCount : undefined} color="primary">
                  <NotificationsOutlinedIcon fontSize="small" />
                </Badge>
              </IconButton>

              <Button variant="outlined" size="small" startIcon={<LogoutOutlinedIcon />} onClick={signOut}>
                Sign out
              </Button>
            </Box>
          </Box>

          <Box sx={{ position: 'relative' }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Quick search modules..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ fontSize: '1rem', mr: 0.7, color: alpha(brandTokens.parchment, 0.45) }} />,
              }}
            />

            {query.trim().length > 0 && (
              <Box
                sx={{
                  mt: 0.6,
                  border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
                  borderRadius: 1.2,
                  backgroundColor: alpha(brandTokens.bgSurface, 0.97),
                  overflow: 'hidden',
                }}
              >
                {filtered.length === 0 ? (
                  <Typography sx={{ px: 1.2, py: 1, color: alpha(brandTokens.parchment, 0.55), fontSize: '0.78rem' }}>
                    No modules match your search.
                  </Typography>
                ) : (
                  filtered.slice(0, 7).map((mod) => (
                    <Box
                      key={mod.href}
                      component="a"
                      href={mod.href}
                      sx={{
                        display: 'block',
                        textDecoration: 'none',
                        px: 1.2,
                        py: 0.95,
                        borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
                        '&:last-of-type': { borderBottom: 'none' },
                        '&:hover': { backgroundColor: alpha(brandTokens.parchment, 0.05) },
                      }}
                    >
                      <Typography sx={{ color: brandTokens.parchment, fontSize: '0.83rem', fontWeight: 600 }}>
                        {mod.label}
                      </Typography>
                      <Typography sx={{ color: alpha(brandTokens.parchment, 0.56), fontSize: '0.74rem' }}>
                        {mod.description}
                      </Typography>
                    </Box>
                  ))
                )}
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, md: 3 }, py: { xs: 2.4, md: 3 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '250px minmax(0, 1fr)' }, gap: 2.2 }}>
        <Box
          component="aside"
          sx={{
            border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
            borderRadius: 1.8,
            backgroundColor: alpha(brandTokens.bgSurface, 0.62),
            p: 1,
            height: 'fit-content',
          }}
        >
          {moduleLinks.map((mod) => {
            const active = pathname === mod.href
            return (
              <Box
                key={mod.href}
                component="a"
                href={mod.href}
                sx={{
                  display: 'block',
                  textDecoration: 'none',
                  borderRadius: 1,
                  px: 1,
                  py: 0.9,
                  mb: 0.5,
                  border: `1px solid ${active ? alpha(brandTokens.forgeGold, 0.45) : 'transparent'}`,
                  backgroundColor: active ? alpha(brandTokens.forgeGold, 0.12) : 'transparent',
                  '&:hover': { backgroundColor: alpha(brandTokens.parchment, 0.05) },
                }}
              >
                <Typography sx={{ color: active ? brandTokens.forgeGold : alpha(brandTokens.parchment, 0.84), fontSize: '0.81rem', fontWeight: 700 }}>
                  {mod.label}
                </Typography>
                <Typography sx={{ color: alpha(brandTokens.parchment, 0.52), fontSize: '0.7rem', mt: 0.15 }}>
                  {mod.description}
                </Typography>
              </Box>
            )
          })}
        </Box>

        <Box
          component="section"
          sx={{
            border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
            borderRadius: 1.8,
            backgroundColor: alpha(brandTokens.bgSurface, 0.58),
            p: { xs: 1.6, md: 2 },
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  )
}
