import React, { useEffect, useState } from 'react'
import { Landmark } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  sellerFinanceService,
  WITHDRAWAL_MIN_AMOUNT,
  type SellerFinancialSummary,
  type SellerWithdrawalRow,
} from '@/services/sellerFinance'
import { EmptyState, KpiCard, LoadingState, ErrorState } from '@/components/seller/SellerWidgets'
import { formatBDT, formatDate } from '@/lib/utils'

const HISTORY_PAGE_SIZE = 25

function withdrawalStatusBadge(status: string): React.ReactNode {
  if (status === 'completed') return <Badge variant="success">Completed</Badge>
  if (status === 'rejected' || status === 'failed') return <Badge variant="danger">{status === 'rejected' ? 'Rejected' : 'Failed'}</Badge>
  if (status === 'pending') return <Badge variant="muted">Pending</Badge>
  return <Badge variant="accent">{status.replace('_', ' ')}</Badge>
}

function statusDetail(row: SellerWithdrawalRow): string | null {
  if (row.status === 'rejected' && row.rejectionReason) return `Reason: ${row.rejectionReason}`
  if (row.status === 'failed' && row.failureReason) return `Reason: ${row.failureReason}`
  if (row.status === 'completed' && row.externalReference) return `Ref: ${row.externalReference}`
  return null
}

/**
 * Seller withdrawal console (migration 019).
 *
 * Balances and history derive server-side; the request form
 * sends only an amount plus an idempotency key, and the RPC
 * re-validates the BDT 500 minimum, capacity, one-active
 * rule, and idempotency. Failures surface as error states,
 * never as fabricated balances. No payout gateway exists:
 * completion happens on the admin side with a manual
 * reference.
 */
export const SellerWithdrawalsPage: React.FC = () => {
  const [amount, setAmount] = useState('')
  const [finance, setFinance] = useState<SellerFinancialSummary | null>(null)
  const [rows, setRows] = useState<SellerWithdrawalRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      setError(null)
      const [finRes, histRes] = await Promise.all([
        sellerFinanceService.getSummary(),
        sellerFinanceService.listWithdrawals(),
      ])
      if (!active) return
      const err = finRes.error ?? histRes.error
      if (err) {
        setError(err.message)
        setFinance(null)
        setRows([])
        setHasMore(false)
      } else {
        setFinance(finRes.data)
        const batch = histRes.data ?? []
        setRows(batch)
        setHasMore(batch.length === HISTORY_PAGE_SIZE)
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [reloadKey])

  async function loadMore(): Promise<void> {
    const last = rows[rows.length - 1]
    if (!last || loadingMore) return
    setLoadingMore(true)
    const { data, error: err } = await sellerFinanceService.listWithdrawals({
      createdBefore: last.createdAt,
      idBefore: last.withdrawalId,
    })
    setLoadingMore(false)
    if (err || !data) {
      setError(err ? err.message : 'Something went wrong. Please try again.')
      return
    }
    setRows((prev) => [...prev, ...data])
    setHasMore(data.length === HISTORY_PAGE_SIZE)
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (submitting) return
    setSubmitError(null)
    setNotice(null)
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed < WITHDRAWAL_MIN_AMOUNT) {
      setSubmitError(`Minimum withdrawal is BDT ${WITHDRAWAL_MIN_AMOUNT}.`)
      return
    }
    // One idempotency key per form attempt: retries of the same
    // submit reuse it, so a retried request can never double-spend.
    const key = idempotencyKey ?? (() => {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    })()
    setIdempotencyKey(key)
    setSubmitting(true)
    const { data, error: err } = await sellerFinanceService.requestWithdrawal(parsed, key)
    setSubmitting(false)
    if (err || !data) {
      setSubmitError(err ? err.message : 'Something went wrong. Please try again.')
      return
    }
    setAmount('')
    setIdempotencyKey(null)
    setNotice('Withdrawal requested. Funds are reserved while an admin reviews it.')
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  const hasActiveRequest = rows.some((r) => r.status === 'pending' || r.status === 'approved' || r.status === 'processing')
  const available = finance?.availableBalance ?? null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Withdrawals</h1>
        <p className="text-sm text-neutral-500 mt-1">Move available earnings to your account.</p>
      </div>

      {loading && <LoadingState message="Loading withdrawal data…" />}
      {!loading && error && (
        <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <KpiCard
              label="Available Balance"
              value={available === null ? '—' : formatBDT(available)}
              hint={finance === null ? 'Balance unavailable' : 'Cleared earnings minus reservations'}
            />
            <KpiCard
              label="Reserved"
              value={finance === null ? '—' : formatBDT(finance.reservedAmount)}
              hint="Locked in active requests"
            />
          </div>

          <div className="card-premium p-5 sm:p-6">
            <h2 className="font-display font-bold text-lg text-navy-900 mb-1">Request Withdrawal</h2>
            <p className="text-xs text-neutral-500 mb-4">
              Minimum BDT {WITHDRAWAL_MIN_AMOUNT}. One active request at a time — funds lock
              immediately and unlock automatically if rejected or if the payout fails.
            </p>
            {hasActiveRequest ? (
              <p className="text-sm text-neutral-600 bg-neutral-50 border border-neutral-200/70 rounded-xl px-4 py-3">
                You already have a withdrawal in progress. New requests unlock once it completes, fails, or is rejected.
              </p>
            ) : (
              <form onSubmit={(e) => void handleSubmit(e)}>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Landmark className="h-4 w-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="number"
                      min={WITHDRAWAL_MIN_AMOUNT}
                      step="0.01"
                      value={amount}
                      onChange={(e) => { setAmount(e.target.value); setIdempotencyKey(null) }}
                      placeholder={`Amount in BDT (min ${WITHDRAWAL_MIN_AMOUNT})`}
                      aria-label="Withdrawal amount in BDT"
                      disabled={submitting || available === null}
                      className="w-full rounded-xl border border-neutral-300 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 disabled:bg-neutral-100 disabled:text-neutral-400"
                    />
                  </div>
                  <Button type="submit" variant="primary" size="md" disabled={submitting || available === null}>
                    {submitting ? 'Requesting…' : 'Request Payout'}
                  </Button>
                </div>
                {submitError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mt-4">
                    {submitError}
                  </p>
                )}
              </form>
            )}
            {notice && (
              <p className="text-xs text-primary-700 bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 mt-4">
                {notice}
              </p>
            )}
          </div>

          <div className="card-premium p-5 sm:p-6">
            <h2 className="font-display font-bold text-lg text-navy-900 mb-4">Withdrawal History</h2>
            {rows.length === 0 ? (
              <EmptyState
                title="No withdrawals yet"
                message="Every payout request and its status (pending, processing, completed) will be listed here."
              />
            ) : (
              <div className="space-y-3">
                {rows.map((row) => {
                  const detail = statusDetail(row)
                  return (
                    <div key={row.withdrawalId} className="py-2 border-b border-neutral-100 last:border-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-neutral-900">{formatBDT(row.amount)}</p>
                          <p className="text-xs text-neutral-500">{formatDate(row.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {withdrawalStatusBadge(row.status)}
                        </div>
                      </div>
                      {detail && (
                        <p className="text-xs text-neutral-500 mt-1 break-words">{detail}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {hasMore && (
              <div className="mt-4 text-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
