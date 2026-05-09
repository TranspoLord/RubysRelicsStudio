import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { brandTokens } from '@/theme/theme'

interface OrderItemRow {
  id: string
  product_title: string
  variant_label: string | null
  quantity: number
  line_total: number
  selected_options: Record<string, string> | null
}

interface OrderRow {
  id: string
  status: string
  payment_status: string
  production_estimate_band: string
  subtotal: number
  discount_amount: number
  order_total: number
  created_at: string
  guest_tracking_expires_at: string | null
}

async function getGuestOrder(orderId: string, accessToken: string) {
  if (!orderId || !accessToken) return null

  const supabase = getSupabaseAdmin()

  const { data: order, error } = await supabase
    .from('exp_orders')
    .select('id, status, payment_status, production_estimate_band, subtotal, discount_amount, order_total, created_at, guest_tracking_expires_at')
    .eq('id', orderId)
    .eq('guest_tracking_token', accessToken)
    .single()

  if (error || !order) {
    return null
  }

  if (order.guest_tracking_expires_at) {
    const expiry = new Date(order.guest_tracking_expires_at)
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now()) {
      return null
    }
  }

  const { data: items, error: itemError } = await supabase
    .from('exp_order_items')
    .select('id, product_title, variant_label, quantity, line_total, selected_options')
    .eq('order_id', order.id)

  if (itemError) {
    console.error('[orders:track:items]', itemError.message)
  }

  return {
    order: order as OrderRow,
    items: (items ?? []) as OrderItemRow[],
  }
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export default async function OrderTrackingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ access?: string }>
}) {
  const routeParams = await params
  const query = await searchParams
  const orderId = typeof routeParams.id === 'string' ? routeParams.id : ''
  const accessToken = typeof query.access === 'string' ? query.access : ''

  const result = await getGuestOrder(orderId, accessToken)

  return (
    <>
      <Header currentPath="/orders" />
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Order Tracking' },
        ]}
      />

      <Box component="main" id="main-content" sx={{ py: { xs: 6, md: 8 }, backgroundColor: brandTokens.bgVoid }}>
        <Container maxWidth="md">
          <Box
            sx={{
              borderRadius: 2,
              border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
              backgroundColor: alpha(brandTokens.bgSurface, 0.62),
              p: { xs: 2, md: 3 },
            }}
          >
            {!result ? (
              <Box sx={{ textAlign: 'center' }}>
                <Typography sx={{ fontSize: '2rem', mb: 0.7 }}>🔒</Typography>
                <Typography variant="h3" component="h1" sx={{ mb: 1 }}>
                  Tracking Link Unavailable
                </Typography>
                <Typography sx={{ color: alpha(brandTokens.parchment, 0.7), mb: 2 }}>
                  This tracking link is missing, expired, or invalid. If you need help, submit a custom request and include your order details.
                </Typography>
                <Button component="a" href="/custom-orders" variant="contained">
                  Contact Support
                </Button>
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gap: 1.3 }}>
                <Typography variant="h3" component="h1" sx={{ mb: 0.2 }}>
                  Order Tracking
                </Typography>

                <Typography sx={{ fontSize: '0.84rem', color: alpha(brandTokens.parchment, 0.6) }}>
                  Order: {result.order.id}
                </Typography>
                <Typography sx={{ fontSize: '0.84rem', color: alpha(brandTokens.parchment, 0.6) }}>
                  Created: {formatTimestamp(result.order.created_at)}
                </Typography>

                <Box
                  sx={{
                    mt: 0.4,
                    p: 1.1,
                    borderRadius: 1.2,
                    border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                    backgroundColor: alpha(brandTokens.bgVoid, 0.24),
                  }}
                >
                  <Typography sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.7) }}>
                    Payment: {result.order.payment_status}
                  </Typography>
                  <Typography sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.7) }}>
                    Status: {result.order.status}
                  </Typography>
                  <Typography sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.7) }}>
                    Production estimate: {result.order.production_estimate_band}
                  </Typography>
                </Box>

                <Box sx={{ display: 'grid', gap: 0.8, mt: 0.4 }}>
                  {result.items.map((item) => (
                    <Box
                      key={item.id}
                      sx={{
                        borderRadius: 1.2,
                        border: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
                        backgroundColor: alpha(brandTokens.bgSurface, 0.45),
                        p: 1,
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 700 }}>{item.product_title}</Typography>
                        <Typography sx={{ fontFamily: 'var(--font-cinzel, serif)', fontWeight: 700 }}>
                          ${Number(item.line_total).toFixed(2)}
                        </Typography>
                      </Box>
                      {item.variant_label && (
                        <Typography sx={{ fontSize: '0.76rem', color: alpha(brandTokens.parchment, 0.55), mt: 0.2 }}>
                          {item.variant_label}
                        </Typography>
                      )}
                      <Typography sx={{ fontSize: '0.74rem', color: alpha(brandTokens.parchment, 0.5), mt: 0.35 }}>
                        Qty {item.quantity}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                <Box sx={{ display: 'grid', gap: 0.45, mt: 0.3 }}>
                  <SummaryRow label="Subtotal" value={Number(result.order.subtotal)} />
                  <SummaryRow label="Discounts" value={-Number(result.order.discount_amount)} />
                  <SummaryRow label="Total" value={Number(result.order.order_total)} emph />
                </Box>
              </Box>
            )}
          </Box>
        </Container>
      </Box>

      <Footer />
    </>
  )
}

function SummaryRow({
  label,
  value,
  emph = false,
}: {
  label: string
  value: number
  emph?: boolean
}) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
      <Typography sx={{ color: emph ? brandTokens.parchment : alpha(brandTokens.parchment, 0.62), fontWeight: emph ? 700 : 400 }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: emph ? 700 : 500, fontFamily: emph ? 'var(--font-cinzel, serif)' : 'inherit' }}>
        ${value.toFixed(2)}
      </Typography>
    </Box>
  )
}
