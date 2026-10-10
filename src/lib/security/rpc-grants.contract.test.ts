import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * OCT #3: PostgREST exposes every `public` function at /rest/v1/rpc/<name>, and
 * Postgres grants EXECUTE on new functions to PUBLIC by default. So every
 * **callable** SECURITY DEFINER function must have an explicit
 * `revoke execute ... from public, anon, authenticated` somewhere in the
 * migrations. Trigger functions are excluded (they are only reachable as a
 * trigger), and a planted-offence case keeps the scan from passing vacuously.
 */
const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations')

function allMigrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), 'utf-8'))
    .join('\n')
}

interface DefinerFunction {
  name: string
  returnsTrigger: boolean
}

/** Every SECURITY DEFINER function declared in the given SQL. */
function securityDefinerFunctions(sql: string): DefinerFunction[] {
  const re =
    /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\([\s\S]*?\)\s*([\s\S]*?)\bas\s+\$\$/gi
  const found: DefinerFunction[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(sql)) !== null) {
    const header = match[2].toLowerCase()
    if (!header.includes('security definer')) continue
    found.push({ name: match[1], returnsTrigger: /returns\s+trigger/.test(header) })
  }
  return found
}

function hasExecuteRevoke(sql: string, name: string): boolean {
  return new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+(?:public\\.)?${name}\\s*\\(`, 'i').test(sql)
}

describe('SECURITY DEFINER RPC grants (OCT #3)', () => {
  const sql = allMigrationSql()
  const callable = [
    ...new Set(securityDefinerFunctions(sql).filter((fn) => !fn.returnsTrigger).map((fn) => fn.name)),
  ].sort()

  it('finds the callable definer functions (scan is not vacuous)', () => {
    expect(callable.length).toBeGreaterThan(0)
  })

  it('every callable SECURITY DEFINER function has an EXECUTE revoke', () => {
    const offenders = callable.filter((name) => !hasExecuteRevoke(sql, name))
    expect(offenders).toEqual([])
  })

  it('the check catches a planted un-revoked definer function', () => {
    const planted = `create or replace function public.sneaky_fn(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$ begin end; $$;`
    const names = securityDefinerFunctions(planted).map((fn) => fn.name)
    expect(names).toContain('sneaky_fn')
    expect(hasExecuteRevoke(planted, 'sneaky_fn')).toBe(false)
  })
})
