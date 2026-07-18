import bcrypt from 'bcryptjs'
import { createHmac, randomBytes } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { getResend } from '@/lib/resend/client'

const SESSION_DURATION_DAYS = 30
const PASSWORD_RESET_TOKEN_DURATION_HOURS = 24
const SESSION_TOKEN_LENGTH = 32

// Cost factor for bcrypt — good balance of security and speed
const BCRYPT_ROUNDS = 10

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = SESSION_TOKEN_LENGTH): string {
  return randomBytes(length).toString('hex')
}

/**
 * Hash a password using bcrypt.
 * bcrypt hashes are self-contained (salt + hash stored together like $2a$10$...),
 * so they go directly in the password_hash column without a separate salt field.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

/**
 * Verify a password against a stored hash.
 * Supports both legacy SHA256-HMAC format (salt:hash) and bcrypt ($2a$...).
 *
 * When a legacy hash is detected and the password is correct, the callback
 * allows the caller to upgrade the stored hash to bcrypt on-the-fly.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  onUpgradeNeeded?: (newBcryptHash: string) => Promise<void>
): Promise<boolean> {
  // Detect legacy SHA256 format (salt:hash)
  if (storedHash.includes(':')) {
    const [salt, hash] = storedHash.split(':')
    const computedHash = createHmac('sha256', salt).update(password).digest('hex')
    const isValid = computedHash === hash

    // Upgrade to bcrypt on successful verification
    if (isValid && onUpgradeNeeded) {
      try {
        const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
        await onUpgradeNeeded(newHash)
      } catch {
        // Non-critical — log but don't fail the login
        console.warn('[auth:password] Failed to upgrade legacy hash to bcrypt')
      }
    }

    return isValid
  }

  // bcrypt format
  return bcrypt.compare(password, storedHash)
}

/**
 * Sign up a new customer
 */
export async function signUpCustomer(
  email: string,
  password: string,
  firstName?: string,
  lastName?: string
): Promise<{ customerId: string; error?: string }> {
  if (!email || email.trim().length === 0) {
    return { customerId: '', error: 'Email is required.' }
  }

  if (!password || password.length < 8) {
    return { customerId: '', error: 'Password must be at least 8 characters.' }
  }

  try {
    const supabase = getSupabaseAdmin()

    // Check if email already exists
    const { data: existing, error: checkError } = await supabase
      .from('exp_customers')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (existing) {
      return { customerId: '', error: 'Email is already registered. Please log in instead.' }
    }

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 = no rows returned (expected)
      console.error('[auth:signup]', checkError.message)
      return { customerId: '', error: 'Failed to check email availability.' }
    }

    // Hash password with bcrypt
    const passwordHash = await hashPassword(password)

    // Insert new customer
    const { data, error } = await supabase
      .from('exp_customers')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        first_name: firstName?.trim() || null,
        last_name: lastName?.trim() || null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[auth:signup]', error.message)
      return { customerId: '', error: 'Failed to create account. Please try again.' }
    }

    return { customerId: data.id }
  } catch (error) {
    console.error('[auth:signup]', error)
    return { customerId: '', error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * Log in a customer and create a session
 */
export async function loginCustomer(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ sessionToken?: string; customerId?: string; error?: string }> {
  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  try {
    const supabase = getSupabaseAdmin()

    // Fetch customer
    const { data: customer, error: fetchError } = await supabase
      .from('exp_customers')
      .select('id, password_hash, email')
      .eq('email', email.toLowerCase())
      .single()

    if (!customer || fetchError) {
      // Generic message to avoid email enumeration
      return { error: 'Invalid email or password.' }
    }

    // Verify password (supports both legacy SHA256 and bcrypt)
    if (!customer.password_hash) {
      // This customer uses magic-link only
      return { error: 'This account uses magic-link login. Check your email for a login link.' }
    }

    const isValid = await verifyPassword(
      password,
      customer.password_hash,
      // Upgrade legacy SHA256 hash to bcrypt on successful login
      async (newBcryptHash: string) => {
        await supabase
          .from('exp_customers')
          .update({ password_hash: newBcryptHash, updated_at: new Date().toISOString() })
          .eq('id', customer.id)
      }
    )

    if (!isValid) {
      return { error: 'Invalid email or password.' }
    }

    // Create session token
    const sessionToken = generateSecureToken()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS)

    const { error: sessionError } = await supabase
      .from('exp_customer_sessions')
      .insert({
        customer_id: customer.id,
        session_token: sessionToken,
        ip_address: ipAddress,
        user_agent: userAgent,
        expires_at: expiresAt.toISOString(),
      })

    if (sessionError) {
      console.error('[auth:login]', sessionError.message)
      return { error: 'Failed to create session. Please try again.' }
    }

    // Update last login
    await supabase
      .from('exp_customers')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', customer.id)

    return { sessionToken, customerId: customer.id }
  } catch (error) {
    console.error('[auth:login]', error)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * Verify a session token
 */
export async function verifyCustomerSession(sessionToken: string): Promise<string | null> {
  if (!sessionToken) return null

  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('exp_customer_sessions')
      .select('customer_id, expires_at')
      .eq('session_token', sessionToken)
      .single()

    if (error || !data) {
      return null
    }

    // Check expiration
    if (new Date(data.expires_at) < new Date()) {
      // Session expired
      return null
    }

    // Update last activity
    await supabase
      .from('exp_customer_sessions')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('session_token', sessionToken)

    return data.customer_id
  } catch (error) {
    console.error('[auth:verify]', error)
    return null
  }
}

/**
 * Log out by deleting session
 */
export async function logoutCustomer(sessionToken: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin()

    const { error } = await supabase
      .from('exp_customer_sessions')
      .delete()
      .eq('session_token', sessionToken)

    return !error
  } catch (error) {
    console.error('[auth:logout]', error)
    return false
  }
}

/**
 * Request a password reset (generates token and sends email)
 */
export async function requestPasswordReset(email: string): Promise<{ error?: string }> {
  if (!email) {
    return { error: 'Email is required.' }
  }

  try {
    const supabase = getSupabaseAdmin()

    // Find customer
    const { data: customer, error: fetchError } = await supabase
      .from('exp_customers')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (!customer || fetchError) {
      // Generic message to avoid email enumeration
      // Still return success to avoid leaking whether email exists
      console.warn('[auth:reset-request] Email not found:', email)
      return {}
    }

    // Create reset token
    const token = generateSecureToken()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + PASSWORD_RESET_TOKEN_DURATION_HOURS)

    const { error: tokenError } = await supabase
      .from('exp_password_reset_tokens')
      .insert({
        customer_id: customer.id,
        token,
        expires_at: expiresAt.toISOString(),
      })

    if (tokenError) {
      console.error('[auth:reset-request]', tokenError.message)
      return { error: 'Failed to generate reset link. Please try again.' }
    }

    // Send password reset email via Resend
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'
      const resetLink = `${appUrl.replace(/\/$/, '')}/api/customer/reset-password?token=${token}`
      const resend = getResend()
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@rubysrelicsstudio.com'

      await resend.emails.send({
        from: fromEmail,
        to: [email],
        subject: "Reset your Ruby's Relics Studio password",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Password Reset Request</h2>
            <p>You requested a password reset for your Ruby's Relics Studio account.</p>
            <p>Click the button below to reset your password. This link expires in 24 hours.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" 
                 style="background: #c9a96e; color: #fff; padding: 14px 32px; border-radius: 6px; 
                        text-decoration: none; font-weight: bold; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">
              If you did not request this reset, please ignore this email.
            </p>
            <p style="color: #666; font-size: 12px;">
              Or copy this link into your browser: ${resetLink}
            </p>
          </div>
        `,
      })
    } catch (emailError) {
      // Log the error but don't reveal it to the client
      console.error('[auth:reset-request] Failed to send reset email:', emailError)
    }

    return {}
  } catch (error) {
    console.error('[auth:reset-request]', error)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * Reset password using reset token
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ error?: string }> {
  if (!token || !newPassword) {
    return { error: 'Token and password are required.' }
  }

  if (newPassword.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }

  try {
    const supabase = getSupabaseAdmin()

    // Find reset token
    const { data: resetRecord, error: fetchError } = await supabase
      .from('exp_password_reset_tokens')
      .select('customer_id, expires_at, used')
      .eq('token', token)
      .single()

    if (!resetRecord || fetchError) {
      return { error: 'Invalid or expired reset link.' }
    }

    // Check if already used
    if (resetRecord.used) {
      return { error: 'This reset link has already been used.' }
    }

    // Check expiration
    if (new Date(resetRecord.expires_at) < new Date()) {
      return { error: 'This reset link has expired.' }
    }

    // Hash new password with bcrypt
    const passwordHash = await hashPassword(newPassword)

    // Update customer password
    const { error: updateError } = await supabase
      .from('exp_customers')
      .update({ password_hash: passwordHash })
      .eq('id', resetRecord.customer_id)

    if (updateError) {
      console.error('[auth:reset-password]', updateError.message)
      return { error: 'Failed to update password. Please try again.' }
    }

    // Mark token as used
    await supabase
      .from('exp_password_reset_tokens')
      .update({ used: true, used_at: new Date().toISOString() })
      .eq('token', token)

    // Invalidate all other sessions for security
    await supabase
      .from('exp_customer_sessions')
      .delete()
      .eq('customer_id', resetRecord.customer_id)

    return {}
  } catch (error) {
    console.error('[auth:reset-password]', error)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * Get customer details
 */
export async function getCustomer(customerId: string): Promise<{
  customer?: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
    phone: string | null
    emailVerified: boolean
  }
  error?: string
}> {
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('exp_customers')
      .select('id, email, first_name, last_name, phone, email_verified')
      .eq('id', customerId)
      .single()

    if (error || !data) {
      return { error: 'Customer not found.' }
    }

    return {
      customer: {
        id: data.id,
        email: data.email,
        firstName: data.first_name,
        lastName: data.last_name,
        phone: data.phone,
        emailVerified: data.email_verified,
      },
    }
  } catch (error) {
    console.error('[auth:get-customer]', error)
    return { error: 'Failed to fetch customer.' }
  }
}

/**
 * Update customer profile
 */
export async function updateCustomerProfile(
  customerId: string,
  updates: {
    firstName?: string
    lastName?: string
    phone?: string
    receivesNewsletter?: boolean
  }
): Promise<{ error?: string }> {
  try {
    const supabase = getSupabaseAdmin()

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (updates.firstName !== undefined) updateData.first_name = updates.firstName || null
    if (updates.lastName !== undefined) updateData.last_name = updates.lastName || null
    if (updates.phone !== undefined) updateData.phone = updates.phone || null
    if (updates.receivesNewsletter !== undefined)
      updateData.receives_newsletter = updates.receivesNewsletter

    const { error } = await supabase
      .from('exp_customers')
      .update(updateData)
      .eq('id', customerId)

    if (error) {
      console.error('[auth:update-profile]', error.message)
      return { error: 'Failed to update profile.' }
    }

    return {}
  } catch (error) {
    console.error('[auth:update-profile]', error)
    return { error: 'An unexpected error occurred.' }
  }
}
