import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Percent } from 'lucide-react'
import { sellerFinanceService, type SellerFinancialSummary, type SellerFinanceReport, type SellerLedgerRow } from '@/services/sellerFinance'
import { KpiCard, LoadingState, ErrorState, EmptyState } from '@/components/seller/SellerWidgets'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatBDT, formatDate } from '@/lib/utils'

const LEDGER_PAGE_SIZE = 25

function clearingBadge(status: string): React.ReactNode {
  if (status === 'available') return <Badge variant="success">Available</Badge>
  return <Badge variant="muted">Pending</Badge>
}

function entryTypeBadge(entryType: string): React.ReactNode | null {
  if (entryType === 'refund') return <Badge variant="danger">Refund</Badge>
  if (entryType === 'adjustment') return <Badge variant="accent">Adjustment</Badge>
  return null
}

/**
 * Seller earnings console (migration 018 read layer).
 *
 * Every figure is aggregated server-side from the seller's own
 * immutable ledger rows: balances derive from created_at
 * against the 7-day clearing rule, and per-row status arrives
 * computed — the frontend never calculates money or status.
 * Failures surface as error states, never as zero balances.
 */
export const SellerEarningsPage: React.FC = () => {
  const [summary, setSummary] = useState<SellerFinancialSummary | null>(null)
  const [report, setReport] = useState<SellerFinanceReport | null>(null)
  const [rows, setRows] = useState<SellerLedgerRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null })

  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      setError(null)
      const [sumRes, repRes, ledRes] = await Promise.all([
        sellerFinanceService.getSummary(),
        sellerFinanceService.getReport(range.from !== null || range.to !== null ? range : undefined),
        sellerFinanceService.listLedger(undefined, range.from !== null || range.to !== null ? range : undefined),
      ])
      if (!active) return
      const err = sumRes.error ?? repRes.error ?? ledRes.error
      if (err) {
        setError(err.message)
        setSummary(null)
        setReport(null)
        setRows([])
        setHasMore(false)
      } else {
        setSummary(sumRes.data)
        setReport(repRes.data)
        const batch = ledRes.data ?? []
        setRows(batch)
        setHasMore(batch.length === LEDGER_PAGE_SIZE)
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [reloadKey, range])

  function toIsoStart(dateStr: string): string {
    return new Date(`${dateStr}T00:00:00`).toISOString()
  }

  function toIsoEnd(dateStr: string): string {
    return new Date(`${dateStr}T23:59:59.999`).toISOString()
  }

  function applyRange(): void {
    if (fromInput !== '' && toInput !== '' && fromInput > toInput) {
      setError('The start date must not be after the end date.')
      return
    }
    setRange({
      from: fromInput === '' ? null : toIsoStart(fromInput),
      to: toInput === '' ? null : toIsoEnd(toInput),
    })
  }

  function clearRange(): void {
    setFromInput('')
    setToInput('')
    setRange({ from: null, to: null })
  }

  const rangeActive = range.from !== null || range.to !== null

  async function loadMore(): Promise<void> {
    const last = rows[rows.length - 1]
    if (!last || loadingMore) return
    setLoadingMore(true)
    const { data, error: err } = await sellerFinanceService.listLedger({
      createdBefore: last.createdAt,
      idBefore: last.entryId,
    }, rangeActive ? range : undefined)
    setLoadingMore(false)
    if (err || !data) {
      setError(err ? err.message : 'Something went wrong. Please try again.')
      return
    }
    setRows((prev) => [...prev, ...data])
    setHasMore(data.length === LEDGER_PAGE_SIZE)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Earnings</h1>
        <p className="text-sm text-neutral-500 mt-1">How your sales turn into payouts.</p>
      </div>

      {loading && <LoadingState message="Loading your earnings…" />}
      {!loading && error && (
        <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            <KpiCard
              label="Total Earnings"
              value={summary === null ? '—' : formatBDT(summary.totalEarnings)}
              hint={summary === null ? 'No earnings yet' : `${summary.earningCount} earning${summary.earningCount === 1 ? '' : 's'} recognized`}
            />
            <KpiCard
              label="Available Balance"
              value={summary === null ? '—' : formatBDT(summary.availableBalance)}
              hint="Cleared for 7+ days · withdrawable amount"
            />
            <KpiCard
              label="Pending Earnings"
              value={summary === null ? '—' : formatBDT(summary.pendingEarnings)}
              hint="Clearing within 7 days"
            />
            <KpiCard
              label="Total Commission"
              value={summary === null ? '—' : formatBDT(summary.totalCommission)}
              hint="Platform share to date"
            />
            <KpiCard
              label="Refunded"
              value={summary === null ? '—' : formatBDT(summary.refundedAmount)}
              hint="Returned to customers"
            />
            <KpiCard
              label="Net Earnings"
              value={summary === null ? '—' : formatBDT(summary.netEarnings)}
              hint="Net earnings after refunds and adjustments. Payouts are excluded."
            />
            <KpiCard
              label="Paid Out"
              value={report === null ? '—' : formatBDT(report.paidOutAmount)}
              hint={rangeActive ? 'Completed payouts in period' : 'Completed payouts to date'}
            />
            <KpiCard
              label="Reserved"
              value={report === null ? '—' : formatBDT(report.reservedAmount)}
              hint="Locked in active requests"
            />
            <KpiCard
              label="Adjustments"
              value={report === null ? '—' : formatBDT(report.adjustmentAmount)}
              hint={rangeActive ? 'Corrections in period (signed)' : 'Corrections to date (signed)'}
            />
          </div>

          {report !== null && report.debtAmount > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              This account carries a balance owed of {formatBDT(report.debtAmount)}. New cleared earnings will offset it first.
            </div>
          )}

          <div className="card-premium p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <label htmlFor="earn-from" className="block text-xs font-medium text-neutral-500 mb-1">From</label>
                <input
                  id="earn-from"
                  type="date"
                  value={fromInput}
                  max={toInput !== '' ? toInput : undefined}
                  onChange={(e) => setFromInput(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="earn-to" className="block text-xs font-medium text-neutral-500 mb-1">To</label>
                <input
                  id="earn-to"
                  type="date"
                  value={toInput}
                  min={fromInput !== '' ? fromInput : undefined}
                  onChange={(e) => setToInput(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="md" onClick={applyRange}>
                  <span>Apply period</span>
                </Button>
                {rangeActive && (
                  <Button type="button" variant="outline" size="md" onClick={clearRange}>
                    <span>Clear</span>
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {rangeActive
                ? 'Showing period flows; Reserved, Available, and debt stay current.'
                : 'Showing lifetime flows. Pick dates to report a period.'}
            </p>
          </div>

          <div className="card-premium p-5 sm:p-6 flex items-start gap-4">
            <div className="h-11 w-11 rounded-xl bg-primary-50 border border-primary-100 text-primary-700 flex items-center justify-center shrink-0">
              <Percent className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-navy-900">How commission works</h2>
              <p className="text-sm text-neutral-500 mt-1 leading-relaxed">
                Each delivered sale splits into platform commission and your net earning
                automatically, using the rate in effect when the sale was recognized.
                Earnings clear 7 days after recognition; only cleared earnings become
                available. Figures above come from your immutable ledger — never estimated.
              </p>
            </div>
          </div>

          <div className="card-premium p-5 sm:p-6">
            <h2 className="font-display font-bold text-lg text-navy-900 mb-4">Earning history</h2>
            {rows.length === 0 ? (
              <EmptyState
                title="No earnings yet"
                message="Recognized earnings from your delivered, paid orders will appear here with their commission breakdown."
              />
            ) : (
              <div className="space-y-3">
                {rows.map((row) => {
                  const isReversal = row.entryType === 'refund' || row.entryType === 'adjustment'
                  return (
                  <div key={row.entryId} className="flex items-center justify-between gap-3 py-2 border-b border-neutral-100 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy-900">
                        {entryTypeBadge(row.entryType) ?? 'Earning'}
                        {row.orderNumber ? (
                          <>
                            {' · '}
                            {row.orderId ? (
                              <Link to={`/seller/orders/${row.orderId}`} className="font-mono hover:underline">
                                {row.orderNumber}
                              </Link>
                            ) : (
                              <span className="font-mono">{row.orderNumber}</span>
                            )}
                          </>
                        ) : null}
                        <span className="ml-2 text-xs font-normal text-neutral-500">
                          {formatDate(row.createdAt)}
                        </span>
                      </p>
                      <p className="text-xs text-neutral-500">
                        {isReversal ? (
                          <>Reversed {row.grossAmount === null ? '—' : formatBDT(row.grossAmount)} gross
                          {row.commissionAmount !== null && ` · ${formatBDT(row.commissionAmount)} commission returned`}</>
                        ) : (
                          <>Gross {row.grossAmount === null ? '—' : formatBDT(row.grossAmount)}
                          {row.commissionRate !== null && ` · ${row.commissionRate}% commission`}
                          {row.commissionAmount !== null && ` · ${formatBDT(row.commissionAmount)}`}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {clearingBadge(row.clearingStatus)}
                      <span className="text-sm font-bold text-neutral-900">
                        {isReversal
                          ? (row.amount === null ? '—' : `−${formatBDT(Math.abs(row.amount))}`)
                          : (row.netAmount === null ? '—' : formatBDT(row.netAmount))}
                      </span>
                    </div>
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
