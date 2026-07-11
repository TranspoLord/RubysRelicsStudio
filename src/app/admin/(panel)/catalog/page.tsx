'use client'

import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Grid from '@mui/material/Grid2'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import Link from 'next/link'

import { brandTokens } from '@/theme/theme'

interface CatalogStats {
  totalProducts: number
  activeProducts: number
  draftProducts: number
  archivedProducts: number
  totalCategories: number
  visibleCategories: number
  activeDeals: number
  activePromoCodes: number
}

export default function CatalogDashboardPage() {
  const [stats, setStats] = useState<CatalogStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/admin/catalog/stats', { cache: 'no-store' })
        const data = await res.json()
        setStats(data)
      } catch (error) {
        console.error('Failed to load catalog stats:', error)
      } finally {
        setLoading(false)
      }
    }

    void fetchStats()
  }, [])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Box>
        <Typography variant="h4" component="h1" sx={{ mb: 0.5 }}>
          Catalog
        </Typography>
        <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
          Manage products, categories, pricing, and promotions from this hub.
        </Typography>
      </Box>

      {stats && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ borderRadius: 1 }}>
              <CardContent>
                <Typography color="textSecondary" sx={{ fontSize: '0.875rem', mb: 0.5 }}>
                  Total Products
                </Typography>
                <Typography variant="h5">{stats.totalProducts}</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: alpha(brandTokens.parchment, 0.5), mt: 0.5 }}>
                  {stats.activeProducts} active | {stats.draftProducts} draft
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ borderRadius: 1 }}>
              <CardContent>
                <Typography color="textSecondary" sx={{ fontSize: '0.875rem', mb: 0.5 }}>
                  Categories
                </Typography>
                <Typography variant="h5">{stats.totalCategories}</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: alpha(brandTokens.parchment, 0.5), mt: 0.5 }}>
                  {stats.visibleCategories} visible
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ borderRadius: 1 }}>
              <CardContent>
                <Typography color="textSecondary" sx={{ fontSize: '0.875rem', mb: 0.5 }}>
                  Promotions
                </Typography>
                <Typography variant="h5">{stats.activeDeals + stats.activePromoCodes}</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: alpha(brandTokens.parchment, 0.5), mt: 0.5 }}>
                  {stats.activeDeals} deals | {stats.activePromoCodes} codes
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ borderRadius: 1 }}>
              <CardContent>
                <Typography color="textSecondary" sx={{ fontSize: '0.875rem', mb: 0.5 }}>
                  Archived
                </Typography>
                <Typography variant="h5">{stats.archivedProducts}</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: alpha(brandTokens.parchment, 0.5), mt: 0.5 }}>
                  products
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Box>
        <Typography variant="h6" sx={{ mb: 1.5 }}>
          Quick Actions
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Link href="/admin/catalog/products" style={{ textDecoration: 'none' }}>
            <Button variant="outlined">Manage Products</Button>
          </Link>
          <Link href="/admin/catalog/categories" style={{ textDecoration: 'none' }}>
            <Button variant="outlined">Manage Categories</Button>
          </Link>
          <Link href="/admin/catalog/processes" style={{ textDecoration: 'none' }}>
            <Button variant="outlined">Manage Processes</Button>
          </Link>
          <Link href="/admin/catalog/pricing" style={{ textDecoration: 'none' }}>
            <Button variant="outlined">Manage Pricing & Deals</Button>
          </Link>
        </Stack>
      </Box>
    </Box>
  )
}
