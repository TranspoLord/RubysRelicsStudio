import { adminModuleMetadata } from '@/lib/admin/admin-modules'

export const metadata = adminModuleMetadata('/admin/finance')

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return children
}
