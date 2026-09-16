import { describe, it, expect } from 'vitest'
import { parseJsonBody, BodyTooLargeError, DEFAULT_MAX_BODY_BYTES } from '@/lib/security/body'

function makeRequest(body: string): Request {
  return new Request('http://localhost:3000/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
}

describe('parseJsonBody', () => {
  it('parses a valid JSON body', async () => {
    const body = await parseJsonBody<{ ok: boolean }>(makeRequest('{"ok":true}'))
    expect(body).toEqual({ ok: true })
  })

  it('throws BodyTooLargeError when the body exceeds the byte limit', async () => {
    const oversized = 'a'.repeat(DEFAULT_MAX_BODY_BYTES + 1)
    await expect(parseJsonBody(makeRequest(oversized))).rejects.toBeInstanceOf(BodyTooLargeError)
  })

  it('counts UTF-8 byte length, not character count', async () => {
    // 30,000 four-byte emoji characters = 120,000 bytes.
    // Character count (30,000) is well under the 102,400-char limit the
    // old code used, but byte count (120,000) exceeds the 102,400-byte
    // limit the fixed code enforces.
    const overByteLimit = '🎨'.repeat(30_000)
    expect(Buffer.byteLength(overByteLimit, 'utf8')).toBe(120_000)
    expect(overByteLimit.length).toBeLessThan(DEFAULT_MAX_BODY_BYTES) // old code would let this through
    await expect(parseJsonBody(makeRequest(JSON.stringify({ data: overByteLimit })))).rejects.toBeInstanceOf(
      BodyTooLargeError
    )

    // A small payload well under the limit should pass.
    const underLimit = 'a'.repeat(1000)
    const body = await parseJsonBody<{ data: string }>(makeRequest(JSON.stringify({ data: underLimit })))
    expect(body.data).toBe(underLimit)
  })

  it('throws SyntaxError for invalid JSON', async () => {
    await expect(parseJsonBody(makeRequest('not json'))).rejects.toBeInstanceOf(SyntaxError)
  })
})
