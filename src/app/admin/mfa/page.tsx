import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import { alpha } from '@mui/material/styles'

import { requireAdminPageMfaSessionOrRedirect } from '@/lib/admin/auth'
import { AdminMfaView } from '@/components/admin/AdminMfaView'
import { brandTokens } from '@/theme/theme'

export const metadata: Metadata = {
  title: 'Two-factor authentication',
  robots: { index: false, follow: false },
}

/**
 * §10.16 — the mandatory-MFA step. Gated by the *MFA* variant of the page gate
 * (role + allow-list, no AAL), because this page is the path to `aal2`.
 */
export default async function AdminMfaPage() {
  await requireAdminPageMfaSessionOrRedirect()

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        backgroundColor: brandTokens.bgVoid,
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 520,
          border: `1px solid ${alpha(brandTokens.parchment, 0.12)}`,
          borderRadius: 2,
          p: { xs: 3, md: 4 },
          background: alpha(brandTokens.bgSurface, 0.6),
        }}
      >
        <AdminMfaView />
      </Box>
    </Box>
  )
}