/**
 * Sanitizing logger (SEC-026).
 *
 * All `console.error` calls in API routes MUST use `safeLogError()` which
 * strips known-sensitive patterns (connection strings, API keys, JWTs) from
 * the logged message before writing to stdout.
 */

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Postgres / Supabase connection strings: postgres://user:pass@host
  { pattern: /postgres:\/\/[^\s"']+/g, label: '[REDACTED]' },
  // Square secret keys: sk_live_... or sk_test_...
  { pattern: /sk_(?:live|test)_[a-zA-Z0-9_-]+/g, label: '[REDACTED]' },
  // Generic API key patterns: key_..., shippo_...
  { pattern: /shippo_(?:live|test)_[a-zA-Z0-9_-]+/g, label: '[REDACTED]' },
  // JWTs: eyJ... (header.payload.signature)
  { pattern: /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, label: '[REDACTED]' },
  // Resend API keys: re_...
  { pattern: /re_[a-zA-Z0-9]{20,}/g, label: '[REDACTED]' },
  // Bearer tokens
  { pattern: /Bearer\s+[a-zA-Z0-9_.-]+/g, label: 'Bearer [REDACTED]' },
]

function sanitize(message: string): string {
  let result = message
  for (const { pattern, label } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, label)
  }
  return result
}

/**
 * Renders an error for logging. PostgREST/Postgres errors are plain objects
 * (`{ message, code, details, hint }`) — `String(error)` would log
 * `[object Object]` and drop the diagnostic fields, so those are surfaced
 * explicitly. (OCT #16: observability.)
 */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    const pg = error as Error & { code?: unknown; details?: unknown; hint?: unknown }
    const extras: string[] = []
    if (pg.code != null) extras.push(`code=${String(pg.code)}`)
    if (pg.details != null) extras.push(`details=${String(pg.details)}`)
    if (pg.hint != null) extras.push(`hint=${String(pg.hint)}`)
    return extras.length > 0 ? `${error.message} (${extras.join(', ')})` : error.message
  }
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error) ?? String(error)
  } catch {
    return String(error)
  }
}

/**
 * Log an error with sensitive patterns stripped.
 * Use this instead of `console.error` in all API routes.
 */
export function safeLogError(prefix: string, error: unknown): void {
  console.error(prefix, sanitize(describeError(error)))
}

/**
 * Log an informational message with sensitive patterns stripped.
 */
export function safeLog(prefix: string, ...args: unknown[]): void {
  const sanitizedArgs = args.map((arg) => {
    if (typeof arg === 'string') return sanitize(arg)
    return arg
  })
  console.log(prefix, ...sanitizedArgs)
}