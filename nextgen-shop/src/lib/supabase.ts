// Supabase browser client for Nextgen Shop.
// Uses ONLY VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
// The service-role key must never appear in frontend code.

import { createBrowserClient } from '@supabase/ssr'
import type { Session } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0

// Placeholder values keep module init from crashing when env is missing.
// All auth calls will fail gracefully and report "not configured".
export const supabase = createBrowserClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder-anon-key',
)

export type ProfileRole = 'customer' | 'seller' | 'admin'
export type VerificationStatus = 'pending' | 'verified' | 'rejected'

export interface Profile {
  id: string
  email: string | null
  phone: string | null
  name: string | null
  role: ProfileRole
  verification_status: VerificationStatus
  onboarding_complete: boolean
}

function notConfiguredError(): Error {
  return new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

export async function getSession(): Promise<{ session: Session | null; error: Error | null }> {
  if (!isSupabaseConfigured) return { session: null, error: notConfiguredError() }
  const { data, error } = await supabase.auth.getSession()
  return { session: data.session, error }
}

export async function signIn(email: string, password: string) {
  if (!isSupabaseConfigured) return { data: { session: null, user: null }, error: notConfiguredError() }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signUp(email: string, password: string) {
  if (!isSupabaseConfigured) return { data: { session: null, user: null }, error: notConfiguredError() }
  const { data, error } = await supabase.auth.signUp({ email, password })
  return { data, error }
}

export async function signOut(): Promise<{ error: Error | null }> {
  if (!isSupabaseConfigured) return { error: null }
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function resetPassword(email: string) {
  if (!isSupabaseConfigured) return { data: null, error: notConfiguredError() }
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/login',
  })
  return { data, error }
}

export async function getProfile(userId: string): Promise<{ profile: Profile | null; error: Error | null }> {
  if (!isSupabaseConfigured) return { profile: null, error: notConfiguredError() }
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return { profile: (data ?? null) as Profile | null, error }
}

// Creates the customer's own profile row with safe server-enforced defaults.
// Role is ALWAYS 'customer' and status ALWAYS 'pending' here; RLS + CHECK
// constraints enforce this in the database. Never accept role from the browser.
export async function ensureProfile(user: { id: string; email: string | null }, name: string | null, phone: string | null) {
  if (!isSupabaseConfigured) return { profile: null as Profile | null, error: notConfiguredError() }
  const existing = await getProfile(user.id)
  if (existing.profile || existing.error) return existing
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      email: user.email ?? null,
      name,
      phone,
      role: 'customer',
      verification_status: 'pending',
      onboarding_complete: false,
    })
    .select()
    .maybeSingle()
  return { profile: (data ?? null) as Profile | null, error }
}
