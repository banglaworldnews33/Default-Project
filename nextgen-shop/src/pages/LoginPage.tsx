import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { SiteLogo } from '@/components/brand/SiteLogo'
import { isValidBDMobile } from '@/lib/utils'

type Mode = 'login' | 'register' | 'forgot'

function getSafeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return '/'
  return raw
}

export const LoginPage: React.FC = () => {
  const { user, profile, isLoading: authLoading, isConfigured, signIn, signUp, signOut, sendPasswordReset } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnPath = getSafeReturnPath(searchParams.get('return'))

  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mobile, setMobile] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function switchMode(next: Mode): void {
    setMode(next)
    setFormError(null)
    setNotice(null)
  }

  function validate(): string | null {
    if (!email.trim() || !email.includes('@')) return 'Enter a valid email address.'
    if (mode === 'forgot') return null
    if (!password || password.length < 6) return 'Password must be at least 6 characters.'
    if (mode === 'register') {
      if (!name.trim()) return 'Enter your full name.'
      if (!isValidBDMobile(mobile)) return 'Enter a valid BD mobile number (01XXXXXXXXX).'
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setFormError(null)
    setNotice(null)
    const validationError = validate()
    if (validationError) {
      setFormError(validationError)
      return
    }
    setSubmitting(true)
    try {
      if (mode === 'forgot') {
        const { error } = await sendPasswordReset(email.trim())
        if (error) {
          setFormError(error.message)
        } else {
          setNotice('Password reset link sent. Check your email inbox.')
        }
        return
      }
      if (mode === 'login') {
        const { error } = await signIn(email.trim(), password)
        if (error) {
          setFormError(error.message)
          return
        }
        setNotice('Logged in successfully.')
        navigate(returnPath, { replace: true })
        return
      }
      const { needsVerification, error } = await signUp(email.trim(), password, {
        name: name.trim(),
        phone: mobile.trim(),
      })
      if (error) {
        setFormError(error.message)
        return
      }
      if (needsVerification) {
        setNotice('Account created. Check your email to verify it, then sign in.')
      } else {
        setNotice('Account created successfully.')
        navigate(returnPath, { replace: true })
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout(): Promise<void> {
    setFormError(null)
    const { error } = await signOut()
    if (error) {
      setFormError(error.message)
      return
    }
    setNotice('Logged out successfully.')
  }

  function renderAlert(): React.ReactNode {
    if (formError) {
      return (
        <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">
          {formError}
        </div>
      )
    }
    if (notice) {
      return (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3">
          {notice}
        </div>
      )
    }
    return null
  }

  function renderFields(): React.ReactNode {
    if (mode === 'forgot') {
      return (
        <div>
          <label htmlFor="auth-email" className="block text-sm font-medium text-neutral-700 mb-1">
            Email <span className="text-rose-600">*</span>
          </label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white"
            placeholder="you@example.com"
          />
        </div>
      )
    }
    return (
      <>
        {mode === 'register' && (
          <div>
            <label htmlFor="auth-name" className="block text-sm font-medium text-neutral-700 mb-1">
              Full Name <span className="text-rose-600">*</span>
            </label>
            <input
              id="auth-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white"
              placeholder="Your name"
            />
          </div>
        )}
        <div>
          <label htmlFor="auth-email" className="block text-sm font-medium text-neutral-700 mb-1">
            Email <span className="text-rose-600">*</span>
          </label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="auth-password" className="block text-sm font-medium text-neutral-700 mb-1">
            Password <span className="text-rose-600">*</span>
          </label>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white"
            placeholder="Min. 6 characters"
          />
        </div>
        {mode === 'register' && (
          <div>
            <label htmlFor="auth-mobile" className="block text-sm font-medium text-neutral-700 mb-1">
              Mobile Number <span className="text-rose-600">*</span>
            </label>
            <input
              id="auth-mobile"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={11}
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white"
              placeholder="01XXXXXXXXX"
            />
          </div>
        )}
      </>
    )
  }

  function renderModeLinks(): React.ReactNode {
    if (mode === 'login') {
      return (
        <div className="text-center text-xs text-neutral-500 space-y-2">
          <p>
            Don&apos;t have an account?{' '}
            <button type="button" onClick={() => switchMode('register')} className="font-semibold text-accent-700 hover:underline cursor-pointer">
              Sign Up
            </button>
          </p>
          <p>
            <button type="button" onClick={() => switchMode('forgot')} className="font-semibold text-accent-700 hover:underline cursor-pointer">
              Forgot password?
            </button>
          </p>
        </div>
      )
    }
    if (mode === 'register') {
      return (
        <p className="text-center text-xs text-neutral-500">
          Already have an account?{' '}
          <button type="button" onClick={() => switchMode('login')} className="font-semibold text-accent-700 hover:underline cursor-pointer">
            Sign In
          </button>
        </p>
      )
    }
    return (
      <p className="text-center text-xs text-neutral-500">
        Remembered it?{' '}
        <button type="button" onClick={() => switchMode('login')} className="font-semibold text-accent-700 hover:underline cursor-pointer">
          Back to Sign In
        </button>
      </p>
    )
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <div className="max-w-md mx-auto py-12">
          <div className="bg-white rounded-xl border border-neutral-200/80 p-6 text-center text-sm text-neutral-500">
            Loading your session...
          </div>
        </div>
      </div>
    )
  }

  if (user) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <div className="max-w-md mx-auto py-12">
          <div className="bg-white rounded-xl border border-neutral-200/80 p-6 space-y-4">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <SiteLogo height={44} />
              </div>
              <h1 className="text-2xl font-display font-bold text-neutral-900">Your Account</h1>
              <p className="text-sm text-neutral-500 mt-1">{user.email}</p>
            </div>
            {renderAlert()}
            <div className="rounded-lg bg-neutral-50 border border-neutral-200 text-sm text-neutral-600 px-4 py-3 space-y-1">
              <p>Role: <span className="font-semibold text-neutral-900">{profile ? profile.role : 'customer'}</span></p>
              <p>Status: <span className="font-semibold text-neutral-900">{profile ? profile.verification_status : 'pending'}</span></p>
            </div>
            <Button variant="outline" size="lg" className="w-full" onClick={handleLogout}>
              Log Out
            </Button>
            <p className="text-center text-xs text-neutral-500">
              <Link to="/" className="font-semibold text-accent-700 hover:underline">
                Continue shopping
              </Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  const title = mode === 'login' ? 'Welcome Back' : mode === 'register' ? 'Create Account' : 'Reset Password'
  const subtitle =
    mode === 'login'
      ? 'Sign in to your Nextgen Shop account'
      : mode === 'register'
        ? 'Join Nextgen Shop for a better experience'
        : 'Enter your email to receive a reset link'
  const submitLabel = submitting ? 'Please wait...' : mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Link'

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-md mx-auto py-12">
        <div className="bg-white rounded-xl border border-neutral-200/80 p-6">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <SiteLogo height={44} />
            </div>
            <h1 className="text-2xl font-display font-bold text-neutral-900">{title}</h1>
            <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>
          </div>
          {!isConfigured && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-4">
              Auth backend is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable sign in.
            </div>
          )}
          {renderAlert()}
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {renderFields()}
            <Button type="submit" variant="secondary" size="lg" className="w-full" disabled={submitting}>
              {submitLabel}
            </Button>
            {renderModeLinks()}
          </form>
        </div>
      </div>
    </div>
  )
}