import { describe, expect, it } from 'vitest'
import {
  listSourceFiles,
  readSourceFile,
  relativeSourcePath,
  stripComments,
} from '@/lib/testing/source-contract'
import { ADMIN_MUTATION_PREFIXES } from './AdminCsrfFetchBridge'

/**
 * OCT #6: every admin mutation must be covered by the CSRF fetch bridge.
 *
 * The bridge attaches `x-csrf-token` to same-origin calls whose path starts with
 * one of `ADMIN_MUTATION_PREFIXES`. A mutation that targets anything else 403s
 * ("CSRF token missing or invalid.") before doing any work — which is exactly how
 * the whole custom-request pipeline was dead in the panel.
 */
const MUTATION_METHOD = /method:\s*['"](POST|PUT|PATCH|DELETE)['"]/

/** Pulls the URL out of each `fetch(...)` call that uses a mutation method. */
function mutationTargets(source: string): string[] {
  const targets: string[] = []
  const call = /fetch\(\s*(`[^`]*`|'[^']*'|"[^"]*")?/g
  let match: RegExpExecArray | null

  while ((match = call.exec(source))) {
    // The URL and its options are always adjacent; 800 characters is far more
    // than any of them needs.
    const options = source.slice(match.index, match.index + 800)
    if (!MUTATION_METHOD.test(options)) continue
    targets.push(match[1] ? match[1].slice(1, -1) : '')
  }

  return targets
}

function isAllowed(url: string): boolean {
  if (!url) return false
  // A template hole (`/api/admin/orders/${id}`) is fine: the prefix is the point.
  return ADMIN_MUTATION_PREFIXES.some((prefix) => url.startsWith(prefix))
}

describe('admin mutation fetch scope (OCT #6)', () => {
  const adminFiles = listSourceFiles().filter((file) => {
    const relative = relativeSourcePath(file)
    return relative.startsWith('/src/app/admin/') || relative.startsWith('/src/components/admin/')
  })

  it('covers the admin surface', () => {
    expect(adminFiles.length).toBeGreaterThan(10)
  })

  it('sends every admin mutation to a CSRF-covered prefix', () => {
    const offenders: string[] = []

    for (const file of adminFiles) {
      const relative = relativeSourcePath(file)
      const source = stripComments(readSourceFile(relative.slice(1)))

      for (const url of mutationTargets(source)) {
        if (!isAllowed(url)) offenders.push(`${relative} → ${url || '(non-literal URL)'}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('catches a planted offence (the guard actually works)', () => {
    const allowed = `await fetch('/api/custom-orders/abc', { method: 'PATCH', body: '{}' })`
    expect(mutationTargets(allowed)).toEqual(['/api/custom-orders/abc'])
    expect(isAllowed('/api/custom-orders/abc')).toBe(true)

    const planted = `await fetch('/api/webhooks/square', { method: 'POST' })`
    expect(mutationTargets(planted)).toEqual(['/api/webhooks/square'])
    expect(isAllowed('/api/webhooks/square')).toBe(false)
  })

  it('still checks the origin before attaching the header', () => {
    const source = stripComments(readSourceFile('src/components/admin/AdminCsrfFetchBridge.tsx'))

    expect(source).toContain('target.origin !== window.location.origin')
    expect(source).toContain('ADMIN_MUTATION_PREFIXES.some')
  })
})
