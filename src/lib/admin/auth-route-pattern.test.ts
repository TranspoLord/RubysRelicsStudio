import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

/**
 * SEC-BATCH1-C1 + OCT #16: regression test for the dead-authorization bug. Any
 * admin route handler that calls requireAdminApiSession MUST check the returned
 * `ok` flag and short-circuit with `auth.response` on failure — and it must do
 * so *before* it touches the database or parses the body.
 *
 * OCT #16 fixed two ways the old version passed vacuously:
 *   1. `fullPath.endsWith('/route.ts')` never matched on Windows (`path.join`
 *      yields backslashes), so it walked **0 of 36** files there. It now matches
 *      on `basename(...)` and asserts the walker actually saw the routes.
 *   2. It accepted a whole file if *any* guard existed. It now splits the module
 *      per exported handler and requires the guard in each chunk, ahead of the
 *      first `getSupabaseAdmin()` / `request.json()` / `request.formData()`.
 * A planted-offence case keeps the check from passing on a broken regex.
 */
const ADMIN_ROUTES_DIR = join(process.cwd(), 'src/app/api/admin')

function* walkRouteFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      yield* walkRouteFiles(fullPath)
    } else if (stat.isFile() && basename(fullPath) === 'route.ts') {
      yield fullPath
    }
  }
}

/** Splits a route module into per-handler chunks, keyed on the HTTP-method export. */
function handlerChunks(source: string): string[] {
  const re = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g
  const starts: number[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) starts.push(match.index)
  return starts.map((start, i) =>
    source.slice(start, i + 1 < starts.length ? starts[i + 1] : source.length)
  )
}

const GUARD = /if\s*\(\s*!\w+\.ok\s*\)\s*(?:\{\s*)?return\s+\w+\.response/
const WORK = /getSupabaseAdmin\(|request\.json\(|request\.formData\(/

describe('admin route auth pattern (OCT #16)', () => {
  it('every admin route handler guards requireAdminApiSession before doing work', () => {
    const files = [...walkRouteFiles(ADMIN_ROUTES_DIR)]
    // The walker must actually see the routes — the old Windows bug matched 0.
    expect(files.length).toBeGreaterThanOrEqual(36)

    const failures: string[] = []
    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf-8')
      if (!source.includes('requireAdminApiSession')) continue

      for (const chunk of handlerChunks(source)) {
        if (!chunk.includes('requireAdminApiSession')) continue
        const guardIndex = chunk.search(/if\s*\(\s*!\w+\.ok\s*\)/)
        const workIndex = chunk.search(WORK)
        const guarded = GUARD.test(chunk)
        // The guard must exist and must precede the first DB/body access.
        if (!guarded || (workIndex !== -1 && guardIndex > workIndex)) {
          failures.push(`${basename(filePath)} (${filePath}): ${chunk.slice(0, 70).replace(/\s+/g, ' ')}`)
        }
      }
    }

    expect(failures).toEqual([])
  })

  it('the guard check catches a planted offence (no vacuous pass)', () => {
    const offending = `export async function GET(request: Request) {
      const auth = await requireAdminApiSession(request)
      const supabase = getSupabaseAdmin()
    }`
    const chunk = handlerChunks(offending)[0]
    expect(GUARD.test(chunk)).toBe(false)
    expect(chunk.search(WORK)).toBeGreaterThan(-1)

    const compliant = `export async function GET(request: Request) {
      const auth = await requireAdminApiSession(request)
      if (!auth.ok) return auth.response
      const supabase = getSupabaseAdmin()
    }`
    expect(GUARD.test(handlerChunks(compliant)[0])).toBe(true)
  })
})

