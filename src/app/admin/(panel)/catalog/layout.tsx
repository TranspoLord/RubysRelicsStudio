import { adminModuleMetadata } from '@/lib/admin/admin-modules'

export const metadata = adminModuleMetadata('/admin/catalog')

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return children
}
