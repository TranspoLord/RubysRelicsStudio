/**
 * Admin allow-list tooling (SEPT_IMPLEMENTATION_PLAN §10.1 / §10.2).
 *
 * The allow-list is `exp_admin_users`, keyed by `auth.users.id`. An account is
 * an admin only when both gates agree:
 *   - the DB gate (§10.3): a row here with `is_active = true` and `revoked_at is null`
 *   - the Edge gate (§10.5): `app_metadata.role === 'admin'` on the user's JWT
 *
 * `grantAdmin()` writes both, `revokeAdmin()` clears both. The DB row is the
 * authority; the claim is an Edge-safe optimisation.
 *
 * The bootstrap case (no admin exists yet) is service-role only — this module
 * is the only path that creates an admin identity. There is deliberately no web
 * form, or the first admin would be an unauthenticated write.
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The allow-list table created by migration 066. */
export const ALLOWLIST_TABLE = 'exp_admin_users'

export const ADMIN_ROLE = 'admin'

/** Page size used when scanning auth.users for an email match. */
const LIST_USERS_PER_PAGE = 1000

/** Guard against an unbounded scan if the project ever holds many users. */
const MAX_USER_PAGES = 100

/**
 * Loads `.env.local` then `.env` from `cwd`, without overwriting variables that
 * are already set in the process environment.
 *
 * Same behaviour as `scripts/test-rls-lockdown.mjs` so the two scripts agree on
 * how local configuration is resolved.
 */
export function loadEnvFiles(cwd = process.cwd()) {
  loadEnvFile(join(cwd, '.env.local'))
  loadEnvFile(join(cwd, '.env'))
}

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

export function getEnv(name) {
  const value = process.env[name]
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

/**
 * Service-role client. Bypasses RLS, which is required: both `exp_admin_users`
 * and `auth.users` are unreadable with the anon key.
 */
export function createServiceClient() {
  return createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Emails are compared case-insensitively; Google may return either casing. */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

/**
 * Finds the `auth.users` row for an email address.
 *
 * `supabase.auth.admin` exposes no "get user by email", so this pages through
 * `listUsers()`. Returns `null` when no account has signed in with that address
 * yet — the caller decides whether that is fatal.
 */
export async function findAuthUserByEmail(client, email) {
  const target = normalizeEmail(email)
  if (!target) throw new Error('An email address is required.')

  let page = 1
  let lastPage = 1

  do {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: LIST_USERS_PER_PAGE })
    if (error) {
      throw new Error(`Could not list auth users: ${error.message}`)
    }

    const users = data?.users ?? []
    const match = users.find((user) => normalizeEmail(user.email) === target)
    if (match) return match


    // GoTrue only emits `lastPage`/`total` when it sends the pagination headers,
    // so a missing value means "unknown, keep paging" rather than "one page" —
    // the full-page check below ends the scan for the normal single-page case.
    const total = data?.total ?? 0
    lastPage = data?.lastPage || (total > 0 ? Math.ceil(total / LIST_USERS_PER_PAGE) : MAX_USER_PAGES)
    if (users.length < LIST_USERS_PER_PAGE) return null
    page += 1
  } while (page <= lastPage && page <= MAX_USER_PAGES)

  return null
}

/**
 * Grants admin access: upserts the allow-list row, then mirrors the role into
 * `app_metadata` so the Edge gate agrees.
 *
 * The existing `app_metadata` is spread into the write on purpose — `provider`
 * and `providers` live there, and the claim must be safe whether the Auth
 * server merges or replaces the object.
 */
export async function grantAdmin(client, { email, createdBy = 'scripts/grant-admin.mjs' }) {
  const target = normalizeEmail(email)
  const user = await findAuthUserByEmail(client, target)
  if (!user) {
    throw new Error(
      `No auth.users row for ${target}. That account must sign in with Google once ` +
        '(storefront /sign-in) before it can be allow-listed — Google sign-in is what creates the row.'
    )
  }

  const { data: existingRow, error: readError } = await client
    .from(ALLOWLIST_TABLE)
    .select('user_id, created_by, is_active')
    .eq('user_id', user.id)
    .maybeSingle()

  if (readError) {
    throw new Error(`Could not read ${ALLOWLIST_TABLE}: ${readError.message}`)
  }

  const { error: rowError } = await client.from(ALLOWLIST_TABLE).upsert(
    {
      user_id: user.id,
      email: normalizeEmail(user.email ?? target),
      role: ADMIN_ROLE,
      is_active: true,
      // Preserve who originally granted access; a re-grant is not a new grant.
      created_by: existingRow?.created_by ?? createdBy,
      revoked_at: null,
    },
    { onConflict: 'user_id' }
  )

  if (rowError) {
    throw new Error(`Could not upsert ${ALLOWLIST_TABLE}: ${rowError.message}`)
  }

  const { error: claimError } = await client.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata ?? {}), role: ADMIN_ROLE },
  })

  if (claimError) {
    throw new Error(
      `Allow-list row written, but the app_metadata claim failed: ${claimError.message}. ` +
        'Run the command again — the DB row alone is enough for §10.3, but §10.5 needs the claim.'
    )
  }

  return {
    userId: user.id,
    email: normalizeEmail(user.email ?? target),
    created: !existingRow,
    reactivated: Boolean(existingRow && !existingRow.is_active),
  }
}

/**
 * Revokes admin access: deactivates the allow-list row (the revocation
 * authority) and clears the `app_metadata.role` claim.
 *
 * Works even when the `auth.users` row is already gone — the row is still
 * deactivated by email, so a recycled address cannot silently re-admit.
 */
export async function revokeAdmin(client, { email }) {
  const target = normalizeEmail(email)
  if (!target) throw new Error('An email address is required.')

  const user = await findAuthUserByEmail(client, target)
  const revokedAt = new Date().toISOString()

  // Preference order: match the row by user_id when the account exists, else by
  // email so a deleted account's row is still deactivated.
  const filterColumn = user ? 'user_id' : 'email'
  const filterValue = user ? user.id : target

  const { data: updatedRows, error: rowError } = await client
    .from(ALLOWLIST_TABLE)
    .update({ is_active: false, revoked_at: revokedAt })
    .eq(filterColumn, filterValue)
    .select('user_id')

  if (rowError) {
    throw new Error(`Could not update ${ALLOWLIST_TABLE}: ${rowError.message}`)
  }

  let claimCleared = false
  if (user) {
    // `role: null` (rather than deleting the key) makes the removal effective
    // whether the server merges or replaces app_metadata; every other key is
    // preserved so provider identity mapping survives.
    const { error: claimError } = await client.auth.admin.updateUserById(user.id, {
      app_metadata: { ...(user.app_metadata ?? {}), role: null },
    })

    if (claimError) {
      throw new Error(
        `Allow-list row revoked, but clearing the app_metadata claim failed: ${claimError.message}. ` +
          'The DB gate already rejects the account; retry to clear the claim.'
      )
    }

    claimCleared = true
  }

  return {
    email: target,
    userId: user?.id ?? null,
    rowRevoked: Array.isArray(updatedRows) && updatedRows.length > 0,
    claimCleared,
  }
}
