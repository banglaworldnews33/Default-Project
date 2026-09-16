import React, { useEffect, useRef, useState } from 'react'
import {
  sellerCustomersService,
  SELLER_CUSTOMERS_PAGE_SIZE,
  type SellerCustomer,
} from '@/services/sellerCustomers'
import { EmptyState, ErrorState, LoadingState } from '@/components/seller/SellerWidgets'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'

/**
 * Seller customer directory (migration 023 RPC contract).
 *
 * Rows flow exclusively through get_seller_customers: the seller
 * is derived server-side from auth.uid(), visibility is limited
 * to customers behind the seller's own order items, and only
 * the minimal summary (latest name/mobile snapshot plus
 * per-seller counts) is ever consumed. No address, email,
 * payment, or unrelated profile data exists on this page, and
 * page counts are never presented as totals.
 */
export const SellerCustomersPage: React.FC = () => {
  const [rows, setRows] = useState<SellerCustomer[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [moreError, setMoreError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [appliedSearch, setAppliedSearch] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const requestId = useRef(0)

  // First page for the current search. Runs on mount, on search
  // change, and on explicit retry — never on any state it writes
  // itself, so no effect loop is possible.
  useEffect(() => {
    let active = true
    const id = requestId.current + 1
    requestId.current = id
    void (async () => {
      setLoading(true)
      setError(null)
      setMoreError(null)
      const { data, error: err } = await sellerCustomersService.listCustomers(undefined, appliedSearch)
      if (!active || requestId.current !== id) return
      if (err || !data) {
        setError(err ? err.message : 'Something went wrong. Please try again.')
        setRows([])
        setHasMore(false)
      } else {
        setRows(data)
        setHasMore(data.length === SELLER_CUSTOMERS_PAGE_SIZE)
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [reloadKey, appliedSearch])

  function applySearch(): void {
    const term = searchInput.trim()
    setAppliedSearch(term === '' ? null : term)
  }

  function clearSearch(): void {
    setSearchInput('')
    setAppliedSearch(null)
  }

  async function loadMore(): Promise<void> {
    const last = rows[rows.length - 1]
    if (!last || loadingMore) return
    setLoadingMore(true)
    setMoreError(null)
    const { data, error: err } = await sellerCustomersService.listCustomers(
      { cursorAt: last.lastOrderAt, cursorId: last.customerId },
      appliedSearch,
    )
    setLoadingMore(false)
    if (err || !data) {
      setMoreError(err ? err.message : 'Something went wrong. Please try again.')
      return
    }
    setRows((prev) => {
      const seen = new Set(prev.map((r) => r.customerId))
      return [...prev, ...data.filter((r) => !seen.has(r.customerId))]
    })
    setHasMore(data.length === SELLER_CUSTOMERS_PAGE_SIZE)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Customers</h1>
        <p className="text-sm text-neutral-500 mt-1">People who bought from your shop.</p>
      </div>

      <div className="card-premium p-4 sm:p-5 space-y-3">
        <div>
          <label htmlFor="cust-search" className="block text-xs font-medium text-neutral-500 mb-1">
            Search by name or mobile number
          </label>
          <input
            id="cust-search"
            type="search"
            value={searchInput}
            maxLength={120}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applySearch() }}
            placeholder="e.g. Rahim or 01XXXXXXXXX"
            autoComplete="off"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white text-navy-900 placeholder:text-neutral-400"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="button" variant="secondary" size="md" onClick={applySearch}>
            <span>Search</span>
          </Button>
          {appliedSearch !== null && (
            <Button type="button" variant="outline" size="md" onClick={clearSearch}>
              <span>Clear</span>
            </Button>
          )}
        </div>
        <p className="text-xs text-neutral-500">Only buyers with orders containing your products appear here.</p>
      </div>

      {loading && <LoadingState message="Loading your customers…" />}
      {!loading && error && (
        <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />
      )}

      {!loading && !error && rows.length === 0 && appliedSearch === null && (
        <div className="card-premium p-5 sm:p-6">
          <EmptyState
            title="No customers yet"
            message="Buyer profiles linked to your completed sales will appear here. Contact details stay limited to what each order requires."
          />
        </div>
      )}

      {!loading && !error && rows.length === 0 && appliedSearch !== null && (
        <div className="card-premium p-5 sm:p-6">
          <EmptyState
            title="No matching customers"
            message="No buyer in your customer set matches the current search. Try a different name or mobile number."
          />
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((customer) => (
            <article key={customer.customerId} className="card-premium p-5 sm:p-6 space-y-2.5 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0">
                <h2 className="text-sm font-semibold text-navy-900 truncate flex-1 min-w-0">
                  {customer.customerName}
                </h2>
                <span className="text-xs text-neutral-400 shrink-0">
                  Last order {formatDate(customer.lastOrderAt)}
                </span>
              </div>
              <p className="text-sm text-neutral-600 break-words">{customer.customerMobile}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="muted">
                  {customer.totalOrders} order{customer.totalOrders === 1 ? '' : 's'} with you
                </Badge>
                <Badge variant="muted">
                  {customer.totalItems} item{customer.totalItems === 1 ? '' : 's'}
                </Badge>
              </div>
            </article>
          ))}
          {moreError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="flex-1">{moreError}</span>
              <Button type="button" variant="outline" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
                <span>Retry</span>
              </Button>
            </div>
          )}
          {hasMore && (
            <div className="text-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                <span>{loadingMore ? 'Loading…' : 'Load more'}</span>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
