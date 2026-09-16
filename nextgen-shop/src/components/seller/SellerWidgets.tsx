import React from 'react'
import { Link } from 'react-router-dom'
import { Inbox, ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { SellerApplicationStatus } from '@/types'

export const EmptyState: React.FC<{
  title: string
  message: string
  actionLabel?: string
  actionTo?: string
}> = ({ title, message, actionLabel, actionTo }) => (
  <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50/70 px-6 py-12 text-center">
    <div className="h-12 w-12 rounded-2xl bg-white border border-neutral-200 text-neutral-400 flex items-center justify-center mx-auto mb-4 shadow-sm">
      <Inbox className="h-6 w-6" />
    </div>
    <h3 className="font-semibold text-navy-900">{title}</h3>
    <p className="text-sm text-neutral-500 mt-1.5 max-w-sm mx-auto leading-relaxed">{message}</p>
    {actionLabel && actionTo && (
      <Link
        to={actionTo}
        className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-primary-700 hover:text-primary-800"
      >
        {actionLabel}
        <ArrowRight className="h-4 w-4" />
      </Link>
    )}
  </div>
)

export const KpiCard: React.FC<{
  label: string
  value: string
  hint: string
}> = ({ label, value, hint }) => (
  <div className="card-premium p-5">
    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
    <p className="text-2xl sm:text-3xl font-display font-bold text-navy-900 mt-1.5">{value}</p>
    <p className="text-xs text-neutral-400 mt-1">{hint}</p>
  </div>
)

export function applicationStatusBadge(status: SellerApplicationStatus): React.ReactNode {
  if (status === 'approved') return <Badge variant="success">Approved</Badge>
  if (status === 'rejected') return <Badge variant="danger">Rejected</Badge>
  return <Badge variant="accent">Pending Review</Badge>
}

export const LoadingState: React.FC<{ message?: string }> = ({ message = 'Loading…' }) => (
  <div className="rounded-2xl border border-neutral-200/80 bg-white p-8 text-center text-sm text-neutral-500 shadow-card">
    {message}
  </div>
)

export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
    <p className="text-sm text-rose-700">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 text-sm font-semibold text-rose-700 hover:underline cursor-pointer"
      >
        Try again
      </button>
    )}
  </div>
)
