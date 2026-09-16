import React from 'react'
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  Archive,
  Tag,
  BarChart3,
  Settings,
  TrendingUp,
  FileText,
  Clock,
  Edit3,
  Trash2,
  Plus,
  Menu,
  X,
  Check,
  KeyRound,
  Percent,
  Wallet,
  Undo2,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { productService, orderService, customerService } from '@/services'
import { adminOrdersService, ADMIN_ORDERS_PAGE_SIZE, type AdminOrderDetailRow, type AdminOrderRow } from '@/services/adminOrders'
import { adminProductsService } from '@/services/adminProducts'
import { adminFinanceService, type AdminWithdrawalRow, type AdminRefundRow, type AdminFinanceReport, type AdminSellerFinancialRow } from '@/services/adminFinance'
import { sellerService } from '@/services/seller'
import { adminDirectoryService } from '@/services/adminDirectory'
import { categoriesService } from '@/services/categories'
import { LoadingState, ErrorState, EmptyState } from '@/components/seller/SellerWidgets'
import { formatBDT, formatDate } from '@/lib/utils'
import { type CategorySlug, type SellerApplication } from '@/types'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SiteLogo } from '@/components/brand/SiteLogo'

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/admin', to: '/admin' },
  { icon: ShoppingBag, label: 'Orders', path: '/admin/orders', to: '/admin?tab=orders' },
  { icon: Package, label: 'Products', path: '/admin/products', to: '/admin/products' },
  { icon: Users, label: 'Customers', path: '/admin/customers', to: '/admin?tab=customers' },
  { icon: Archive, label: 'Stock', path: '/admin/stock', to: '/admin?tab=stock' },
  { icon: Tag, label: 'Coupons', path: '/admin/coupons', to: '/admin?tab=coupons' },
  { icon: BarChart3, label: 'Reports', path: '/admin/reports', to: '/admin?tab=reports' },
  { icon: Settings, label: 'Settings', path: '/admin/settings', to: '/admin?tab=settings' },
  { icon: KeyRound, label: 'Access', path: '/admin/access', to: '/admin/access' },
  { icon: Percent, label: 'Commission', path: '/admin/commission', to: '/admin/commission' },
  { icon: Wallet, label: 'Withdrawals', path: '/admin/withdrawals', to: '/admin?tab=withdrawals' },
  { icon: Undo2, label: 'Refunds', path: '/admin/refunds', to: '/admin?tab=refunds' },
  { icon: TrendingUp, label: 'Finance', path: '/admin/finance', to: '/admin?tab=finance' },
]

export const AdminLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [searchParams] = useSearchParams()
  const subPath = searchParams.get('tab') ?? 'dashboard'

  const current = NAV_ITEMS.find((item) => {
    if (item.path === '/admin' && subPath === 'dashboard') return true
    return item.path === `/admin/${subPath}`
  }) ?? NAV_ITEMS[0]

  const toggleSidebar = () => setSidebarOpen((o) => !o)
  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={closeSidebar} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-neutral-200 transform transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <span className="flex items-center gap-2 min-w-0">
            <SiteLogo height={30} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white bg-primary-600 rounded-md px-1.5 py-0.5 shrink-0">
              Admin
            </span>
          </span>
          <button
            type="button"
            onClick={closeSidebar}
            className="lg:hidden p-1 rounded-md text-neutral-500 hover:text-neutral-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              (item.path === '/admin' && subPath === 'dashboard') ||
              item.path === `/admin/${subPath}`
            return (
              <Link
                key={item.path}
                to={item.to}
                onClick={closeSidebar}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-neutral-200 px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={toggleSidebar}
            className="lg:hidden p-1 rounded-md text-neutral-700 hover:bg-neutral-100"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h2 className="font-display font-bold text-lg text-neutral-900">
            {current.label}
          </h2>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {subPath === 'dashboard' && <AdminDashboardPage />}
          {subPath === 'orders' && <AdminOrdersPage />}
          {subPath === 'products' && <AdminProductsPage />}
          {subPath === 'customers' && <AdminCustomersPage />}
          {subPath === 'stock' && <AdminStockPage />}
          {subPath === 'coupons' && <AdminCouponsPage />}
          {subPath === 'reports' && <AdminReportsPage />}
          {subPath === 'withdrawals' && <AdminWithdrawalsPage />}
          {subPath === 'refunds' && <AdminRefundsPage />}
          {subPath === 'finance' && <AdminFinancePage />}
          {subPath === 'settings' && <AdminSettingsPage />}
        </main>
      </div>
    </div>
  )
}

/* ---- Dashboard (real marketplace data; honest placeholders where no backend exists) ---- */
const AdminDashboardPage: React.FC = () => {
  const [loading, setLoading] = React.useState(true)
  const [reloadKey, setReloadKey] = React.useState(0)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [recentOrders, setRecentOrders] = React.useState<AdminOrderRow[] | null>(null)
  const [pendingProductApprovals, setPendingProductApprovals] = React.useState<number | null>(null)
  const [applications, setApplications] = React.useState<SellerApplication[] | null>(null)
  const [verifiedSellerCount, setVerifiedSellerCount] = React.useState<number | null>(null)
  const [categoryCounts, setCategoryCounts] = React.useState<{ total: number; active: number } | null>(null)

  React.useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      setLoadError(null)
      const [oRes, pRes, aRes, sRes, cRes] = await Promise.all([
        adminOrdersService.listAdminOrders(),
        adminProductsService.getAdminProducts({ status: 'pending_review', limit: 100 }),
        sellerService.listAll(),
        adminDirectoryService.listVerifiedSellers(),
        categoriesService.listAll(),
      ])
      if (!active) return
      // Each source degrades independently to an honest placeholder;
      // only a total failure blocks the dashboard with an error state.
      if (oRes.error && pRes.error && aRes.error && sRes.error && cRes.error) {
        setLoadError(oRes.error.message)
        setLoading(false)
        return
      }
      setRecentOrders(oRes.data ? oRes.data.slice(0, 5) : null)
      setPendingProductApprovals(pRes.data ? pRes.data.length : null)
      setApplications(aRes.data ?? null)
      setVerifiedSellerCount(sRes.data ? sRes.data.length : null)
      setCategoryCounts(
        cRes.data
          ? { total: cRes.data.length, active: cRes.data.filter((c) => c.isActive).length }
          : null,
      )
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [reloadKey])

  const pendingApps = (applications ?? []).filter((a) => a.status === 'pending')
  const value = (n: number | null): string => (n === null ? '—' : String(n))

  return (
    <div className="space-y-6">
      {loading && <LoadingState message="Loading marketplace overview…" />}
      {!loading && loadError && (
        <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
      )}
      {!loading && !loadError && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: 'Pending Applications', value: applications === null ? '—' : String(pendingApps.length), hint: 'Sellers awaiting review', icon: Clock, color: 'bg-amber-100 text-amber-700' },
              { label: 'Verified Sellers', value: value(verifiedSellerCount), hint: 'Approved marketplace sellers', icon: Users, color: 'bg-emerald-100 text-emerald-700' },
              { label: 'Categories', value: categoryCounts === null ? '—' : String(categoryCounts.total), hint: categoryCounts === null ? 'Unavailable' : `${categoryCounts.active} active`, icon: Tag, color: 'bg-purple-100 text-purple-700' },
              { label: 'Pending Approvals', value: value(pendingProductApprovals), hint: 'Products awaiting review', icon: FileText, color: 'bg-blue-100 text-blue-700' },
              { label: 'Total Orders', value: '—', hint: 'See Orders tab for the live list', icon: Package, color: 'bg-blue-100 text-blue-700' },
              { label: 'Total Sales', value: '—', hint: 'No sales backend yet', icon: TrendingUp, color: 'bg-accent-100 text-accent-700' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-xl border border-neutral-200/80 p-5 flex items-center gap-4">
                <div className={`h-12 w-12 rounded-lg ${stat.color} flex items-center justify-center shrink-0`}>
                  <stat.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-neutral-900">{stat.value}</p>
                  <p className="text-xs text-neutral-500">{stat.label}</p>
                  <p className="text-[11px] text-neutral-400">{stat.hint}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-neutral-200/80 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-neutral-900">Recent Orders</h3>
                <Link to="/admin?tab=orders" className="text-xs font-semibold text-primary-700 hover:underline">
                  View all
                </Link>
              </div>
              {recentOrders === null ? (
                <p className="text-sm text-neutral-500">Order data unavailable.</p>
              ) : recentOrders.length === 0 ? (
                <p className="text-sm text-neutral-500">No real orders yet.</p>
              ) : (
                <div className="space-y-3">
                  {recentOrders.map((order) => (
                    <div key={order.orderId} className="flex items-center justify-between py-2 border-b border-neutral-100">
                      <div>
                        <p className="text-sm font-mono font-medium text-neutral-900">{order.orderNumber}</p>
                        <p className="text-xs text-neutral-500">{formatDate(order.createdAt)} · {formatBDT(order.total)}</p>
                      </div>
                      <Badge variant="default">{order.orderStatus}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-neutral-200/80 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-neutral-900">Pending Seller Applications</h3>
                <Link to="/admin/sellers" className="text-xs font-semibold text-primary-700 hover:underline">
                  Review all
                </Link>
              </div>
              {applications === null ? (
                <p className="text-sm text-neutral-500">Application data unavailable.</p>
              ) : pendingApps.length === 0 ? (
                <p className="text-sm text-neutral-500">No pending applications.</p>
              ) : (
                <div className="space-y-3">
                  {pendingApps.slice(0, 5).map((app) => (
                    <div key={app.id} className="flex items-center justify-between py-2 border-b border-neutral-100">
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{app.businessName}</p>
                        <p className="text-xs text-neutral-500">Applied {formatDate(app.createdAt)}</p>
                      </div>
                      <Badge variant="accent">Pending</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ---- Orders (REAL Supabase marketplace orders, read-only) ---- */
function adminOrderStatusBadge(status: string): React.ReactNode {
  if (status === 'delivered') return <Badge variant="success">Delivered</Badge>
  if (status === 'cancelled') return <Badge variant="danger">Cancelled</Badge>
  if (status === 'shipped') return <Badge variant="accent">Shipped</Badge>
  if (status === 'pending') return <Badge variant="muted">Pending</Badge>
  return <Badge variant="accent">{status.replace('_', ' ')}</Badge>
}

function adminPaymentStatusBadge(status: string): React.ReactNode {
  if (status === 'paid') return <Badge variant="success">Paid</Badge>
  if (status === 'failed' || status === 'refunded') return <Badge variant="danger">{status}</Badge>
  return <Badge variant="muted">Pending</Badge>
}

const AdminOrdersPage: React.FC = () => {
  const [rows, setRows] = React.useState<AdminOrderRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [hasMore, setHasMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = React.useState<string | null>(null)
  const [detailRows, setDetailRows] = React.useState<AdminOrderDetailRow[]>([])
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [detailError, setDetailError] = React.useState<string | null>(null)

  // Initial page load only. Authorization is server-side inside the
  // RPC (public.is_admin()); non-admin callers receive zero rows.
  React.useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      const { data, error: err } = await adminOrdersService.listAdminOrders()
      if (!active) return
      if (err) {
        setError(err.message)
        setRows([])
        setHasMore(false)
      } else {
        const batch = data ?? []
        setError(null)
        setRows(batch)
        setHasMore(batch.length === ADMIN_ORDERS_PAGE_SIZE)
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  const loadMore = async (): Promise<void> => {
    const last = rows[rows.length - 1]
    if (!last || loadingMore) return
    setLoadingMore(true)
    const { data, error: err } = await adminOrdersService.listAdminOrders({
      createdBefore: last.createdAt,
      idBefore: last.orderId,
    })
    setLoadingMore(false)
    if (err) {
      setError(err.message)
      return
    }
    const batch = data ?? []
    setRows((prev) => [...prev, ...batch])
    setHasMore(batch.length === ADMIN_ORDERS_PAGE_SIZE)
  }

  const toggleDetail = async (orderId: string): Promise<void> => {
    if (selectedOrder === orderId) {
      setSelectedOrder(null)
      setDetailRows([])
      setDetailError(null)
      return
    }
    setSelectedOrder(orderId)
    setDetailRows([])
    setDetailError(null)
    setDetailLoading(true)
    const { data, error: err } = await adminOrdersService.getAdminOrderDetail(orderId)
    setDetailLoading(false)
    if (err) {
      setDetailError(err.message)
      return
    }
    setDetailRows(data ?? [])
  }

  const detail = detailRows.length > 0 ? detailRows[0] : null

  return (
    <div className="space-y-6">
      <p className="text-xs text-neutral-500">
        Live Supabase marketplace orders · read-only. Demo guest orders are tracked separately and are not shown here.
      </p>

      {loading && (
        <div className="bg-white rounded-xl border border-neutral-200/80 p-12 text-center text-sm text-neutral-500">
          Loading real orders…
        </div>
      )}

      {!loading && error && (
        <div className="bg-white rounded-xl border border-rose-200 p-6 text-center">
          <p className="text-sm text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 text-sm font-semibold text-rose-700 hover:underline cursor-pointer"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white rounded-xl border border-neutral-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  {['Order', 'Date', 'Items', 'Total', 'Payment', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-neutral-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.orderId} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="px-4 py-3 font-mono font-medium text-neutral-900">{o.orderNumber}</td>
                    <td className="px-4 py-3 text-neutral-600">{formatDate(o.createdAt)}</td>
                    <td className="px-4 py-3 text-neutral-600">{o.itemCount} item(s) · Qty {o.totalQuantity}</td>
                    <td className="px-4 py-3 font-medium text-neutral-900">{formatBDT(o.total)}</td>
                    <td className="px-4 py-3">
                      <span className="block text-neutral-600 text-xs mb-1">{o.paymentMethod}</span>
                      {adminPaymentStatusBadge(o.paymentStatus)}
                    </td>
                    <td className="px-4 py-3">{adminOrderStatusBadge(o.orderStatus)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void toggleDetail(o.orderId)}
                        className="text-accent-700 hover:underline text-xs font-semibold cursor-pointer"
                      >
                        {selectedOrder === o.orderId ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <div className="p-12 text-center text-sm text-neutral-500">No real orders yet.</div>
          )}
        </div>
      )}

      {!loading && !error && hasMore && (
        <div className="text-center">
          <Button size="sm" variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
            <span>{loadingMore ? 'Loading…' : 'Load more orders'}</span>
          </Button>
        </div>
      )}

      {selectedOrder && (
        <div className="bg-white rounded-xl border border-neutral-200/80 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-neutral-900">Order Details</h3>
            <button
              type="button"
              onClick={() => { setSelectedOrder(null); setDetailRows([]); setDetailError(null) }}
              className="text-neutral-500 hover:text-neutral-900 cursor-pointer"
              aria-label="Close order details"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {detailLoading && (
            <p className="text-sm text-neutral-500">Loading order details…</p>
          )}
          {!detailLoading && detailError && (
            <p className="text-sm text-rose-700">{detailError}</p>
          )}
          {!detailLoading && !detailError && detailRows.length === 0 && (
            <p className="text-sm text-neutral-500">Order not found or unavailable.</p>
          )}

          {!detailLoading && !detailError && detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div><span className="text-neutral-500">Order:</span> <span className="font-mono font-medium">{detail.orderNumber}</span></div>
                <div><span className="text-neutral-500">Date:</span> <span className="font-medium">{formatDate(detail.createdAt)}</span></div>
                <div><span className="text-neutral-500">Status:</span> {adminOrderStatusBadge(detail.orderStatus)}</div>
                <div><span className="text-neutral-500">Payment:</span> <span className="font-medium">{detail.paymentMethod}</span> {adminPaymentStatusBadge(detail.paymentStatus)}</div>
                <div><span className="text-neutral-500">Customer:</span> <span className="font-medium">{detail.customerName ?? '—'}</span></div>
                <div><span className="text-neutral-500">Phone:</span> <span className="font-medium">{detail.customerMobile ?? '—'}</span></div>
                <div className="sm:col-span-2"><span className="text-neutral-500">Address:</span> <span className="font-medium">{[detail.addressLine, detail.upazila, detail.district, detail.division].filter(Boolean).join(', ') || '—'}</span></div>
                {detail.orderNotes && (
                  <div className="sm:col-span-2"><span className="text-neutral-500">Notes:</span> <span className="font-medium">{detail.orderNotes}</span></div>
                )}
              </div>
              <div>
                <h4 className="font-semibold text-neutral-900 mb-2">Items ({detailRows.length})</h4>
                <div className="space-y-2">
                  {detailRows.map((item, index) => (
                    <div key={`${item.productName}-${item.sku ?? 'no-sku'}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 border border-neutral-200/70 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900 truncate">{item.productName}</p>
                        <p className="text-xs text-neutral-500">
                          {item.sku ? `${item.sku} · ` : ''}Qty {item.quantity} · {formatBDT(item.unitPrice)} each
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {adminOrderStatusBadge(item.fulfillmentStatus)}
                        <span className="font-semibold text-neutral-900">{formatBDT(item.lineSubtotal)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-1 text-sm border-t border-neutral-200 pt-3">
                <div className="flex justify-between text-neutral-600"><span>Subtotal</span><span>{formatBDT(detail.subtotal)}</span></div>
                <div className="flex justify-between text-neutral-600"><span>Delivery</span><span>{formatBDT(detail.deliveryCharge)}</span></div>
                <div className="flex justify-between text-neutral-600"><span>Discount</span><span>{formatBDT(detail.discount)}</span></div>
                <div className="flex justify-between font-bold text-neutral-900"><span>Total</span><span>{formatBDT(detail.total)}</span></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ---- Products ---- */
const AdminProductsPage: React.FC = () => {
  const products = productService.list()
  const [showForm, setShowForm] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [name, setName] = React.useState('')
  const [price, setPrice] = React.useState('')
  const [stock, setStock] = React.useState('')
  const [category, setCategory] = React.useState('men')

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setName('')
    setPrice('')
    setStock('')
    setCategory('men')
  }

  const handleEdit = (product: typeof products[0]) => {
    setEditingId(product.id)
    setName(product.name)
    setPrice(String(product.price))
    setStock(String(product.stock))
    setCategory(product.category)
    setShowForm(true)
  }

  const handleSave = () => {
    const existing = editingId ? productService.byId(editingId) : null
    const productData = {
      id: existing?.id ?? `p-${Date.now()}`,
      slug: existing?.slug ?? name.toLowerCase().replace(/\s+/g, '-'),
      name,
      price: Number(price) || 0,
      stock: Number(stock) || 0,
category: category as CategorySlug,
      isFeatured: existing?.isFeatured ?? false,
      isNewArrival: existing?.isNewArrival ?? false,
      isBestSeller: existing?.isBestSeller ?? false,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      description: existing?.description ?? '',
      shortDescription: existing?.shortDescription ?? '',
      oldPrice: existing?.oldPrice,
      discount: existing?.discount ?? 0,
      image: existing?.image ?? '/images/products/placeholder-2.svg',
      images: existing?.images,
      rating: existing?.rating ?? 0,
      reviews: existing?.reviews ?? 0,
      sizes: existing?.sizes ?? ['M'],
      colors: existing?.colors ?? ['Black'],
    }
    productService.save(productData)
    resetForm()
  }

  const handleDelete = (id: string) => {
    productService.remove(id)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-neutral-900">Products ({products.length})</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          <span>{showForm ? 'Cancel' : 'Add Product'}</span>
        </Button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-accent-300 p-6 space-y-4">
          <h4 className="font-semibold text-neutral-900">
            {editingId ? 'Edit Product' : 'Add New Product'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Product Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent-600" placeholder="e.g. Men's T-Shirt" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Price (৳)</label>
              <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent-600" placeholder="790" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Stock</label>
              <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent-600" placeholder="42" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none bg-white">
                <option value="men">Men</option>
                <option value="women">Women</option>
                <option value="baby-moms">Baby & Moms</option>
                <option value="clothes">Clothes</option>
              </select>
            </div>
          </div>
          <Button size="sm" onClick={handleSave}>
            <Check className="h-4 w-4" />
            <span>{editingId ? 'Update' : 'Save'}</span>
          </Button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-neutral-200/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              {['Image', 'Name', 'Category', 'Price', 'Stock', 'Status', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-neutral-700">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                <td className="px-4 py-3"><img src={p.image} alt={p.name} className="h-10 w-10 rounded object-cover" /></td>
                <td className="px-4 py-3 font-medium text-neutral-900">{p.name}</td>
                <td className="px-4 py-3 text-neutral-600 capitalize">{p.category.replace('-', ' & ')}</td>
                <td className="px-4 py-3 text-neutral-900">{formatBDT(p.price)}</td>
                <td className="px-4 py-3 text-neutral-600">{p.stock}</td>
                <td className="px-4 py-3"><Badge variant={p.stock > 10 ? 'success' : p.stock > 0 ? 'default' : 'danger'}>{p.stock > 10 ? 'In Stock' : p.stock > 0 ? 'Low' : 'Out'}</Badge></td>
                <td className="px-4 py-3 flex items-center gap-1">
                  <button onClick={() => handleEdit(p)} className="text-accent-700 hover:underline text-xs cursor-pointer"><Edit3 className="h-3.5 w-3.5 inline" /> Edit</button>
                  <button onClick={() => handleDelete(p.id)} className="text-rose-600 hover:underline text-xs cursor-pointer"><Trash2 className="h-3.5 w-3.5 inline" /> Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && <div className="p-12 text-center text-sm text-neutral-500">No products yet.</div>}
      </div>
    </div>
  )
}

/* ---- Customers ---- */
const AdminCustomersPage: React.FC = () => {
  const customers = customerService.list()

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-neutral-900">Customers ({customers.length})</h3>
      <div className="bg-white rounded-xl border border-neutral-200/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              {['Name', 'Mobile', 'Total Orders', 'Total Spent', 'Last Order', 'Status'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-neutral-700">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.mobile} className="border-b border-neutral-100 hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium text-neutral-900">{c.name}</td>
                <td className="px-4 py-3 text-neutral-600">{c.mobile}</td>
                <td className="px-4 py-3 text-neutral-600">{c.totalOrders}</td>
                <td className="px-4 py-3 text-neutral-900">{formatBDT(c.totalSpent)}</td>
                <td className="px-4 py-3 text-neutral-600">{c.lastOrderAt?.slice(0, 10) ?? '-'}</td>
                <td className="px-4 py-3"><Badge variant={c.status === 'active' ? 'success' : 'danger'}>{c.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {customers.length === 0 && <div className="p-12 text-center text-sm text-neutral-500">No customers yet.</div>}
      </div>
    </div>
  )
}

/* ---- Stock ---- */
const AdminStockPage: React.FC = () => {
  const products = productService.list()

  const sorted = [...products].sort((a, b) => a.stock - b.stock)

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-neutral-900">Stock Inventory ({products.length})</h3>
      <div className="bg-white rounded-xl border border-neutral-200/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              {['Product', 'Category', 'Current Stock', 'Status', 'Sold (estimated)'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-neutral-700">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium text-neutral-900">{p.name}</td>
                <td className="px-4 py-3 text-neutral-600 capitalize">{p.category.replace('-', ' & ')}</td>
                <td className="px-4 py-3">
                  <span className={p.stock > 10 ? 'text-emerald-600' : p.stock > 0 ? 'text-amber-600' : 'text-rose-600'}>
                    {p.stock}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={p.stock > 10 ? 'success' : p.stock > 0 ? 'default' : 'danger'}>
                    {p.stock > 10 ? 'In Stock' : p.stock > 0 ? 'Low Stock' : 'Out of Stock'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-neutral-600">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ---- Coupons ---- */
const AdminCouponsPage: React.FC = () => {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-neutral-900">Coupons Management</h3>
      <div className="bg-white rounded-xl border border-neutral-200/80 p-6">
        <p className="text-sm text-neutral-500">Coupon management will be available in the next step.</p>
      </div>
    </div>
  )
}

/* ---- Reports ---- */
const AdminReportsPage: React.FC = () => {
  const orders = orderService.list()
  const delivered = orders.filter((o) => o.status === 'Delivered').length
  const revenue = orders.filter((o) => o.status === 'Delivered').reduce((sum, o) => sum + o.total, 0)

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-neutral-900">Reports</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-neutral-200/80 p-5">
          <p className="text-2xl font-bold text-neutral-900">{orders.length}</p>
          <p className="text-xs text-neutral-500">Total Orders</p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200/80 p-5">
          <p className="text-2xl font-bold text-emerald-600">{formatBDT(revenue)}</p>
          <p className="text-xs text-neutral-500">Revenue (Delivered)</p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200/80 p-5">
          <p className="text-2xl font-bold text-accent-700">{delivered}</p>
          <p className="text-xs text-neutral-500">Delivered Orders</p>
        </div>
      </div>
    </div>
  )
}

/* ---- Withdrawals (REAL payout review; state changes are RPC-only) ---- */
function withdrawalStatusBadge(status: string): React.ReactNode {
  if (status === 'completed') return <Badge variant="success">Completed</Badge>
  if (status === 'rejected' || status === 'failed') {
    return <Badge variant="danger">{status === 'rejected' ? 'Rejected' : 'Failed'}</Badge>
  }
  if (status === 'pending') return <Badge variant="muted">Pending</Badge>
  return <Badge variant="accent">{status.replace('_', ' ')}</Badge>
}

const WITHDRAWAL_STATUSES = ['all', 'pending', 'approved', 'processing', 'completed', 'rejected', 'failed'] as const

const AdminWithdrawalsPage: React.FC = () => {
  const [rows, setRows] = React.useState<AdminWithdrawalRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [hasMore, setHasMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)
  const [statusFilter, setStatusFilter] = React.useState<(typeof WITHDRAWAL_STATUSES)[number]>('all')
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [actionMsg, setActionMsg] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState('')
  const [reference, setReference] = React.useState('')
  const [confirmAction, setConfirmAction] = React.useState<'reject' | 'complete' | 'fail' | null>(null)

  const loadFirst = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await adminFinanceService.listWithdrawals(
      undefined,
      statusFilter === 'all' ? undefined : statusFilter,
    )
    if (err) {
      setError(err.message)
      setRows([])
      setHasMore(false)
    } else {
      const batch = data ?? []
      setRows(batch)
      setHasMore(batch.length === 25)
    }
    setLoading(false)
  }, [statusFilter])

  React.useEffect(() => {
    let active = true
    void (async () => {
      setExpandedId(null)
      setConfirmAction(null)
      setActionMsg(null)
      await loadFirst()
      if (!active) return
    })()
    return () => {
      active = false
    }
  }, [loadFirst, reloadKey])

  async function runAction(kind: 'approve' | 'reject' | 'start' | 'complete' | 'fail', row: AdminWithdrawalRow): Promise<void> {
    if (busy) return
    setBusy(true)
    setActionMsg(null)
    let result: { error: Error | null }
    if (kind === 'approve') result = await adminFinanceService.approveWithdrawal(row.withdrawalId)
    else if (kind === 'reject') result = await adminFinanceService.rejectWithdrawal(row.withdrawalId, reason)
    else if (kind === 'start') result = await adminFinanceService.startPayout(row.withdrawalId)
    else if (kind === 'complete') result = await adminFinanceService.completePayout(row.withdrawalId, reference)
    else result = await adminFinanceService.failPayout(row.withdrawalId, reason)
    setBusy(false)
    if (result.error) {
      setActionMsg(result.error.message)
      return
    }
    setReason('')
    setReference('')
    setConfirmAction(null)
    setExpandedId(null)
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  function openConfirm(kind: 'reject' | 'complete' | 'fail'): void {
    setActionMsg(null)
    setConfirmAction(kind)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-neutral-900">Withdrawals</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Review seller payout requests. Every action is validated and recorded server-side.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          aria-label="Filter by withdrawal status"
          className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-medium text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 cursor-pointer"
        >
          {WITHDRAWAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {actionMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">
          {actionMsg}
        </div>
      )}

      {loading && <LoadingState message="Loading withdrawal requests…" />}
      {!loading && error && (
        <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="card-premium p-5 sm:p-6">
          <EmptyState
            title="No withdrawal requests"
            message={statusFilter === 'all'
              ? 'Sellers have not requested any payouts yet.'
              : 'No requests with this status.'}
          />
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row) => {
            const expanded = expandedId === row.withdrawalId
            return (
              <div key={row.withdrawalId} className="card-premium p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-navy-900">
                      {formatBDT(row.amount)}
                      <span className="ml-2 text-xs font-normal text-neutral-500">
                        {row.shopName ?? 'Seller'} · {formatDate(row.createdAt)}
                      </span>
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5 font-mono truncate">
                      {row.withdrawalId}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {withdrawalStatusBadge(row.status)}
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedId(expanded ? null : row.withdrawalId)
                        setConfirmAction(null)
                        setActionMsg(null)
                      }}
                      className="text-xs font-semibold text-primary-700 hover:underline cursor-pointer px-1 py-1"
                    >
                      {expanded ? 'Hide' : 'Review'}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 pt-4 border-t border-neutral-100 space-y-3 text-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-neutral-600">
                      {row.rejectionReason && (
                        <p className="sm:col-span-2">Rejection reason: <span className="font-medium text-neutral-900">{row.rejectionReason}</span></p>
                      )}
                      {row.failureReason && (
                        <p className="sm:col-span-2">Failure reason: <span className="font-medium text-neutral-900">{row.failureReason}</span></p>
                      )}
                      {row.externalReference && (
                        <p className="sm:col-span-2">Payout reference: <span className="font-mono font-medium text-neutral-900">{row.externalReference}</span></p>
                      )}
                    </div>

                    {row.status === 'pending' && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={busy}
                          onClick={() => void runAction('approve', row)}
                        >
                          {busy ? 'Working…' : 'Approve'}
                        </Button>
                        {confirmAction !== 'reject' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => openConfirm('reject')}
                          >
                            Reject
                          </Button>
                        ) : (
                          <div className="flex flex-col sm:flex-row gap-2 w-full">
                            <input
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Rejection reason (required)"
                              aria-label="Rejection reason"
                              className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                            />
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                disabled={busy}
                                onClick={() => void runAction('reject', row)}
                              >
                                {busy ? 'Rejecting…' : 'Confirm reject'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => setConfirmAction(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {row.status === 'approved' && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={busy}
                          onClick={() => void runAction('start', row)}
                        >
                          {busy ? 'Working…' : 'Start processing'}
                        </Button>
                      </div>
                    )}

                    {row.status === 'processing' && (
                      <div className="space-y-2">
                        {confirmAction === null && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              disabled={busy}
                              onClick={() => openConfirm('complete')}
                            >
                              Complete payout
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => openConfirm('fail')}
                            >
                              Mark failed
                            </Button>
                          </div>
                        )}
                        {confirmAction === 'complete' && (
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              value={reference}
                              onChange={(e) => setReference(e.target.value)}
                              placeholder="External payout reference (required)"
                              aria-label="External payout reference"
                              className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                            />
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                disabled={busy}
                                onClick={() => void runAction('complete', row)}
                              >
                                {busy ? 'Completing…' : 'Confirm completion'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => setConfirmAction(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                        {confirmAction === 'fail' && (
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Failure reason (required)"
                              aria-label="Failure reason"
                              className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                            />
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                disabled={busy}
                                onClick={() => void runAction('fail', row)}
                              >
                                {busy ? 'Recording…' : 'Confirm failure'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => setConfirmAction(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!loading && !error && hasMore && (
        <div className="text-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => void (async () => {
              const last = rows[rows.length - 1]
              if (!last) return
              setLoadingMore(true)
              const { data, error: err } = await adminFinanceService.listWithdrawals(
                { createdBefore: last.createdAt, idBefore: last.withdrawalId },
                statusFilter === 'all' ? undefined : statusFilter,
              )
              setLoadingMore(false)
              if (err || !data) {
                setError(err ? err.message : 'Something went wrong. Please try again.')
                return
              }
              setRows((prev) => [...prev, ...data])
              setHasMore(data.length === 25)
            })()}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  )
}

/* ---- Refunds (REAL reversal review; state changes are RPC-only) ---- */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function refundStatusBadge(status: string): React.ReactNode {
  if (status === 'processed') return <Badge variant="success">Processed</Badge>
  if (status === 'rejected') return <Badge variant="danger">Rejected</Badge>
  if (status === 'pending') return <Badge variant="muted">Pending</Badge>
  return <Badge variant="accent">{status.replace('_', ' ')}</Badge>
}

const REFUND_STATUSES = ['all', 'pending', 'approved', 'rejected', 'processed'] as const

function newRequestKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

const AdminRefundsPage: React.FC = () => {
  const [rows, setRows] = React.useState<AdminRefundRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [hasMore, setHasMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)
  const [statusFilter, setStatusFilter] = React.useState<(typeof REFUND_STATUSES)[number]>('all')
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [actionMsg, setActionMsg] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState('')
  const [confirmAction, setConfirmAction] = React.useState<'reject' | 'process' | null>(null)

  const [itemId, setItemId] = React.useState('')
  const [refundAmount, setRefundAmount] = React.useState('')
  const [requestReason, setRequestReason] = React.useState('')
  const [requestKey, setRequestKey] = React.useState<string | null>(null)
  const [requestMsg, setRequestMsg] = React.useState<string | null>(null)
  const [requesting, setRequesting] = React.useState(false)

  const [adjEntryId, setAdjEntryId] = React.useState('')
  const [adjAmount, setAdjAmount] = React.useState('')
  const [adjReason, setAdjReason] = React.useState('')
  const [adjKey, setAdjKey] = React.useState<string | null>(null)
  const [adjMsg, setAdjMsg] = React.useState<string | null>(null)
  const [adjusting, setAdjusting] = React.useState(false)

  const loadFirst = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await adminFinanceService.listRefunds(
      undefined,
      statusFilter === 'all' ? undefined : statusFilter,
    )
    if (err) {
      setError(err.message)
      setRows([])
      setHasMore(false)
    } else {
      const batch = data ?? []
      setRows(batch)
      setHasMore(batch.length === 25)
    }
    setLoading(false)
  }, [statusFilter])

  React.useEffect(() => {
    let active = true
    void (async () => {
      setExpandedId(null)
      setConfirmAction(null)
      setActionMsg(null)
      await loadFirst()
      if (!active) return
    })()
    return () => {
      active = false
    }
  }, [loadFirst, reloadKey])

  function refresh(): void {
    setReason('')
    setConfirmAction(null)
    setExpandedId(null)
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  async function runAction(kind: 'approve' | 'reject' | 'process', row: AdminRefundRow): Promise<void> {
    if (busy) return
    setBusy(true)
    setActionMsg(null)
    let result: { error: Error | null }
    if (kind === 'approve') result = await adminFinanceService.approveRefund(row.refundId)
    else if (kind === 'reject') result = await adminFinanceService.rejectRefund(row.refundId, reason)
    else result = await adminFinanceService.processRefund(row.refundId)
    setBusy(false)
    if (result.error) {
      setActionMsg(result.error.message)
      return
    }
    refresh()
  }

  async function handleRequest(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (requesting) return
    setRequestMsg(null)
    const parsed = Number(refundAmount)
    if (!UUID_RE.test(itemId.trim())) {
      setRequestMsg('Enter a valid order item UUID.')
      return
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setRequestMsg('Refund amount must be greater than zero.')
      return
    }
    if (!requestReason.trim()) {
      setRequestMsg('A refund reason is required.')
      return
    }
    // One idempotency key per case attempt: retries of the same
    // submit reuse it, so a retried request can never duplicate.
    const key = requestKey ?? newRequestKey()
    setRequestKey(key)
    setRequesting(true)
    const { data, error: err } = await adminFinanceService.requestRefund(
      itemId.trim(), parsed, requestReason.trim(), key,
    )
    setRequesting(false)
    if (err || !data) {
      setRequestMsg(err ? err.message : 'Something went wrong. Please try again.')
      return
    }
    setItemId('')
    setRefundAmount('')
    setRequestReason('')
    setRequestKey(null)
    setRequestMsg('Refund case created. It takes effect only after approval and processing.')
    refresh()
  }

  async function handleAdjustment(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (adjusting) return
    setAdjMsg(null)
    const parsed = Number(adjAmount)
    if (!UUID_RE.test(adjEntryId.trim())) {
      setAdjMsg('Enter a valid ledger entry UUID.')
      return
    }
    if (!Number.isFinite(parsed) || parsed === 0) {
      setAdjMsg('Adjustment amount must be non-zero (negative reverses, positive credits).')
      return
    }
    if (!adjReason.trim()) {
      setAdjMsg('A correction reason is required.')
      return
    }
    const key = adjKey ?? newRequestKey()
    setAdjKey(key)
    setAdjusting(true)
    const { data, error: err } = await adminFinanceService.createAdjustment(
      adjEntryId.trim(), parsed, adjReason.trim(), key,
    )
    setAdjusting(false)
    if (err || !data) {
      setAdjMsg(err ? err.message : 'Something went wrong. Please try again.')
      return
    }
    setAdjEntryId('')
    setAdjAmount('')
    setAdjReason('')
    setAdjKey(null)
    setAdjMsg('Correction recorded as an immutable compensating entry.')
  }

  function openConfirm(kind: 'reject' | 'process'): void {
    setActionMsg(null)
    setConfirmAction(kind)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-neutral-900">Refunds</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Reverse seller earnings with compensating entries. History is never edited.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          aria-label="Filter by refund status"
          className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-medium text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 cursor-pointer"
        >
          {REFUND_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {actionMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">
          {actionMsg}
        </div>
      )}

      <div className="card-premium p-5 sm:p-6">
        <h4 className="font-display font-bold text-base text-navy-900 mb-1">New refund case</h4>
        <p className="text-xs text-neutral-500 mb-4">
          Item-level, net-denominated. The server caps the amount at the remaining refundable earning.
        </p>
        <form onSubmit={(e) => void handleRequest(e)} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor="ref-item" className="block text-xs font-semibold text-neutral-700 mb-1">Order item UUID</label>
            <input
              id="ref-item"
              value={itemId}
              onChange={(e) => { setItemId(e.target.value); setRequestKey(null) }}
              placeholder="e.g. 8f5d137e-…"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
            />
          </div>
          <div>
            <label htmlFor="ref-amount" className="block text-xs font-semibold text-neutral-700 mb-1">Net amount (BDT)</label>
            <input
              id="ref-amount"
              type="number"
              min={0}
              step="0.01"
              value={refundAmount}
              onChange={(e) => { setRefundAmount(e.target.value); setRequestKey(null) }}
              placeholder="e.g. 400.00"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
            />
          </div>
          <div>
            <label htmlFor="ref-reason" className="block text-xs font-semibold text-neutral-700 mb-1">Reason</label>
            <input
              id="ref-reason"
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              placeholder="Why is this being refunded?"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
            />
          </div>
          <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={requesting}>
              {requesting ? 'Creating…' : 'Create refund case'}
            </Button>
            {requestMsg && <p className="text-xs text-neutral-600">{requestMsg}</p>}
          </div>
        </form>
      </div>

      {loading && <LoadingState message="Loading refund cases…" />}
      {!loading && error && (
        <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="card-premium p-5 sm:p-6">
          <EmptyState
            title="No refund cases"
            message={statusFilter === 'all'
              ? 'No item refunds have been requested yet.'
              : 'No cases with this status.'}
          />
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row) => {
            const expanded = expandedId === row.refundId
            return (
              <div key={row.refundId} className="card-premium p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-navy-900">
                      {formatBDT(row.requestedNetAmount)}
                      <span className="ml-2 text-xs font-normal text-neutral-500">
                        {row.shopName ?? 'Seller'}
                        {row.orderNumber ? ` · ${row.orderNumber}` : ''}
                      </span>
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">
                      {row.reason ?? 'No reason recorded'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {refundStatusBadge(row.status)}
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedId(expanded ? null : row.refundId)
                        setConfirmAction(null)
                        setActionMsg(null)
                      }}
                      className="text-xs font-semibold text-primary-700 hover:underline cursor-pointer px-1 py-1"
                    >
                      {expanded ? 'Hide' : 'Review'}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 pt-4 border-t border-neutral-100 space-y-3 text-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-neutral-600">
                      <p>Requested: <span className="font-medium text-neutral-900">{formatDate(row.createdAt)}</span></p>
                      {row.rejectionReason && (
                        <p className="sm:col-span-2">Rejection reason: <span className="font-medium text-neutral-900">{row.rejectionReason}</span></p>
                      )}
                    </div>

                    {row.status === 'pending' && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={busy}
                          onClick={() => void runAction('approve', row)}
                        >
                          {busy ? 'Working…' : 'Approve'}
                        </Button>
                        {confirmAction !== 'reject' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => openConfirm('reject')}
                          >
                            Reject
                          </Button>
                        ) : (
                          <div className="flex flex-col sm:flex-row gap-2 w-full">
                            <input
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Rejection reason (required)"
                              aria-label="Rejection reason"
                              className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                            />
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                disabled={busy}
                                onClick={() => void runAction('reject', row)}
                              >
                                {busy ? 'Rejecting…' : 'Confirm reject'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => setConfirmAction(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {row.status === 'approved' && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={busy}
                          onClick={() => openConfirm('process')}
                        >
                          Process refund
                        </Button>
                        {confirmAction === 'process' && (
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              disabled={busy}
                              onClick={() => void runAction('process', row)}
                            >
                              {busy ? 'Processing…' : 'Confirm — writes ledger entry'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => setConfirmAction(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!loading && !error && hasMore && (
        <div className="text-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => void (async () => {
              const last = rows[rows.length - 1]
              if (!last) return
              setLoadingMore(true)
              const { data, error: err } = await adminFinanceService.listRefunds(
                { createdBefore: last.createdAt, idBefore: last.refundId },
                statusFilter === 'all' ? undefined : statusFilter,
              )
              setLoadingMore(false)
              if (err || !data) {
                setError(err ? err.message : 'Something went wrong. Please try again.')
                return
              }
              setRows((prev) => [...prev, ...data])
              setHasMore(data.length === 25)
            })()}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}

      <div className="card-premium p-5 sm:p-6">
        <h4 className="font-display font-bold text-base text-navy-900 mb-1">Financial correction</h4>
        <p className="text-xs text-neutral-500 mb-4">
          Super-admin only. Records a signed compensating entry anchored to an existing ledger row. History is never edited.
        </p>
        <form onSubmit={(e) => void handleAdjustment(e)} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor="adj-entry" className="block text-xs font-semibold text-neutral-700 mb-1">Ledger entry UUID</label>
            <input
              id="adj-entry"
              value={adjEntryId}
              onChange={(e) => { setAdjEntryId(e.target.value); setAdjKey(null) }}
              placeholder="Entry to compensate"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
            />
          </div>
          <div>
            <label htmlFor="adj-amount" className="block text-xs font-semibold text-neutral-700 mb-1">Amount (signed BDT)</label>
            <input
              id="adj-amount"
              type="number"
              step="0.01"
              value={adjAmount}
              onChange={(e) => { setAdjAmount(e.target.value); setAdjKey(null) }}
              placeholder="e.g. -50.00 or 25.00"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
            />
          </div>
          <div>
            <label htmlFor="adj-reason" className="block text-xs font-semibold text-neutral-700 mb-1">Correction reason</label>
            <input
              id="adj-reason"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="Why is this correction needed?"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
            />
          </div>
          <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center gap-2">
            <Button type="submit" variant="secondary" size="sm" disabled={adjusting}>
              {adjusting ? 'Recording…' : 'Record correction'}
            </Button>
            {adjMsg && <p className="text-xs text-neutral-600">{adjMsg}</p>}
          </div>
        </form>
      </div>
    </div>
  )
}

/* ---- Finance (platform reporting; read-only aggregates) ---- */
const AdminFinancePage: React.FC = () => {
  const [report, setReport] = React.useState<AdminFinanceReport | null>(null)
  const [sellers, setSellers] = React.useState<AdminSellerFinancialRow[]>([])
  const [hasMoreSellers, setHasMoreSellers] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)
  const [fromInput, setFromInput] = React.useState('')
  const [toInput, setToInput] = React.useState('')
  const [range, setRange] = React.useState<{ from: string | null; to: string | null }>({ from: null, to: null })

  const rangeActive = range.from !== null || range.to !== null

  const loadAll = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    const bounded = range.from !== null || range.to !== null ? range : undefined
    const [repRes, selRes] = await Promise.all([
      adminFinanceService.getReport(bounded),
      adminFinanceService.listSellerFinancials(),
    ])
    const err = repRes.error ?? selRes.error
    if (err) {
      setError(err.message)
      setReport(null)
      setSellers([])
      setHasMoreSellers(false)
    } else {
      setReport(repRes.data)
      const batch = selRes.data ?? []
      setSellers(batch)
      setHasMoreSellers(batch.length === 25)
    }
    setLoading(false)
  }, [range])

  React.useEffect(() => {
    let active = true
    void (async () => {
      await loadAll()
      if (!active) return
    })()
    return () => {
      active = false
    }
  }, [loadAll, reloadKey])

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
    const next = {
      from: fromInput === '' ? null : toIsoStart(fromInput),
      to: toInput === '' ? null : toIsoEnd(toInput),
    }
    setRange(next)
  }

  function clearRange(): void {
    setFromInput('')
    setToInput('')
    setRange({ from: null, to: null })
  }

  async function loadMoreSellers(): Promise<void> {
    const last = sellers[sellers.length - 1]
    if (!last || loadingMore) return
    setLoadingMore(true)
    const { data, error: err } = await adminFinanceService.listSellerFinancials(last.sellerId)
    setLoadingMore(false)
    if (err || !data) {
      setError(err ? err.message : 'Something went wrong. Please try again.')
      return
    }
    setSellers((prev) => [...prev, ...data])
    setHasMoreSellers(data.length === 25)
  }

  const stats: Array<{ label: string; value: string; hint: string }> = report === null
    ? []
    : [
        { label: 'Gross Earnings', value: formatBDT(report.grossEarnings), hint: rangeActive ? 'Recognized in period' : 'Recognized to date' },
        { label: 'Commission', value: formatBDT(report.totalCommission), hint: 'Platform share' },
        { label: 'Refunded', value: formatBDT(report.refundedAmount), hint: 'Returned via reversals' },
        { label: 'Adjustments', value: formatBDT(report.adjustmentAmount), hint: 'Signed corrections' },
        { label: 'Net Earnings', value: formatBDT(report.netEarnings), hint: 'Gross minus refunds, plus adjustments' },
        { label: 'Paid Out', value: formatBDT(report.paidOutAmount), hint: 'Completed payouts' },
        { label: 'Reserved', value: formatBDT(report.reservedAmount), hint: 'Locked in active requests' },
        { label: 'Available', value: formatBDT(report.availableEarnings), hint: 'Current withdrawable total' },
        { label: 'Sellers Active', value: String(report.sellersWithActivity), hint: `${report.earningCount} earnings in scope` },
      ]

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-neutral-900">Finance</h3>
        <p className="text-xs text-neutral-500 mt-0.5">
          Platform reporting from the immutable ledger. Flows honor the period; Reserved and Available stay current.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200/80 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label htmlFor="fin-from" className="block text-xs font-medium text-neutral-500 mb-1">From</label>
            <input
              id="fin-from"
              type="date"
              value={fromInput}
              max={toInput !== '' ? toInput : undefined}
              onChange={(e) => setFromInput(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="fin-to" className="block text-xs font-medium text-neutral-500 mb-1">To</label>
            <input
              id="fin-to"
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
      </div>

      {loading && <LoadingState message="Loading financial report…" />}
      {!loading && error && (
        <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />
      )}

      {!loading && !error && report === null && (
        <div className="bg-white rounded-xl border border-neutral-200/80 p-6">
          <EmptyState
            title="No financial activity"
            message={rangeActive ? 'No ledger rows fall inside the selected period.' : 'No earnings have been recognized yet.'}
          />
        </div>
      )}

      {!loading && !error && report !== null && (
        <>
          {report.debtAmount > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Outstanding seller debt of {formatBDT(report.debtAmount)}. Future cleared earnings offset it first.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {stats.map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-neutral-200/80 p-5">
                <p className="text-2xl font-bold text-neutral-900">{s.value}</p>
                <p className="text-xs text-neutral-500">{s.label}</p>
                <p className="text-[11px] text-neutral-400">{s.hint}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-neutral-200/80 p-5 sm:p-6">
            <h4 className="font-display font-bold text-base text-navy-900 mb-4">Per-seller position</h4>
            {sellers.length === 0 ? (
              <p className="text-sm text-neutral-500">No sellers with earnings yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200">
                      <th className="py-2 pr-3 font-medium">Shop</th>
                      <th className="py-2 pr-3 font-medium text-right">Gross</th>
                      <th className="py-2 pr-3 font-medium text-right">Commission</th>
                      <th className="py-2 pr-3 font-medium text-right">Refunded</th>
                      <th className="py-2 pr-3 font-medium text-right">Net</th>
                      <th className="py-2 font-medium text-right">Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellers.map((s) => (
                      <tr key={s.sellerId} className="border-b border-neutral-100 last:border-0">
                        <td className="py-2 pr-3 font-medium text-neutral-900 truncate max-w-[180px]">
                          {s.shopName ?? 'Seller'}
                        </td>
                        <td className="py-2 pr-3 text-right text-neutral-700">{formatBDT(s.totalEarnings)}</td>
                        <td className="py-2 pr-3 text-right text-neutral-700">{formatBDT(s.totalCommission)}</td>
                        <td className="py-2 pr-3 text-right text-neutral-700">{formatBDT(s.refundedAmount)}</td>
                        <td className="py-2 pr-3 text-right font-semibold text-neutral-900">{formatBDT(s.netEarnings)}</td>
                        <td className="py-2 text-right font-semibold text-neutral-900">{formatBDT(s.availableEarnings)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {hasMoreSellers && (
              <div className="mt-4 text-center">
                <Button type="button" variant="outline" size="sm" disabled={loadingMore} onClick={() => void loadMoreSellers()}>
                  {loadingMore ? 'Loading…' : 'Load more sellers'}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ---- Settings ---- */
const AdminSettingsPage: React.FC = () => {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-neutral-900">Settings</h3>
      <div className="bg-white rounded-xl border border-neutral-200/80 p-6 space-y-4">
        <p className="text-sm text-neutral-500">Store settings configuration is available in the next step.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-neutral-900">Free Shipping Threshold</p>
            <p className="text-neutral-600">৳5,000</p>
          </div>
          <div>
            <p className="font-medium text-neutral-900">Delivery Charges</p>
            <p className="text-neutral-600">Inside Dhaka: ৳80 · Outside: ৳130</p>
          </div>
        </div>
      </div>
    </div>
  )
}
