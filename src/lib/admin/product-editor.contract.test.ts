import { describe, expect, it } from 'vitest'
import { readSourceFile, stripComments } from '@/lib/testing/source-contract'

/**
 * OCT #7: `PUT /api/admin/catalog/products/[id]` replaces the whole row and the
 * route defaults `has_designer` to `false`. Any editor that omits the field
 * silently switches the embedded designer off and nulls `designer_mockup_url`,
 * which is what the pricing page used to do on every price save.
 *
 * The guard stays until the PATCH handler (update only the keys present) lands.
 */
describe('product editor write contract (OCT #7)', () => {
  const PRICING_PAGE = 'src/app/admin/(panel)/catalog/products/[id]/pricing/page.tsx'
  const PRODUCT_ROUTE = 'src/app/api/admin/catalog/products/[id]/route.ts'

  it('sends has_designer and designer_mockup_url with the price update', () => {
    const source = stripComments(readSourceFile(PRICING_PAGE))
    const putAt = source.indexOf("method: 'PUT'")
    expect(putAt).toBeGreaterThan(-1)

    const body = source.slice(putAt, putAt + 1200)
    expect(body).toContain('has_designer')
    expect(body).toContain('designer_mockup_url')
  })

  it('keeps the route defaulting has_designer to false (so the field must be sent)', () => {
    const route = stripComments(readSourceFile(PRODUCT_ROUTE))

    expect(route).toContain('asBoolean(body.has_designer, false)')
  })
})
