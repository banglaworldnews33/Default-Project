import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  ensureProfile,
  getProfile,
  isSupabaseConfigured,
  resetPassword,
  signIn as supabaseSignIn,
  signOut as supabaseSignOut,
  signUp as supabaseSignUp,
  supabase,
  type Profile,
} from '@/lib/supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  isLoading: boolean
  profileLoading: boolean
  isConfigured: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, opts?: { name?: string; phone?: string }) => Promise<{ needsVerification: boolean; error: Error | null }>
  signOut: () => Promise<{ error: Error | null }>
  sendPasswordReset: (email: string) => Promise<{ error: Error | null }>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function loadProfileForUser(user: User): Promise<Profile | null> {
  const { profile } = await getProfile(user.id)
  if (profile) return profile
  const meta = (user.user_metadata ?? {}) as { name?: string; phone?: string }
  const created = await ensureProfile(
    { id: user.id, email: user.email ?? null },
    typeof meta.name === 'string' ? meta.name : null,
    typeof meta.phone === 'string' ? meta.phone : null,
  )
  return created.profile
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured)
  const [profileLoading, setProfileLoading] = useState(false)

  const refreshProfile = useCallback(async () => {
    if (!isSupabaseConfigured) return
    const { data } = await supabase.auth.getSession()
    const currentUser = data.session?.user ?? null
    if (!currentUser) {
      setProfile(null)
      return
    }
    setProfileLoading(true)
    try {
      const loaded = await loadProfileForUser(currentUser)
      setProfile(loaded)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setIsLoading(false)
      if (data.session?.user) {
        setProfileLoading(true)
        loadProfileForUser(data.session.user)
          .then((loaded) => {
            if (active) setProfile(loaded)
          })
          .finally(() => {
            if (active) setProfileLoading(false)
          })
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      if (nextSession?.user) {
        setProfileLoading(true)
        loadProfileForUser(nextSession.user)
          .then((loaded) => {
            if (active) setProfile(loaded)
          })
          .finally(() => {
            if (active) setProfileLoading(false)
          })
      } else {
        setProfile(null)
      }
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabaseSignIn(email, password)
    return { error }
  }, [])

  const signUp = useCallback(async (email: string, password: string, opts?: { name?: string; phone?: string }) => {
    if (!isSupabaseConfigured) {
      const { error } = await supabaseSignUp(email, password)
      return { needsVerification: false, error }
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: opts?.name ?? null, phone: opts?.phone ?? null } },
    })
    // Supabase returns a session immediately when email confirmation is off,
    // otherwise the user must verify via the emailed link.
    const needsVerification = !error && !data.session && !!data.user
    return { needsVerification, error }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabaseSignOut()
    setProfile(null)
    return { error }
  }, [])

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await resetPassword(email)
    return { error }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      isLoading,
      profileLoading,
      isConfigured: isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      refreshProfile,
    }),
    [session, user, profile, isLoading, profileLoading, signIn, signUp, signOut, sendPasswordReset, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
