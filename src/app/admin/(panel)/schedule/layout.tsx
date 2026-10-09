import { adminModuleMetadata } from '@/lib/admin/admin-modules'

export const metadata = adminModuleMetadata('/admin/schedule')

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return children
}
