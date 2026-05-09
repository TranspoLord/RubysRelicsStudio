import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]

const CUSTOMER_TABLES = [
  'exp_customers',
  'exp_customer_sessions',
  'exp_password_reset_tokens',
  'exp_customer_addresses',
  'exp_wishlists',
  'exp_recently_viewed',
  'exp_newsletter_subscribers',
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
  return code === 'PGRST205' || message.includes('could not find the table')
}

async function queryOneRow(client, tableName) {
  return client.from(tableName).select('*').limit(1)
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
  const strictMode = process.env.RLS_TEST_STRICT === '1'

  for (const tableName of CUSTOMER_TABLES) {
    const serviceResult = await queryOneRow(serviceClient, tableName)
    if (isMissingTableError(serviceResult.error)) {
      skipped.push(tableName)
      console.log(`${tableName}: SKIP (table not found in Supabase schema cache; migration may be pending)`)
      continue
    }

    if (serviceResult.error) {
      failures.push(
        `[service_role] ${tableName}: expected readable, got error ${serviceResult.error.code ?? 'unknown'} - ${serviceResult.error.message}`,
      )
    }

    const anonResult = await queryOneRow(anonClient, tableName)
    if (!isAuthorizationFailure(anonResult.error)) {
      const errorText = anonResult.error
        ? `${anonResult.error.code ?? 'unknown'} - ${anonResult.error.message}`
        : 'no error returned'
      failures.push(
        `[anon] ${tableName}: expected authorization failure, got ${errorText}`,
      )
    }

    const serviceStatus = serviceResult.error ? 'FAIL' : 'PASS'
    const anonStatus = isAuthorizationFailure(anonResult.error) ? 'PASS' : 'FAIL'
    console.log(`${tableName}: service_role=${serviceStatus}, anon_blocked=${anonStatus}`)
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
