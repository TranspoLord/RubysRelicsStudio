import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * SEC-BATCH1-C1: Regression test for the dead-authorization bug. Any admin
 * route handler that calls requireAdminApiSession MUST check the returned
 * `ok` flag and short-circuit with `auth.response` on failure. The previous
 * `instanceof NextResponse` test was always false because the function returns
 * a discriminated union, never a NextResponse instance.
 */
const ADMIN_ROUTES_DIR = join(process.cwd(), 'src/app/api/admin')

function* walkRouteFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      yield* walkRouteFiles(fullPath)
    } else if (stat.isFile() && fullPath.endsWith('/route.ts')) {
      yield fullPath
    }
  }
}

describe('admin route auth pattern', () => {
  it('every admin route using requireAdminApiSession checks if (!auth.ok)', () => {
    const failures: string[] = []

    for (const filePath of walkRouteFiles(ADMIN_ROUTES_DIR)) {
      const source = readFileSync(filePath, 'utf-8')
      if (!source.includes('requireAdminApiSession')) continue

      // Accept either `if (!auth.ok) return auth.response` or
      // `if (!session.ok) return session.response` naming conventions.
      const hasGuard =
        /if\s*\(\s*!\w+\.ok\s*\)\s*return\s+\w+\.response/.test(source) ||
        /if\s*\(\s*!\w+\.ok\s*\)\s*\{\s*return\s+\w+\.response\s*\}/.test(source)

      if (!hasGuard) {
        failures.push(filePath)
      }
    }

    expect(failures).toEqual([])
  })
})
