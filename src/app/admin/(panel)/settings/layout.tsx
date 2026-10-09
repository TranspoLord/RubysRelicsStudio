import { adminModuleMetadata } from '@/lib/admin/admin-modules'

export const metadata = adminModuleMetadata('/admin/settings')

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children
}
