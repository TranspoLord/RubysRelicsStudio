import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { ClearCartOnSuccess } from '@/components/checkout/ClearCartOnSuccess'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { brandTokens } from '@/theme/theme'

interface OrderConfirmationItem {
  id: string
  product_title: string
  variant_label: string | null
  quantity: number
  line_total: number
  selected_options: Record<string, string> | null
}

interface OrderConfirmation {
  id: string
  payment_status: string
  status: string
  production_estimate_band: string
  subtotal: number
  discount_amount: number
  order_total: number
  created_at: string
  guest_tracking_token: string | null
  items: OrderConfirmationItem[]
}

async function getOrderConfirmation(sessionId: string): Promise<OrderConfirmation | null> {
  if (!sessionId) return null

  const supabase = getSupabaseAdmin()

  const { data: order, error: orderError } = await supabase
    .from('exp_orders')
    .select('id, payment_status, status, production_estimate_band, subtotal, discount_amount, order_total, created_at, guest_tracking_token')
    .eq('stripe_session_id', sessionId)
    .single()

  if (orderError || !order) {
    if (orderError?.code !== 'PGRST116') {
      console.error('[checkout:success:order]', orderError?.message)
    }
    return null
  }

  const { data: items, error: itemsError } = await supabase
    .from('exp_order_items')
    .select('id, product_title, variant_label, quantity, line_total, selected_options')
    .eq('order_id', order.id)

  if (itemsError) {
    console.error('[checkout:success:items]', itemsError.message)
  }

  return {
    ...order,
    items: (items ?? []) as OrderConfirmationItem[],
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

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const params = await searchParams
  const sessionId = typeof params.session_id === 'string' ? params.session_id : ''
  const order = await getOrderConfirmation(sessionId)
  const paymentSettled = order?.payment_status === 'paid'

  return (
    <>
      <ClearCartOnSuccess />
      <Header currentPath="/checkout" />
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Checkout', href: '/checkout' },
          { label: 'Success' },
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
            <Box sx={{ textAlign: 'center', mb: order ? 2.2 : 0 }}>
              <Typography sx={{ fontSize: '2.2rem', mb: 0.8 }}>{paymentSettled ? '✅' : '⏳'}</Typography>
              <Typography variant="h2" component="h1" sx={{ mb: 1 }}>
                {paymentSettled ? 'Payment Received' : 'Order Received'}
              </Typography>
              <Typography sx={{ color: alpha(brandTokens.parchment, 0.72), maxWidth: 620, mx: 'auto', mb: 2 }}>
                {paymentSettled
                  ? 'Your order is now in our forge queue. You will receive updates as it moves into production and shipping.'
                  : 'Stripe redirected successfully. Your payment is still syncing, but your order record has been created.'}
              </Typography>
            </Box>

            {order ? (
              <Box
                sx={{
                  display: 'grid',
                  gap: 1.4,
                  mb: 2.2,
                  p: { xs: 1.4, md: 1.8 },
                  borderRadius: 1.5,
                  border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                  backgroundColor: alpha(brandTokens.bgVoid, 0.25),
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.58) }}>
                    Order ID: {order.id}
                  </Typography>
                  <Typography sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.58) }}>
                    Created: {formatTimestamp(order.created_at)}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.58) }}>
                    Payment: {order.payment_status}
                  </Typography>
                  <Typography sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.58) }}>
                    Status: {order.status}
                  </Typography>
                </Box>

                <Typography sx={{ fontSize: '0.84rem', color: alpha(brandTokens.parchment, 0.72) }}>
                  Production estimate: {order.production_estimate_band}
                </Typography>

                <Box sx={{ display: 'grid', gap: 0.9 }}>
                  {order.items.map((item) => (
                    <Box
                      key={item.id}
                      sx={{
                        borderRadius: 1.2,
                        border: `1px solid ${alpha(brandTokens.parchment, 0.08)}`,
                        p: 1.1,
                        backgroundColor: alpha(brandTokens.bgSurface, 0.45),
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 700 }}>{item.product_title}</Typography>
                        <Typography sx={{ fontWeight: 700, fontFamily: 'var(--font-cinzel, serif)' }}>
                          ${Number(item.line_total).toFixed(2)}
                        </Typography>
                      </Box>

                      {item.variant_label && (
                        <Typography sx={{ fontSize: '0.76rem', color: alpha(brandTokens.parchment, 0.58), mt: 0.2 }}>
                          {item.variant_label}
                        </Typography>
                      )}

                      {item.selected_options && Object.keys(item.selected_options).length > 0 && (
                        <Typography sx={{ fontSize: '0.74rem', color: alpha(brandTokens.parchment, 0.52), mt: 0.25 }}>
                          {Object.entries(item.selected_options)
                            .map(([key, value]) => `${key}: ${String(value)}`)
                            .join(' • ')}
                        </Typography>
                      )}

                      <Typography sx={{ fontSize: '0.74rem', color: alpha(brandTokens.parchment, 0.52), mt: 0.35 }}>
                        Qty {item.quantity}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                <Box sx={{ display: 'grid', gap: 0.45, pt: 0.4 }}>
                  <SummaryRow label="Subtotal" value={Number(order.subtotal)} />
                  <SummaryRow label="Discounts" value={-Number(order.discount_amount)} />
                  <SummaryRow label="Total" value={Number(order.order_total)} emph />
                </Box>
              </Box>
            ) : (
              sessionId && (
                <Typography sx={{ fontSize: '0.75rem', color: alpha(brandTokens.parchment, 0.52), mb: 2, textAlign: 'center' }}>
                  Session: {sessionId}
                </Typography>
              )
            )}

            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1 }}>
              <Button component="a" href="/shop" variant="contained">
                Continue Shopping
              </Button>
              {order?.guest_tracking_token && (
                <Button
                  component="a"
                  href={`/orders/${order.id}?access=${encodeURIComponent(order.guest_tracking_token)}`}
                  variant="outlined"
                >
                  Track This Order
                </Button>
              )}
              <Button component="a" href="/custom-orders" variant="outlined">
                Request Another Project
              </Button>
            </Box>
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
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
      <Typography sx={{ color: emph ? brandTokens.parchment : alpha(brandTokens.parchment, 0.62), fontWeight: emph ? 700 : 400 }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: emph ? 700 : 500, fontFamily: emph ? 'var(--font-cinzel, serif)' : 'inherit' }}>
        ${value.toFixed(2)}
      </Typography>
    </Box>
  )
}
