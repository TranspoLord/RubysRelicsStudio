/**
 * Shared environment helpers for security-sensitive decisions.
 *
 * Centralising these checks prevents the inconsistent-env-var bugs identified
 * in SEC-019 (e.g. one route checking NEXT_PUBLIC_APP_ENV while another checks
 * NODE_ENV). Every cookie `secure` flag and production-gated behaviour MUST
 * route through `isProd()`.
 */

/**
 * Returns true only when the app is running in the production Vercel
 * environment. We require BOTH NODE_ENV and VERCEL_ENV to be "production"
 * so that a misconfigured preview deployment never sets Secure cookies
 * over an http connection.
 */
export function isProd(): boolean {
  return (
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV === 'production'
  )
}