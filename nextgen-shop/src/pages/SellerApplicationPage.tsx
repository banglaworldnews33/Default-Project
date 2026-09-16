import React, { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Store, Clock, CircleCheck, CircleX, RefreshCw } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { sellerService } from '@/services/seller'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { applicationStatusBadge, ErrorState, LoadingState } from '@/components/seller/SellerWidgets'
import type { SellerApplication } from '@/types'

export const SellerApplicationPage: React.FC = () => {
  const { user, profile, isLoading, isConfigured, refreshProfile } = useAuth()
  const [apps, setApps] = useState<SellerApplication[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!isConfigured || isLoading || !user) return
    let active = true
    void (async () => {
      await refreshProfile()
      const { data, error: err } = await sellerService.listMine()
      if (!active) return
      if (err) {
        setError(err.message)
        setApps(null)
      } else {
        setError(null)
        setApps(data ?? [])
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [isConfigured, isLoading, user, refreshProfile, reloadKey])

  if (!isConfigured) {
    return (
      <div className="container-shop py-12">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-neutral-200/80 p-8 text-center text-sm text-neutral-500 shadow-card">
          Application status needs the online backend. Please configure Supabase first.
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="container-shop py-12 max-w-2xl">
        <LoadingState message="Checking your account…" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login?return=/seller/application" replace />

  const latest = apps?.[0] ?? null
  const history = apps ?? []
  const isSeller = profile?.role === 'seller' && profile?.verification_status === 'verified'

  return (
    <div className="bg-neutral-50/70 border-y border-neutral-200/70">
      <div className="container-shop py-10 sm:py-14 max-w-2xl">
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary-50 border border-primary-100 text-primary-700 text-xs font-semibold tracking-wider uppercase">
            <Store className="h-3.5 w-3.5" />
            Seller Application
          </span>
          <h1 className="text-3xl font-display font-bold text-navy-900 mt-3">Application Status</h1>
        </div>

        {loading && <LoadingState message="Loading your applications…" />}
        {!loading && error && <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />}

        {!loading && !error && apps && apps.length === 0 && (
          <div className="card-premium p-8 text-center space-y-4">
            <p className="text-sm text-neutral-500">You haven&apos;t applied to sell yet.</p>
            <Button to="/seller/register" variant="secondary" size="lg" className="w-full sm:w-auto">
              Start Seller Application
            </Button>
          </div>
        )}

        {!loading && !error && latest && (
          <div className="space-y-4">
            <div className="card-premium p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Business</p>
                  <h2 className="text-xl font-display font-bold text-navy-900 mt-1">{latest.businessName}</h2>
                </div>
                {applicationStatusBadge(latest.status)}
              </div>

              <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3.5">
                  <dt className="text-xs text-neutral-400 font-medium">Phone</dt>
                  <dd className="font-semibold text-navy-900 mt-0.5">{latest.phone ?? '—'}</dd>
                </div>
                <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3.5">
                  <dt className="text-xs text-neutral-400 font-medium">Submitted</dt>
                  <dd className="font-semibold text-navy-900 mt-0.5">{formatDate(latest.createdAt)}</dd>
                </div>
                <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3.5">
                  <dt className="text-xs text-neutral-400 font-medium">Review status</dt>
                  <dd className="font-semibold text-navy-900 mt-0.5 capitalize">{latest.status}</dd>
                </div>
                <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3.5">
                  <dt className="text-xs text-neutral-400 font-medium">Reviewed on</dt>
                  <dd className="font-semibold text-navy-900 mt-0.5">
                    {latest.reviewedAt ? formatDate(latest.reviewedAt) : '—'}
                  </dd>
                </div>
              </dl>

              {latest.status === 'pending' && (
                <div className="mt-5 flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4">
                  <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Under review by our team. Seller dashboard access unlocks automatically once approved —
                    no further action needed from you.
                  </p>
                </div>
              )}
              {latest.status === 'approved' && (
                <div className="mt-5 flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                  <CircleCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    Approved! Your seller account is active.
                  </p>
                </div>
              )}
              {latest.status === 'rejected' && (
                <div className="mt-5 rounded-xl bg-rose-50 border border-rose-200 p-4 space-y-2">
                  <p className="flex items-start gap-2 text-xs text-rose-800 leading-relaxed">
                    <CircleX className="h-5 w-5 shrink-0 mt-0.5" />
                    <span>This application was not approved.</span>
                  </p>
                  {latest.rejectionReason && (
                    <p className="text-xs text-rose-700 bg-white/70 rounded-lg p-3 border border-rose-100">
                      <span className="font-semibold">Reason from reviewer: </span>
                      {latest.rejectionReason}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
                {isSeller || latest.status === 'approved' ? (
                  <Button to="/seller" variant="primary" size="md" className="flex-1">
                    Open Seller Dashboard
                  </Button>
                ) : latest.status === 'rejected' ? (
                  <Button to="/seller/register" variant="secondary" size="md" className="flex-1">
                    <RefreshCw className="h-4 w-4" />
                    Submit a New Application
                  </Button>
                ) : null}
                <Button to="/" variant="outline" size="md" className="flex-1">
                  Continue Shopping
                </Button>
              </div>
            </div>

            {history.length > 1 && (
              <div className="card-premium p-6">
                <h3 className="font-semibold text-navy-900 text-sm mb-3">Application history</h3>
                <ul className="space-y-2.5">
                  {history.slice(1).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 text-sm rounded-xl bg-neutral-50 border border-neutral-200/70 px-4 py-2.5">
                      <span className="font-medium text-navy-900 truncate">{a.businessName}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-neutral-400">{formatDate(a.createdAt)}</span>
                        {applicationStatusBadge(a.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-center text-xs text-neutral-400">
              Status is controlled by our review team in the database and cannot be changed from this page.{' '}
              <Link to="/contact" className="font-semibold text-primary-700 hover:underline">
                Contact support
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
