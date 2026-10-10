/**
 * `images.remotePatterns` for Supabase Storage (OCT #69).
 *
 * The config used to allow `*.supabase.co`, which means
 * `/_next/image?url=https://<any-project>.supabase.co/storage/v1/object/public/…`
 * — any third party can make this deployment resize *their* images under the
 * shop's own domain and spend its Vercel image quota. Only this project's
 * storage bucket is ever used, so the hostname is derived from
 * `NEXT_PUBLIC_SUPABASE_URL`.
 *
 * A missing or malformed URL yields `[]`: fail closed, so the build refuses to
 * optimize remote images rather than falling back to a wildcard.
 */

export interface RemoteImagePattern {
  protocol: 'http' | 'https'
  hostname: string
  pathname: string
}

/** Only public objects — never signed URLs or a private bucket path. */
export const SUPABASE_IMAGE_PATHNAME = '/storage/v1/object/public/**'

export function supabaseRemotePatterns(
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL
): RemoteImagePattern[] {
  if (!supabaseUrl) return []

  try {
    const { protocol, hostname } = new URL(supabaseUrl)
    if (protocol !== 'https:' && protocol !== 'http:') return []
    // A wildcard hostname would re-create the hole this helper closes, so it is
    // rejected outright rather than passed through.
    if (!hostname || hostname.includes('*')) return []

    return [
      {
        protocol: protocol === 'https:' ? 'https' : 'http',
        hostname,
        pathname: SUPABASE_IMAGE_PATHNAME,
      },
    ]
  } catch {
    return []
  }
}
