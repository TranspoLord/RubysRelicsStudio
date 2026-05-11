import { NextResponse } from 'next/server'
import { getBudgetRanges, getCustomOrderIntakeSettings } from '@/lib/storefront-settings'

export async function GET() {
  try {
    const [budgetRanges, intakeSettings] = await Promise.all([
      getBudgetRanges(),
      getCustomOrderIntakeSettings(),
    ])

    return NextResponse.json(
      {
        budgetRanges,
        maxQuantity: intakeSettings.max_quantity,
        maxFiles: intakeSettings.max_files,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[custom-orders:config]', error)
    return NextResponse.json({ error: 'Could not load custom order config.' }, { status: 500 })
  }
}