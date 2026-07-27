/**
 * SEC-009: Server-side SVG sanitizer.
 *
 * Replaces `isomorphic-dompurify` (which transitively requires `jsdom` →
 * `html-encoding-sniffer` → `@exodus/bytes`, an ESM-only package that breaks
 * under Next.js Turbopack's CJS `require()` with ERR_REQUIRE_ESM).
 *
 * This implementation uses `@xmldom/xmldom` — a pure-JavaScript, CJS-compatible
 * XML DOM parser with no ESM-only transitive dependencies — to parse the SVG,
 * walk the DOM, and strip dangerous elements, attributes, and URIs.
 *
 * Threat model (what we strip):
 *  - <script> blocks (inline JS)
 *  - Event handler attributes: on*, e.g. onerror, onload, onclick
 *  - javascript: URIs in href/xlink:href/src
 *  - data: URIs with text/html or script payloads
 *  - <foreignObject> (allows arbitrary HTML including <script>)
 *  - <use href="#..."> / <animate> / <set> with href to external or script targets
 *  - XML processing instructions and comments that could carry payloads
 *  - External entity references (XXE) via DOCTYPE
 */

import {
  DOMParser,
  XMLSerializer,
  type Attr,
  type Document,
  type Element,
  type Node,
} from '@xmldom/xmldom'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

/**
 * Elements that are always removed (and their children).
 * These either execute script or allow embedding arbitrary HTML/script.
 */
const FORBIDDEN_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
  'use',
  'animate',
  'animatetransform',
  'animatemotion',
  'set',
])

/**
 * Allowed SVG element tags. Anything not in this allowlist is removed.
 * This is an allowlist (default-deny) approach — safer than a blocklist.
 */
const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'textpath',
  'lineargradient',
  'radialgradient',
  'stop',
  'filter',
  'feblend',
  'fecolormatrix',
  'fecomponenttransfer',
  'fecomposite',
  'feconvolvematrix',
  'fediffuselighting',
  'fedisplacementmap',
  'fedropshadow',
  'feflood',
  'fefunca',
  'fefuncb',
  'fefuncg',
  'fefuncr',
  'fegaussianblur',
  'femerge',
  'femergenode',
  'femorphology',
  'feoffset',
  'fespecularlighting',
  'fetile',
  'feturbulence',
  'fedistantlight',
  'fepointlight',
  'fespotlight',
  'clippath',
  'mask',
  'pattern',
  'marker',
  'image',
  'title',
  'desc',
  'metadata',
  'style',
])

/**
 * Allowed attributes (presentational + structural). Anything not in this
 * allowlist is removed. URI-bearing attributes (href/xlink:href/src) are
 * validated separately in `isSafeUri`.
 */
const ALLOWED_ATTRIBUTES = new Set([
  'id',
  'class',
  'transform',
  'translate',
  'scale',
  'rotate',
  'skewx',
  'skewy',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'd',
  'points',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'opacity',
  'visibility',
  'display',
  'color',
  'stop-color',
  'stop-opacity',
  'offset',
  'gradientunits',
  'gradienttransform',
  'spreadmethod',
  'fx',
  'fy',
  'text-anchor',
  'text-decoration',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'word-spacing',
  'clip-path',
  'clip-rule',
  'mask',
  'mask-type',
  'maskunits',
  'maskcontentunits',
  'patternunits',
  'patterncontentunits',
  'patterntransform',
  'marker-start',
  'marker-mid',
  'marker-end',
  'markerunits',
  'markerwidth',
  'markerheight',
  'refx',
  'refy',
  'orient',
  'viewbox',
  'preserveaspectratio',
  'filter',
  'filterunits',
  'primitiveunits',
  'result',
  'in',
  'in2',
  'mode',
  'type',
  'values',
  'tablevalues',
  'slope',
  'intercept',
  'amplitude',
  'exponent',
  'operator',
  'kernelmatrix',
  'divisor',
  'bias',
  'targetx',
  'targety',
  'edgemode',
  'order',
  'kernelunitlength',
  'diffuseconstant',
  'surfacescale',
  'specularconstant',
  'specularexponent',
  'lighting-color',
  'azimuth',
  'elevation',
  'pointsatx',
  'pointsaty',
  'pointsatz',
  'limitingconeangle',
  'xlink:href',
  'href',
  'preserveaspectratio',
  'xmlns',
  'xmlns:xlink',
  'style',
  'dx',
  'dy',
  'startoffset',
  'method',
  'spacing',
  'lengthadjust',
  'textlength',
  'basefrequency',
  'numoctaves',
  'seed',
  'stitchtiles',
  'crossorigin',
])

/**
 * Check whether a URI is safe to keep in href/src attributes.
 * Safe = absolute path, relative path, fragment (#id), https URL, or data:image/*.
 * Unsafe = javascript:, data:text/html, data: with non-image MIME, vbscript:, etc.
 */
function isSafeUri(value: string): boolean {
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, '')
  if (trimmed === '') return true // empty href is harmless
  if (trimmed.startsWith('#')) return true // fragment reference
  if (trimmed.startsWith('/')) return true // absolute path
  if (trimmed.startsWith('./') || trimmed.startsWith('../')) return true // relative path
  if (trimmed.startsWith('https://')) return true
  if (trimmed.startsWith('data:image/')) {
    // Allow data: URIs for image MIME types only (png, jpeg, webp, gif).
    // Block data:image/svg+xml entirely — nested SVG could carry <script>
    // and we can't re-sanitize at attribute-scan time.
    if (trimmed.startsWith('data:image/svg+xml')) return false
    return true
  }
  // Block javascript:, vbscript:, file:, and anything else
  return false
}

/**
 * Strip XML processing instructions and DOCTYPE declarations that could
 * carry XXE or script payloads. We only keep the root <svg> element.
 */
function stripProlog(svg: string): string {
  // Remove everything before the first <svg tag, and any trailing content
  // after the closing </svg>. This drops <?xml ... ?>, <!DOCTYPE ... >,
  // comments, and PIs.
  const match = svg.match(/<svg[\s>]/i)
  if (!match || match.index === undefined) return svg
  const start = match.index
  const endMatch = svg.match(/<\/svg>\s*$/i)
  const end = endMatch && endMatch.index !== undefined ? endMatch.index + endMatch[0].length : svg.length
  return svg.slice(start, end)
}

/**
 * Recursively sanitize a DOM node: remove forbidden elements, strip
 * forbidden/unknown attributes, and validate URIs.
 */
function sanitizeNode(node: Node, depth: number): void {
  // Guard against pathological nesting depth (DoS).
  if (depth > 100) return

  const children = node.childNodes
  // Iterate backwards so removals don't disturb the index.
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children.item(i)
    if (!child) continue

    const nodeType = child.nodeType

    // Element node (1)
    if (nodeType === 1) {
      const el = child as unknown as Element
      const tag = el.tagName.toLowerCase()

      // Remove forbidden elements entirely (with children).
      if (FORBIDDEN_ELEMENTS.has(tag)) {
        node.removeChild(child)
        continue
      }

      // Remove non-allowlisted elements, but preserve their children
      // (lift children into parent) — this is safer than dropping content
      // and matches DOMPurify's default behavior for unknown elements.
      if (!ALLOWED_ELEMENTS.has(tag)) {
        // Move children up before removing the element.
        const grandkids = el.childNodes
        const insertBefore = child
        while (grandkids.length > 0) {
          const gk = grandkids.item(0)
          if (gk) node.insertBefore(gk, insertBefore)
          else break
        }
        node.removeChild(child)
        continue
      }

      // Sanitize attributes.
      sanitizeAttributes(el)

      // Recurse into surviving children.
      sanitizeNode(el, depth + 1)
      continue
    }

    // Comment node (8) — remove (can carry IE conditional-comment payloads).
    if (nodeType === 8) {
      node.removeChild(child)
      continue
    }

    // Processing instruction (7) — remove.
    if (nodeType === 7) {
      node.removeChild(child)
      continue
    }

    // CDATA section (4) — remove. We already drop <script>, and CDATA
    // outside of style/script contexts is unnecessary in safe SVGs.
    if (nodeType === 4) {
      node.removeChild(child)
      continue
    }

    // Text node (3) — keep (will be XML-escaped on serialization).
    // Document/DocumentType nodes (9,10) — handled at top level, not here.
  }
}

/**
 * Remove forbidden attributes and validate URI-bearing attributes.
 */
function sanitizeAttributes(el: Element): void {
  const attrs = el.attributes
  // Iterate backwards for safe removal.
  for (let i = attrs.length - 1; i >= 0; i--) {
    const attr = attrs.item(i) as Attr | null
    if (!attr) continue

    const name = attr.name.toLowerCase()

    // 1. Strip all event handler attributes: on*
    if (name.startsWith('on')) {
      el.removeAttribute(attr.name)
      continue
    }

    // 2. Strip xmlns:* declarations except the two we allow (svg, xlink).
    if (name.startsWith('xmlns:') && name !== 'xmlns:xlink') {
      el.removeAttribute(attr.name)
      continue
    }

    // 3. Validate URI-bearing attributes.
    if (name === 'href' || name === 'xlink:href' || name === 'src') {
      if (!isSafeUri(attr.value)) {
        el.removeAttribute(attr.name)
        continue
      }
    }

    // 4. Allowlist enforcement: remove any attribute not explicitly allowed.
    if (!ALLOWED_ATTRIBUTES.has(name)) {
      el.removeAttribute(attr.name)
      continue
    }
  }

  // Special handling: <style> element text content.
  if (el.tagName.toLowerCase() === 'style') {
    const text = el.textContent
    if (text && /expression\s*\(|javascript:|@import|<script/i.test(text)) {
      // Remove the entire <style> if it contains dangerous CSS.
      const parent = el.parentNode
      if (parent) parent.removeChild(el)
    }
  }
}

/**
 * Sanitize an SVG document string for safe display.
 *
 * Returns a cleaned SVG string. If parsing fails or the input is not a
 * valid SVG document, returns an empty `<svg/>` to avoid serving broken
 * markup.
 *
 * @example
 *   const clean = sanitizeSvg(rawSvgString)
 */
export function sanitizeSvg(input: string): string {
  const EMPTY_SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>'

  if (typeof input !== 'string' || input.length === 0) {
    return EMPTY_SVG
  }

  // Cap input size to prevent DoS via deeply nested/huge documents.
  // 10MB matches the route's MAX_FILE_SIZE_BYTES.
  if (input.length > 10 * 1024 * 1024) {
    return EMPTY_SVG
  }

  // Strip XML prolog, DOCTYPE, and PIs before parsing.
  const stripped = stripProlog(input)
  if (!/<svg[\s>]/i.test(stripped)) {
    return EMPTY_SVG
  }

  let doc: Document
  try {
    const parser = new DOMParser()
    // Parse as XML image/svg+xml. xmldom is lenient and produces a
    // best-effort tree; the allowlist walk handles the rest.
    doc = parser.parseFromString(stripped, 'image/svg+xml')
  } catch {
    return EMPTY_SVG
  }

  if (!doc || !doc.documentElement) {
    return EMPTY_SVG
  }

  const root = doc.documentElement
  // Ensure the root is <svg>; if not, bail.
  if (root.tagName.toLowerCase() !== 'svg') {
    return EMPTY_SVG
  }

  // Ensure the SVG namespace is declared so browsers render it correctly.
  if (!root.getAttribute('xmlns')) {
    root.setAttribute('xmlns', SVG_NAMESPACE)
  }

  // Sanitize the root element's own attributes (sanitizeNode only descends
  // into children, so the root's attributes are handled here separately).
  sanitizeAttributes(root)

  // Walk and sanitize children.
  sanitizeNode(root, 0)

  // Serialize back to string.
  const serializer = new XMLSerializer()
  const out = serializer.serializeToString(root)

  // Final belt-and-suspenders: if anything dangerous slipped through,
  // return a safe empty svg. This catches edge cases in the serializer.
  if (/<script|onerror|onload\s*=|javascript:/i.test(out)) {
    return EMPTY_SVG
  }

  return out
}