import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Search, Check, X, Clock } from 'lucide-react'
import { sellerService } from '@/services/seller'
import { getProfile, type Profile } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { applicationStatusBadge, EmptyState, LoadingState, ErrorState } from '@/components/seller/SellerWidgets'
import type { SellerApplication, SellerApplicationStatus, SellerAuditEntry } from '@/types'

type Filter = 'pending' | 'approved' | 'rejected' | 'all'

export const AdminSellersPage: React.FC = () => {
  const [apps, setApps] = useState<SellerApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [filter, setFilter] = useState<Filter>('pending')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [applicant, setApplicant] = useState<Profile | null>(null)
  const [audit, setAudit] = useState<SellerAuditEntry[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [confirming, setConfirming] = useState<'approve' | 'reject' | null>(null)
  const [acting, setActing] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const { data, error: err } = await sellerService.listAll()
      if (!active) return
      if (err) {
        setError(err.message)
        setApps([])
      } else {
        setError(null)
        setApps(data ?? [])
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [reloadKey])

  async function reload(): Promise<void> {
    setLoading(true)
    setError(null)
    const { data, error: err } = await sellerService.listAll()
    if (err) {
      setError(err.message)
      setApps([])
    } else {
      setApps(data ?? [])
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return apps.filter((a) => {
      if (filter !== 'all' && a.status !== filter) return false
      if (q && !a.businessName.toLowerCase().includes(q)) return false
      return true
    })
  }, [apps, filter, query])

  const counts = useMemo(() => {
    const c: Record<SellerApplicationStatus, number> = { pending: 0, approved: 0, rejected: 0 }
    for (const a of apps) c[a.status] += 1
    return c
  }, [apps])

  const selected = apps.find((a) => a.id === selectedId) ?? null

  async function openDetail(id: string): Promise<void> {
    setSelectedId(id)
    setApplicant(null)
    setAudit([])
    setRejectReason('')
    setConfirming(null)
    setActionMsg(null)
    setDetailLoading(true)
    const app = apps.find((a) => a.id === id) ?? null
    const [profRes, auditRes] = await Promise.all([
      app ? getProfile(app.userId) : Promise.resolve({ profile: null, error: null as Error | null }),
      sellerService.listAudit(id),
    ])
    setApplicant(profRes.profile)
    setAudit(auditRes.data ?? [])
    setDetailLoading(false)
  }

  async function act(kind: 'approve' | 'reject'): Promise<void> {
    if (!selected) return
    if (kind === 'reject' && !rejectReason.trim()) {
      setActionMsg('Please enter a rejection reason first.')
      return
    }
    setActing(true)
    setActionMsg(null)
    const { error: err } =
      kind === 'approve'
        ? await sellerService.approve(selected.id)
        : await sellerService.reject(selected.id, rejectReason.trim())
    setActing(false)
    if (err) {
      setActionMsg(err.message)
      return
    }
    setConfirming(null)
    setRejectReason('')
    await reload()
    await openDetail(selected.id)
  }

  return (
    <div className="container-shop py-8 sm:py-10">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800 mb-5">
        <ArrowLeft className="h-4 w-4" />
        Back to Admin Dashboard
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Seller Management</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Review applications. Approvals and rejections run through secure database workflows — roles are never edited here.
          </p>
        </div>
      </div>

      {/* Stats + filters */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">
        {(['pending', 'approved', 'rejected'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`card-premium p-4 text-left transition-all cursor-pointer ${filter === s ? 'ring-2 ring-primary-500' : 'hover:shadow-card-hover'}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 capitalize">{s}</p>
            <p className="text-2xl font-display font-bold text-navy-900 mt-1 flex items-center gap-2">
              {s === 'pending' && <Clock className="h-5 w-5 text-amber-500" />}
              {counts[s]}
            </p>
          </button>
        ))}
      </div>

      <div className="card-premium p-4 mb-5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by business name…"
            aria-label="Search seller applications"
            className="w-full rounded-xl border border-neutral-300 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all placeholder:text-neutral-400"
          />
        </div>
        <div className="flex gap-2" role="group" aria-label="Filter applications">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold capitalize transition-colors cursor-pointer ${
                filter === f ? 'bg-navy-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading && <LoadingState message="Loading seller applications…" />}
      {!loading && error && <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
          {/* List */}
          <div className="lg:col-span-2 card-premium p-3 sm:p-4 space-y-2">
            {filtered.length === 0 && (
              <p className="text-sm text-neutral-500 text-center py-8">No applications match this filter.</p>
            )}
            {filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => void openDetail(a.id)}
                className={`w-full text-left rounded-xl border p-4 transition-all cursor-pointer ${
                  selectedId === a.id
                    ? 'border-primary-500 bg-primary-50/60 ring-1 ring-primary-500'
                    : 'border-neutral-200 hover:border-navy-200 hover:bg-neutral-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-navy-900 text-sm truncate">{a.businessName}</p>
                  {applicationStatusBadge(a.status)}
                </div>
                <p className="text-xs text-neutral-400 mt-1">Applied {formatDate(a.createdAt)}</p>
              </button>
            ))}
          </div>

          {/* Detail */}
          <div className="lg:col-span-3 card-premium p-5 sm:p-6">
            {!selected && (
              <EmptyState
                title="Select an application"
                message="Choose an application on the left to review details, applicant identity, and audit history."
              />
            )}
            {selected && detailLoading && <LoadingState message="Loading details…" />}
            {selected && !detailLoading && (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-display font-bold text-navy-900">{selected.businessName}</h2>
                    <p className="text-xs text-neutral-400 mt-0.5">Applied {formatDate(selected.createdAt)}</p>
                  </div>
                  {applicationStatusBadge(selected.status)}
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3.5">
                    <dt className="text-xs text-neutral-400 font-medium">Applicant</dt>
                    <dd className="font-semibold text-navy-900 mt-0.5">{applicant?.name ?? '—'}</dd>
                    <dd className="text-xs text-neutral-500 mt-0.5 break-all">{applicant?.email ?? selected.userId}</dd>
                  </div>
                  <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3.5">
                    <dt className="text-xs text-neutral-400 font-medium">Phone</dt>
                    <dd className="font-semibold text-navy-900 mt-0.5">{selected.phone ?? applicant?.phone ?? '—'}</dd>
                  </div>
                  <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3.5 sm:col-span-2">
                    <dt className="text-xs text-neutral-400 font-medium">Business description</dt>
                    <dd className="text-navy-900 mt-0.5 text-sm leading-relaxed">{selected.description?.trim() ? selected.description : '—'}</dd>
                  </div>
                  <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3.5">
                    <dt className="text-xs text-neutral-400 font-medium">Shop category</dt>
                    <dd className="font-semibold text-navy-900 mt-0.5 capitalize">{selected.shopCategory?.replace('-', ' & ') ?? '—'}</dd>
                  </div>
                  <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3.5">
                    <dt className="text-xs text-neutral-400 font-medium">Reviewed</dt>
                    <dd className="font-semibold text-navy-900 mt-0.5">
                      {selected.reviewedAt ? formatDate(selected.reviewedAt) : 'Not yet reviewed'}
                    </dd>
                  </div>
                </dl>

                {selected.rejectionReason && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-4">
                    <p className="text-xs font-semibold text-rose-700 mb-1">Rejection reason</p>
                    <p className="text-sm text-rose-800">{selected.rejectionReason}</p>
                  </div>
                )}

                {audit.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-navy-900 mb-2">Audit trail</h3>
                    <ul className="space-y-2">
                      {audit.map((e) => (
                        <li key={e.id} className="text-xs rounded-xl bg-neutral-50 border border-neutral-200/70 px-3.5 py-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-mono font-semibold text-navy-900">{e.action}</span>
                          <span className="text-neutral-400">{formatDate(e.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selected.status === 'pending' && (
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4 space-y-3">
                    {confirming === null && (
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <Button
                          type="button"
                          variant="primary"
                          size="md"
                          className="flex-1"
                          disabled={acting}
                          onClick={() => setConfirming('approve')}
                        >
                          <Check className="h-4 w-4" />
                          Approve Seller
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="md"
                          className="flex-1"
                          disabled={acting}
                          onClick={() => setConfirming('reject')}
                        >
                          <X className="h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    )}
                    {confirming === 'approve' && (
                      <div className="space-y-3">
                        <p className="text-sm text-navy-900">
                          Approve <strong>{selected.businessName}</strong>? Their profile becomes
                          seller + verified through the secure workflow.
                        </p>
                        <div className="flex gap-2.5">
                          <Button type="button" variant="primary" size="md" className="flex-1" disabled={acting} onClick={() => void act('approve')}>
                            {acting ? 'Approving…' : 'Confirm Approval'}
                          </Button>
                          <Button type="button" variant="outline" size="md" disabled={acting} onClick={() => setConfirming(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                    {confirming === 'reject' && (
                      <div className="space-y-3">
                        <label htmlFor="reject-reason" className="block text-sm font-semibold text-navy-900">
                          Rejection reason <span className="text-rose-600">*</span>
                        </label>
                        <textarea
                          id="reject-reason"
                          rows={3}
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Explain what the applicant should fix…"
                          maxLength={2000}
                          className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 bg-white resize-y"
                        />
                        <div className="flex gap-2.5">
                          <Button type="button" variant="danger" size="md" className="flex-1" disabled={acting} onClick={() => void act('reject')}>
                            {acting ? 'Rejecting…' : 'Confirm Rejection'}
                          </Button>
                          <Button type="button" variant="outline" size="md" disabled={acting} onClick={() => setConfirming(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                    {actionMsg && (
                      <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">
                        {actionMsg}
                      </p>
                    )}
                    <p className="text-[11px] text-neutral-400">
                      Both actions run as audited database workflows. Profile roles are never edited from this page.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
