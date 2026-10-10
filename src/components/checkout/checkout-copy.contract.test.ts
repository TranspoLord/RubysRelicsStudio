import { describe, expect, it } from 'vitest'
import {
  listSourceFiles,
  readSourceFile,
  relativeSourcePath,
  stripComments,
} from '@/lib/testing/source-contract'

/**
 * OCT #13: the checkout surface is Square's. It used to look up the order by a
 * `stripe_session_id` param Square never sends and tell every customer
 * "Stripe redirected successfully…", so this guard keeps either from creeping
 * back — and keeps the payment provider's name out of customer copy.
 */
describe('checkout copy contract (OCT #13)', () => {
  const checkoutFiles = listSourceFiles().filter((file) => {
    const relative = relativeSourcePath(file)
    return (
      relative.startsWith('/src/app/checkout/') || relative.startsWith('/src/components/checkout/')
    )
  })

  it('covers the checkout surface', () => {
    expect(checkoutFiles.length).toBeGreaterThanOrEqual(8)
  })

  it('mentions no Stripe anywhere in the checkout surface', () => {
    const offenders = checkoutFiles
      .filter((file) => /stripe/i.test(stripComments(readSourceFile(relativeSourcePath(file).slice(1)))))
      .map(relativeSourcePath)

    expect(offenders).toEqual([])
  })

  it('looks the success-page order up by id and guest token', () => {
    const source = stripComments(readSourceFile('src/app/checkout/success/page.tsx'))

    expect(source).toContain(".eq('id', orderId)")
    expect(source).toContain(".eq('guest_tracking_token', accessToken)")
    expect(source).not.toContain('session_id')
  })

  it('keeps the success page out of search results', () => {
    const source = readSourceFile('src/app/checkout/success/page.tsx')

    expect(source).toContain('robots')
    expect(source).toContain('index: false')
  })

  it('only clears the cart when the order was found', () => {
    const source = stripComments(readSourceFile('src/app/checkout/success/page.tsx'))

    expect(source).toContain('<ClearCartOnSuccess enabled={Boolean(order)} />')
  })
})
