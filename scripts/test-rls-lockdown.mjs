import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]

// Relations that were dropped and must not reappear (a live read must fail).
const REMOVED_TABLES = [
  'exp_customers',
  'exp_customer_sessions',
  'exp_password_reset_tokens',
  'exp_customer_addresses',
  'exp_wishlists',
  'exp_recently_viewed',
  'exp_commission_queue',
]

// PII / money tables anon must NOT be able to read. Pass on 42501, OR on a 200
// with zero rows *after* the service role confirmed the table actually holds
// rows (otherwise an empty table would pass vacuously).
const PROTECTED_TABLES = [
  'exp_orders',
  'exp_order_items',
  'exp_custom_requests',
  'exp_cart_captures',
  'exp_promo_codes',
  'exp_bundle_deals',
  'exp_artwork_uploads',
  'exp_admin_users',
  'exp_admin_audit_log',
  'exp_product_designs',
  'exp_product_design_assets',
  'exp_product_design_exports',
  'exp_rate_limit_windows',
]

// Service-role-only RPCs (OCT #3): anon must not be able to execute them.
const PROTECTED_RPCS = [
  ['increment_rate_limit', { p_expires_at: new Date().toISOString(), p_key: 'rls-probe' }],
  ['cleanup_expired_rate_limits', {}],
  ['exp_reserve_order_inventory', { p_order_id: '00000000-0000-0000-0000-000000000000' }],
  ['exp_release_order_inventory', { p_order_id: '00000000-0000-0000-0000-000000000000' }],
  ['exp_increment_promo_code_usage', { p_code_id: '00000000-0000-0000-0000-000000000000' }],
  ['exp_increment_bundle_deal_usage', { p_deal_id: '00000000-0000-0000-0000-000000000000' }],
]

// Buckets whose object listing must not be open to anon.
const PRIVATE_BUCKETS = ['customer-artwork', 'design-artifacts', 'product-media']

// Tables with selective RLS: anon can SELECT visible rows but cannot INSERT/UPDATE/DELETE
const SELECTIVE_RLS_TABLES = [
  'exp_future_products',
  'exp_future_product_statuses',
]

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  const raw = readFileSync(filePath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] == null) {
      process.env[key] = value
    }
  }
}

function getEnv(name) {
  const value = process.env[name]
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function isAuthorizationFailure(error) {
  if (!error) return false
  const code = String(error.code ?? '')
  const message = String(error.message ?? '').toLowerCase()
  return code === '42501' || message.includes('permission denied') || message.includes('not allowed')
}

function isMissingTableError(error) {
  if (!error) return false
  const code = String(error.code ?? '')
  const message = String(error.message ?? '').toLowerCase()
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    message.includes('could not find the table') ||
    message.includes('does not exist')
  )
}

/** True when a call to a service-role-only RPC was refused (revoked or hidden). */
function isRpcBlocked(error) {
  if (!error) return false
  const code = String(error.code ?? '')
  const message = String(error.message ?? '').toLowerCase()
  return (
    code === '42501' ||
    code === 'PGRST202' ||
    message.includes('permission denied') ||
    message.includes('could not find the function')
  )
}

async function queryOneRow(client, tableName) {
  return client.from(tableName).select('*').limit(1)
}

/**
 * A plain signed-in (authenticated) user must not bypass RLS. Creates a
 * throwaway confirmed user with the service role, signs in, probes, and deletes
 * the user in a `finally`. (OCT #65: the RLS-bypassing view was granted to
 * `authenticated`, so the anon-only probes missed it entirely.)
 */
async function runAuthenticatedProbe(serviceClient, url, anonKey, failures) {
  const email = `rls-probe-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  const password = `Probe-${crypto.randomUUID()}`
  let userId = null

  try {
    const created = await serviceClient.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error || !created.data?.user) {
      failures.push(`[auth-probe] could not create a throwaway user: ${created.error?.message ?? 'unknown'}`)
      return
    }
    userId = created.data.user.id

    const signInClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const signIn = await signInClient.auth.signInWithPassword({ email, password })
    if (signIn.error || !signIn.data?.session) {
      failures.push(`[auth-probe] could not sign in the throwaway user: ${signIn.error?.message ?? 'unknown'}`)
      return
    }

    const authed = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${signIn.data.session.access_token}` } },
    })

    const viewResult = await authed.from('exp_commission_queue').select('*').limit(1)
    if (isMissingTableError(viewResult.error)) {
      console.log('auth-probe exp_commission_queue: PASS (gone)')
    } else {
      const errorText = viewResult.error
        ? `${viewResult.error.code ?? 'unknown'} - ${viewResult.error.message}`
        : 'a readable response'
      failures.push(`[auth-probe] exp_commission_queue: expected a missing-relation error, got ${errorText}`)
      console.log('auth-probe exp_commission_queue: FAIL (readable)')
    }

    const ordersResult = await authed.from('exp_orders').select('id').limit(1)
    const ordersBlocked =
      isAuthorizationFailure(ordersResult.error) ||
      (!ordersResult.error && Array.isArray(ordersResult.data) && ordersResult.data.length === 0)
    if (ordersBlocked) {
      console.log('auth-probe exp_orders: PASS (denied/empty)')
    } else {
      failures.push('[auth-probe] exp_orders: an authenticated user could read order rows')
      console.log('auth-probe exp_orders: FAIL')
    }
  } finally {
    if (userId) {
      await serviceClient.auth.admin.deleteUser(userId)
    }
  }
}

async function main() {
  const cwd = process.cwd()
  loadEnvFile(join(cwd, '.env.local'))
  loadEnvFile(join(cwd, '.env'))

  for (const envName of REQUIRED_ENV) {
    getEnv(envName)
  }

  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')

  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const serviceClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const failures = []
  const skipped = []
  // #65: strict by default — a "skip" is a failure unless explicitly opted out.
  // (The old default let the script pass while covering nothing.)
  const strictMode = process.env.RLS_TEST_ALLOW_SKIPS !== '1'

  // ─── Dropped relations: a live read must fail (OCT #3 drops the view) ───────
  for (const tableName of REMOVED_TABLES) {
    const result = await queryOneRow(anonClient, tableName)
    if (isMissingTableError(result.error)) {
      console.log(`${tableName}: PASS (removed)`)
    } else {
      const errorText = result.error
        ? `${result.error.code ?? 'unknown'} - ${result.error.message}`
        : 'a readable response'
      failures.push(`[removed] ${tableName}: expected a missing-relation error, got ${errorText}`)
      console.log(`${tableName}: FAIL (still present)`)
    }
  }

  // ─── Protected tables: anon denied, or empty only if the table is empty ─────
  for (const tableName of PROTECTED_TABLES) {
    const serviceResult = await queryOneRow(serviceClient, tableName)
    if (isMissingTableError(serviceResult.error)) {
      skipped.push(tableName)
      console.log(`${tableName}: SKIP (not found; migration may be pending)`)
      continue
    }
    if (serviceResult.error) {
      failures.push(
        `[service_role] ${tableName}: expected readable, got ${serviceResult.error.code ?? 'unknown'} - ${serviceResult.error.message}`,
      )
    }
    const serviceHasRows = Array.isArray(serviceResult.data) && serviceResult.data.length > 0

    const anonResult = await queryOneRow(anonClient, tableName)
    const anonDenied = isAuthorizationFailure(anonResult.error)
    const anonEmpty =
      !anonResult.error && Array.isArray(anonResult.data) && anonResult.data.length === 0
    // Denied is always fine. "200 + 0 rows" only counts when the table has rows,
    // otherwise an empty table would pass vacuously.
    const ok = anonDenied || (anonEmpty && serviceHasRows)
    if (!ok) {
      const errorText = anonResult.error
        ? `${anonResult.error.code ?? 'unknown'} - ${anonResult.error.message}`
        : 'no error'
      failures.push(
        `[anon] ${tableName}: expected denial or zero rows, got ${errorText}${anonEmpty ? ' (but the table is empty — proves nothing)' : ''}`,
      )
    }
    console.log(
      `${tableName}: service_role=${serviceResult.error ? 'FAIL' : 'PASS'}, anon_blocked=${ok ? 'PASS' : 'FAIL'}${anonEmpty ? ' (empty)' : ''}`,
    )
  }

  // ─── Service-role-only RPCs: anon must be refused (OCT #3) ──────────────────
  for (const [fnName, args] of PROTECTED_RPCS) {
    const result = await anonClient.rpc(fnName, args)
    if (isRpcBlocked(result.error)) {
      console.log(`rpc ${fnName}: PASS (anon blocked)`)
    } else {
      const errorText = result.error
        ? `${result.error.code ?? 'unknown'} - ${result.error.message}`
        : 'no error — anon executed it!'
      failures.push(`[rpc] ${fnName}: expected anon to be blocked, got ${errorText}`)
      console.log(`rpc ${fnName}: FAIL`)
    }
  }

  // ─── Private bucket listing should be closed to anon (warn: #64 tightens) ───
  for (const bucket of PRIVATE_BUCKETS) {
    const result = await anonClient.storage.from(bucket).list('', { limit: 1 })
    const blocked = Boolean(result.error) || (Array.isArray(result.data) && result.data.length === 0)
    if (blocked) {
      console.log(`bucket ${bucket}: PASS (anon cannot list)`)
    } else {
      console.warn(`bucket ${bucket}: WARN — anon can list objects (see OCT #64: drop the storage SELECT policy)`)
    }
  }

  // ─── Authenticated probe: a plain signed-in user must not bypass RLS ────────
  await runAuthenticatedProbe(serviceClient, url, anonKey, failures)

  // ─── Selective RLS tables: anon can SELECT visible rows, but cannot write ────
  for (const tableName of SELECTIVE_RLS_TABLES) {
    const serviceResult = await queryOneRow(serviceClient, tableName)
    if (isMissingTableError(serviceResult.error)) {
      skipped.push(tableName)
      console.log(`${tableName}: SKIP (table not found; migration may be pending)`)
      continue
    }

    if (serviceResult.error) {
      failures.push(
        `[service_role] ${tableName}: expected readable, got error ${serviceResult.error.code ?? 'unknown'} - ${serviceResult.error.message}`,
      )
    }

    // Anon should be able to SELECT (visible rows only — RLS filters them)
    const anonReadResult = await queryOneRow(anonClient, tableName)
    if (anonReadResult.error && !isAuthorizationFailure(anonReadResult.error)) {
      failures.push(
        `[anon read] ${tableName}: SELECT visible rows should succeed, got error ${anonReadResult.error.code ?? 'unknown'} - ${anonReadResult.error.message}`,
      )
    }

    // Anon should NOT be able to INSERT (no INSERT policy for anon/authenticated)
    const anonInsertResult = await anonClient.from(tableName).insert({})
    if (!isAuthorizationFailure(anonInsertResult.error)) {
      const errorText = anonInsertResult.error
        ? `${anonInsertResult.error.code ?? 'unknown'} - ${anonInsertResult.error.message}`
        : 'no error — INSERT was not blocked!'
      failures.push(`[anon write] ${tableName}: INSERT should be blocked, got ${errorText}`)
    }

    const s2 = serviceResult.error ? 'FAIL' : 'PASS'
    const anonReadOk = isAuthorizationFailure(anonReadResult.error) ? 'FAIL' : 'PASS'
    const anonWriteBlocked = isAuthorizationFailure(anonInsertResult.error) ? 'PASS' : 'FAIL'
    console.log(`${tableName}: service_role=${s2}, anon_read=${anonReadOk}, anon_write_blocked=${anonWriteBlocked}`)
  }

  if (failures.length > 0) {
    console.error('\nRLS lockdown verification failed:')
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    process.exit(1)
  }

  if (skipped.length > 0) {
    const joined = skipped.join(', ')
    if (strictMode) {
      console.error(`\nStrict mode enabled and these tables were missing: ${joined}`)
      process.exit(1)
    }
    console.warn(`\nRLS verification skipped missing table(s): ${joined}`)
    console.warn('Apply pending migrations, then run with RLS_TEST_STRICT=1 for full enforcement.')
  }

  console.log('\nRLS lockdown verification passed for all customer tables.')
}

main().catch((error) => {
  console.error('Unexpected test failure:', error)
  process.exit(1)
})
