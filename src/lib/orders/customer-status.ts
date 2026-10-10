/**
 * OCT #13: one place that turns internal order/payment enums into language a
 * customer understands.
 *
 * Every function tolerates an unknown value — the database can gain a status
 * before the UI knows about it — and never returns a raw enum, so
 * `awaiting_payment` cannot leak onto a customer page or into an email.
 */

export interface CustomerStatusView {
  /** Short label for headings, chips and email copy. */
  label: string
  /** One sentence explaining what the customer should expect next. */
  detail: string
}

const ORDER_STATUS_VIEWS: Record<string, CustomerStatusView> = {
  awaiting_payment: {
    label: 'Awaiting payment',
    detail: 'We have your order, but the payment has not come through yet.',
  },
  paid: {
    label: 'Paid',
    detail: 'Payment received — your order is queued for production.',
  },
  in_production: {
    label: 'In production',
    detail: 'We are making your item by hand right now.',
  },
  ready_to_ship: {
    label: 'Ready to ship',
    detail: 'Your order is finished and waiting for the carrier.',
  },
  shipped: {
    label: 'Shipped',
    detail: 'Your order is on its way to you.',
  },
  delivered: {
    label: 'Delivered',
    detail: 'Your order was delivered — we hope you love it.',
  },
  cancelled: {
    label: 'Cancelled',
    detail: 'This order was cancelled and will not be produced.',
  },
}

const PAYMENT_STATUS_VIEWS: Record<string, CustomerStatusView> = {
  pending: { label: 'Payment pending', detail: 'We have not received the payment yet.' },
  paid: { label: 'Paid in full', detail: 'We received the full payment.' },
  failed: {
    label: 'Payment failed',
    detail: 'The payment did not go through, so the order is on hold.',
  },
  refunded: { label: 'Refunded', detail: 'This order was refunded in full.' },
  partially_refunded: {
    label: 'Partially refunded',
    detail: 'Part of this order was refunded.',
  },
}

const UNKNOWN_ORDER_STATUS: CustomerStatusView = {
  label: 'In progress',
  detail: 'We are working on your order — check back soon for an update.',
}

const UNKNOWN_PAYMENT_STATUS: CustomerStatusView = {
  label: 'Payment pending',
  detail: 'We have not received the payment yet.',
}

/** The fulfilment journey, in order, for progress UI. */
export const FULFILMENT_STEPS = [
  'paid',
  'in_production',
  'ready_to_ship',
  'shipped',
  'delivered',
] as const

/** Plain-language label + detail for a fulfilment status. */
export function describeOrderStatus(status: string | null | undefined): CustomerStatusView {
  if (!status) return UNKNOWN_ORDER_STATUS
  return ORDER_STATUS_VIEWS[status] ?? UNKNOWN_ORDER_STATUS
}

/** Plain-language label + detail for a payment status. */
export function describePaymentStatus(status: string | null | undefined): CustomerStatusView {
  if (!status) return UNKNOWN_PAYMENT_STATUS
  return PAYMENT_STATUS_VIEWS[status] ?? UNKNOWN_PAYMENT_STATUS
}

/**
 * 1-based position on the fulfilment journey, or 0 when the order is not on it
 * yet (`awaiting_payment`) or never will be (`cancelled` / unknown).
 */
export function fulfilmentStep(status: string | null | undefined): number {
  const index = FULFILMENT_STEPS.indexOf(status as (typeof FULFILMENT_STEPS)[number])
  return index === -1 ? 0 : index + 1
}

/** True while the order is still moving through the journey. */
export function isOrderInProgress(status: string | null | undefined): boolean {
  return fulfilmentStep(status) > 0 && status !== 'delivered'
}

/** True once the payment is fully settled (no further action from the buyer). */
export function isPaymentSettled(status: string | null | undefined): boolean {
  return status === 'paid' || status === 'refunded' || status === 'partially_refunded'
}
