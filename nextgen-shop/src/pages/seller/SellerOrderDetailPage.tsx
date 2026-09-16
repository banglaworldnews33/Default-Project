import React, { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  sellerOrdersService,
  FULFILLMENT_NEXT,
  type FulfillmentStatus,
  type SellerOrderDetailRow,
} from '@/services/sellerOrders'
import { formatBDT, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { LoadingState, ErrorState, EmptyState } from '@/components/seller/SellerWidgets'

const ACTION_LABELS: Record<FulfillmentStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirm',
  processing: 'Start Processing',
  shipped: 'Mark Shipped',
  delivered: 'Mark Delivered',
  cancelled: 'Cancel',
}

function statusBadge(status: FulfillmentStatus): React.ReactNode {
  if (status === 'delivered') return <Badge variant="success">Delivered</Badge>
  if (status === 'cancelled') return <Badge variant="danger">Cancelled</Badge>
  if (status === 'shipped') return <Badge variant="accent">Shipped</Badge>
  if (status === 'pending') return <Badge variant="muted">Pending</Badge>
  return <Badge variant="accent">{ACTION_LABELS[status]}</Badge>
}

function PiiField({ label, value, redactedNote }: { label: string; value: string | null; redactedNote?: boolean }): React.ReactNode {
  return (
    <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3">
      <dt className="text-xs text-neutral-400">{label}</dt>
      <dd className="font-semibold text-navy-900 mt-0.5 break-words">
        {value ?? '—'}
      </dd>
      {value === null && redactedNote === true && (
        <dd className="text-[11px] text-neutral-400 mt-0.5">Not available for this order status.</dd>
      )}
    </div>
  )
}

/**
 * Seller order detail (migration 013 detail RPC).
 *
 * The URL order id only selects which RPC call to make; empty
 * results render a generic unavailable state with no distinction
 * between missing, foreign, or unauthorized orders. PII renders
 * exactly as returned (NULL stays NULL). Status changes refetch
 * from the database — the submitted value is never trusted.
 */
export const SellerOrderDetailPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>()
  const [rows, setRows] = useState<SellerOrderDetailRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyItem, setBusyItem] = useState<string | null>(null)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async (): Promise<{ rows: SellerOrderDetailRow[]; error: string | null }> => {
    if (!orderId) return { rows: [], error: null }
    const { data, error: err } = await sellerOrdersService.getSellerOrderDetail(orderId)
    if (err) return { rows: [], error: err.message }
    return { rows: data ?? [], error: null as string | null }
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
        setRows(res.rows ?? [])
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [load, reloadKey])

  async function handleStatus(itemId: string, next: FulfillmentStatus): Promise<void> {
    if (busyItem !== null) return
    setBusyItem(itemId)
    setActionMsg(null)
    const { error: err } = await sellerOrdersService.updateFulfillment(itemId, next)
    if (err) {
      setBusyItem(null)
      setActionMsg(err.message)
      return
    }
    // Re-derive everything from the database; never trust the submit.
    const res = await load()
    setBusyItem(null)
    setConfirmCancelId(null)
    if (res.error) {
      setActionMsg(res.error)
      return
    }
    setRows(res.rows ?? [])
    setReloadKey((k) => k + 1)
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <Link to="/seller/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800">
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </Link>
        <LoadingState message="Loading order…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-5">
        <Link to="/seller/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800">
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </Link>
        <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-5">
        <Link to="/seller/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800">
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </Link>
        <div className="card-premium p-5 sm:p-6">
          <EmptyState
            title="Order unavailable"
            message="This order doesn't exist or isn't assigned to your shop."
          />
        </div>
      </div>
    )
  }

  const head = rows[0]
  const orderTotal = rows.reduce((s, r) => s + r.lineSubtotal, 0)

  return (
    <div className="space-y-5">
      <Link to="/seller/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800">
        <ArrowLeft className="h-4 w-4" />
        Back to Orders
      </Link>

      <div>
        <h1 className="font-mono text-xl sm:text-2xl font-bold text-navy-900">{head.orderNumber}</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {formatDate(head.orderCreatedAt)} · Overall: {head.parentOrderStatus.replace('_', ' ')} · Your total: {formatBDT(orderTotal)}
        </p>
      </div>

      {actionMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">
          {actionMsg}
        </div>
      )}

      <div className="card-premium p-5 sm:p-6">
        <h2 className="font-display font-bold text-lg text-navy-900 mb-4">Delivery Information</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <PiiField label="Recipient" value={head.customerName} redactedNote />
          <PiiField label="Mobile" value={head.customerMobile} redactedNote />
          <PiiField label="Address" value={head.deliveryAddress} redactedNote />
          <PiiField
            label="Area"
            value={
              head.deliveryUpazila ?? head.deliveryDistrict ?? head.deliveryDivision
                ? [head.deliveryUpazila, head.deliveryDistrict, head.deliveryDivision].filter(Boolean).join(', ')
                : null
            }
            redactedNote
          />
          <PiiField label="Postal Code" value={head.deliveryPostalCode} redactedNote />
        </dl>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const next = FULFILLMENT_NEXT[row.fulfillmentStatus]
          const busy = busyItem === row.itemId
          return (
            <div key={row.itemId} className="card-premium p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy-900 truncate">{row.productName}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {row.sku ? `${row.sku} · ` : ''}
                    {[row.variantName, row.variantAttributes.size, row.variantAttributes.color].filter(Boolean).join(' · ') || 'standard'}
                    {` · Qty ${row.quantity} · ${formatBDT(row.unitPrice)} each · ${formatBDT(row.lineSubtotal)}`}
                  </p>
                </div>
                {statusBadge(row.fulfillmentStatus)}
              </div>
              {next.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {next.filter((target) => target !== 'cancelled').map((target) => (
                    <Button
                      key={target}
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleStatus(row.itemId, target)}
                    >
                      {busy ? 'Updating…' : ACTION_LABELS[target]}
                    </Button>
                  ))}
                  {next.includes('cancelled') && confirmCancelId !== row.itemId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setConfirmCancelId(row.itemId)}
                    >
                      Cancel Order Item
                    </Button>
                  )}
                  {next.includes('cancelled') && confirmCancelId === row.itemId && (
                    <>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={busy}
                        onClick={() => void handleStatus(row.itemId, 'cancelled')}
                      >
                        {busy ? 'Cancelling…' : 'Confirm Cancel'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => setConfirmCancelId(null)}
                      >
                        Keep Item
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
