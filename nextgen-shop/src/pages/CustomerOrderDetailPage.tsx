import React, { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { customerOrdersService, type CustomerOrderDetailRow } from '@/services/customerOrders'
import { formatBDT, formatDate } from '@/lib/utils'
import { deliveryZoneLabel } from '@/data/storeConfig'
import type { DeliveryZone } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { LoadingState, ErrorState, EmptyState } from '@/components/seller/SellerWidgets'

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

function fulfillmentBadge(status: string): React.ReactNode {
  if (status === 'delivered') return <Badge variant="success">Delivered</Badge>
  if (status === 'cancelled') return <Badge variant="danger">Cancelled</Badge>
  if (status === 'pending') return <Badge variant="muted">Pending</Badge>
  return <Badge variant="accent">{status.replace('_', ' ')}</Badge>
}

function variantLabel(row: CustomerOrderDetailRow): string {
  const parts = [row.variantName, row.variantAttributes.size, row.variantAttributes.color].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  )
  return parts.length > 0 ? parts.join(' · ') : 'Standard'
}

/**
 * Customer order detail (migration 014 detail RPC).
 *
 * The URL order id only selects which RPC call to make; empty
 * results render a generic unavailable state with no distinction
 * between missing, foreign, or unauthorized orders. No identity
 * or ownership value is ever sent from the client.
 */
export const CustomerOrderDetailPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>()
  const [rows, setRows] = useState<CustomerOrderDetailRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async (): Promise<{ rows: CustomerOrderDetailRow[]; error: string | null }> => {
    if (!orderId) return { rows: [], error: null }
    const { data, error: err } = await customerOrdersService.getCustomerOrderDetail(orderId)
    if (err) return { rows: [], error: err.message }
    return { rows: data ?? [], error: null }
  }, [orderId])

  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      setError(null)
      const res = await load()
      if (!active) return
      if (res.error) {
        setError(res.error)
        setRows([])
      } else {
        setRows(res.rows)
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [load, reloadKey])

  if (loading) {
    return (
      <div className="container-shop py-8 sm:py-12 space-y-5">
        <Link to="/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-700 hover:text-accent-800">
          <ArrowLeft className="h-4 w-4" />
          Back to My Orders
        </Link>
        <LoadingState message="Loading order…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="container-shop py-8 sm:py-12 space-y-5">
        <Link to="/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-700 hover:text-accent-800">
          <ArrowLeft className="h-4 w-4" />
          Back to My Orders
        </Link>
        <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="container-shop py-8 sm:py-12 space-y-5">
        <Link to="/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-700 hover:text-accent-800">
          <ArrowLeft className="h-4 w-4" />
          Back to My Orders
        </Link>
        <EmptyState
          title="Order not found or unavailable"
          message="This order doesn't exist or isn't available in your order history."
          actionLabel="Back to My Orders"
          actionTo="/orders"
        />
      </div>
    )
  }

  const head = rows[0]
  const area = [head.upazila, head.district, head.division].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  ).join(', ')

  return (
    <div className="container-shop py-8 sm:py-12 space-y-5 sm:space-y-6">
      <Link to="/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-700 hover:text-accent-800">
        <ArrowLeft className="h-4 w-4" />
        Back to My Orders
      </Link>

      {/* Order summary */}
      <section className="bg-white rounded-xl border border-neutral-200/80 p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-mono text-xl sm:text-2xl font-bold text-navy-900 break-all">
              {head.orderNumber}
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Placed on {formatDate(head.createdAt)} · {deliveryZoneDisplay(head.deliveryZone)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {orderStatusBadge(head.orderStatus)}
            {paymentStatusBadge(head.paymentStatus)}
          </div>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-sm">
          <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3">
            <dt className="text-xs text-neutral-400">Payment Method</dt>
            <dd className="font-semibold text-navy-900 mt-0.5">{head.paymentMethod}</dd>
          </div>
          <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3">
            <dt className="text-xs text-neutral-400">Delivery Zone</dt>
            <dd className="font-semibold text-navy-900 mt-0.5">{deliveryZoneDisplay(head.deliveryZone)}</dd>
          </div>
          <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3">
            <dt className="text-xs text-neutral-400">Items</dt>
            <dd className="font-semibold text-navy-900 mt-0.5">
              {rows.length} item{rows.length === 1 ? '' : 's'} · Qty {rows.reduce((s, r) => s + r.quantity, 0)}
            </dd>
          </div>
        </dl>
      </section>

      {/* Delivery information */}
      <section className="bg-white rounded-xl border border-neutral-200/80 p-5 sm:p-6">
        <h2 className="font-display font-bold text-lg text-neutral-900 mb-4">Delivery Information</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3">
            <dt className="text-xs text-neutral-400">Recipient</dt>
            <dd className="font-semibold text-navy-900 mt-0.5 break-words">{head.customerName ?? '—'}</dd>
          </div>
          <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3">
            <dt className="text-xs text-neutral-400">Mobile</dt>
            <dd className="font-semibold text-navy-900 mt-0.5 break-words">{head.customerMobile ?? '—'}</dd>
          </div>
          <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3">
            <dt className="text-xs text-neutral-400">Address</dt>
            <dd className="font-semibold text-navy-900 mt-0.5 break-words">{head.addressLine ?? '—'}</dd>
          </div>
          <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3">
            <dt className="text-xs text-neutral-400">Area</dt>
            <dd className="font-semibold text-navy-900 mt-0.5 break-words">{area.length > 0 ? area : '—'}</dd>
          </div>
          <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3">
            <dt className="text-xs text-neutral-400">Postal Code</dt>
            <dd className="font-semibold text-navy-900 mt-0.5 break-words">{head.postalCode ?? '—'}</dd>
          </div>
        </dl>
        {head.orderNotes && (
          <div className="mt-3 rounded-xl bg-neutral-50 border border-neutral-200/70 p-3 text-sm">
            <p className="text-xs text-neutral-400">Order Notes</p>
            <p className="font-medium text-neutral-800 mt-0.5 break-words">{head.orderNotes}</p>
          </div>
        )}
      </section>

      {/* Items */}
      <section className="space-y-3">
        <h2 className="font-display font-bold text-lg text-neutral-900">Items ({rows.length})</h2>
        {rows.map((row, index) => (
          <article key={`${row.productName}-${row.sku ?? 'no-sku'}-${index}`} className="bg-white rounded-xl border border-neutral-200/80 p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-navy-900 break-words">{row.productName}</p>
                <p className="text-xs text-neutral-500 mt-1 break-words">
                  {row.sku ? `${row.sku} · ` : ''}{variantLabel(row)} · Qty {row.quantity} · {formatBDT(row.unitPrice)} each
                </p>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Updated {formatDate(row.itemUpdatedAt)}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end shrink-0">
                {fulfillmentBadge(row.fulfillmentStatus)}
                <p className="text-sm font-bold text-neutral-900">{formatBDT(row.lineSubtotal)}</p>
              </div>
            </div>
          </article>
        ))}
      </section>

      {/* Totals */}
      <section className="bg-white rounded-xl border border-neutral-200/80 p-5 sm:p-6">
        <h2 className="font-display font-bold text-lg text-neutral-900 mb-3">Total</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-neutral-600">
            <span>Subtotal</span>
            <span className="font-medium text-neutral-900">{formatBDT(head.subtotal)}</span>
          </div>
          <div className="flex justify-between text-neutral-600">
            <span>Delivery ({deliveryZoneDisplay(head.deliveryZone)})</span>
            <span className="font-medium text-neutral-900">{formatBDT(head.deliveryCharge)}</span>
          </div>
          <div className="flex justify-between text-neutral-600">
            <span>Discount</span>
            <span className="font-medium text-neutral-900">{formatBDT(head.discount)}</span>
          </div>
          <div className="border-t border-neutral-200 pt-3 flex justify-between font-bold text-base text-neutral-900">
            <span>Total</span>
            <span>{formatBDT(head.total)}</span>
          </div>
        </div>
      </section>
    </div>
  )
}
