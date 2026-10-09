import type { Metadata } from 'next'

import { activeAdminModuleLabel } from '@/lib/admin/module-nav'

/**
 * The admin module registry — the single source of truth for the panel's rail,
 * header label and per-route `<title>`.
 *
 * Previously `ADMIN_MODULES` lived inline in `src/app/admin/(panel)/layout.tsx`
 * and the `AdminModuleLink` shape in `AdminShell.tsx`. They are colocated here
 * so the client shell, the panel layout and the per-segment metadata all read
 * the same list and cannot drift (OCT-20).
 */
export interface AdminModuleLink {
  label: string
  href: string
  description: string
}

export const ADMIN_MODULES: AdminModuleLink[] = [
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
    label: 'Shipping',
    href: '/admin/shipping',
    description: 'Shippo integration, carriers, and webhook configuration.',
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

/**
 * The `metadata` for a module route. The root layout's title template appends
 * ` | Ruby's Relics Studio`, so this resolves the same way `AdminShell`'s
 * client-side `document.title = `${activeModuleLabel ?? 'Admin'} | Ruby's Relics
 * Studio`` does — the server `<title>` and the post-hydration title agree.
 */
export function adminModuleMetadata(href: string): Metadata {
  return { title: activeAdminModuleLabel(href, ADMIN_MODULES) ?? 'Admin' }
}
