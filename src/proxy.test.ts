import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * `src/proxy.ts` owns two contracts that no type-check can protect and that
 * only show up in a browser or at build time (§7.6):
 *
 * 1. Next 16 requires a named `proxy` export (it used to be `middleware`) and
 *    only fails the build if the name is wrong;
 * 2. every branch must decorate its response with the CSP nonce, or the page
 *    renders unhydrated.
 *
 * The Supabase session layer is mocked so the branch matrix is deterministic and
 * no network call happens — including the "Auth unreachable" case, which is the
 * fail-closed path (§10.5, OCT_IMPLEMENTATION_PLAN.md → OCT-1).
 */

const mocks = vi.hoisted(() => ({
  refreshSupabaseSession: vi.fn(),
  updateSupabaseSession: vi.fn(),
}))

vi.mock('@/lib/supabase/update-session', () => ({
  refreshSupabaseSession: mocks.refreshSupabaseSession,
  updateSupabaseSession: mocks.updateSupabaseSession,
}))

import { readAuthClaims } from '@/lib/auth/claims'
import { CSP_HEADER, CSP_NONCE_COOKIE, CSP_NONCE_HEADER } from '@/lib/security/csp'
import { config, proxy } from '@/proxy'

function request(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, 'http://localhost:3000'))
}

function adminSession() {
  return {
    claims: readAuthClaims({
      sub: '443fb9f7-0000-4000-8000-000000000000',
      email: 'admin@example.com',
      iat: 1_800_000_000,
      app_metadata: { role: 'admin' },
    }),
    response: NextResponse.next(),
  }
}

function anonymousSession() {
  return { claims: null, response: NextResponse.next() }
}

/** Asserts the SEC-047 contract every branch has to satisfy. */
function expectCspDecorations(response: NextResponse) {
  const nonce = response.headers.get(CSP_NONCE_HEADER)
  expect(nonce).toMatch(/^[0-9a-f]{32}$/)
  expect(response.headers.get(CSP_HEADER)).toContain(`'nonce-${nonce}'`)
  expect(response.headers.get(CSP_HEADER)).toContain('https://va.vercel-scripts.com')
  expect(response.cookies.get(CSP_NONCE_COOKIE)?.value).toBe(nonce)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateSupabaseSession.mockResolvedValue(null)
  mocks.refreshSupabaseSession.mockResolvedValue(anonymousSession())
})

describe('proxy entry contract (§7.6)', () => {
  it('exports the handler as `proxy`, which is the name Next 16 requires', () => {
    // `middleware` is deprecated in Next 16 and a `middleware`-named export in
    // proxy.ts fails the production build (Next error E903).
    expect(typeof proxy).toBe('function')
  })

  it('keeps the matcher that excludes static assets and the favicon', () => {
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image|favicon.ico).*)'])
  })
})

describe('storefront branch', () => {
  it('applies the CSP — including the analytics origin — and the nonce', async () => {
    const response = await proxy(request('/'))
    expect(response.status).toBe(200)
    expectCspDecorations(response)
    expect(mocks.refreshSupabaseSession).not.toHaveBeenCalled()
  })
})

describe('admin branch (§10.5)', () => {
  it('allows a verified admin and carries the rotated session cookies out', async () => {
    mocks.refreshSupabaseSession.mockResolvedValue(adminSession())
    const response = await proxy(request('/admin/homepage'))
    expect(response.status).toBe(200)
    expectCspDecorations(response)
  })

  it('redirects a panel page to /admin/login when there is no session', async () => {
    const response = await proxy(request('/admin/homepage'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/admin/login')
    expectCspDecorations(response)
  })

  it('answers an admin API with 401 JSON when there is no session', async () => {
    const response = await proxy(request('/api/admin/orders'))
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expectCspDecorations(response)
  })

  it('leaves the exempt sign-in page reachable and decorated', async () => {
    const response = await proxy(request('/admin/login'))
    expect(response.status).toBe(200)
    expectCspDecorations(response)
    // An exempt path must not consult Auth at all.
    expect(mocks.refreshSupabaseSession).not.toHaveBeenCalled()
  })

  it('fails closed, and in the caller\'s shape, when Auth is unreachable (OCT-1)', async () => {
    mocks.refreshSupabaseSession.mockRejectedValue(new Error('auth service unreachable'))

    const api = await proxy(request('/api/admin/orders'))
    // Before OCT-1 the decision stayed at its 'redirect-login' default, so an
    // API caller got a 307 with no body instead of the documented 401.
    expect(api.status).toBe(401)
    await expect(api.json()).resolves.toEqual({ error: 'Unauthorized' })
    expectCspDecorations(api)

    const page = await proxy(request('/admin'))
    expect(page.status).toBe(307)
    expect(page.headers.get('location')).toBe('http://localhost:3000/admin/login')
    expectCspDecorations(page)
  })
})
