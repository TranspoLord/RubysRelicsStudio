export type InventoryAvailabilityOverride = 'inherit' | 'force_in_stock' | 'force_out_of_stock'

export interface InventoryStateInput {
  available_qty: number | null
  low_stock_threshold: number | null
  availability_override: InventoryAvailabilityOverride | null
  is_track_inventory: boolean | null
}

export interface InventoryState {
  isInStock: boolean
  isLowStock: boolean
  status:
    | 'forced_in_stock'
    | 'forced_out_of_stock'
    | 'in_stock'
    | 'low_stock'
    | 'out_of_stock'
    | 'untracked'
  maxPurchasable: number | null
}

export function evaluateInventoryState(input: InventoryStateInput): InventoryState {
  const availableQty = Math.max(0, Number(input.available_qty ?? 0))
  const lowThreshold = Math.max(0, Number(input.low_stock_threshold ?? 0))
  const override = input.availability_override ?? 'inherit'
  const isTrack = Boolean(input.is_track_inventory)

  if (override === 'force_out_of_stock') {
    return {
      isInStock: false,
      isLowStock: false,
      status: 'forced_out_of_stock',
      maxPurchasable: 0,
    }
  }

  if (override === 'force_in_stock') {
    return {
      isInStock: true,
      isLowStock: false,
      status: 'forced_in_stock',
      maxPurchasable: null,
    }
  }

  if (!isTrack) {
    return {
      isInStock: true,
      isLowStock: false,
      status: 'untracked',
      maxPurchasable: null,
    }
  }

  if (availableQty <= 0) {
    return {
      isInStock: false,
      isLowStock: false,
      status: 'out_of_stock',
      maxPurchasable: 0,
    }
  }

  if (availableQty <= lowThreshold) {
    return {
      isInStock: true,
      isLowStock: true,
      status: 'low_stock',
      maxPurchasable: availableQty,
    }
  }

  return {
    isInStock: true,
    isLowStock: false,
    status: 'in_stock',
    maxPurchasable: availableQty,
  }
}
