import { redirect } from 'next/navigation'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { brandTokens } from '@/theme/theme'
import { verifyCustomerSession } from '@/lib/auth/customer'
import { AccountTabsClient } from '@/components/account/AccountTabsClient'

async function getSessionFromCookie(): Promise<string | null> {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('rr_customer_session')?.value
  return sessionToken || null
}

async function getCustomerData(customerId: string) {
  const supabase = getSupabaseAdmin()

  // Fetch customer profile
  const { data: customer, error: customerError } = await supabase
    .from('exp_customers')
    .select('id, email, first_name, last_name, phone, email_verified, receives_newsletter, receives_order_updates, receives_marketing')
    .eq('id', customerId)
    .single()

  if (customerError || !customer) {
    return null
  }

  // Fetch customer orders
  const { data: orders, error: ordersError } = await supabase
    .from('exp_orders')
    .select('id, status, order_total, created_at, guest_tracking_token')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (ordersError) {
    console.error('Error fetching orders:', ordersError)
  }

  // Fetch customer addresses
  const { data: addresses, error: addressesError } = await supabase
    .from('exp_customer_addresses')
    .select('*')
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })

  if (addressesError) {
    console.error('Error fetching addresses:', addressesError)
  }

  return {
    customer,
    orders: orders || [],
    addresses: addresses || [],
  }
}

// ─── Page Component ────────────────────────────────────────────────────────

export const metadata = {
  title: 'My Account | Ruby\'s Relics Studio',
  description: 'Manage your profile, orders, and preferences.',
}

export default async function AccountPage() {
  // Verify session
  const sessionToken = await getSessionFromCookie()

  if (!sessionToken) {
    redirect('/login')
  }

  const customerId = await verifyCustomerSession(sessionToken)

  if (!customerId) {
    redirect('/login')
  }

  // Fetch customer data
  const data = await getCustomerData(customerId)

  if (!data) {
    redirect('/login')
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />

      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'My Account', href: '/account' },
        ]}
      />

      <Container maxWidth="lg" sx={{ py: 4, flex: 1 }}>
        <Box sx={{ display: 'grid', gap: 2.2, mb: 3 }}>
          <Typography variant="h4" component="h1">
            My Account
          </Typography>
          <Typography sx={{ color: alpha(brandTokens.parchment, 0.65) }}>
            Welcome, {data.customer.first_name || data.customer.email}. Manage your orders, addresses, and preferences.
          </Typography>
        </Box>

        <AccountTabsClient customer={data.customer} orders={data.orders} addresses={data.addresses} />
      </Container>

      <Footer />
    </Box>
  )
}
