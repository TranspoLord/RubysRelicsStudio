import { describe, expect, it } from 'vitest'

import { readSourceFile, stripComments } from '@/lib/testing/source-contract'

/**
 * §2.10 — the JSON-LD block. No DOM harness (OCT-5), so this pins the contract
 * at the source level: the component must emit `application/ld+json` and must
 * stringify its input (never interpolate it raw into HTML).
 */
const SOURCE = stripComments(readSourceFile('src/components/seo/JsonLd.tsx'))

describe('JsonLd contract (§2.10)', () => {
  it('emits an application/ld+json script', () => {
    expect(SOURCE).toContain('type="application/ld+json"')
  })

  it('serializes its data with JSON.stringify, never raw HTML', () => {
    expect(SOURCE).toContain('JSON.stringify(data)')
    expect(SOURCE).toContain('dangerouslySetInnerHTML')
  })

  it('accepts a single object or an array of objects', () => {
    expect(SOURCE).toMatch(/Record<string, unknown>\s*\|\s*Record<string, unknown>\[\]/)
  })
})