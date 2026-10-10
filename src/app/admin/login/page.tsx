import type { Metadata } from 'next'

import { AdminLoginView } from '@/components/admin/AdminLoginView'
import { sanitizeAdminNextPath } from '@/lib/auth/redirect'

export const metadata: Metadata = {
  title: 'Admin sign-in',
  robots: { index: false, follow: false },
}

/**
 * Admin sign-in entry point (docs/archive/SEPT_IMPLEMENTATION_PLAN 10.6).
 *
 * Google sign-in replaces the old shared-key form. This page stays exempt from
 * the Edge gate (ADMIN_AUTH_EXEMPT_PATHS) - otherwise nobody could reach it to
 * sign in at all.
 *
 * `next` is sanitized here on the server, so the client only ever receives a
 * destination that is known to stay inside `/admin`.
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; reason?: string }>
}) {
  const { next, error, reason } = await searchParams

  return (
    <AdminLoginView
      nextPath={sanitizeAdminNextPath(next)}
      notAuthorizedNotice={error === 'not_authorized'}
      sessionExpiredNotice={reason === 'expired'}
    />
  )
}
