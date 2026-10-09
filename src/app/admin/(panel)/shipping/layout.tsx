import { adminModuleMetadata } from '@/lib/admin/admin-modules'

export const metadata = adminModuleMetadata('/admin/shipping')

export default function ShippingLayout({ children }: { children: React.ReactNode }) {
  return children
}
