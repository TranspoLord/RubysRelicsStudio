import { ImageResponse } from 'next/og'

/**
 * Programmatic favicon (SEPT_IMPLEMENTATION_PLAN §7.10).
 *
 * `public/` does not exist and there is no `src/app/icon.*`, so `/favicon.ico`
 * 404'd on every page load. Next generates this route at build time, which avoids
 * waiting on artwork: a gold "R" on the forge void.
 *
 * Verified by fetching `/icon` from a production server (200, `image/png`,
 * non-zero body) — see OCT_IMPLEMENTATION_PLAN.md → Batch 6 notes.
 */
export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0C0A07',
          color: '#C4921A',
          fontSize: 44,
          fontWeight: 700,
          borderRadius: 12,
        }}
      >
        R
      </div>
    ),
    size
  )
}