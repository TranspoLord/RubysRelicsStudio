import { Resend } from 'resend'

// ─── Resend client (server-only) ──────────────────────────────────────────────
export function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('[Resend] RESEND_API_KEY must be set.')
  }
  return new Resend(apiKey)
}

// ─── Sender identity ──────────────────────────────────────────────────────────
export function getEmailSenderAddress(): string {
  const fromEmail = process.env.RESEND_FROM_EMAIL
  const fromName = process.env.RESEND_FROM_NAME ?? "Ruby's Relics Studio"
  if (!fromEmail) {
    throw new Error('[Resend] RESEND_FROM_EMAIL must be set.')
  }
  return `${fromName} <${fromEmail}>`
}

// ─── Email catalog keys ───────────────────────────────────────────────────────
// These match the transactional email catalog defined in EXPANSION_NOTES.
export const EmailTemplate = {
  // Customer emails
  CUSTOM_REQUEST_RECEIVED: 'custom_request_received',
  QUOTE_APPROVED: 'quote_approved',
  QUOTE_REJECTED: 'quote_rejected',
  PAYMENT_RECEIVED: 'payment_received',
  ORDER_IN_PRODUCTION: 'order_in_production',
  ORDER_SHIPPED: 'order_shipped',
  ORDER_DELIVERED: 'order_delivered',
  BACK_IN_STOCK: 'back_in_stock',
  CAPACITY_REOPENED: 'capacity_reopened',
  ABANDONED_CART: 'abandoned_cart',
  ABANDONED_REQUEST: 'abandoned_request',
  // Admin emails
  ADMIN_NEW_CUSTOM_REQUEST: 'admin_new_custom_request',
  ADMIN_NEW_PAID_ORDER: 'admin_new_paid_order',
  ADMIN_RESTRICTED_ARTWORK: 'admin_restricted_artwork',
  ADMIN_LOW_STOCK: 'admin_low_stock',
} as const

export type EmailTemplateKey = (typeof EmailTemplate)[keyof typeof EmailTemplate]

// TODO: Implement email send helper and React Email templates per catalog above.
// Each template lives in src/emails/<template-key>.tsx
