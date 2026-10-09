import { adminModuleMetadata } from '@/lib/admin/admin-modules'

export const metadata = adminModuleMetadata('/admin/inventory')

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return children
}
