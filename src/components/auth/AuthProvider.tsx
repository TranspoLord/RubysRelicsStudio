'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

import { getBrowserSupabaseClient } from '@/lib/supabase/browser'

/**
 * Application-wide Supabase session state.
 *
 * The session lives in cookies (see `@supabase/ssr`), so this provider is the
 * React-facing view of it: it hydrates from the cookie store on mount and
 * stays in sync through `onAuthStateChange` (token refresh, sign-in, sign-out,
 * another tab signing out).
 *
 * SECURITY: the values exposed here are for rendering only. `getSession()`
 * reads the cookie without re-validating the JWT, so never use `user` or
 * `isSignedIn` to authorize data access. Server-side code must call
 * `createServerSupabaseClient()` and `supabase.auth.getClaims()`.
 */
export interface AuthContextValue {
  /** Full session (access token, refresh token, expiry) or `null` when signed out. */
  session: Session | null
  /** Convenience view of `session.user`. */
  user: User | null
  /** `true` until the initial cookie-backed session read completes. */
  isLoading: boolean
  /** `true` when a session is present (display only — not an authorization check). */
  isSignedIn: boolean
  /** Clears the Supabase session cookies and re-renders Server Components. */
  signOut: () => Promise<void>
  /** §10.17 — revokes every session *except* the current one (Supabase `scope: 'others'`). */
  signOutOthers: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getBrowserSupabaseClient()
  const router = useRouter()

  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setSession(data.session)
      setIsLoading(false)
    })

    // The callback must stay synchronous: calling other Supabase methods
    // inside it can deadlock the auth client (documented behaviour).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    // Re-render Server Components so they observe the cleared cookies.
    router.refresh()
  }, [supabase, router])

  const signOutOthers = useCallback(async () => {
    // §10.17: "sign out everywhere except this device". Supabase revokes every
    // refresh token except the one held by the current session cookies, so the
    // admin keeps this device and kills the rest — no session-list UI needed.
    await supabase.auth.signOut({ scope: 'others' })
    router.refresh()
  }, [supabase, router])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isSignedIn: Boolean(session),
      signOut,
      signOutOthers,
    }),
    [session, isLoading, signOut, signOutOthers]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Reads the Supabase session context.
 * Throws when used outside `<AuthProvider>` so the mistake surfaces in
 * development instead of silently rendering a signed-out UI.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>.')
  }
  return context
}
