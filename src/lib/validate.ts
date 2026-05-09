/**
 * Shared input validation and sanitization utilities.
 * All functions are pure and dependency-free.
 */

// RFC 5322-compatible email regex (pragmatic subset — covers 99.9% of real addresses)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Validate an email address format and length.
 * Returns the normalized (lowercased) email or null if invalid.
 */
export function validateEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (trimmed.length === 0 || trimmed.length > 254) return null
  if (!EMAIL_REGEX.test(trimmed)) return null
  return trimmed
}

/**
 * Sanitize a text string: trim, collapse internal whitespace, strip null bytes,
 * and enforce a maximum length. Returns empty string if input is not a string.
 */
export function sanitizeText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\0/g, '')           // strip null bytes
    .trim()
    .replace(/\s+/g, ' ')         // collapse whitespace
    .slice(0, maxLen)
}

/**
 * Sanitize a phone number: allow digits, +, -, (, ), spaces only.
 * Returns null if the value is empty or doesn't look like a phone number.
 */
export function sanitizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const sanitized = value
    .replace(/[^0-9+\-() ]/g, '') // keep only valid phone chars
    .trim()
    .slice(0, 20)
  return sanitized.length >= 5 ? sanitized : null
}

/**
 * Validate password strength.
 * Returns an error string if invalid, or null if valid.
 */
export function validatePassword(value: unknown): string | null {
  if (typeof value !== 'string') return 'Password is required.'
  if (value.length < 8) return 'Password must be at least 8 characters.'
  if (value.length > 72) return 'Password must be 72 characters or fewer.'
  return null
}

/**
 * Escape HTML special characters for safe use in email HTML bodies.
 */
export function safeHtmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Sanitize a search query: strip special SQL/regex chars that could cause
 * unexpected ILIKE behavior, trim, and enforce max length.
 */
export function sanitizeSearchQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const sanitized = value
    .replace(/[%_\\]/g, '')        // strip ILIKE wildcards and escapes
    .replace(/\0/g, '')            // strip null bytes
    .trim()
    .slice(0, 200)
  return sanitized.length >= 2 ? sanitized : null
}
