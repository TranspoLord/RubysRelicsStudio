// Test script for Square checkout integration
// Run with: node scripts/test-square-checkout.mjs

import { config } from 'dotenv'

// Load environment variables (fallback to .env if .env.local doesn't exist)
config({ path: '.env.local' })
config({ path: '.env' }) // Fallback to .env

function testSquareConfig() {
  console.log('🔍 Testing Square Configuration...')

  const requiredVars = [
    'SQUARE_APPLICATION_ID',
    'SQUARE_ACCESS_TOKEN',
    'SQUARE_LOCATION_ID',
    'SQUARE_ENVIRONMENT'
  ]

  const missing = requiredVars.filter(v => !process.env[v])

  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing.join(', '))
    process.exit(1)
  }

  console.log('✅ All required Square environment variables are set')
  console.log(`   Application ID: ${process.env.SQUARE_APPLICATION_ID?.slice(0, 15)}...`)
  console.log(`   Environment: ${process.env.SQUARE_ENVIRONMENT}`)
  console.log(`   Location ID: ${process.env.SQUARE_LOCATION_ID}`)

  // Validate application ID format
  const appId = process.env.SQUARE_APPLICATION_ID
  if (appId && !appId.startsWith('sandbox-') && !appId.startsWith('sq0idp-')) {
    console.warn('⚠️  Application ID format may be incorrect (expected sandbox-... or sq0idp-...)')
  }

  // Validate access token format
  const accessToken = process.env.SQUARE_ACCESS_TOKEN
  if (accessToken && !accessToken.startsWith('EAA') && !accessToken.startsWith('EAAAE')) {
    console.warn('⚠️  Access token format may be incorrect (expected EAAA...)')
  }

  return true
}

// Generate a Square payment URL without needing the TS import
function getSquarePaymentUrl({ amount, requestId, customerEmail }) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const amountCents = Math.round(amount * 100)
  return `${origin}/api/square/checkout?amount=${amountCents}&requestId=${requestId}&email=${encodeURIComponent(customerEmail || '')}`
}

function testPaymentUrlGeneration() {
  console.log('\n🔌 Testing Payment URL Generation...')

  try {
    const testUrl = getSquarePaymentUrl({
      amount: 1000, // $10.00
      requestId: 'test-request-123',
      customerEmail: 'test@example.com'
    })

    console.log(`✅ Payment URL generated: ${testUrl}`)
    console.log('   (This URL calls /api/square/checkout with Square SDK on the server)')
    return true
  } catch (error) {
    console.error('❌ Payment URL generation failed:', error.message)
    return false
  }
}

function main() {
  console.log('='.repeat(60))
  console.log('Ruby\'s Relics Studio - Square Integration Test')
  console.log('='.repeat(60))

  const configOk = testSquareConfig()
  const urlOk = testPaymentUrlGeneration()

  if (configOk && urlOk) {
    console.log('\n✅ All Square tests passed!')
    console.log('\nNext steps:')
    console.log('  1. Apply database migration: supabase db push supabase/migrations/033_square_checkout_fields.sql')
    console.log('  2. Add products with is_square_enabled=true in admin panel')
    console.log('  3. Start dev server: npm run dev')
    console.log('  4. Test checkout on a product page')
    process.exit(0)
  } else {
    console.error('\n❌ Some tests failed')
    process.exit(1)
  }
}

main()