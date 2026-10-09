import { adminModuleMetadata } from '@/lib/admin/admin-modules'

export const metadata = adminModuleMetadata('/admin/pricing')

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
