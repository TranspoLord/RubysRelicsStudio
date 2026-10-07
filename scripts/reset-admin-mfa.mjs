/**
 * §10.16 — MFA lockout recovery.
 *
 * Mandatory admin MFA means the gate demands `aal2`, so a lost authenticator
 * would otherwise lock the owner out for good. This script deletes every
 * enrolled TOTP factor for the allow-listed admin(s), so the owner can sign in
 * and re-enrol. Service-role only — run it from a machine with `.env`.
 *
 * Usage:
 *   npm run admin:reset-mfa -- <google-email>   # one admin
 *   npm run admin:reset-mfa                      # every active allow-list admin
 */

import {
  createServiceClient,
  findAuthUserByEmail,
  getEnv,
  loadEnvFiles,
  normalizeEmail,
} from './lib/admin-allowlist.mjs'

async function listFactors(url, key, userId) {
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}/factors`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`list factors failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  const payload = await res.json()
  // The GoTrue admin API returns either an array or `{ factors: [...] }`.
  const factors = Array.isArray(payload) ? payload : (payload?.factors ?? [])
  return (factors ?? []).filter((f) => f.factor_type === 'totp')
}

async function deleteFactor(url, key, userId, factorId) {
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}/factors/${factorId}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`delete factor failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
}

async function main() {
  loadEnvFiles()
  const client = createServiceClient()
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL')
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY')

  const email = normalizeEmail(process.argv[2])

  let targets = []
  if (email && email.includes('@')) {
    const user = await findAuthUserByEmail(client, email)
    if (!user) {
      console.error(`No auth.users row for ${email}`)
      process.exit(1)
    }
    targets = [{ id: user.id, email }]
  } else {
    const { data, error } = await client
      .from('exp_admin_users')
      .select('user_id, email')
      .eq('is_active', true)
    if (error) throw new Error(`allow-list read failed: ${error.message}`)
    targets = (data ?? []).map((row) => ({ id: row.user_id, email: row.email }))
  }

  if (targets.length === 0) {
    console.error('No active admin(s) to reset.')
    process.exit(1)
  }

  for (const target of targets) {
    const totp = await listFactors(url, key, target.id)
    console.log(`${target.email}: ${totp.length} TOTP factor(s)`)
    for (const factor of totp) {
      await deleteFactor(url, key, target.id, factor.id)
      console.log(`  deleted ${factor.id}`)
    }
  }

  console.log('\nDone. Sign in and re-enrol in the panel (Settings → Security).')
}

main().catch((error) => {
  console.error('\nreset-admin-mfa failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})