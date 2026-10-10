import { getEmailSenderAddress, getResend } from '@/lib/resend/client'

/**
 * OCT #14: the one place an email is sent.
 *
 * Resend v4 returns `{ data, error }` and never throws, so
 * `await resend.emails.send(...)` looked like it succeeded even on a 429 or a
 * 500. Back-in-stock and capacity alerts were marked `notified` after a rejected
 * send, quote emails reported success when they had not gone out, and the
 * payment/delivered webhook emails were dropped silently.
 *
 * Every caller now gets a typed result, and `idempotencyKey` makes a retry — or a
 * second processor run — a no-op instead of a duplicate email.
 */
export type SendResult = { ok: true; id: string } | { ok: false; error: string; retryable: boolean }

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  /**
   * Deterministic key, e.g. `paid:${orderId}`, `back-in-stock:${alertId}`.
   * Resend deduplicates on it for 24 hours.
   */
  idempotencyKey: string
  headers?: Record<string, string>
}

/**
 * Resend errors are `{ name, message, statusCode }`.
 *
 * 429 (rate limited) and 5xx (Resend's side) are worth retrying; everything else
 * — 422 bad address, 403 domain not verified — will fail identically on a retry,
 * so the caller should stop rather than spin.
 */
export function describeResendError(error: unknown): { message: string; retryable: boolean } {
  if (!error || typeof error !== 'object') {
    return { message: String(error ?? 'unknown error'), retryable: false }
  }

  const candidate = error as { message?: unknown; name?: unknown; statusCode?: unknown }
  const message =
    typeof candidate.message === 'string'
      ? candidate.message
      : typeof candidate.name === 'string'
        ? candidate.name
        : 'unknown Resend error'

  const status = Number(candidate.statusCode)
  const retryable = status === 429 || (status >= 500 && status < 600)

  return { message, retryable }
}

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY is not set', retryable: false }
  }

  let from: string
  try {
    from = getEmailSenderAddress()
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'email sender is not configured',
      retryable: false,
    }
  }

  try {
    const resend = getResend()
    const { data, error } = await resend.emails.send(
      {
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.headers ? { headers: input.headers } : {}),
      },
      { idempotencyKey: input.idempotencyKey }
    )

    if (error) {
      const described = describeResendError(error)
      return { ok: false, error: described.message, retryable: described.retryable }
    }

    const id = (data as { id?: unknown } | null)?.id
    if (typeof id !== 'string' || id.length === 0) {
      return { ok: false, error: 'Resend returned no message id', retryable: false }
    }

    return { ok: true, id }
  } catch (error) {
    // Resend v4 does not throw, but fetch can.
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      retryable: true,
    }
  }
}
