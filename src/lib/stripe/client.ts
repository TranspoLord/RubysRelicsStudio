import Stripe from 'stripe'

// ─── Server-side Stripe client ────────────────────────────────────────────────
// Only import this in server-side code (API routes, server actions).
export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('[Stripe] STRIPE_SECRET_KEY must be set.')
  }
  return new Stripe(secretKey, {
    apiVersion: '2025-02-24.acacia',
    typescript: true,
  })
}

// ─── Webhook signature verification ──────────────────────────────────────────
export function verifyStripeWebhook(
  payload: string | Buffer,
  signature: string,
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    throw new Error('[Stripe] STRIPE_WEBHOOK_SECRET must be set.')
  }
  const stripe = getStripe()
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret)
}

// ─── Feature flag ─────────────────────────────────────────────────────────────
export function isStripeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_STRIPE === 'true'
}

// ─── Public key (browser-safe) ───────────────────────────────────────────────
export function getStripePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!key) {
    throw new Error('[Stripe] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be set.')
  }
  return key
}
