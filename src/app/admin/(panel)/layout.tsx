import { requireAdminPageSessionOrRedirect } from '@/lib/admin/auth'
import { getUnreadNotificationCount, syncOperationalNotifications } from '@/lib/admin/notifications'
import { AdminShell } from '@/components/admin/AdminShell'
import { ADMIN_MODULES } from '@/lib/admin/admin-modules'
import { AdminCsrfFetchBridge } from '@/components/admin/AdminCsrfFetchBridge'

async function loadUnreadNotificationCount() {
  await syncOperationalNotifications()
  return getUnreadNotificationCount()
}

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdminPageSessionOrRedirect('/admin')

  const notificationCount = await loadUnreadNotificationCount()

  return (
    <>
      <AdminCsrfFetchBridge />
      <AdminShell
        notificationCount={notificationCount}
        moduleLinks={ADMIN_MODULES}
      >
        {children}
      </AdminShell>
    </>
  )
}
