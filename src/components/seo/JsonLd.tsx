/**
 * §2.10 — server-rendered JSON-LD block.
 *
 * Emits `<script type="application/ld+json">` with the (server-authored, fully
 * sanitised-by-construction) structured data object. `dangerouslySetInnerHTML` is
 * the only way to inject a JSON-LD script in React, and it is safe here because
 * `data` is built by the pure builders in `src/lib/seo/structured-data.ts` from
 * database strings — never user-authored HTML — and `JSON.stringify` escapes any
 * embedded `<`, `>`, `&`, quotes or U+2028/29 line separators.
 */

interface JsonLdProps {
  data: Record<string, unknown> | Record<string, unknown>[]
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}