import { NextRequest, NextResponse } from 'next/server'
import { verifyMFACode } from '@/lib/admin/mfa-store'
import { requireAdminApiSession } from '@/lib/admin/auth'

export async function POST(request: NextRequest) {
  try {
    // Require admin session - must have logged in with admin key first
    const sessionCheck = await requireAdminApiSession(request)
    if (!sessionCheck.ok) {
      return sessionCheck.response
    }

    const { code } = await request.json()
    const ip = sessionCheck.context.clientIp

    // Log for debugging (helps diagnose Vercel IP mismatches)
    console.log('[MFA Verify] IP for verification:', ip)

    // Email-based code verification
    if (!code || code.length !== 6) {
      return NextResponse.json({ error: 'Invalid verification code format' }, { status: 400 })
    }

    const isValid = await verifyMFACode(ip, code)

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 401 })
    }

    // Set session cookie - MFA verified
    const response = NextResponse.json({ success: true })
    response.cookies.set('admin_mfa_verified', 'true', {
      httpOnly: true,
      secure: process.env.NEXT_PUBLIC_APP_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8, // 8 hours
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('[MFA Verify] Error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}