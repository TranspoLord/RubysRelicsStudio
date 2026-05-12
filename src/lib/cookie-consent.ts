export type CookieConsentLevel = 'accepted' | 'essential-only' | 'dismissed'

export interface CookieConsentState {
  version: string
  level: CookieConsentLevel
  acceptedAt: string | null
  preferences: {
    essential: true
    analytics: boolean
    preferences: boolean
  }
}

export const COOKIE_CONSENT_STORAGE_KEY = 'rr_cookie_consent_state'
export const COOKIE_CONSENT_VERSION = '2'

export function defaultConsentState(): CookieConsentState {
  return {
    version: COOKIE_CONSENT_VERSION,
    level: 'dismissed',
    acceptedAt: null,
    preferences: {
      essential: true,
      analytics: false,
      preferences: false,
    },
  }
}

export function normalizeConsentState(raw: unknown): CookieConsentState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const root = raw as Record<string, unknown>

  const level =
    root.level === 'accepted' || root.level === 'essential-only' || root.level === 'dismissed'
      ? root.level
      : null

  const prefs =
    root.preferences && typeof root.preferences === 'object' && !Array.isArray(root.preferences)
      ? (root.preferences as Record<string, unknown>)
      : null

  if (!level || !prefs) return null

  return {
    version: typeof root.version === 'string' && root.version.length > 0 ? root.version : COOKIE_CONSENT_VERSION,
    level,
    acceptedAt: typeof root.acceptedAt === 'string' ? root.acceptedAt : null,
    preferences: {
      essential: true,
      analytics: Boolean(prefs.analytics),
      preferences: Boolean(prefs.preferences),
    },
  }
}

export function readConsentState(): CookieConsentState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)
    if (!raw) return null
    return normalizeConsentState(JSON.parse(raw))
  } catch {
    return null
  }
}

export function writeConsentState(next: CookieConsentState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // localStorage unavailable
  }
}

export function createAcceptedConsent(analytics: boolean, preferences: boolean): CookieConsentState {
  return {
    version: COOKIE_CONSENT_VERSION,
    level: analytics || preferences ? 'accepted' : 'essential-only',
    acceptedAt: new Date().toISOString(),
    preferences: {
      essential: true,
      analytics,
      preferences,
    },
  }
}
