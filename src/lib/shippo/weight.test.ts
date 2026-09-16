import { describe, it, expect, vi, beforeEach } from 'vitest'
import { derivePackageWeight, clampPackageWeight, MAX_PACKAGE_WEIGHT_LB } from './weight'

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

function makeSupabase(products: Record<string, number | null>, variants: Record<string, number | null>) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn((columns: string) => ({
        eq: vi.fn((column: string, value: string) => ({
          maybeSingle: vi.fn(async () => {
            if (table === 'exp_products' && columns === 'weight_lb') {
              return { data: products[value] !== undefined ? { weight_lb: products[value] } : null, error: null }
            }
            if (table === 'exp_product_variants' && columns === 'weight_lb') {
              return { data: variants[value] !== undefined ? { weight_lb: variants[value] } : null, error: null }
            }
            return { data: null, error: null }
          }),
        })),
      })),
    })),
  }
}

describe('derivePackageWeight', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for an empty cart', async () => {
    await expect(derivePackageWeight([])).resolves.toBeNull()
  })

  it('uses product weight_lb when no variant is supplied', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase({ 'prod-1': 2.5 }, {}))

    const result = await derivePackageWeight([{ productId: 'prod-1', quantity: 2 }])
    expect(result?.weight).toBe(5)
    expect(result?.itemWeights).toHaveLength(1)
    expect(result?.itemWeights[0].weight).toBe(5)
  })

  it('prefers variant weight_lb over product weight_lb', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase({ 'prod-1': 2 }, { 'var-1': 4 }))

    const result = await derivePackageWeight([{ productId: 'prod-1', variantId: 'var-1', quantity: 1 }])
    expect(result?.weight).toBe(4)
  })

  it('clamps per-unit weight to the maximum ceiling', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase({ 'prod-1': 200 }, {}))

    const result = await derivePackageWeight([{ productId: 'prod-1', quantity: 1 }])
    expect(result?.weight).toBe(MAX_PACKAGE_WEIGHT_LB)
  })

  it('clamps total weight to the maximum ceiling', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase({ 'prod-1': 10, 'prod-2': 80 }, {}))

    const result = await derivePackageWeight([
      { productId: 'prod-1', quantity: 2 },
      { productId: 'prod-2', quantity: 2 },
    ])
    expect(result?.weight).toBe(MAX_PACKAGE_WEIGHT_LB)
  })

  it('falls back to 1 lb when product weight_lb is missing', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase({ 'prod-1': null }, {}))

    const result = await derivePackageWeight([{ productId: 'prod-1', quantity: 3 }])
    expect(result?.weight).toBe(3)
  })
})

describe('clampPackageWeight', () => {
  it('returns 1 for invalid or missing weight', () => {
    expect(clampPackageWeight(undefined)).toBe(1)
    expect(clampPackageWeight(null)).toBe(1)
    expect(clampPackageWeight('abc')).toBe(1)
    expect(clampPackageWeight(-5)).toBe(1)
  })

  it('caps weight at the maximum ceiling', () => {
    expect(clampPackageWeight(200)).toBe(MAX_PACKAGE_WEIGHT_LB)
  })

  it('returns valid weights unchanged', () => {
    expect(clampPackageWeight(5.5)).toBe(5.5)
  })
})
