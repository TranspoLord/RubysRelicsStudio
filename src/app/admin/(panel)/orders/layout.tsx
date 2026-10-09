import { adminModuleMetadata } from '@/lib/admin/admin-modules'

export const metadata = adminModuleMetadata('/admin/orders')

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return children
}
