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
  if (process.env.NODE_ENV !== 'production') {
    return false
  }

  // On Vercel, only treat production deploys as production.
  if (process.env.VERCEL) {
    return process.env.VERCEL_ENV === 'production'
  }

  // Non-Vercel production deployments should still enable production safeguards.
  return true
}

/**
 * Returns true when cookies must carry `Secure`.
 *
 * OCT #69: `isProd()` is deliberately strict (a preview deploy must not set
 * `Secure` over an http connection to a *preview* host), but that left preview
 * deployments — which are https — issuing `Secure`-less session and CSRF
 * cookies. `isHttpsDeployment()` is the right predicate for the `secure` flag:
 * production, or any Vercel deployment (previews included, all https).
 *
 * Do **not** use this for behaviour that must only happen in production (e.g.
 * relaxing a CSP in dev): use `isProd()` there.
 */
export function isHttpsDeployment(): boolean {
  return isProd() || process.env.VERCEL === '1'
}

/**
 * Returns true on a Vercel **preview** deployment.
 *
 * Only previews get the `vercel.live` toolbar, so only previews may allow-list
 * that origin in the CSP (OCT #69).
 */
export function isPreviewDeployment(): boolean {
  return process.env.VERCEL_ENV === 'preview'
}