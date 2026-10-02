import { describe, expect, it } from 'vitest'

import { listSourceFiles, readSourceFile, relativeSourcePath } from '@/lib/testing/source-contract'
import { MIN_MUTED_TEXT_ALPHA } from '@/theme/theme'

/**
 * The §8.3 sweep is only half a fix on its own: nothing stopped the next
 * component from writing `alpha(brandTokens.parchment, 0.4)` again, and the
 * audit found 151 such sites, so the regression is guaranteed without a guard.
 *
 * This test walks `src/` and fails on any *text* colour below the floor. It is
 * deliberately a source scan rather than a render test: the values are literals
 * in `sx` props, and a source scan keeps working without a DOM harness
 * (OCT_IMPLEMENTATION_PLAN.md → OCT-5).
 *
 * Scope:
 * - only `color:` is inspected, so the many low-alpha *borders* and background
 *   tints the design relies on are untouched (`borderColor:`/`backgroundColor:`
 *   are different properties and mostly use capital-C casing);
 * - dynamic values (`alpha(…, muted ? 0.4 : 1)`) are invisible to this scan; they
 *   are also invisible to `grep`, so reviewers should watch for them by hand.
 */

/** Matches `color: alpha(brandTokens.parchment, 0.4)`. */
const MUTED_TEXT_PATTERN = /\bcolor:\s*alpha\(brandTokens\.parchment,\s*0\.(\d+)\)/g

/** Raw hexes that are only legible as a *surface*, never as text (§9.5). */
const SURFACE_ONLY_HEXES = ['#CF4040', '#cF4040', '#4A7C3F', '#3A6B8A', '#C97B22']

describe('muted text contrast floor (§8.3 / §9.5)', () => {
  it(`no text colour in src/ sits below alpha ${MIN_MUTED_TEXT_ALPHA}`, () => {
    const offenders: string[] = []

    for (const file of listSourceFiles()) {
      const relative = relativeSourcePath(file)
      const lines = readSourceFile(relative.slice(1)).split(/\r?\n/)
      lines.forEach((line, index) => {
        for (const match of line.matchAll(MUTED_TEXT_PATTERN)) {
          const alpha = Number(`0.${match[1]}`)
          if (alpha < MIN_MUTED_TEXT_ALPHA) {
            offenders.push(`${relative}:${index + 1} alpha=${alpha}`)
          }
        }
      })
    }

    expect(offenders).toEqual([])
  })

  it('no component paints text with a surface-only colour', () => {
    const offenders: string[] = []

    for (const file of listSourceFiles()) {
      const relative = relativeSourcePath(file)
      const lines = readSourceFile(relative.slice(1)).split(/\r?\n/)
      lines.forEach((line, index) => {
        for (const hex of SURFACE_ONLY_HEXES) {
          const textUse = new RegExp(`\\bcolor:\\s*'${hex}'`, 'i')
          if (textUse.test(line)) {
            offenders.push(`${relative}:${index + 1} ${hex}`)
          }
        }
      })
    }

    expect(offenders).toEqual([])
  })

  it('the scan itself works — it finds a planted offence', () => {
    // Guards against a pattern that silently matches nothing, which would make
    // the two assertions above vacuously true.
    const planted = "sx={{ color: alpha(brandTokens.parchment, 0.35) }}"
    const found = [...planted.matchAll(MUTED_TEXT_PATTERN)].map((m) => Number(`0.${m[1]}`))
    expect(found).toEqual([0.35])
    expect(found[0]).toBeLessThan(MIN_MUTED_TEXT_ALPHA)
  })
})
