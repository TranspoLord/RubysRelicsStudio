/**
 * Grants admin access to a Google account (docs/archive/SEPT_IMPLEMENTATION_PLAN §10.2).
 *
 * Usage:
 *   npm run admin:grant -- admin@example.com
 *
 * Writes the `exp_admin_users` allow-list row and the matching
 * `app_metadata.role = 'admin'` claim, so the DB gate (§10.3) and the Edge gate
 * (§10.5) agree. Idempotent: re-running re-activates a revoked row.
 *
 * The account must exist in auth.users first, i.e. it must have completed one
 * Google sign-in on the storefront. This script never creates the account.
 */

import {
  createServiceClient,
  grantAdmin,
  loadEnvFiles,
  normalizeEmail,
} from './lib/admin-allowlist.mjs'

async function main() {
  loadEnvFiles()

  const email = normalizeEmail(process.argv[2])
  if (!email || !email.includes('@')) {
    console.error('Usage: npm run admin:grant -- <google-email>')
    process.exit(1)
  }

  const client = createServiceClient()
  const result = await grantAdmin(client, { email })

  const verb = result.created ? 'Granted' : result.reactivated ? 'Re-activated' : 'Refreshed'
  console.log(`${verb} admin access for ${result.email}`)
  console.log(`  user_id: ${result.userId}`)
  console.log('  allow-list row: exp_admin_users.is_active = true')
  console.log("  claim: app_metadata.role = 'admin'")
  console.log('\nNext: sign in at /admin/login with this Google account.')
}

main().catch((error) => {
  console.error('\nGrant failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
