import { createClient } from '@supabase/supabase-js'

// ─── Branch isolation (mirrors sticker-site resolveBranch pattern) ────────────
function resolveBranch(): string {
  const env = process.env.NEXT_PUBLIC_APP_ENV ?? 'development'
  if (env === 'production') return 'PROD'
  if (env === 'test') return 'TEST'
  return 'DEV'
}

export const branch = resolveBranch()

// ─── Public client (browser-safe, uses anon key) ──────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Supabase] NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Admin client (server-only, uses service role key) ───────────────────────
// Only import this in server-side code (API routes, server actions).
// Never expose the service role key to the browser.
export function getSupabaseAdmin() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('[Supabase] SUPABASE_SERVICE_ROLE_KEY must be set for admin operations.')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
