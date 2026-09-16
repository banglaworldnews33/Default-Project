import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, ArrowRight } from 'lucide-react'
import { sellerOrdersService, type SellerOrderItemRow } from '@/services/sellerOrders'
import { formatBDT, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, LoadingState, ErrorState } from '@/components/seller/SellerWidgets'

const STATUSES = ['all', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] as const

function statusBadge(status: string): React.ReactNode {
  if (status === 'delivered') return <Badge variant="success">Delivered</Badge>
  if (status === 'cancelled') return <Badge variant="danger">Cancelled</Badge>
  if (status === 'shipped') return <Badge variant="accent">Shipped</Badge>
  if (status === 'pending') return <Badge variant="muted">Pending</Badge>
  return <Badge variant="accent">{status.replace('_', ' ')}</Badge>
}

interface OrderGroup {
  orderId: string
  orderNumber: string
  orderCreatedAt: string
  parentOrderStatus: string
  items: SellerOrderItemRow[]
}

/**
 * Seller fulfillment queue (migration 013 read RPC).
 *
 * Rows are exclusively the caller's own order items — scoping is
 * server-side. Search/status filters run client-side over those
 * authorized rows only. No customer PII exists on this page.
 */
export const SellerOrdersPage: React.FC = () => {
  const [rows, setRows] = useState<SellerOrderItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all')

  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      const { data, error: err } = await sellerOrdersService.listSellerOrders()
      if (!active) return
      if (err) {
        setError(err.message)
        setRows([])
      } else {
        setError(null)
        setRows(data ?? [])
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [reloadKey])

  const groups = useMemo<OrderGroup[]>(() => {
    const q = query.trim().toLowerCase()
    const byOrder = new Map<string, OrderGroup>()
    for (const row of rows) {
      if (status !== 'all' && row.fulfillmentStatus !== status) continue
      if (
        q &&
        !`${row.orderNumber} ${row.productName} ${row.sku ?? ''}`.toLowerCase().includes(q)
      ) {
        continue
      }
      const existing = byOrder.get(row.orderId)
      if (existing) {
        existing.items.push(row)
      } else {
        byOrder.set(row.orderId, {
          orderId: row.orderId,
          orderNumber: row.orderNumber,
          orderCreatedAt: row.orderCreatedAt,
          parentOrderStatus: row.parentOrderStatus,
          items: [row],
        })
      }
    }
    return [...byOrder.values()].sort((a, b) => (a.orderCreatedAt < b.orderCreatedAt ? 1 : -1))
  }, [rows, query, status])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Orders</h1>
        <p className="text-sm text-neutral-500 mt-1">Fulfill customer orders and track delivery.</p>
      </div>

      <div className="card-premium p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by order number or product…"
            aria-label="Search orders"
            className="w-full rounded-xl border border-neutral-300 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all placeholder:text-neutral-400"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          aria-label="Filter by fulfillment status"
          className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-medium text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 cursor-pointer"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {loading && <LoadingState message="Loading your orders…" />}
      {!loading && error && (
        <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />
      )}

      {!loading && !error && groups.length === 0 && (
        <div className="card-premium p-5 sm:p-6">
          <EmptyState
            title={rows.length === 0 ? 'No orders yet' : 'No matching orders'}
            message={
              rows.length === 0
                ? 'Only orders containing your products will ever appear here — never another seller\u2019s.'
                : 'Try a different search term or status filter.'
            }
          />
        </div>
      )}

      {!loading && !error && groups.length > 0 && (
        <div className="space-y-3">
          {groups.map((g) => {
            const totalQty = g.items.reduce((s, i) => s + i.quantity, 0)
            const totalAmount = g.items.reduce((s, i) => s + i.lineSubtotal, 0)
            return (
              <Link
                key={g.orderId}
                to={`/seller/orders/${g.orderId}`}
                className="block card-premium p-4 sm:p-5 hover:shadow-card-hover hover:border-navy-200 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-semibold text-navy-900 text-sm truncate">
                      {g.orderNumber}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {formatDate(g.orderCreatedAt)} · {g.items.length} item{g.items.length === 1 ? '' : 's'} · Qty {totalQty} · {formatBDT(totalAmount)}
                    </p>
                    <p className="text-xs text-neutral-500 mt-1 line-clamp-1">
                      {g.items.map((i) => i.productName).join(' · ')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {statusBadge(g.items[0].fulfillmentStatus)}
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700">
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
