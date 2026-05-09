import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from '@/lib/admin/session'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { AdminShell, type AdminModuleLink } from '@/components/admin/AdminShell'

const ADMIN_MODULES: AdminModuleLink[] = [
  {
    label: 'Dashboard',
    href: '/admin',
    description: 'Operational snapshot and module access.',
  },
  {
    label: 'Custom Requests',
    href: '/admin/custom-requests',
    description: 'Quote pipeline and payment-link actions.',
  },
  {
    label: 'Orders',
    href: '/admin/orders',
    description: 'Paid flow and order status operations.',
  },
  {
    label: 'Catalog',
    href: '/admin/catalog',
    description: 'Products, categories, and visibility controls.',
  },
  {
    label: 'Pricing',
    href: '/admin/pricing',
    description: 'Base pricing and discount tier settings.',
  },
  {
    label: 'Inventory',
    href: '/admin/inventory',
    description: 'Ready-made stock and threshold tracking.',
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    description: 'Storefront toggles and runtime controls.',
  },
]

async function getUnreadNotificationCount() {
  try {
    const supabase = getSupabaseAdmin()

    const [customPending, orderPending] = await Promise.all([
      supabase
        .from('exp_custom_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'awaiting_quote'),
      supabase
        .from('exp_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['awaiting_payment', 'paid']),
    ])

    const customCount = customPending.count ?? 0
    const orderCount = orderPending.count ?? 0

    return customCount + orderCount
  } catch {
    return 0
  }
}

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const adminKey = process.env.ADMIN_LOGIN_KEY
  if (!adminKey) {
    throw new Error('ADMIN_LOGIN_KEY must be set for admin routes.')
  }

  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value

  if (!verifyAdminSessionToken(token, adminKey)) {
    redirect('/admin/login?next=/admin')
  }

  const notificationCount = await getUnreadNotificationCount()

  return (
    <AdminShell
      notificationCount={notificationCount}
      moduleLinks={ADMIN_MODULES}
    >
      {children}
    </AdminShell>
  )
}
