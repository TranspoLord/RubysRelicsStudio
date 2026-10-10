import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Schema contract (OCT #2, deferred from #16): every `payment_mode:` literal
 * written under `src/app/api` must be allowed by the `exp_orders_payment_mode_check`
 * constraint in `supabase/migrations`. The shop checkout route wrote
 * `'square_checkout'` while the CHECK only allowed three values, so every shop
 * order insert failed with 23514 — the customer paid and no order was recorded.
 * This test fails on the pre-`069` tree and passes after it.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations')
const API_DIR = join(process.cwd(), 'src/app/api')

function walkFiles(dir: string, predicate: (file: string) => boolean): string[] {
  const out: string[] = []
  function walk(current: string): void {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else if (predicate(full)) {
        out.push(full)
      }
    }
  }
  walk(dir)
  return out
}

function relative(file: string): string {
  return file.replace(process.cwd(), '').replace(/\\/g, '/')
}

/** `payment_mode: '<literal>'` values written under `src/app/api`. */
function apiPaymentModeLiterals(): { value: string; file: string }[] {
  const found: { value: string; file: string }[] = []
  for (const file of walkFiles(API_DIR, (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
    const source = readFileSync(file, 'utf-8')
    for (const match of source.matchAll(/payment_mode\s*:\s*'([^']+)'/g)) {
      found.push({ value: match[1], file: relative(file) })
    }
  }
  return found
}

/** The values in the *last* `exp_orders_payment_mode_check` across the migrations. */
function latestPaymentModeCheck(): string[] {
  const sql = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), 'utf-8'))
    .join('\n')

  const matches = [
    ...sql.matchAll(/exp_orders_payment_mode_check[\s\S]*?payment_mode\s+in\s*\(([^)]*)\)/gi),
  ]
  if (matches.length === 0) return []
  return [...matches[matches.length - 1][1].matchAll(/'([^']+)'/g)].map((match) => match[1])
}

describe('payment_mode schema contract (OCT #2)', () => {
  const allowed = latestPaymentModeCheck()

  it('finds the CHECK definition (scan is not vacuous)', () => {
    expect(allowed.length).toBeGreaterThan(0)
    expect(allowed).toContain('stripe_checkout')
  })

  it('allows the mode the shop checkout route writes', () => {
    expect(allowed).toContain('square_checkout')
  })

  it('every payment_mode literal under src/app/api is allowed by the CHECK', () => {
    const literals = apiPaymentModeLiterals()
    expect(literals.length).toBeGreaterThan(0)

    const allowedSet = new Set(allowed)
    const offenders = literals.filter((literal) => !allowedSet.has(literal.value))
    expect(
      offenders.map((offender) => `${offender.file}: payment_mode '${offender.value}'`),
    ).toEqual([])
  })

  it('the check catches a planted literal the CHECK does not allow', () => {
    const allowedSet = new Set(allowed)
    expect(allowedSet.has('totally_made_up_mode')).toBe(false)
  })
})
