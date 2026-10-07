import { describe, expect, it } from 'vitest'

import { listSourceFiles, readSourceFile, relativeSourcePath } from '@/lib/testing/source-contract'
import { MIN_TEXT_SIZE_REM } from '@/theme/theme'

/**
 * §8.5 — the 12px type floor. Batch 9 swept ~50 `0.6–0.74rem` `fontSize` sites
 * across 26 files up to `MIN_TEXT_SIZE_REM`; this scan keeps them there.
 *
 * It is a source scan, not a render test, for the same reason as the contrast
 * floor (OCT_IMPLEMENTATION_PLAN.md → OCT-5): the values are literals in `sx`
 * props, and a scan works without a DOM harness.
 *
 * Scope:
 * - only rem **strings** below the floor are inspected (`fontSize: '0.65rem'`);
 *   numeric icon sizes (`fontSize: 13`, `sx={{ fontSize: 14 }}`) are not text and
 *   are untouched;
 * - a `fontSize: 0.75` numeric (px) is invisible to this scan but is not the
 *   failure mode it targets — the defect was rem strings, so that is what it pins.
 */

/** Matches `fontSize: '0.NNrem'`; group 1 is the NN. */
const REM_FONT_PATTERN = /\bfontSize:\s*'0\.(\d{1,2})rem'/g

describe('sub-12px text floor (§8.5)', () => {
  it(`no rem font size in src/ sits below ${MIN_TEXT_SIZE_REM}rem`, () => {
    const offenders: string[] = []

    for (const file of listSourceFiles()) {
      const relative = relativeSourcePath(file)
      const lines = readSourceFile(relative.slice(1)).split(/\r?\n/)
      lines.forEach((line, index) => {
        for (const match of line.matchAll(REM_FONT_PATTERN)) {
          const rem = Number(`0.${match[1]}`)
          if (rem < MIN_TEXT_SIZE_REM) {
            offenders.push(`${relative}:${index + 1} ${match[0].trim()}`)
          }
        }
      })
    }

    expect(offenders).toEqual([])
  })

  it('the scan itself works — it finds a planted offence', () => {
    const planted = "sx={{ fontSize: '0.65rem', height: 20 }}"
    const found = [...planted.matchAll(REM_FONT_PATTERN)].map((m) => Number(`0.${m[1]}`))
    expect(found).toEqual([0.65])
    expect(found[0]).toBeLessThan(MIN_TEXT_SIZE_REM)
  })
})