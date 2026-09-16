import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, KeyRound, ShieldCheck, Ban, Copy, Check, RefreshCw } from 'lucide-react'
import { adminAccessService, type AdminCodeStatus } from '@/services/adminAccess'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { LoadingState, ErrorState, EmptyState } from '@/components/seller/SellerWidgets'
import { formatDate } from '@/lib/utils'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MIN_CODE_LENGTH = 12

const inputClass =
  'w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 bg-white transition-all placeholder:text-neutral-400'

/** Random code from a CSPRNG (never Math.random). Shown once for copy only. */
function generateCode(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

/**
 * Super-admin Admin Code console (migration 010).
 *
 * Authorization lives entirely in the database RPCs: this page may
 * render for any admin, but set/revoke/list deny non-super-admins
 * server-side. There is deliberately no client-side super-admin
 * flag, no email/UUID comparison, and no localStorage involvement.
 * Plaintext codes exist only in the password field (and the
 * one-time generated display) and are cleared after every submit.
 */
export const AdminAccessPage: React.FC = () => {
    const [targetAdminId, setTargetAdminId] = useState('')
  const [code, setCode] = useState('')
  const [generatedOnce, setGeneratedOnce] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [statuses, setStatuses] = useState<AdminCodeStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeKind, setNoticeKind] = useState<'ok' | 'err'>('ok')
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async () => {
    const { data, error: err } = await adminAccessService.listAdminProductCodes()
    if (err) {
      // Normal admins are denied here by the database; surface the
      // denial honestly instead of treating empty as a role signal.
      setError(err.message)
      setStatuses([])
    } else {
      setError(null)
      setStatuses(data ?? [])
    }
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      await load()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [load, reloadKey])

  function showNotice(kind: 'ok' | 'err', message: string): void {
    setNoticeKind(kind)
    setNotice(message)
  }

  /** The code must never survive a submit — success or failure. */
  function clearSecrets(): void {
    setCode('')
    setGeneratedOnce(null)
    setCopied(false)
  }

  function validTarget(): boolean {
    return UUID_RE.test(targetAdminId.trim())
  }

  // --- Admin permission grant/revoke (migration 011) ---
  // No user directory exists for arbitrary users (adminDirectory only
  // lists verified sellers), so targets are entered as UUIDs. No
  // client-side privilege state: the RPCs enforce is_super_admin().
  const [permTarget, setPermTarget] = useState('')
  const [permBusy, setPermBusy] = useState(false)
  const [confirmRevokePerm, setConfirmRevokePerm] = useState(false)

  function validPermTarget(): boolean {
    return UUID_RE.test(permTarget.trim())
  }

  async function handleGrantAdmin(): Promise<void> {
    const target = permTarget.trim()
    if (!validPermTarget()) {
      showNotice('err', 'Enter a valid target user UUID first.')
      return
    }
    setPermBusy(true)
    setNotice(null)
    const { error: err } = await adminAccessService.grantAdminPermission(target)
    setPermBusy(false)
    if (err) {
      showNotice('err', err.message)
      return
    }
    showNotice('ok', 'Admin permission granted. The user is now an admin.')
  }

  async function handleRevokeAdmin(): Promise<void> {
    const target = permTarget.trim()
    if (!validPermTarget()) {
      showNotice('err', 'Enter a valid target user UUID first.')
      return
    }
    setPermBusy(true)
    setNotice(null)
    const { error: err } = await adminAccessService.revokeAdminPermission(target)
    setPermBusy(false)
    setConfirmRevokePerm(false)
    if (err) {
      showNotice('err', err.message)
      return
    }
    showNotice('ok', 'Admin permission revoked. The user is now a customer.')
  }

  async function handleSetCode(): Promise<void> {
    const target = targetAdminId.trim()
    if (!validTarget()) {
      showNotice('err', 'Enter a valid target Admin UUID first.')
      return
    }
    if (code.length < MIN_CODE_LENGTH) {
      showNotice('err', `Admin Code must be at least ${MIN_CODE_LENGTH} characters.`)
      return
    }
    setActing(true)
    setNotice(null)
    const { error: err } = await adminAccessService.setAdminProductCode(target, code)
    clearSecrets()
    setActing(false)
    if (err) {
      showNotice('err', err.message)
      return
    }
    showNotice('ok', 'Admin Code saved (hash stored server-side). Share it with the admin once, out-of-band — it cannot be retrieved again.')
    setReloadKey((k) => k + 1)
  }

  async function handleRevoke(): Promise<void> {
    const target = targetAdminId.trim()
    if (!validTarget()) {
      showNotice('err', 'Enter a valid target Admin UUID first.')
      return
    }
    setActing(true)
    setNotice(null)
    const { error: err } = await adminAccessService.revokeAdminProductCode(target)
    clearSecrets()
    setActing(false)
    if (err) {
      showNotice('err', err.message)
      return
    }
    showNotice('ok', 'Admin Code revoked. That admin can no longer create seller-bound products until a new code is issued.')
    setReloadKey((k) => k + 1)
  }

  function handleGenerate(): void {
    const fresh = generateCode(24)
    setCode(fresh)
    setGeneratedOnce(fresh)
    setCopied(false)
    setNotice(null)
  }

  async function handleCopy(): Promise<void> {
    if (!generatedOnce) return
    try {
      await navigator.clipboard.writeText(generatedOnce)
      setCopied(true)
    } catch {
      showNotice('err', 'Copy failed — select and copy the code manually.')
    }
  }

  return (
    <div className="container-shop py-8 sm:py-10">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800 mb-5">
        <ArrowLeft className="h-4 w-4" />
        Back to Admin Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Admin Access</h1>
        <p className="text-sm text-neutral-500 mt-1 max-w-2xl">
          Issue, rotate, and revoke per-admin product codes. Every action runs through a
          super-admin-gated database workflow — denials here come from the database, never
          from this page. Codes are stored as hashes only and can never be retrieved.
        </p>
      </div>

      {notice && (
        <div className={`rounded-xl border text-sm px-4 py-3 mb-5 ${noticeKind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
        <form
          className="lg:col-span-2 card-premium p-5 sm:p-6 space-y-4"
          onSubmit={(e) => { e.preventDefault(); void handleSetCode() }}
        >
          <h2 className="font-display font-bold text-lg text-navy-900">Issue / Rotate Code</h2>
          <div>
            <label htmlFor="aa-target" className="block text-sm font-semibold text-navy-900 mb-1.5">
              Target Admin UUID <span className="text-rose-600">*</span>
            </label>
            <input
              id="aa-target"
              value={targetAdminId}
              onChange={(e) => setTargetAdminId(e.target.value)}
              placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>
          <div>
            <label htmlFor="aa-code" className="block text-sm font-semibold text-navy-900 mb-1.5">
              Admin Code <span className="text-rose-600">*</span>
            </label>
            <input
              id="aa-code"
              type="password"
              value={code}
              onChange={(e) => { setCode(e.target.value); setGeneratedOnce(null); setCopied(false) }}
              placeholder={`Minimum ${MIN_CODE_LENGTH} characters`}
              autoComplete="new-password"
              maxLength={256}
              className={inputClass}
            />
            <p className="text-[11px] text-neutral-400 mt-1">
              Masked at all times. Cleared from this page after every submit — share it once, out-of-band.
            </p>
          </div>
          {generatedOnce && (
            <div className="rounded-xl bg-primary-50/60 border border-primary-100 p-4 space-y-2">
              <p className="text-xs font-semibold text-primary-900">
                Generated code — copy it now. It will never be shown again.
              </p>
              <p className="font-mono text-xs text-navy-900 break-all bg-white rounded-lg border border-neutral-200 px-3 py-2">
                {generatedOnce}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <Button type="button" variant="outline" size="md" disabled={acting} onClick={handleGenerate}>
              <RefreshCw className="h-4 w-4" />
              Generate
            </Button>
            <Button type="submit" variant="secondary" size="md" className="flex-1" disabled={acting}>
              <KeyRound className="h-4 w-4" />
              {acting ? 'Saving…' : 'Set / Rotate Code'}
            </Button>
          </div>
          <Button type="button" variant="danger" size="md" className="w-full" disabled={acting} onClick={() => void handleRevoke()}>
            <Ban className="h-4 w-4" />
            Revoke Code
          </Button>
          <p className="text-[11px] text-neutral-400">
            Setting requires Super Admin rights in the database; otherwise the request is denied server-side.
          </p>
        </form>

        <div className="lg:col-span-3 card-premium p-5 sm:p-6">
          <h2 className="font-display font-bold text-lg text-navy-900 mb-1">Code Status</h2>
          <p className="text-xs text-neutral-500 mb-4">
            Status only — hashes are never returned and existing codes are never displayed.
          </p>
          {loading && <LoadingState message="Loading code status…" />}
          {!loading && error && (
            <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />
          )}
          {!loading && !error && statuses.length === 0 && (
            <EmptyState
              title="No codes issued"
              message="No Admin Product Codes exist yet, or this account is not permitted to view them."
            />
          )}
          {!loading && !error && statuses.length > 0 && (
            <ul className="space-y-2">
              {statuses.map((s) => (
                <li key={s.adminId} className="rounded-xl border border-neutral-200 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs text-navy-900 break-all">
                    <ShieldCheck className="h-4 w-4 text-primary-600 shrink-0" />
                    {s.adminId}
                  </span>
                  <Badge variant={s.isActive ? 'success' : 'muted'}>{s.isActive ? 'Active' : 'Revoked'}</Badge>
                  <span className="text-xs text-neutral-500">
                    {s.failedAttempts} failed attempt{s.failedAttempts === 1 ? '' : 's'}
                  </span>
                  {s.lockedUntil && (
                    <span className="text-xs text-rose-600">Locked until {formatDate(s.lockedUntil)}</span>
                  )}
                  <span className="text-xs text-neutral-400 ml-auto">Updated {formatDate(s.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card-premium p-5 sm:p-6 mt-5">
        <h2 className="font-display font-bold text-lg text-navy-900">Admin Permissions</h2>
        <p className="text-xs text-neutral-500 mt-1 mb-4">
          Grant or revoke the admin role. Only a Super Admin can use these actions — every
          request is authorized by the database, and denials come from the database, never
          from this page. Revoking a Super Admin is refused server-side.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="aa-perm-target" className="block text-sm font-semibold text-navy-900 mb-1.5">
              Target User UUID <span className="text-rose-600">*</span>
            </label>
            <input
              id="aa-perm-target"
              value={permTarget}
              onChange={(e) => { setPermTarget(e.target.value); setConfirmRevokePerm(false) }}
              placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>
        </div>
        {confirmRevokePerm ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mt-4 space-y-3">
            <p className="text-sm text-amber-900">
              Revoke admin permission from <span className="font-mono font-semibold">{permTarget.trim()}</span>?
              They will return to the customer role.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <Button type="button" variant="danger" size="md" className="flex-1" disabled={permBusy} onClick={() => void handleRevokeAdmin()}>
                {permBusy ? 'Revoking…' : 'Confirm Revoke'}
              </Button>
              <Button type="button" variant="outline" size="md" disabled={permBusy} onClick={() => setConfirmRevokePerm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
            <Button type="button" variant="secondary" size="md" className="flex-1" disabled={permBusy} onClick={() => void handleGrantAdmin()}>
              <ShieldCheck className="h-4 w-4" />
              {permBusy ? 'Working…' : 'Grant Admin'}
            </Button>
            <Button type="button" variant="outline" size="md" className="flex-1" disabled={permBusy} onClick={() => setConfirmRevokePerm(true)}>
              <Ban className="h-4 w-4" />
              Revoke Admin
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
