import { adminModuleMetadata } from '@/lib/admin/admin-modules'

export const metadata = adminModuleMetadata('/admin/custom-requests')

export default function CustomRequestsLayout({ children }: { children: React.ReactNode }) {
  return children
}
