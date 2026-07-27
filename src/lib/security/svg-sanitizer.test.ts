import { describe, expect, it } from 'vitest'

import { sanitizeSvg } from './svg-sanitizer'

const EMPTY_SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>'

// ─── Valid SVG passes through ────────────────────────────────────────────────

describe('sanitizeSvg — valid SVG', () => {
  it('preserves a simple <rect> element with allowed attributes', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="50" fill="#f00"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).toContain('<rect')
    expect(out).toContain('width="100"')
    expect(out).toContain('fill="#f00"')
  })

  it('preserves <path> with d attribute', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 10" stroke="black"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).toContain('<path')
    expect(out).toContain('d="M0 0 L10 10"')
  })

  it('preserves gradients and filters', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient>
        <filter id="f1"><feGaussianBlur stdDeviation="2"/></filter>
      </defs>
      <rect width="100" height="100" fill="url(#g1)" filter="url(#f1)"/>
    </svg>`
    const out = sanitizeSvg(input)
    expect(out).toContain('linearGradient')
    expect(out).toContain('feGaussianBlur')
    expect(out).toContain('filter="url(#f1)"')
  })

  it('preserves text elements', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20" font-size="14">Hello</text></svg>'
    const out = sanitizeSvg(input)
    expect(out).toContain('<text')
    expect(out).toContain('Hello')
  })

  it('adds xmlns if missing', () => {
    const input = '<svg><rect width="10" height="10"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('strips XML prolog and DOCTYPE but keeps svg content', () => {
    const input = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('<?xml')
    expect(out).not.toContain('<!DOCTYPE')
    expect(out).toContain('<rect')
  })
})

// ─── Script injection ────────────────────────────────────────────────────────

describe('sanitizeSvg — script injection', () => {
  it('removes <script> elements', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
    expect(out).toContain('<rect')
  })

  it('removes <script> with attributes', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><script type="text/javascript" src="evil.js"></script></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('<script')
    expect(out).not.toContain('evil.js')
  })
})

// ─── Event handler attributes ────────────────────────────────────────────────

describe('sanitizeSvg — event handlers', () => {
  it('removes onerror attributes', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><image href="x.png" onerror="alert(1)"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('alert(1)')
  })

  it('removes onload attributes', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" onload="alert(1)"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('onload')
    expect(out).not.toContain('alert(1)')
  })

  it('removes onclick attributes', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" onclick="alert(1)"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('onclick')
  })

  it('removes all on* attributes regardless of name', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><rect onmouseover="x" onfocus="y" onanimationend="z" width="10" height="10"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toMatch(/on\w+=/i)
  })
})

// ─── Dangerous URIs ──────────────────────────────────────────────────────────

describe('sanitizeSvg — dangerous URIs', () => {
  it('removes javascript: URIs from href', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect width="10" height="10"/></a></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('alert(1)')
  })

  it('removes javascript: URIs from xlink:href', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="javascript:alert(1)"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('javascript:')
  })

  it('removes data:text/html URIs', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:text/html,<script>alert(1)</script>"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('data:text/html')
    expect(out).not.toContain('<script')
  })

  it('removes data:image/svg+xml URIs (nested SVG script risk)', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/svg+xml,<svg onload=alert(1)/>"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('data:image/svg+xml')
  })

  it('preserves https: URIs', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/img.png" width="10" height="10"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).toContain('https://example.com/img.png')
  })

  it('preserves fragment URIs', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="url(#grad)"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).toContain('url(#grad)')
  })

  it('preserves absolute path URIs', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><image href="/images/photo.png" width="10" height="10"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).toContain('/images/photo.png')
  })
})

// ─── Forbidden elements ──────────────────────────────────────────────────────

describe('sanitizeSvg — forbidden elements', () => {
  it('removes <foreignObject> and children', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body><script>alert(1)</script></body></foreignObject></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('foreignObject')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
  })

  it('removes <iframe>', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://evil.com"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('iframe')
    expect(out).not.toContain('evil.com')
  })

  it('removes <use> (can reference external/script targets)', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><use href="#x"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('<use')
  })

  it('removes <animate> and <set>', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"><animate attributeName="x" to="100"/></rect><set attributeName="x" to="50"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('<animate')
    expect(out).not.toContain('<set')
  })
})

// ─── Unknown elements (allowlist enforcement) ────────────────────────────────

describe('sanitizeSvg — allowlist enforcement', () => {
  it('removes unknown elements but lifts children', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><custom><rect width="10" height="10"/></custom></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('<custom')
    expect(out).toContain('<rect')
  })

  it('removes unknown attributes', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" data-evil="payload" custom-attr="x"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('data-evil')
    expect(out).not.toContain('custom-attr')
    expect(out).toContain('width="10"')
  })
})

// ─── Comments and processing instructions ────────────────────────────────────

describe('sanitizeSvg — comments and PIs', () => {
  it('removes XML comments', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><!-- evil comment --><rect width="10" height="10"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('<!--')
    expect(out).not.toContain('evil comment')
  })

  it('removes processing instructions', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><?xml-stylesheet type="text/xsl" href="evil.xsl"?><rect width="10" height="10"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('<?xml-stylesheet')
    expect(out).not.toContain('evil.xsl')
  })
})

// ─── <style> element sanitization ────────────────────────────────────────────

describe('sanitizeSvg — <style> element', () => {
  it('removes <style> with expression() (IE CSS script injection)', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><style>rect { width: expression(alert(1)); }</style><rect width="10" height="10"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('expression')
    expect(out).not.toContain('alert(1)')
  })

  it('removes <style> with javascript: URI', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><style>rect { background: url(javascript:alert(1)); }</style></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('javascript:')
  })

  it('removes <style> with @import', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url("https://evil.com/evil.css");</style></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('@import')
  })

  it('preserves benign <style> content', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><style>rect { fill: red; }</style><rect width="10" height="10"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).toContain('fill: red')
  })
})

// ─── Edge cases and robustness ───────────────────────────────────────────────

describe('sanitizeSvg — edge cases', () => {
  it('returns empty svg for empty string', () => {
    expect(sanitizeSvg('')).toBe(EMPTY_SVG)
  })

  it('returns empty svg for non-string input', () => {
    expect(sanitizeSvg(null as unknown as string)).toBe(EMPTY_SVG)
    expect(sanitizeSvg(undefined as unknown as string)).toBe(EMPTY_SVG)
  })

  it('returns empty svg for input without <svg> root', () => {
    expect(sanitizeSvg('<html><body>not svg</body></html>')).toBe(EMPTY_SVG)
    expect(sanitizeSvg('just text')).toBe(EMPTY_SVG)
  })

  it('returns empty svg for non-svg XML root', () => {
    expect(sanitizeSvg('<html xmlns="http://www.w3.org/1999/xhtml"><body>hi</body></html>')).toBe(EMPTY_SVG)
  })

  it('returns empty svg for oversized input (>10MB)', () => {
    const huge = '<svg xmlns="http://www.w3.org/2000/svg">' + 'a'.repeat(10 * 1024 * 1024 + 1) + '</svg>'
    expect(sanitizeSvg(huge)).toBe(EMPTY_SVG)
  })

  it('handles deeply nested elements without crashing', () => {
    let nested = '<svg xmlns="http://www.w3.org/2000/svg">'
    for (let i = 0; i < 50; i++) nested += '<g>'
    nested += '<rect width="10" height="10"/>'
    for (let i = 0; i < 50; i++) nested += '</g>'
    nested += '</svg>'
    const out = sanitizeSvg(nested)
    expect(out).toContain('<rect')
    expect(out).toContain('<g')
  })

  it('handles malformed XML gracefully', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"'
    const out = sanitizeSvg(input)
    // Should not throw; should return some svg string
    expect(typeof out).toBe('string')
    expect(out).toMatch(/^<svg/)
  })

  it('preserves xmlns:xlink declaration', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect width="10" height="10"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).toContain('xmlns:xlink')
  })

  it('removes non-xlink xmlns: declarations', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:evil="http://evil.com"><rect width="10" height="10"/></svg>'
    const out = sanitizeSvg(input)
    expect(out).not.toContain('xmlns:evil')
  })
})

// ─── Combined attack vectors ─────────────────────────────────────────────────

describe('sanitizeSvg — combined attacks', () => {
  it('strips multiple vectors in a single document', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <script>alert('xss')</script>
      <rect width="10" height="10" onerror="alert(1)" onload="alert(2)"/>
      <foreignObject><body><script>alert(3)</script></body></foreignObject>
      <image href="javascript:alert(4)"/>
      <!-- evil comment -->
      <style>@import url("https://evil.com/x.css");</style>
      <rect width="20" height="20" fill="red"/>
    </svg>`
    const out = sanitizeSvg(input)
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('onload')
    expect(out).not.toContain('foreignObject')
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('data:image/svg+xml')
    expect(out).not.toContain('<!--')
    expect(out).not.toContain('@import')
    expect(out).not.toContain('evil.com')
    // Benign content survives
    expect(out).toContain('fill="red"')
    expect(out).toContain('width="20"')
  })
})