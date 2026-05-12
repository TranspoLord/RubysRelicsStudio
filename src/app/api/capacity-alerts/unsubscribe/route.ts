import { NextResponse } from 'next/server'

import { unsubscribeCapacityAlert } from '@/lib/capacity-alerts'

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')?.trim() ?? ''

  const result = await unsubscribeCapacityAlert(token)
  const title = result.ok ? 'You are unsubscribed' : 'Unsubscribe failed'
  const message = result.ok
    ? 'Capacity reopened alerts have been removed for this category.'
    : result.error ?? 'The unsubscribe token is invalid or expired.'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; background: #f7f7f7; color: #222; }
    .card { max-width: 540px; margin: 40px auto; background: white; border: 1px solid #ddd; border-radius: 10px; padding: 20px; }
    a { color: #a0792a; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    <p><a href="/shop">Return to shop</a></p>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    status: result.ok ? 200 : 400,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
