import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { getFutureProductNotifySettings } from '@/lib/storefront-settings'
import { safeLogError } from '@/lib/security/logger'
import { brandTokens } from '@/theme/theme'

export const metadata: Metadata = {
  title: 'Future Products',
  description: 'See what is coming next and tell us what you want to see.',
}

export const dynamic = 'force-dynamic'

interface FutureProductItem {
  id: string
  title: string
  description: string | null
  estimated_release: string | null
  category_key: string | null
  status_id: string | null
  status_label?: string | null
  status_color?: string | null
  media_url: string | null
  media_alt: string | null
  is_visible: boolean
  sort_order: number | null
}

async function getFutureProducts() {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_future_products')
      .select('id, title, description, estimated_release, category_key, status_id, media_url, media_alt, is_visible, sort_order, exp_future_product_statuses(label, color)')
      .eq('is_visible', true)
      .order('sort_order', { ascending: true })

    if (error) {
      safeLogError('[future-products:page]', error)
      return [] as FutureProductItem[]
    }

    return ((data ?? []) as Array<Record<string, unknown>>)
      .map((row): FutureProductItem => {
        const status = Array.isArray(row.exp_future_product_statuses)
          ? row.exp_future_product_statuses[0]
          : row.exp_future_product_statuses
        const statusObj = status as { label?: string; color?: string } | null | undefined
        return {
          id: row.id as string,
          title: row.title as string,
          description: row.description as string | null,
          estimated_release: row.estimated_release as string | null,
          category_key: row.category_key as string | null,
          status_id: row.status_id as string | null,
          status_label: statusObj?.label ?? null,
          status_color: statusObj?.color ?? null,
          media_url: row.media_url as string | null,
          media_alt: row.media_alt as string | null,
          is_visible: row.is_visible as boolean,
          sort_order: row.sort_order as number | null,
        }
      })
      .slice()
      .sort((left, right) => {
        const leftOrder = Number(left.sort_order ?? 0)
        const rightOrder = Number(right.sort_order ?? 0)
        if (leftOrder !== rightOrder) return leftOrder - rightOrder
        const leftRelease = left.estimated_release ?? ''
        const rightRelease = right.estimated_release ?? ''
        return leftRelease.localeCompare(rightRelease)
      })
  } catch (error) {
    safeLogError('[future-products:page]', error)
    return [] as FutureProductItem[]
  }
}

export default async function FutureProductsPage() {
  const [products, notifySettings] = await Promise.all([getFutureProducts(), getFutureProductNotifySettings()])

  return (
    <>
      <Header currentPath="/future-products" />
      <Box component="main" id="main-content" sx={{ background: `linear-gradient(180deg, ${alpha(brandTokens.bgSurface, 0.9)} 0% , ${brandTokens.bgVoid} 100%)`, minHeight: '70vh' }}>
        <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 } }}>
          <Stack spacing={4}>
            <Box>
              <Typography variant="overline" sx={{ color: brandTokens.forgeGold, display: 'block', mb: 1 }}>
                Roadmap
              </Typography>
              <Typography variant="h1" component="h1" sx={{ mb: 1 }}>
                Future products and ideas
              </Typography>
              <Typography variant="body1" sx={{ color: alpha(brandTokens.parchment, 0.7), maxWidth: 700 }}>
                The next drops are still being forged. Tell us what you would love to see, and we will keep you in the loop.
              </Typography>
            </Box>

            <Paper sx={{ p: { xs: 3, md: 4 }, backgroundColor: alpha(brandTokens.bgSurface, 0.9), border: `1px solid ${alpha(brandTokens.parchment, 0.08)}` }}>
              <Typography variant="h5" component="h2" sx={{ mb: 2 }}>
                What is coming next
              </Typography>
              <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.7), mb: 3 }}>
                These are the ideas and releases we are actively shaping for the next season.
              </Typography>
              {products.length === 0 ? (
                <Box sx={{ border: `1px dashed ${alpha(brandTokens.parchment, 0.24)}`, borderRadius: 2, p: 2.5, textAlign: 'center' }}>
                  <Typography variant="body1">No public roadmap items are live yet.</Typography>
                </Box>
              ) : (
                <Stack spacing={1.8}>
                  {products.map((product) => (
                    <Box key={product.id} sx={{ borderRadius: 2, border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`, p: 2, backgroundColor: alpha(brandTokens.bgVoid, 0.28) }}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                        <Box>
                          <Typography variant="h6" component="h3" sx={{ mb: 0.3 }}>
                            {product.title}
                          </Typography>
                          {product.description && (
                            <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.72) }}>
                              {product.description}
                            </Typography>
                          )}
                        </Box>
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          {product.status_label && (
                            <Chip
                              label={product.status_label}
                              size="small"
                              sx={{
                                backgroundColor: product.status_color ?? 'transparent',
                                color: '#FFFFFF',
                                fontWeight: 600,
                              }}
                            />
                          )}
                          {product.estimated_release && <Chip label={product.estimated_release} size="small" />}
                          {product.category_key && <Chip label={product.category_key.replace(/_/g, ' ')} size="small" variant="outlined" />}
                        </Stack>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </Paper>

            {notifySettings.enabled && (
              <Paper sx={{ p: { xs: 3, md: 4 }, backgroundColor: alpha(brandTokens.bgSurface, 0.9), border: `1px solid ${alpha(brandTokens.parchment, 0.08)}` }}>
                <Typography variant="h5" component="h2" sx={{ mb: 2 }}>
                  Want early access?
                </Typography>
                <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.7), mb: 3 }}>
                  Share your email and a quick note. We will use it to keep you informed about future drops and product ideas.
                </Typography>
                <form action="/api/future-products" method="post" style={{ display: 'grid', gap: 16 }}>
                  <TextField name="name" label="Name" fullWidth />
                  <TextField name="email" label="Email" type="email" required fullWidth />
                  <TextField name="idea" label="What would you like to see?" multiline minRows={3} fullWidth />
                  <TextField name="comments" label="Anything else?" multiline minRows={2} fullWidth />
                  <Button type="submit" variant="contained" sx={{ width: { xs: '100%', sm: 'fit-content' } }}>
                    Notify me
                  </Button>
                </form>
              </Paper>
            )}
          </Stack>
        </Container>
      </Box>
      <Footer />
    </>
  )
}
