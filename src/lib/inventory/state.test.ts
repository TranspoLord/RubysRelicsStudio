import { describe, expect, it } from 'vitest'
import { evaluateInventoryState } from './state'

describe('evaluateInventoryState', () => {
  it('returns forced out-of-stock when override is force_out_of_stock', () => {
    const result = evaluateInventoryState({
      available_qty: 10,
      low_stock_threshold: 3,
      availability_override: 'force_out_of_stock',
      is_track_inventory: true,
    })

    expect(result.status).toBe('forced_out_of_stock')
    expect(result.isInStock).toBe(false)
    expect(result.maxPurchasable).toBe(0)
  })

  it('returns untracked in-stock when tracking is disabled', () => {
    const result = evaluateInventoryState({
      available_qty: 0,
      low_stock_threshold: 3,
      availability_override: 'inherit',
      is_track_inventory: false,
    })

    expect(result.status).toBe('untracked')
    expect(result.isInStock).toBe(true)
    expect(result.maxPurchasable).toBeNull()
  })

  it('returns low-stock state when quantity is at threshold', () => {
    const result = evaluateInventoryState({
      available_qty: 2,
      low_stock_threshold: 2,
      availability_override: 'inherit',
      is_track_inventory: true,
    })

    expect(result.status).toBe('low_stock')
    expect(result.isLowStock).toBe(true)
    expect(result.maxPurchasable).toBe(2)
  })
})
