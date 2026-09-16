import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, LogOut } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'

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
  const { user, profile, signOut, sendPasswordReset } = useAuth()
  const navigate = useNavigate()
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [resetBusy, setResetBusy] = useState(false)

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Settings</h1>
        <p className="text-sm text-neutral-500 mt-1">Account, shop preferences, and security.</p>
      </div>

      <div className="card-premium p-5 sm:p-6 space-y-4">
        <h2 className="font-semibold text-navy-900">Account Information</h2>
        <div className="space-y-2.5">
          <Row label="Display name" value={profile?.name ?? '—'} />
          <Row label="Email" value={profile?.email ?? user?.email ?? '—'} />
          <Row label="Phone" value={profile?.phone ?? '—'} />
        </div>
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
