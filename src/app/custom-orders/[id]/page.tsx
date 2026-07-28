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

interface RequestRow {
  id: string
  status: string
  item_type: string
  quantity: number
  description: string
  quote_amount: number | null
  square_payment_link_url: string | null
  admin_notes: string | null
  created_at: string
  updated_at: string
  customer_access_expires_at: string | null
}

async function getCustomRequest(id: string, access: string) {
  if (!id || !access) return null

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('exp_custom_requests')
    .select('id, status, item_type, quantity, description, quote_amount, square_payment_link_url, admin_notes, created_at, updated_at, customer_access_expires_at')
    .eq('id', id)
    .eq('customer_access_token', access)
    .single()

  if (error || !data) return null

  if (data.customer_access_expires_at) {
    const expires = new Date(data.customer_access_expires_at)
    if (!Number.isNaN(expires.getTime()) && expires.getTime() < Date.now()) {
      return null
    }
  }

  return data as RequestRow
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

function prettyStatus(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default async function CustomOrderStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ access?: string }>
}) {
  const routeParams = await params
  const query = await searchParams
  const requestId = typeof routeParams.id === 'string' ? routeParams.id : ''
  const access = typeof query.access === 'string' ? query.access : ''

  const request = await getCustomRequest(requestId, access)

  return (
    <>
      <Header currentPath="/custom-orders" />
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Custom Orders', href: '/custom-orders' },
          { label: 'Request Status' },
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
            {!request ? (
              <Box sx={{ textAlign: 'center' }}>
                <Typography sx={{ fontSize: '2rem', mb: 0.7 }}>🔒</Typography>
                <Typography variant="h3" component="h1" sx={{ mb: 1 }}>
                  Request Link Unavailable
                </Typography>
                <Typography sx={{ color: alpha(brandTokens.parchment, 0.7), mb: 2 }}>
                  This request link is missing, invalid, or expired. Submit a new custom request and we will continue from there.
                </Typography>
                <Button component="a" href="/custom-orders" variant="contained">
                  Start New Request
                </Button>
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gap: 1.3 }}>
                <Typography variant="h3" component="h1" sx={{ mb: 0.2 }}>
                  Custom Request Status
                </Typography>

                <Typography sx={{ fontSize: '0.84rem', color: alpha(brandTokens.parchment, 0.6) }}>
                  Request: {request.id}
                </Typography>
                <Typography sx={{ fontSize: '0.84rem', color: alpha(brandTokens.parchment, 0.6) }}>
                  Created: {formatTimestamp(request.created_at)}
                </Typography>
                <Typography sx={{ fontSize: '0.84rem', color: alpha(brandTokens.parchment, 0.6) }}>
                  Updated: {formatTimestamp(request.updated_at)}
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
                    Status: {prettyStatus(request.status)}
                  </Typography>
                  <Typography sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.7) }}>
                    Item type: {request.item_type}
                  </Typography>
                  <Typography sx={{ fontSize: '0.82rem', color: alpha(brandTokens.parchment, 0.7) }}>
                    Quantity: {request.quantity}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    p: 1.1,
                    borderRadius: 1.2,
                    border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                    backgroundColor: alpha(brandTokens.bgSurface, 0.45),
                  }}
                >
                  <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Project Notes</Typography>
                  <Typography sx={{ color: alpha(brandTokens.parchment, 0.7), whiteSpace: 'pre-wrap' }}>
                    {request.description}
                  </Typography>
                </Box>

                {request.quote_amount !== null && (
                  <Box
                    sx={{
                      p: 1.1,
                      borderRadius: 1.2,
                      border: `1px solid ${alpha(brandTokens.forgeGold, 0.34)}`,
                      backgroundColor: alpha(brandTokens.forgeGold, 0.1),
                    }}
                  >
                    <Typography sx={{ fontWeight: 700, color: brandTokens.forgeGold }}>Quote Ready</Typography>
                    <Typography sx={{ color: alpha(brandTokens.parchment, 0.78), mt: 0.25 }}>
                      Total quote: ${Number(request.quote_amount).toFixed(2)}
                    </Typography>
                    {request.square_payment_link_url && (
                      <Button
                        component="a"
                        href={request.square_payment_link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="contained"
                        sx={{ mt: 1.1 }}
                      >
                        Pay Quote via Square
                      </Button>
                    )}
                  </Box>
                )}

                {request.admin_notes && (
                  <Box
                    sx={{
                      p: 1.1,
                      borderRadius: 1.2,
                      border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
                      backgroundColor: alpha(brandTokens.bgSurface, 0.45),
                    }}
                  >
                    <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Studio Note</Typography>
                    <Typography sx={{ color: alpha(brandTokens.parchment, 0.7), whiteSpace: 'pre-wrap' }}>
                      {request.admin_notes}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </Container>
      </Box>

      <Footer />
    </>
  )
}
