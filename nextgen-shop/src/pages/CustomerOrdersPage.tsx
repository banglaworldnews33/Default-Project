import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Package } from 'lucide-react'
import { customerOrdersService, type CustomerOrderRow } from '@/services/customerOrders'
import { formatBDT, formatDate } from '@/lib/utils'
import { deliveryZoneLabel } from '@/data/storeConfig'
import type { DeliveryZone } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, LoadingState, ErrorState } from '@/components/seller/SellerWidgets'

function isDeliveryZone(value: string): value is DeliveryZone {
  return value === 'inside-dhaka' || value === 'outside-dhaka'
}

function deliveryZoneDisplay(zone: string): string {
  return isDeliveryZone(zone) ? deliveryZoneLabel(zone) : zone
}

function orderStatusBadge(status: string): React.ReactNode {
  if (status === 'delivered') return <Badge variant="success">Delivered</Badge>
  if (status === 'cancelled') return <Badge variant="danger">Cancelled</Badge>
  if (status === 'shipped') return <Badge variant="accent">Shipped</Badge>
  if (status === 'pending') return <Badge variant="muted">Pending</Badge>
  return <Badge variant="accent">{status.replace('_', ' ')}</Badge>
}

function paymentStatusBadge(status: string): React.ReactNode {
  if (status === 'paid') return <Badge variant="success">Paid</Badge>
  if (status === 'failed' || status === 'refunded') return <Badge variant="danger">{status}</Badge>
  return <Badge variant="muted">Pending</Badge>
}

/**
 * Customer order history (migration 014 read RPC).
 *
 * Rows are exclusively the caller's own orders — scoping is
 * server-side via orders.customer_id = auth.uid(). No identity
 * is sent from the client and no ownership is decided here.
 */
export const CustomerOrdersPage: React.FC = () => {
  const [rows, setRows] = useState<CustomerOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      const { data, error: err } = await customerOrdersService.listCustomerOrders()
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

  return (
    <div className="container-shop py-8 sm:py-12">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-neutral-900">My Orders</h1>
        <p className="text-sm text-neutral-500 mt-2">
          Real orders you placed through secure checkout. Demo guest orders are tracked separately.
        </p>
      </div>

      {loading && <LoadingState message="Loading your orders…" />}

      {!loading && error && (
        <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />
      )}

      {!loading && !error && rows.length === 0 && (
        <EmptyState
          title="No orders yet"
          message="Your real Supabase orders will appear here after you check out from the live market."
          actionLabel="Continue shopping"
          actionTo="/market"
        />
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          {rows.map((order) => (
            <article
              key={order.orderId}
              className="bg-white rounded-xl border border-neutral-200/80 p-4 sm:p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Package className="h-4 w-4 text-neutral-400 shrink-0" />
                    <p className="font-mono font-semibold text-navy-900 text-sm truncate">
                      {order.orderNumber}
                    </p>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">
                    {formatDate(order.createdAt)} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'} · Qty {order.totalQuantity} · {deliveryZoneDisplay(order.deliveryZone)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2.5">
                    {orderStatusBadge(order.orderStatus)}
                    {paymentStatusBadge(order.paymentStatus)}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start shrink-0">
                  <p className="text-base sm:text-lg font-bold text-neutral-900">
                    {formatBDT(order.total)}
                  </p>
                  <Link
                    to={`/orders/${order.orderId}`}
                    aria-label={`View details for order ${order.orderNumber}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-accent-700 hover:text-accent-800"
                  >
                    <span>View Details</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
