import type { Metadata } from 'next'

import { NotAuthorizedView } from '@/components/admin/NotAuthorizedView'

export const metadata: Metadata = {
  title: 'Not authorised',
  robots: { index: false, follow: false },
}

/**
 * Landing page for a signed-in account that is *not* an admin (§10.4).
 *
 * Having a real page here is what stops the redirect loop: without it a
 * signed-in non-admin would be bounced between `/admin` and `/admin/login`
 * forever. It is exempt from the Edge gate for the same reason — see
 * `ADMIN_AUTH_EXEMPT_PATHS`.
 */
export default function AdminNotAuthorizedPage() {
  return <NotAuthorizedView />
}
