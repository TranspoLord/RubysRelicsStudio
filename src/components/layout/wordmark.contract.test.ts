import { describe, expect, it } from 'vitest'

import { readSourceFile, stripComments } from '@/lib/testing/source-contract'

/**
 * §8.9 — the wordmark paints itself with `background-clip: text` + a transparent
 * fill, so it never declared a `color`; its computed colour fell back to the UA
 * link blue (flagged 2.10:1 in all 24 captures) and forced-colours mode — which
 * drops the clip/fill — would render it blue. The fix adds an explicit brand-gold
 * fallback to both wordmarks; this guards that pairing, on the *same element* as
 * the transparent fill rather than anywhere in the file.
 */

const HEADER = stripComments(readSourceFile('src/components/layout/Header.tsx'))
const FOOTER = stripComments(readSourceFile('src/components/layout/Footer.tsx'))

describe('wordmark forced-colours fallback (§8.9)', () => {
  it.each([
    ['Header.tsx', HEADER],
    ['Footer.tsx', FOOTER],
  ])('%s declares brand gold on the clipped wordmark', (_name, source) => {
    expect(source).toContain("WebkitTextFillColor: 'transparent'")
    expect(source).toMatch(
      /WebkitTextFillColor: 'transparent',[\s\S]{0,200}color: brandTokens\.forgeGold/
    )
  })
})