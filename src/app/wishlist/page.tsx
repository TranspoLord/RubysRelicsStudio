import { redirect } from 'next/navigation'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid2'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { verifyCustomerSession } from '@/lib/auth/customer'
import { brandTokens } from '@/theme/theme'
import { WishlistClient } from '@/components/wishlist/WishlistClient'

// ─── Protected Page ─────────────────────────────────────────────────────────

async function getSessionFromCookie(): Promise<string | null> {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('rr_customer_session')?.value
  return sessionToken || null
}

async function getWishlistItems(customerId: string) {
  const supabase = getSupabaseAdmin()

  const { data: wishlists, error } = await supabase
    .from('exp_wishlists')
    .select(`
      id,
      product_id,
      created_at,
      exp_products (
        id,
        title,
        slug,
        base_price,
        thumbnail_url,
        exp_product_categories (
          category_key,
          display_name
        )
      )
    `)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching wishlist:', error)
    return []
  }

  return (wishlists || []).map((item: any) => ({
    id: item.id,
    product: {
      id: item.exp_products.id,
      title: item.exp_products.title,
      slug: item.exp_products.slug,
      price: item.exp_products.base_price,
      thumbnail: item.exp_products.thumbnail_url,
      category: item.exp_products.exp_product_categories?.display_name,
      categoryKey: item.exp_products.exp_product_categories?.category_key,
    },
    addedAt: item.created_at,
  }))
}

export const metadata = {
  title: 'My Wishlist | Ruby\'s Relics Studio',
  description: 'Save your favorite products for later.',
}

export default async function WishlistPage() {
  // Verify session
  const sessionToken = await getSessionFromCookie()

  if (!sessionToken) {
    redirect('/login')
  }

  const customerId = await verifyCustomerSession(sessionToken)

  if (!customerId) {
    redirect('/login')
  }

  // Fetch wishlist items
  const items = await getWishlistItems(customerId)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />

      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'My Wishlist', href: '/wishlist' },
        ]}
      />

      <Container maxWidth="lg" sx={{ py: 6, flex: 1 }}>
        <Box sx={{ display: 'grid', gap: 3, mb: 4 }}>
          <Box>
            <Typography variant="h4" component="h1">
              My Wishlist
            </Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), mt: 1 }}>
              {items.length === 0
                ? 'Start adding your favorite items to your wishlist!'
                : `You have ${items.length} item${items.length !== 1 ? 's' : ''} saved.`}
            </Typography>
          </Box>
        </Box>

        {items.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.65), mb: 2 }}>
              Your wishlist is empty. Browse our shop to find something you love!
            </Typography>
            <Button variant="contained" href="/shop">
              Browse Shop
            </Button>
          </Box>
        ) : (
          <WishlistClient initialItems={items} />
        )}
      </Container>

      <Footer />
    </Box>
  )
}
