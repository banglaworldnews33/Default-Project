import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, ArrowRight } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { sellerService } from '@/services/seller'
import { sellerProductsService } from '@/services/sellerProducts'
import { sellerOrdersService, type SellerOrderItemRow } from '@/services/sellerOrders'
import { sellerFinanceService, type SellerFinancialSummary } from '@/services/sellerFinance'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, KpiCard, LoadingState, ErrorState, applicationStatusBadge } from '@/components/seller/SellerWidgets'
import { formatBDT, formatDate } from '@/lib/utils'
import type { MarketplaceProduct, SellerApplication } from '@/types'

interface OrderGroup {
  orderId: string
  orderNumber: string
  orderCreatedAt: string
  parentOrderStatus: string
  itemCount: number
  totalQty: number
  totalAmount: number
}

function groupOrderRows(rows: SellerOrderItemRow[]): OrderGroup[] {
  const byOrder = new Map<string, OrderGroup>()
  for (const row of rows) {
    const existing = byOrder.get(row.orderId)
    if (existing) {
      existing.itemCount += 1
      existing.totalQty += row.quantity
      existing.totalAmount += row.lineSubtotal
    } else {
      byOrder.set(row.orderId, {
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        orderCreatedAt: row.orderCreatedAt,
        parentOrderStatus: row.parentOrderStatus,
        itemCount: 1,
        totalQty: row.quantity,
        totalAmount: row.lineSubtotal,
      })
    }
  }
  // Rows arrive newest-first from the RPC, so first-seen order wins position.
  return [...byOrder.values()]
}

function orderStatusBadge(status: string): React.ReactNode {
  if (status === 'delivered') return <Badge variant="success">Delivered</Badge>
  if (status === 'cancelled') return <Badge variant="danger">Cancelled</Badge>
  if (status === 'shipped') return <Badge variant="accent">Shipped</Badge>
  if (status === 'pending') return <Badge variant="muted">Pending</Badge>
  return <Badge variant="accent">{status.replace('_', ' ')}</Badge>
}

function productStatusBadge(status: MarketplaceProduct['status']): React.ReactNode {
  if (status === 'approved') return <Badge variant="success">Approved</Badge>
  if (status === 'rejected') return <Badge variant="danger">Rejected</Badge>
  if (status === 'pending_review') return <Badge variant="accent">In Review</Badge>
  if (status === 'inactive') return <Badge variant="muted">Inactive</Badge>
  return <Badge variant="muted">Draft</Badge>
}

export const SellerOverviewPage: React.FC = () => {
  const { user, profile, refreshProfile } = useAuth()
  const [app, setApp] = useState<SellerApplication | null>(null)
  const [products, setProducts] = useState<MarketplaceProduct[] | null>(null)
  const [orderGroups, setOrderGroups] = useState<OrderGroup[] | null>(null)
  const [finance, setFinance] = useState<SellerFinancialSummary | null>(null)
  const [financeError, setFinanceError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    void (async () => {
      if (!user) {
        // No signed-in user (e.g. unconfigured demo passthrough where
        // the route guard renders children anyway): never wedge on the
        // spinner; render honest empty states instead.
        if (active) setLoading(false)
        return
      }
      try {
        // Refresh the profile ONLY when we do not have one yet.
        // AuthContext already loads it on session/auth events, and
        // SellerRoute mounts this page only once a verified profile
        // exists. Refreshing on every mount toggles profileLoading,
        // which makes the route guard unmount this page and remount it
        // into an infinite fetch loop (mount → refresh → unmount →
        // remount). Gating on !profile breaks that cycle.
        if (!profile) await refreshProfile()
        const [appRes, prodRes, ordRes, finRes] = await Promise.all([
          sellerService.listMine(),
          sellerProductsService.listMine(),
          sellerOrdersService.listSellerOrders(),
          sellerFinanceService.getSummary(),
        ])
        if (!active) return
        // Shop identity is required; product/order panels degrade
        // independently to honest empty states on failure.
        if (appRes.error) {
          setError(appRes.error.message)
          setApp(null)
        } else {
          setError(null)
          setApp(appRes.data?.[0] ?? null)
        }
        setProducts(prodRes.data ?? null)
        setOrderGroups(ordRes.data ? groupOrderRows(ordRes.data) : null)
        // Financial failure degrades to honest placeholders plus an
        // explicit notice — never to fabricated zero balances.
        if (finRes.error) {
          setFinance(null)
          setFinanceError(finRes.error.message)
        } else {
          setFinance(finRes.data)
          setFinanceError(null)
        }
      } catch (err) {
        // Transport-level failures (offline/paused backend) reject the
        // Supabase client promise instead of resolving to { error }.
        // Surface them through the existing error state with retry
        // instead of wedging on the loading spinner forever.
        if (!active) return
        setError(err instanceof Error ? err.message : 'Could not load your shop data.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
    // profile is a deliberate dep: a late-arriving profile re-runs the
    // load once (refresh skipped, data fetched); the run itself never
    // writes profile/user state, so no render loop is possible.
  }, [user, profile, refreshProfile, reloadKey])

  const stats = useMemo(() => {
    const list = products ?? []
    const groups = orderGroups ?? []
    return {
      totalProducts: list.length,
      activeProducts: list.filter((p) => p.status === 'approved').length,
      pendingProducts: list.filter((p) => p.status === 'pending_review').length,
      orders: groups.length,
      pendingOrders: groups.filter((g) => g.parentOrderStatus === 'pending').length,
      deliveredOrders: groups.filter((g) => g.parentOrderStatus === 'delivered').length,
    }
  }, [products, orderGroups])

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">
            Welcome{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''} 👋
          </h1>
          <p className="text-sm text-neutral-500 mt-1">Here&apos;s what&apos;s happening with your shop today.</p>
        </div>
        <Button to="/seller/products/new" variant="secondary" size="md">
          + Add Product
        </Button>
      </div>

      {loading && <LoadingState message="Loading your shop data…" />}
      {!loading && error && <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />}

      {!loading && !error && (
        <>
          {/* Shop identity (real, from approved application + profile) */}
          <div className="card-premium p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary-600 text-white flex items-center justify-center shrink-0">
              <Store className="h-7 w-7" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Your Shop</p>
              <h2 className="text-lg font-display font-bold text-navy-900 truncate">
                {app?.businessName ?? 'Shop'}
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                {app ? `Approved ${formatDate(app.reviewedAt ?? app.createdAt)}` : 'Seller account active'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {app && applicationStatusBadge(app.status)}
              <Link to="/seller/shop" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800">
                Manage <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* KPIs — real counts and derived balances; "—" only where unavailable */}
          {financeError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">
              Financial data unavailable: {financeError}
            </div>
          )}
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            <KpiCard label="Total Products" value={products === null ? '—' : String(stats.totalProducts)} hint="Your catalog" />
            <KpiCard label="Active Products" value={products === null ? '—' : String(stats.activeProducts)} hint="Approved and live" />
            <KpiCard label="Pending Products" value={products === null ? '—' : String(stats.pendingProducts)} hint="Awaiting review" />
            <KpiCard label="Orders" value={orderGroups === null ? '—' : String(stats.orders)} hint="Orders with your items" />
            <KpiCard label="Pending Orders" value={orderGroups === null ? '—' : String(stats.pendingOrders)} hint="Awaiting fulfillment" />
            <KpiCard label="Delivered Orders" value={orderGroups === null ? '—' : String(stats.deliveredOrders)} hint="Completed fulfillment" />
            <KpiCard label="Total Earnings" value={finance === null ? '—' : formatBDT(finance.totalEarnings)} hint="Net of commission" />
            <KpiCard label="Available Balance" value={finance === null ? '—' : formatBDT(finance.availableBalance)} hint="Cleared earnings" />
            <KpiCard label="Pending Balance" value={finance === null ? '—' : formatBDT(finance.pendingEarnings)} hint="Clearing within 7 days" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="card-premium p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-lg text-navy-900">Recent Orders</h2>
                <Link to="/seller/orders" className="text-xs font-semibold text-primary-700 hover:underline">
                  View all
                </Link>
              </div>
              {orderGroups === null ? (
                <EmptyState
                  title="Orders unavailable"
                  message="Your order queue could not be loaded right now. Open Orders to retry."
                  actionLabel="Go to Orders"
                  actionTo="/seller/orders"
                />
              ) : orderGroups.length === 0 ? (
                <EmptyState
                  title="No orders yet"
                  message="When customers buy your products, their orders will appear here with fulfillment status."
                />
              ) : (
                <div className="space-y-3">
                  {orderGroups.slice(0, 5).map((g) => (
                    <Link
                      key={g.orderId}
                      to={`/seller/orders/${g.orderId}`}
                      className="flex items-center justify-between gap-3 py-2 border-b border-neutral-100 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-mono font-semibold text-navy-900 truncate">{g.orderNumber}</p>
                        <p className="text-xs text-neutral-500">
                          {formatDate(g.orderCreatedAt)} · {g.itemCount} item{g.itemCount === 1 ? '' : 's'} · {formatBDT(g.totalAmount)}
                        </p>
                      </div>
                      {orderStatusBadge(g.parentOrderStatus)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="card-premium p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-lg text-navy-900">Recent Products</h2>
                <Link to="/seller/products" className="text-xs font-semibold text-primary-700 hover:underline">
                  View all
                </Link>
              </div>
              {products === null ? (
                <EmptyState
                  title="Products unavailable"
                  message="Your catalog could not be loaded right now. Open Products to retry."
                  actionLabel="Go to Products"
                  actionTo="/seller/products"
                />
              ) : products.length === 0 ? (
                <EmptyState
                  title="No products yet"
                  message="Create your first draft. It stays private until our team approves it for the marketplace."
                  actionLabel="Add a product"
                  actionTo="/seller/products/new"
                />
              ) : (
                <div className="space-y-3">
                  {products.slice(0, 5).map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-b border-neutral-100 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-navy-900 truncate">{p.name}</p>
                        <p className="text-xs text-neutral-500">{formatBDT(p.price)} · Stock {p.stockQuantity}</p>
                      </div>
                      {productStatusBadge(p.status)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card-premium p-5 sm:p-6">
            <h2 className="font-display font-bold text-lg text-navy-900 mb-4">Sales Activity</h2>
            <EmptyState
              title="No sales activity yet"
              message="Charts and daily sales trends will appear here after your first completed sale."
            />
          </div>
        </>
      )}
    </div>
  )
}
