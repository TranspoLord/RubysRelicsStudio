import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readSourceFile, listSourceFiles, relativeSourcePath } from '@/lib/testing/source-contract'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  getResend: vi.fn(),
  getEmailSenderAddress: vi.fn(),
}))

vi.mock('@/lib/resend/client', () => ({
  getResend: mocks.getResend,
  getEmailSenderAddress: mocks.getEmailSenderAddress,
}))

import { describeResendError, sendEmail } from './send'

const INPUT = {
  to: 'buyer@example.com',
  subject: 'Your order',
  html: '<p>Thanks!</p>',
  idempotencyKey: 'paid:order-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RESEND_API_KEY = 'test-key'
  mocks.getEmailSenderAddress.mockReturnValue("Ruby's Relics <shop@example.com>")
  mocks.getResend.mockReturnValue({ emails: { send: mocks.send } })
  mocks.send.mockResolvedValue({ data: { id: 'msg-1' }, error: null })
})

afterEach(() => {
  delete process.env.RESEND_API_KEY
})

describe('sendEmail (OCT #14)', () => {
  it('returns the message id on success', async () => {
    await expect(sendEmail(INPUT)).resolves.toEqual({ ok: true, id: 'msg-1' })
  })

  it('passes the idempotency key through to Resend', async () => {
    await sendEmail(INPUT)

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Ruby's Relics <shop@example.com>",
        to: ['buyer@example.com'],
        subject: 'Your order',
      }),
      { idempotencyKey: 'paid:order-1' }
    )
  })

  it('maps a 429 to a retryable failure instead of reporting success', async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 },
    })

    await expect(sendEmail(INPUT)).resolves.toEqual({
      ok: false,
      error: 'Too many requests',
      retryable: true,
    })
  })

  it('maps a 5xx to a retryable failure', async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { message: 'Internal error', statusCode: 500 },
    })

    const result = await sendEmail(INPUT)
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ retryable: true })
  })

  it('does not mark a permanent failure as retryable', async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { message: 'Invalid `to` field', statusCode: 422 },
    })

    await expect(sendEmail(INPUT)).resolves.toEqual({
      ok: false,
      error: 'Invalid `to` field',
      retryable: false,
    })
  })

  it('fails without an API key rather than throwing', async () => {
    delete process.env.RESEND_API_KEY

    await expect(sendEmail(INPUT)).resolves.toEqual({
      ok: false,
      error: 'RESEND_API_KEY is not set',
      retryable: false,
    })
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('fails when the sender is not configured, without calling Resend', async () => {
    mocks.getEmailSenderAddress.mockImplementation(() => {
      throw new Error('[Resend] RESEND_FROM_EMAIL must be set.')
    })

    const result = await sendEmail(INPUT)
    expect(result.ok).toBe(false)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('treats a thrown network error as retryable', async () => {
    mocks.send.mockRejectedValue(new Error('socket hang up'))

    await expect(sendEmail(INPUT)).resolves.toEqual({
      ok: false,
      error: 'socket hang up',
      retryable: true,
    })
  })

  it('treats a response with no id as a failure', async () => {
    mocks.send.mockResolvedValue({ data: null, error: null })

    const result = await sendEmail(INPUT)
    expect(result.ok).toBe(false)
  })
})

describe('describeResendError (OCT #14)', () => {
  it('falls back to the error name when there is no message', () => {
    expect(describeResendError({ name: 'validation_error', statusCode: 400 })).toEqual({
      message: 'validation_error',
      retryable: false,
    })
  })

  it('handles a non-object error', () => {
    expect(describeResendError('boom')).toEqual({ message: 'boom', retryable: false })
  })

  it('treats 429 and 5xx as retryable, 4xx as not', () => {
    expect(describeResendError({ statusCode: 429 }).retryable).toBe(true)
    expect(describeResendError({ statusCode: 503 }).retryable).toBe(true)
    expect(describeResendError({ statusCode: 422 }).retryable).toBe(false)
    expect(describeResendError({ statusCode: 403 }).retryable).toBe(false)
  })
})

describe('OCT #14 contract — one place sends email', () => {
  it('no direct resend.emails.send( outside src/lib/resend/send.ts', () => {
    const offenders = listSourceFiles()
      .filter((file) => !file.replace(/\\/g, '/').endsWith('src/lib/resend/send.ts'))
      .filter((file) => /resend\.emails\.send\(/.test(readSourceFile(relativeSourcePath(file))))
      .map(relativeSourcePath)

    expect(offenders).toEqual([])
  })
})
