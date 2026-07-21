/**
 * Request body size limits (SEC-029).
 *
 * All API routes MUST use `parseJsonBody()` instead of `await request.json()`
 * to enforce a maximum body size and prevent denial-of-service via memory
 * exhaustion. Requests exceeding the limit receive a 413 response.
 */

import { NextResponse } from 'next/server'

export const DEFAULT_MAX_BODY_BYTES = 1024 * 100 // 100 KB

export class BodyTooLargeError extends Error {
  constructor(public maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes`)
    this.name = 'BodyTooLargeError'
  }
}

/**
 * Parse a JSON request body with a size limit.
 *
 * @param request   The incoming Request
 * @param maxSize   Maximum body size in bytes (default 100KB)
 * @returns         The parsed JSON body
 * @throws          BodyTooLargeError if the body exceeds maxSize
 * @throws          SyntaxError if the body is not valid JSON
 */
export async function parseJsonBody<T = unknown>(
  request: Request,
  maxSize: number = DEFAULT_MAX_BODY_BYTES
): Promise<T> {
  const text = await request.text()

  if (text.length > maxSize) {
    throw new BodyTooLargeError(maxSize)
  }

  return JSON.parse(text) as T
}

/**
 * Parse a JSON request body with a size limit, returning a 413/400 response
 * on error instead of throwing. Convenience wrapper for API routes.
 */
export async function parseJsonBodyOrError<T = unknown>(
  request: Request,
  maxSize?: number
): Promise<{ ok: true; body: T } | { ok: false; response: NextResponse }> {
  try {
    const body = await parseJsonBody<T>(request, maxSize)
    return { ok: true, body }
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Request body too large.' },
          { status: 413 }
        ),
      }
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid JSON body.' },
        { status: 400 }
      ),
    }
  }
}