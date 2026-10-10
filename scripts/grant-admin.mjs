/**
 * Grants admin access to a Google account (docs/archive/SEPT_IMPLEMENTATION_PLAN §10.2).
 *
 * Usage:
 *   npm run admin:grant -- admin@example.com --confirm-user-id <uuid>
 *
 * Writes the `exp_admin_users` allow-list row and the matching
 * `app_metadata.role = 'admin'` claim, so the DB gate (§10.3) and the Edge gate
 * (§10.5) agree. Idempotent: re-running re-activates a revoked row.
 *
 * The account must exist in auth.users first, i.e. it must have completed one
 * Google sign-in on the storefront. This script never creates the account.
 *
 * OCT #11(b): the grant is resolved by **email**, so the script first prints the
 * account it found and refuses to write until the operator echoes that `user_id`
 * back with `--confirm-user-id`. It also refuses an unconfirmed address and any
 * account without a Google identity — those are the shapes an attacker can
 * pre-register to have *their* row allow-listed.
 */

import {
  assertGrantableUser,
  createServiceClient,
  describeAuthUser,
  findAuthUserByEmail,
  grantAdmin,
  loadEnvFiles,
  normalizeEmail,
} from './lib/admin-allowlist.mjs'

/** Reads `--confirm-user-id <uuid>`; returns null when the flag is absent. */
function readConfirmUserId(argv) {
  const index = argv.indexOf('--confirm-user-id')
  if (index === -1) return null
  return argv[index + 1] ?? ''
}

async function main() {
  loadEnvFiles()

  const email = normalizeEmail(process.argv[2])
  if (!email || email.startsWith('--') || !email.includes('@')) {
    console.error('Usage: npm run admin:grant -- <google-email> --confirm-user-id <uuid>')
    process.exit(1)
  }

  const client = createServiceClient()

  // Resolve and show the account *before* any write, so the operator confirms a
  // user id rather than trusting that the email matched the right row.
  const user = await findAuthUserByEmail(client, email)
  if (!user) {
    console.error(
      `No auth.users row for ${email}. That account must sign in with Google once ` +
        '(storefront /sign-in) before it can be allow-listed.'
    )
    process.exit(1)
  }

  console.log(`Account found for ${email}:\n  ${describeAuthUser(user)}\n`)

  // Throws with a specific reason (unconfirmed address, no Google identity).
  assertGrantableUser(user)

  const confirmUserId = readConfirmUserId(process.argv)
  if (confirmUserId !== user.id) {
    console.error(
      'Refusing to write — confirm the account above by re-running with:\n' +
        `  npm run admin:grant -- ${email} --confirm-user-id ${user.id}\n` +
        (confirmUserId === null
          ? '(no --confirm-user-id was given)'
          : `(--confirm-user-id ${confirmUserId || '(empty)'} does not match)`)
    )
    process.exit(1)
  }

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
