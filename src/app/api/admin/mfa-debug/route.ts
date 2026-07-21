import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { isProd } from '@/lib/security/env'

interface DebugResults {
  environment: {
    hasSupabaseUrl: boolean
    hasAnonKey: boolean
    hasServiceRoleKey: boolean
    appEnv: string | undefined
  }
  tests: {
    clientCreated?: boolean
    tableRead?: { success: boolean; error?: string; count?: number }
    tableInsert?: { success: boolean; error?: string }
    testCleanup?: string
    tableDelete?: { success: boolean; error?: string }
    error?: string
  }
}

/**
 * Debug endpoint to test Supabase MFA table connectivity.
 * Helps diagnose Vercel deployment issues.
 *
 * SEC-047: This endpoint is blocked in production to prevent exposing
 * internal state (table counts, error messages, env var presence).
 */
export async function GET(request: NextRequest) {
  // SEC-047: Block in production — debug info should not be exposed
  if (isProd()) {
    return NextResponse.json(
      { error: 'Debug endpoint not available in production.' },
      { status: 403 }
    )
  }

  // Require admin session to access this endpoint
  const sessionCheck = await requireAdminApiSession(request)
  if (!sessionCheck.ok) {
    return sessionCheck.response
  }

  const results: DebugResults = {
    environment: {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY, // SEC-028: boolean only, no key prefix
      appEnv: process.env.NEXT_PUBLIC_APP_ENV,
    },
    tests: {},
  }

  try {
    const supabase = getSupabaseAdmin()
    results.tests.clientCreated = true

    // Test table read access
    const { error, count } = await supabase
      .from('admin_mfa_codes')
      .select('*', { count: 'exact', head: true })

    results.tests.tableRead = {
      success: !error,
      error: error?.message,
      count: count ?? undefined,
    }

    // Test table insert
    const testIp = 'debug-test-' + Date.now()
    const { error: insertError } = await supabase
      .from('admin_mfa_codes')
      .insert({
        ip: testIp,
        code: '000000',
        expires_at: new Date(Date.now() + 60000).toISOString(),
      })

    results.tests.tableInsert = {
      success: !insertError,
      error: insertError?.message,
    }

    // Clean up test entry if insert succeeded
    if (!insertError) {
      await supabase.from('admin_mfa_codes').delete().eq('ip', testIp)
      results.tests.testCleanup = 'completed'
    }

    // Test delete
    const { error: deleteError } = await supabase
      .from('admin_mfa_codes')
      .delete()
      .eq('ip', testIp)

    results.tests.tableDelete = {
      success: !deleteError,
      error: deleteError?.message,
    }
  } catch (err) {
    results.tests.error = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json(results)
}