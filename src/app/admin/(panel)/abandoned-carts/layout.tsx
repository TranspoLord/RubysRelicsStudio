import { adminModuleMetadata } from '@/lib/admin/admin-modules'

export const metadata = adminModuleMetadata('/admin/abandoned-carts')

export default function AbandonedCartsLayout({ children }: { children: React.ReactNode }) {
  return children
}
