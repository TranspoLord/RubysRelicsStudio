import { describe, expect, it } from 'vitest'
import { readSourceFile, stripComments } from '@/lib/testing/source-contract'

/**
 * OCT #23 / #28: irreversible admin actions ask first.
 *
 * "Send Quote" creates a live Square payment link and emails a customer, and
 * "Cancel Order" / "Mark Refunded" cannot be undone — all three used to be a
 * single click. These guards keep the confirmation dialog in the path.
 */
describe('admin confirmation dialogs (OCT #23 / #28)', () => {
  const ORDERS_PAGE = 'src/app/admin/(panel)/orders/page.tsx'
  const REQUESTS_PAGE = 'src/app/admin/(panel)/custom-requests/page.tsx'

  it('has one shared, accessible dialog', () => {
    const source = stripComments(readSourceFile('src/components/admin/ConfirmDialog.tsx'))

    expect(source).toContain('aria-labelledby="confirm-dialog-title"')
    expect(source).toContain("tone === 'danger' ? 'error' : 'primary'")
    expect(source).toContain('cancelRef.current?.focus()')
  })

  it('sends no quote without a confirmation, and has no "Admin note" field', () => {
    const source = stripComments(readSourceFile(REQUESTS_PAGE))

    expect(source).toContain('requestSendQuote')
    expect(source).toContain('confirmSendQuote')
    expect(source).toContain('<ConfirmDialog')
    expect(source).not.toContain('onClick={() => void sendQuote(row)}')
    expect(source).not.toContain('label="Admin note"')
    expect(source).toContain('Message to customer')
    expect(source).toContain('Internal note (never sent)')
  })

  it('confirms cancel and mark-refunded before calling the API', () => {
    const source = stripComments(readSourceFile(ORDERS_PAGE))

    expect(source).toContain('confirmDestructiveAction')
    expect(source).toContain('confirmReason.trim().length < 3')
    expect(source).not.toMatch(/onClick=\{\(\) => void runAction\(\{ action: 'cancel'/)
    expect(source).not.toMatch(/onClick=\{\(\) => void runAction\(\{ action: 'mark_refunded'/)
    // The refund dialog says plainly that it does not move money.
    expect(source).toContain('issue the actual refund in Square first')
  })

  it('keeps `cancelled` out of the transition menus, client and server', () => {
    const page = stripComments(readSourceFile(ORDERS_PAGE))
    const route = stripComments(readSourceFile('src/app/api/admin/orders/route.ts'))

    expect(page).not.toMatch(/awaiting_payment: \['paid', 'cancelled'\]/)
    expect(route).not.toMatch(/awaiting_payment: \['paid', 'cancelled'\]/)
  })
})
