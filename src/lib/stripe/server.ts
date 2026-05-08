import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripeServerClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY

  if (!secretKey) {
    throw new Error('[Stripe] STRIPE_SECRET_KEY must be set for checkout sessions.')
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey)
  }

  return stripeClient
}
