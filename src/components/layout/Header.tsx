'use client'

import { useState, useEffect, useRef } from 'react'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Toolbar from '@mui/material/Toolbar'
import IconButton from '@mui/material/IconButton'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Badge from '@mui/material/Badge'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import Button from '@mui/material/Button'
import MenuIcon from '@mui/icons-material/Menu'
import CloseIcon from '@mui/icons-material/Close'
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined'
import SearchIcon from '@mui/icons-material/Search'
import Link from 'next/link'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'
import { useCart } from '@/components/cart/CartProvider'
import { SearchModal } from '@/components/search/SearchModal'

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Shop', href: '/shop' },
  { label: 'Custom Orders', href: '/custom-orders' },
  { label: 'Resources', href: '/resources' },
  { label: 'About', href: '/about' },
]

interface HeaderProps {
  cartItemCount?: number
  currentPath?: string
}

export function Header({ cartItemCount = 0, currentPath = '/' }: HeaderProps) {
  const cart = useCart()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  const effectiveCartCount = cartItemCount > 0 ? cartItemCount : cart.itemCount

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawerOpen) {
        setDrawerOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [drawerOpen])

  const handleDrawerClose = () => {
    setDrawerOpen(false)
    menuButtonRef.current?.focus()
  }

  return (
    <AppBar
      component="header"
      position="sticky"
      elevation={0}
      role="banner"
      sx={{
        backgroundColor: scrolled
          ? alpha(brandTokens.bgSurface, 0.96)
          : alpha(brandTokens.bgVoid, 0.9),
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${alpha(brandTokens.parchment, scrolled ? 0.12 : 0.06)}`,
        transition: 'background-color 0.3s ease, border-color 0.3s ease',
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
        },
      }}
    >
      <Toolbar
        sx={{
          maxWidth: 1280,
          width: '100%',
          mx: 'auto',
          px: { xs: 2, md: 4 },
          minHeight: { xs: 64, md: 72 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { md: 4 } }}>
          <Box
            component={Link}
            href="/"
            aria-label="Ruby's Relics — return to homepage"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              textDecoration: 'none',
              mr: { md: 2 },
            }}
          >
            <Box
              aria-hidden="true"
              sx={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${brandTokens.rubyRed} 0%, ${brandTokens.forgeGold} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
                flexShrink: 0,
              }}
            >
              🔥
            </Box>
            <Box>
              <Typography
                component="span"
                sx={{
                  fontFamily: 'var(--font-cinzel, Cinzel, serif)',
                  fontWeight: 700,
                  fontSize: { xs: '1rem', md: '1.1rem' },
                  background: `linear-gradient(135deg, ${brandTokens.forgeGoldDark}, ${brandTokens.forgeGold}, ${brandTokens.forgeGoldLight})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  letterSpacing: '0.04em',
                  display: 'block',
                  lineHeight: 1.1,
                }}
              >
                Ruby&apos;s Relics
              </Typography>
              <Typography
                component="span"
                sx={{
                  fontSize: '0.6rem',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: brandTokens.parchmentMuted,
                  display: { xs: 'none', sm: 'block' },
                  lineHeight: 1,
                }}
              >
                Studio
              </Typography>
            </Box>
          </Box>

          <Box
            component="nav"
            aria-label="Main navigation"
            sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5 }}
          >
            {NAV_LINKS.map((link) => {
              const active = currentPath === link.href
              return (
                <Button
                  key={link.href}
                  component={Link}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  sx={{
                    color: active ? 'primary.main' : 'text.secondary',
                    fontWeight: active ? 600 : 400,
                    fontSize: '0.875rem',
                    letterSpacing: '0.04em',
                    px: 1.5,
                    py: 1,
                    borderRadius: 1,
                    '&:hover': {
                      color: 'text.primary',
                      backgroundColor: alpha(brandTokens.parchment, 0.05),
                    },
                  }}
                >
                  {link.label}
                </Button>
              )
            })}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton
            aria-label="Search"
            onClick={() => setSearchModalOpen(true)}
            size="medium"
            sx={{
              color: 'text.secondary',
              display: { xs: 'none', sm: 'inline-flex' },
              '&:hover': { color: 'text.primary' },
            }}
          >
            <SearchIcon fontSize="small" />
          </IconButton>

          <IconButton
            aria-label={`Shopping cart, ${effectiveCartCount} item${effectiveCartCount !== 1 ? 's' : ''}`}
            onClick={() => {
              if (cart.drawerOpen) {
                cart.closeDrawer()
                return
              }
              cart.openDrawer()
            }}
            size="medium"
            sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
          >
            <Badge
              badgeContent={effectiveCartCount > 0 ? effectiveCartCount : undefined}
              color="primary"
              sx={{
                '& .MuiBadge-badge': {
                  fontSize: '0.65rem',
                  minWidth: 16,
                  height: 16,
                  padding: '0 4px',
                },
              }}
            >
              <ShoppingCartOutlinedIcon fontSize="small" />
            </Badge>
          </IconButton>

          <IconButton
            ref={menuButtonRef}
            aria-label={drawerOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav-drawer"
            onClick={() => setDrawerOpen(true)}
            size="medium"
            sx={{
              display: { xs: 'inline-flex', md: 'none' },
              color: 'text.secondary',
              ml: 0.5,
            }}
          >
            <MenuIcon />
          </IconButton>
        </Box>
      </Toolbar>

      <Drawer
        id="mobile-nav-drawer"
        anchor="right"
        open={drawerOpen}
        onClose={handleDrawerClose}
        role="dialog"
        aria-label="Navigation menu"
        aria-modal="true"
        PaperProps={{
          sx: {
            width: 280,
            backgroundColor: brandTokens.bgSurface,
            backgroundImage: 'none',
            borderLeft: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
            pt: 2,
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, mb: 1 }}>
          <IconButton
            onClick={handleDrawerClose}
            aria-label="Close navigation menu"
            sx={{ color: 'text.secondary' }}
            autoFocus
          >
            <CloseIcon />
          </IconButton>
        </Box>

        <Box
          sx={{
            px: 3,
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Box aria-hidden="true" sx={{ fontSize: '1.2rem' }}>
            🔥
          </Box>
          <Typography
            sx={{
              fontFamily: 'var(--font-cinzel, serif)',
              fontWeight: 700,
              fontSize: '1rem',
              color: 'primary.main',
            }}
          >
            Ruby&apos;s Relics Studio
          </Typography>
        </Box>

        <Divider sx={{ mb: 1 }} />

        <List component="nav" aria-label="Mobile navigation" disablePadding>
          {NAV_LINKS.map((link) => {
            const active = currentPath === link.href
            return (
              <ListItem key={link.href} disablePadding>
                <ListItemButton
                  component={Link}
                  href={link.href}
                  onClick={handleDrawerClose}
                  aria-current={active ? 'page' : undefined}
                  sx={{
                    px: 3,
                    py: 1.5,
                    color: active ? 'primary.main' : 'text.primary',
                    fontWeight: active ? 600 : 400,
                    borderLeft: active
                      ? `3px solid ${brandTokens.forgeGold}`
                      : '3px solid transparent',
                  }}
                >
                  <ListItemText
                    primary={link.label}
                    primaryTypographyProps={{ fontSize: '1rem' }}
                  />
                </ListItemButton>
              </ListItem>
            )
          })}
        </List>

        <Box sx={{ px: 3, mt: 3 }}>
          <Button
            component={Link}
            href="/custom-orders"
            onClick={handleDrawerClose}
            variant="contained"
            color="primary"
            fullWidth
            sx={{ py: 1.25 }}
          >
            Request a Custom Order
          </Button>
        </Box>
      </Drawer>

      <SearchModal open={searchModalOpen} onClose={() => setSearchModalOpen(false)} />
    </AppBar>
  )
}
