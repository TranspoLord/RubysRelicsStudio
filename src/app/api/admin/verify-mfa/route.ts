import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { verifyMFACode } from '@/lib/admin/mfa-store'
import { requireAdminApiSession } from '@/lib/admin/auth'

// ─── TOTP Functions (DISABLED - kept for future reference) ─────────────────────
// These functions are disabled but preserved in case TOTP is re-enabled later.
// To re-enable TOTP, uncomment the relevant code in the POST handler below.

function verifyTOTP(secret: string, token: string, window: number = 1): boolean {
  const digits = 6
  const now = Math.floor(Date.now() / 1000)
  const counter = Math.floor(now / 30)

  for (let i = -window; i <= window; i++) {
    const computed = computeTOTP(secret, counter + i, digits)
    if (computed === token) return true
  }
  return false
}

function computeTOTP(secret: string, counter: number, digits: number): string {
  const key = base32Decode(secret)
  const buffer = Buffer.alloc(8)
  const high = Math.floor(counter / 0x100000000)
  const low = counter & 0xffffffff
  buffer.writeUInt32BE(high, 0)
  buffer.writeUInt32BE(low, 4)

  const hmac = createHmac('sha1', key).update(buffer).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff)

  return (code % Math.pow(10, digits)).toString().padStart(digits, '0')
}

function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleaned = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = ''

  for (const char of cleaned) {
    const index = alphabet.indexOf(char)
    bits += index.toString(2).padStart(5, '0')
  }

  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2))
  }

  return Buffer.from(bytes)
}

export async function POST(request: NextRequest) {
  try {
    // Require admin session - must have logged in with admin key first
    const sessionCheck = await requireAdminApiSession(request)
    if (!sessionCheck.ok) {
      return sessionCheck.response
    }

    const { code, totp } = await request.json()
    const ip = sessionCheck.context.clientIp

    // Email-based code verification (primary method)
    if (code && code.length === 6) {
      const isValid = verifyMFACode(ip, code)

      if (!isValid) {
        return NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 401 })
      }

      // Set session cookie
      const response = NextResponse.json({ success: true })
      response.cookies.set('admin_mfa_verified', 'true', {
        httpOnly: true,
        secure: process.env.NEXT_PUBLIC_APP_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 8, // 8 hours
        path: '/',
      })

      return response
    }

    // TOTP verification (disabled - kept for reference)
    // To re-enable TOTP, uncomment the code below and set ADMIN_TOTP_SECRET:
    /*
    const secret = process.env.ADMIN_TOTP_SECRET

    if (!secret) {
      return NextResponse.json({ error: 'MFA not configured' }, { status: 500 })
    }

    if (!totp || totp.length !== 6) {
      return NextResponse.json({ error: 'Invalid code format' }, { status: 400 })
    }

    const isValid = verifyTOTP(secret, totp)

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 401 })
    }

    const response = NextResponse.json({ success: true })
    response.cookies.set('admin_mfa_verified', 'true', {
      httpOnly: true,
      secure: process.env.NEXT_PUBLIC_APP_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8,
      path: '/',
    })

    return response
    */

    // Neither code nor totp provided, or invalid format
    return NextResponse.json({ error: 'Invalid verification code format' }, { status: 400 })
  } catch (error: any) {
    console.error('[MFA Verify] Error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}