import { ImageResponse } from 'next/og'

/**
 * Programmatic Open Graph image (docs/archive/SEPT_IMPLEMENTATION_PLAN §7.10).
 *
 * There was no OG image at all, so every share of the site rendered as a bare
 * link. Like `icon.tsx` this is generated at build time from brand tokens, which
 * avoids waiting on artwork.
 */
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export const alt = "Ruby's Relics Studio — Forged in Fire. Gathered for Your Hoard."

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0C0A07 0%, #231F19 100%)',
          color: '#EDE0CC',
          padding: 64,
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 6, color: '#C4921A', textTransform: 'uppercase' }}>
          Custom laser engraving &amp; sublimation
        </div>
        <div
          style={{
            fontSize: 68,
            fontWeight: 700,
            marginTop: 24,
            textAlign: 'center',
            lineHeight: 1.15,
          }}
        >
          Ruby&apos;s Relics Studio
        </div>
        <div style={{ fontSize: 34, marginTop: 20, color: '#9E8A6A', textAlign: 'center' }}>
          Forged in Fire. Gathered for Your Hoard.
        </div>
      </div>
    ),
    size
  )
}