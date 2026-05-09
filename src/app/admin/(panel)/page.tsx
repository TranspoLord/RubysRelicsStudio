import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import { getSupabaseAdmin } from '@/lib/supabase/client'
import { brandTokens } from '@/theme/theme'

async function getDashboardStats() {
  const supabase = getSupabaseAdmin()

  const [customAwaiting, customQuoted, ordersPaid, ordersAwaiting] = await Promise.all([
    supabase
      .from('exp_custom_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'awaiting_quote'),
    supabase
      .from('exp_custom_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'quote_sent'),
    supabase
      .from('exp_orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'paid'),
    supabase
      .from('exp_orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'awaiting_payment'),
  ])

  return {
    customAwaiting: customAwaiting.count ?? 0,
    customQuoted: customQuoted.count ?? 0,
    ordersPaid: ordersPaid.count ?? 0,
    ordersAwaiting: ordersAwaiting.count ?? 0,
  }
}

const MODULE_CARDS = [
  {
    title: 'Custom Requests',
    href: '/admin/custom-requests',
    detail: 'Review new requests, issue quotes, and push payment links.',
  },
  {
    title: 'Orders',
    href: '/admin/orders',
    detail: 'Track payment state and fulfillment movement.',
  },
  {
    title: 'Catalog',
    href: '/admin/catalog',
    detail: 'Manage products, categories, and visibility.',
  },
  {
    title: 'Pricing',
    href: '/admin/pricing',
    detail: 'Adjust pricing controls and discount rules.',
  },
  {
    title: 'Inventory',
    href: '/admin/inventory',
    detail: 'Monitor ready-made stock and restock priorities.',
  },
  {
    title: 'Settings',
    href: '/admin/settings',
    detail: 'Toggle storefront runtime behavior safely.',
  },
]

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats()

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="h3" component="h1">
        Admin Dashboard
      </Typography>
      <Typography sx={{ color: alpha(brandTokens.parchment, 0.66) }}>
        Protected operations shell with quick access to the expansion storefront modules.
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 1.1,
        }}
      >
        <StatCard label="Awaiting Quote" value={stats.customAwaiting} />
        <StatCard label="Quote Sent" value={stats.customQuoted} />
        <StatCard label="Orders Paid" value={stats.ordersPaid} />
        <StatCard label="Awaiting Payment" value={stats.ordersAwaiting} />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
          gap: 1.1,
        }}
      >
        {MODULE_CARDS.map((card) => (
          <Box
            key={card.href}
            component="a"
            href={card.href}
            sx={{
              textDecoration: 'none',
              color: 'inherit',
              borderRadius: 1.4,
              border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
              backgroundColor: alpha(brandTokens.bgSurface, 0.62),
              p: 1.4,
              '&:hover': {
                borderColor: alpha(brandTokens.forgeGold, 0.35),
                backgroundColor: alpha(brandTokens.bgSurface, 0.85),
              },
            }}
          >
            <Typography sx={{ fontWeight: 700, mb: 0.35 }}>{card.title}</Typography>
            <Typography sx={{ color: alpha(brandTokens.parchment, 0.62), fontSize: '0.82rem' }}>
              {card.detail}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Box
      sx={{
        borderRadius: 1.2,
        border: `1px solid ${alpha(brandTokens.parchment, 0.1)}`,
        backgroundColor: alpha(brandTokens.bgSurface, 0.5),
        p: 1.1,
      }}
    >
      <Typography sx={{ fontSize: '0.72rem', color: alpha(brandTokens.parchment, 0.55), mb: 0.2 }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', fontFamily: 'var(--font-cinzel, serif)' }}>
        {value}
      </Typography>
    </Box>
  )
}
