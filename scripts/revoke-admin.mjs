/**
 * Revokes admin access from a Google account (SEPT_IMPLEMENTATION_PLAN §10.2).
 *
 * Usage:
 *   npm run admin:revoke -- admin@example.com
 *
 * Sets `exp_admin_users.is_active = false` / `revoked_at = now()` — the row is
 * the revocation authority — and clears the `app_metadata.role` claim so the
 * Edge gate agrees. A token already in flight keeps working until its access
 * token expires; the DB gate closes that window for anything that matters
 * (§10.3), and `auth.admin.signOut()` is available if a hard cut is needed
 * (§10.17).
 */

import { createServiceClient, loadEnvFiles, normalizeEmail, revokeAdmin } from './lib/admin-allowlist.mjs'

async function main() {
  loadEnvFiles()

  const email = normalizeEmail(process.argv[2])
  if (!email || !email.includes('@')) {
    console.error('Usage: npm run admin:revoke -- <google-email>')
    process.exit(1)
  }

  const client = createServiceClient()
  const result = await revokeAdmin(client, { email })

  console.log(`Revoked admin access for ${result.email}`)
  console.log(`  allow-list row deactivated: ${result.rowRevoked ? 'yes' : 'no row found'}`)
  console.log(`  app_metadata claim cleared: ${result.claimCleared ? 'yes' : 'no auth.users row'}`)

  if (!result.rowRevoked) {
    console.warn('\nNo allow-list row matched — nothing was granting this account access in the first place.')
  }
}

main().catch((error) => {
  console.error('\nRevoke failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
