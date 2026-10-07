'use client'

import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Badge from '@mui/material/Badge'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined'
import SearchIcon from '@mui/icons-material/Search'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import { alpha } from '@mui/material/styles'
import { useRouter } from 'next/navigation'
import { usePathname } from 'next/navigation'

import { brandTokens } from '@/theme/theme'
import { useAuth } from '@/components/auth/AuthProvider'
import { activeAdminModuleLabel, resolveActiveAdminHref } from '@/lib/admin/module-nav'

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

interface AdminNotificationRow {
  id: string
  title: string
  body: string | null
  href: string | null
  is_read: boolean
  created_at: string
}

interface AdminSearchResult {
  type: 'order' | 'product' | 'custom_request' | 'module'
  id: string
  title: string
  subtitle: string
  href: string
}

function panelSurface(tint: string, surfaceAlpha = 0.98, tintAlpha = 0.06) {
  return `linear-gradient(135deg, ${alpha(brandTokens.bgCard, surfaceAlpha)} 0%, ${alpha(tint, tintAlpha)} 100%)`
}

export function AdminShell({ children, notificationCount, moduleLinks }: AdminShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { signOut: signOutSupabase, signOutOthers } = useAuth()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [remoteResults, setRemoteResults] = useState<AdminSearchResult[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notifications, setNotifications] = useState<AdminNotificationRow[]>([])
  const [unreadCount, setUnreadCount] = useState(notificationCount)
  const [signingOutOthers, setSigningOutOthers] = useState(false)

  /**
   * §9.6: the active module is the longest href this path is equal to or nested
   * under, so `/admin/catalog/products/<id>/builder` keeps Catalog marked instead
   * of showing no active module at all (the pre-fix behaviour was a strict
   * `pathname === href`). Logic lives in `src/lib/admin/module-nav.ts`, where it
   * is unit-tested.
   */
  const activeModuleHref = useMemo(
    () => resolveActiveAdminHref(pathname, moduleLinks.map((mod) => mod.href)),
    [pathname, moduleLinks]
  )

  /**
   * §9.10: the sticky bar said "Admin Dashboard" on every route, and every route
   * shared one document title, so tabs/bookmarks/history were indistinguishable.
   * Both now follow the active module. The title is set client-side because the
   * panel's pages are a mix of server and client components and a client
   * component cannot export `metadata`; the SSR title stays the layout default
   * until hydration (see OCT_IMPLEMENTATION_PLAN.md → OCT-20 for the
   * per-route-metadata alternative).
   */
  const activeModuleLabel = useMemo(
    () => activeAdminModuleLabel(pathname, moduleLinks),
    [pathname, moduleLinks]
  )

  useEffect(() => {
    document.title = `${activeModuleLabel ?? 'Admin'} | Ruby's Relics Studio`
  }, [activeModuleLabel])

  const moduleMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return moduleLinks
      .filter((mod) => {
      const hay = `${mod.label} ${mod.description} ${mod.href}`.toLowerCase()
      return hay.includes(q)
    })
      .slice(0, 7)
      .map((mod) => ({
        type: 'module' as const,
        id: mod.href,
        title: mod.label,
        subtitle: mod.description,
        href: mod.href,
      }))
  }, [query, moduleLinks])

  const mergedResults = useMemo(() => {
    if (query.trim().length === 0) return []
    return [...moduleMatches, ...remoteResults].slice(0, 12)
  }, [moduleMatches, remoteResults, query])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setRemoteResults([])
      return
    }

    const timeout = setTimeout(async () => {
      try {
        setSearching(true)
        const params = new URLSearchParams({ q })
        const response = await fetch(`/api/admin/search?${params.toString()}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          setRemoteResults([])
          return
        }
        setRemoteResults(Array.isArray(payload?.results) ? payload.results : [])
      } catch {
        setRemoteResults([])
      } finally {
        setSearching(false)
      }
    }, 180)

    return () => clearTimeout(timeout)
  }, [query])

  async function loadNotifications() {
    setNotificationsLoading(true)
    try {
      const response = await fetch('/api/admin/notifications', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotifications([])
        setNotificationsOpen(false)
        return
      }
      const nextNotifications = Array.isArray(payload?.notifications) ? payload.notifications : []
      setNotifications(nextNotifications)
      setUnreadCount(typeof payload?.unreadCount === 'number' ? payload.unreadCount : 0)
      if (nextNotifications.length === 0) {
        setNotificationsOpen(false)
      }
    } finally {
      setNotificationsLoading(false)
    }
  }

  async function markNotificationRead(notificationId: string) {
    await fetch('/api/admin/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_read', notificationId }),
    })
    await loadNotifications()
  }

  async function markAllNotificationsRead() {
    await fetch('/api/admin/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_all_read' }),
    })
    await loadNotifications()
  }

  async function handleSignOut() {
    // Supabase's signOut() revokes the refresh token server-side, so this is a
    // real revocation — the retired custom cookie's "sign out" never was (§1.6).
    await signOutSupabase()
    router.replace('/admin/login')
    router.refresh()
  }

  async function handleSignOutOthers() {
    // §10.17: revoke every session except this one. Keeps the current device,
    // kills the rest; no confirmation needed because it can't lock the admin out.
    if (signingOutOthers) return
    setSigningOutOthers(true)
    try {
      await signOutOthers()
    } finally {
      setSigningOutOthers(false)
    }
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
        <Box sx={{ maxWidth: 1520, mx: 'auto', px: { xs: 2, md: 3 }, py: 1.4, display: 'grid', gap: 1.2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.2, flexWrap: 'wrap' }}>
            <Typography sx={{ fontFamily: 'var(--font-cinzel, serif)', fontWeight: 700, color: brandTokens.forgeGold, fontSize: '1.02rem' }}>
              {activeModuleLabel ?? 'Admin Dashboard'}
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <IconButton
                aria-label="Notifications"
                sx={{ color: alpha(brandTokens.parchment, 0.8) }}
                onClick={() => {
                  const next = !notificationsOpen
                  setNotificationsOpen(next)
                  if (next) {
                    void loadNotifications()
                  }
                }}
              >
                <Badge badgeContent={unreadCount > 0 ? unreadCount : undefined} color="primary">
                  <NotificationsOutlinedIcon fontSize="small" />
                </Badge>
              </IconButton>

              <Button
                variant="text"
                size="small"
                onClick={handleSignOutOthers}
                disabled={signingOutOthers}
                sx={{ color: alpha(brandTokens.parchment, 0.7) }}
              >
                {signingOutOthers ? 'Signing out…' : 'Sign out other sessions'}
              </Button>

              <Button variant="outlined" size="small" startIcon={<LogoutOutlinedIcon />} onClick={handleSignOut}>
                Sign out
              </Button>
            </Box>
          </Box>

          {notificationsOpen && (
            <Box
              sx={{
                border: `1px solid ${alpha(brandTokens.forgeGold, 0.16)}`,
                borderRadius: 1.2,
                background: panelSurface(brandTokens.parchment, 0.985, 0.065),
                overflow: 'hidden',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.2, py: 0.9 }}>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>
                  Notifications
                </Typography>
                <Button size="small" onClick={() => void markAllNotificationsRead()}>
                  Mark all read
                </Button>
              </Box>

              {notificationsLoading ? (
                <Box sx={{ px: 1.2, py: 1.2, display: 'flex', justifyContent: 'center' }}>
                  <CircularProgress size={18} />
                </Box>
              ) : notifications.length === 0 ? (
                <Typography sx={{ px: 1.2, py: 1, color: alpha(brandTokens.parchment, 0.62), fontSize: '0.78rem' }}>
                  No notifications right now.
                </Typography>
              ) : (
                notifications.map((note) => (
                  <Box
                    key={note.id}
                    sx={{
                      px: 1.2,
                      py: 0.95,
                      borderTop: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
                      backgroundColor: note.is_read ? 'transparent' : alpha(brandTokens.forgeGold, 0.08),
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ color: brandTokens.parchment, fontSize: '0.8rem', fontWeight: 700 }}>
                          {note.title}
                        </Typography>
                        {note.body && (
                          <Typography
                            sx={{
                              color: alpha(brandTokens.parchment, 0.62),
                              // §8.5 (Batch 8): was 0.74rem = 11.84px. Latent —
                              // only renders for a notification that has a body,
                              // so the capture (no such notification) never saw it.
                              fontSize: '0.75rem',
                            }}
                          >
                            {note.body}
                          </Typography>
                        )}
                      </Box>
                      {!note.is_read && (
                        <Button size="small" onClick={() => void markNotificationRead(note.id)}>Read</Button>
                      )}
                    </Box>
                    {note.href && (
                      <Box
                        component="a"
                        href={note.href}
                        sx={{
                          color: brandTokens.forgeGold,
                          // §8.5 (Batch 8): was 0.72rem = 11.52px (latent — a
                          // notification link, absent in the captured state).
                          fontSize: '0.75rem',
                          textDecoration: 'none',
                        }}
                      >
                        Open
                      </Box>
                    )}
                  </Box>
                ))
              )}
            </Box>
          )}

          <Box sx={{ position: 'relative' }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Global quick search (orders, products, custom requests)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // §9.7: the field was placeholder-only, so the input had no
              // accessible name on all 23 routes.
              inputProps={{ 'aria-label': 'Search orders, products and custom requests' }}
              InputProps={{
                startAdornment: <SearchIcon sx={{ fontSize: '1rem', mr: 0.7, color: alpha(brandTokens.parchment, 0.62) }} />,
              }}
            />

            {query.trim().length > 0 && (
              <Box
                sx={{
                  mt: 0.6,
                  border: `1px solid ${alpha(brandTokens.copper, 0.16)}`,
                  borderRadius: 1.2,
                  background: panelSurface(brandTokens.forgeGold, 0.985, 0.055),
                  overflow: 'hidden',
                }}
              >
                {mergedResults.length === 0 ? (
                  <Typography sx={{ px: 1.2, py: 1, color: alpha(brandTokens.parchment, 0.62), fontSize: '0.78rem' }}>
                    {searching ? 'Searching...' : 'No results matched your search.'}
                  </Typography>
                ) : (
                  mergedResults.map((result) => (
                    <Box
                      key={`${result.type}:${result.id}`}
                      component="a"
                      href={result.href}
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
                        {result.title}
                      </Typography>
                      <Typography
                        sx={{
                          color: alpha(brandTokens.parchment, 0.62),
                          // §8.5 (Batch 8): was 0.74rem = 11.84px (latent — the
                          // global search results modal, which no capture opens).
                          fontSize: '0.75rem',
                        }}
                      >
                        [{result.type}] {result.subtitle}
                      </Typography>
                    </Box>
                  ))
                )}
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      <Box sx={{ maxWidth: 1520, mx: 'auto', px: { xs: 2, md: 3 }, py: { xs: 2.4, md: 3 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '280px minmax(0, 1fr)' }, gap: 2.2, overflow: 'visible' }}>
        <Box
          component="nav"
          aria-label="Admin modules"
          sx={{
            border: `1px solid ${alpha(brandTokens.rubyRed, 0.14)}`,
            borderRadius: 1.8,
            background: panelSurface(brandTokens.copper, 0.72, 0.055),
            p: 1,
            height: 'fit-content',
          }}
        >
          {moduleLinks.map((mod) => {
            const active = mod.href === activeModuleHref
            return (
              <Box
                key={mod.href}
                component="a"
                href={mod.href}
                aria-current={active ? 'page' : undefined}
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
                <Typography
                  sx={{
                    color: alpha(brandTokens.parchment, 0.62),
                    // §8.5 (Batch 8): was 0.7rem = 11.2px. Batch 4 fixed these
                    // descriptions' *colour* (§9.5) but not their size, so the 12
                    // of them on every admin page stayed the smallest text in the
                    // panel — below the 12px floor the audit measures. Same fix as
                    // §7.12's `overline` (0.7rem → 0.75rem).
                    fontSize: '0.75rem',
                    mt: 0.15,
                  }}
                >
                  {mod.description}
                </Typography>
              </Box>
            )
          })}
        </Box>

        <Box
          component="main"
          id="main-content"
          sx={{
            border: `1px solid ${alpha(brandTokens.forgeGold, 0.12)}`,
            borderRadius: 1.8,
            background: panelSurface(brandTokens.parchment, 0.7, 0.055),
            p: { xs: 1.6, md: 2 },
            overflow: 'visible',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  )
}
