/**
 * Client-side device fingerprinting for MFA verification.
 *
 * Creates a lightweight hash from browser + device signals that can be
 * used as an additional verification factor during MFA challenge.
 *
 * This is NOT a security boundary — it's an additional risk signal.
 * A sophisticated attacker can spoof these values. But it raises the
 * bar significantly compared to IP-only checks.
 */

export interface DeviceFingerprint {
  /** Hash of combined device signals */
  hash: string
  /** Individual components (for logging/debugging only — never expose to server raw) */
  components: {
    userAgent: string
    screen: string
    timezone: string
    language: string
    platform: string
    hardwareConcurrency: number
    deviceMemory?: number
  }
}

/**
 * Collect device signals and produce a fingerprint hash.
 * Uses only readable browser APIs (no canvas/WebGL fingerprinting).
 */
export async function collectDeviceFingerprint(): Promise<DeviceFingerprint> {
  const components = {
    userAgent: navigator.userAgent,
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    platform: (navigator as any).platform || 'unknown',
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: (navigator as any).deviceMemory || undefined,
  }

  // Create a stable string to hash
  const fingerprintString = [
    components.userAgent,
    components.screen,
    components.timezone,
    components.language,
    components.platform,
    components.hardwareConcurrency,
    components.deviceMemory ?? 'unknown',
  ].join('|||')

  // Use SubtleCrypto to create a SHA-256 hash of the fingerprint
  const hash = await hashString(fingerprintString)

  return { hash, components }
}

async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}