import { adminModuleMetadata } from '@/lib/admin/admin-modules'

export const metadata = adminModuleMetadata('/admin/homepage')

export default function HomepageLayout({ children }: { children: React.ReactNode }) {
  return children
}
