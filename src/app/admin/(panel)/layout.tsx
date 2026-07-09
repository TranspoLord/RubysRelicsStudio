import { requireAdminPageSessionOrRedirect } from '@/lib/admin/auth'
import { getUnreadNotificationCount, syncOperationalNotifications } from '@/lib/admin/notifications'
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
    label: 'Finance',
    href: '/admin/finance',
    description: 'Revenue, margin, labor, and export analytics.',
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    description: 'Storefront toggles and runtime controls.',
  },
  {
    label: 'Schedule',
    href: '/admin/schedule',
    description: 'Production queue and machine scheduling blocks.',
  },
  {
    label: 'Abandoned Carts',
    href: '/admin/abandoned-carts',
    description: 'Cart captures and recovery email tracking.',
  },
  {
    label: 'Homepage',
    href: '/admin/homepage',
    description: 'Quick-pick and process-pick shortcut tiles on the storefront.',
  },
]

async function loadUnreadNotificationCount() {
  await syncOperationalNotifications()
  return getUnreadNotificationCount()
}

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdminPageSessionOrRedirect('/admin')

  const notificationCount = await loadUnreadNotificationCount()

  return (
    <AdminShell
      notificationCount={notificationCount}
      moduleLinks={ADMIN_MODULES}
    >
      {children}
    </AdminShell>
  )
}
