import { describe, expect, it } from 'vitest'
import {
  FULFILMENT_STEPS,
  describeOrderStatus,
  describePaymentStatus,
  fulfilmentStep,
  isOrderInProgress,
  isPaymentSettled,
} from './customer-status'

// Every value the database can hold (migrations 006/049 + 077).
const ORDER_STATUSES = [
  'awaiting_payment',
  'paid',
  'in_production',
  'ready_to_ship',
  'shipped',
  'delivered',
  'cancelled',
] as const

const PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
] as const

describe('customer status vocabulary (OCT #13)', () => {
  it('maps every fulfilment status to a label that is not the raw enum', () => {
    for (const status of ORDER_STATUSES) {
      const view = describeOrderStatus(status)
      expect(view.label).toBeTruthy()
      expect(view.detail).toBeTruthy()
      expect(view.label).not.toBe(status)
      expect(view.label).not.toContain('_')
    }
  })

  it('maps every payment status to a label that is not the raw enum', () => {
    for (const status of PAYMENT_STATUSES) {
      const view = describePaymentStatus(status)
      expect(view.label).not.toBe(status)
      expect(view.label).not.toContain('_')
    }
  })

  it('gives each fulfilment status a distinct label', () => {
    const labels = ORDER_STATUSES.map((status) => describeOrderStatus(status).label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('falls back to neutral copy for an unknown or missing status', () => {
    for (const value of ['teleported', '', null, undefined]) {
      const view = describeOrderStatus(value)
      expect(view.label).toBe('In progress')
      expect(JSON.stringify(view)).not.toContain('teleported')
    }

    expect(describePaymentStatus('teleported').label).toBe('Payment pending')
  })

  it('orders the fulfilment journey', () => {
    expect(fulfilmentStep('awaiting_payment')).toBe(0)
    expect(fulfilmentStep('paid')).toBe(1)
    expect(fulfilmentStep('in_production')).toBe(2)
    expect(fulfilmentStep('ready_to_ship')).toBe(3)
    expect(fulfilmentStep('shipped')).toBe(4)
    expect(fulfilmentStep('delivered')).toBe(5)
    expect(fulfilmentStep('cancelled')).toBe(0)
    expect(fulfilmentStep('nonsense')).toBe(0)
    expect(FULFILMENT_STEPS).toHaveLength(5)
  })

  it('knows which orders are still in flight', () => {
    expect(isOrderInProgress('paid')).toBe(true)
    expect(isOrderInProgress('in_production')).toBe(true)
    expect(isOrderInProgress('shipped')).toBe(true)
    expect(isOrderInProgress('delivered')).toBe(false)
    expect(isOrderInProgress('cancelled')).toBe(false)
    expect(isOrderInProgress('awaiting_payment')).toBe(false)
  })

  it('treats a refund as settled so the buyer is not chased for payment', () => {
    expect(isPaymentSettled('paid')).toBe(true)
    expect(isPaymentSettled('refunded')).toBe(true)
    expect(isPaymentSettled('partially_refunded')).toBe(true)
    expect(isPaymentSettled('pending')).toBe(false)
    expect(isPaymentSettled('failed')).toBe(false)
  })
})
