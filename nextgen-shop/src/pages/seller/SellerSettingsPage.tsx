import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, LogOut } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { sellerSettingsService } from '@/services/sellerSettings'
import { isValidBDMobile } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

const inputClass =
  'w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 bg-white transition-all placeholder:text-neutral-400'

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 rounded-xl bg-neutral-50 border border-neutral-200/70 px-4 py-3">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <span className="text-sm font-semibold text-navy-900 break-all">{value}</span>
      {hint && <span className="text-[11px] text-neutral-400 sm:text-right">{hint}</span>}
    </div>
  )
}

export const SellerSettingsPage: React.FC = () => {
  const { user, profile, profileLoading, signOut, sendPasswordReset, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(profile?.name ?? '')
  const [phoneInput, setPhoneInput] = useState(profile?.phone ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Form inputs are (re)synced from the authoritative profile only
  // when editing starts, so no sync effect (and no effect loop)
  // is needed. Initial values cover the already-loaded case.

  async function handlePasswordReset(): Promise<void> {
    const email = profile?.email ?? user?.email ?? ''
    if (!email) return
    setResetBusy(true)
    setResetMsg(null)
    const { error } = await sendPasswordReset(email)
    setResetMsg(error ? error.message : 'Password reset link sent. Check your email inbox.')
    setResetBusy(false)
  }

  async function handleSignOut(): Promise<void> {
    await signOut()
    navigate('/', { replace: true })
  }

  function startEdit(): void {
    setNameInput(profile?.name ?? '')
    setPhoneInput(profile?.phone ?? '')
    setFormError(null)
    setSaveMsg(null)
    setEditing(true)
  }

  async function handleSave(): Promise<void> {
    if (saving) return
    const name = nameInput.trim()
    const phone = phoneInput.replace(/\s/g, '')
    if (name.length < 2 || name.length > 80) {
      setFormError('Display name must be 2–80 characters.')
      return
    }
    if (!isValidBDMobile(phone)) {
      setFormError('Enter a valid BD mobile number (01XXXXXXXXX).')
      return
    }
    const userId = user?.id ?? ''
    if (!userId) {
      setFormError('Sign in required.')
      return
    }
    setSaving(true)
    setFormError(null)
    setSaveMsg(null)
    const { error } = await sellerSettingsService.updateMyProfile(userId, name, phone)
    setSaving(false)
    if (error) {
      setFormError(error.message)
      return
    }
    setEditing(false)
    setSaveMsg('Profile updated.')
    await refreshProfile()
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Settings</h1>
        <p className="text-sm text-neutral-500 mt-1">Account, shop preferences, and security.</p>
      </div>

      <div className="card-premium p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-navy-900">Account Information</h2>
          {!editing && (
            <Button type="button" variant="outline" size="sm" onClick={startEdit}>
              <span>Edit</span>
            </Button>
          )}
        </div>
        {saveMsg && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3">{saveMsg}</div>
        )}
        {editing ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="settings-name" className="block text-xs font-medium text-neutral-500 mb-1">
                Display name
              </label>
              <input
                id="settings-name"
                type="text"
                value={nameInput}
                maxLength={80}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Your display name"
                autoComplete="name"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="settings-phone" className="block text-xs font-medium text-neutral-500 mb-1">
                Phone
              </label>
              <input
                id="settings-phone"
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="01XXXXXXXXX"
                autoComplete="tel"
                className={inputClass}
              />
            </div>
            {formError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">{formError}</div>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="button" variant="secondary" size="md" disabled={saving} onClick={() => void handleSave()}>
                <span>{saving ? 'Saving…' : 'Save changes'}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="md"
                disabled={saving}
                onClick={() => { setEditing(false); setFormError(null) }}
              >
                <span>Cancel</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {profileLoading && !profile ? (
              <p className="text-sm text-neutral-500">Loading your profile…</p>
            ) : (
              <>
                <Row label="Display name" value={profile?.name ?? '—'} />
                <Row label="Email" value={profile?.email ?? user?.email ?? '—'} />
                <Row label="Phone" value={profile?.phone ?? '—'} />
              </>
            )}
          </div>
        )}
      </div>

      <div className="card-premium p-5 sm:p-6 space-y-4">
        <h2 className="font-semibold text-navy-900">Authorization (database-controlled)</h2>
        <div className="space-y-2.5">
          <Row label="Role" value={profile?.role ?? '—'} hint="Only changeable by admin approval" />
          <Row label="Verification" value={profile?.verification_status ?? '—'} hint="Only changeable by admin approval" />
        </div>
        <p className="flex items-start gap-2 text-xs text-neutral-500 leading-relaxed">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          Role and verification status cannot be edited here or anywhere in the app — they are
          enforced by database triggers and change only through the admin approval workflow.
        </p>
      </div>

      <div className="card-premium p-5 sm:p-6 space-y-4">
        <h2 className="font-semibold text-navy-900">Security</h2>
        <Button
          type="button"
          variant="outline"
          size="md"
          className="w-full sm:w-auto"
          disabled={resetBusy}
          onClick={() => void handlePasswordReset()}
        >
          {resetBusy ? 'Sending…' : 'Send Password Reset Email'}
        </Button>
        {resetMsg && <p className="text-xs text-neutral-600">{resetMsg}</p>}
        <Button
          type="button"
          variant="danger"
          size="md"
          className="w-full sm:w-auto"
          onClick={() => void handleSignOut()}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  )
}
