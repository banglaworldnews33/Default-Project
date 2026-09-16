import React, { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Search, Check, X, Plus, Pencil, Power, EyeOff, Eye } from 'lucide-react'
import { sellerProductsService } from '@/services/sellerProducts'
import { adminProductsService, createSellerProduct, getProductAudit, type ProductAuditEntry } from '@/services/adminProducts'
import { sellerShopService } from '@/services/sellerShop'
import { categoriesService } from '@/services/categories'
import { adminDirectoryService, type SellerDirectoryEntry } from '@/services/adminDirectory'
import { formatBDT, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { LoadingState, ErrorState, EmptyState } from '@/components/seller/SellerWidgets'
import type {
  MarketplaceCategory,
  MarketplaceProduct,
  MarketplaceProductImage,
  MarketplaceProductVariant,
  SellerShop,
} from '@/types'

const STATUSES = ['all', 'draft', 'pending_review', 'approved', 'rejected', 'inactive'] as const

function statusBadge(status: MarketplaceProduct['status']): React.ReactNode {
  if (status === 'approved') return <Badge variant="success">Approved</Badge>
  if (status === 'rejected') return <Badge variant="danger">Rejected</Badge>
  if (status === 'pending_review') return <Badge variant="accent">Pending Review</Badge>
  if (status === 'inactive') return <Badge variant="muted">Inactive</Badge>
  return <Badge variant="muted">Draft</Badge>
}

function ownershipBadge(ownerType: MarketplaceProduct['ownerType']): React.ReactNode {
  if (ownerType === 'admin') return <Badge variant="accent">Admin Product</Badge>
  return <Badge variant="muted">Seller Product</Badge>
}

function visibilityBadge(hiddenByAdmin: boolean): React.ReactNode {
  if (hiddenByAdmin) return <Badge variant="danger">Hidden by Admin</Badge>
  return <Badge variant="success">Visible</Badge>
}

export const AdminProductsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [products, setProducts] = useState<MarketplaceProduct[]>([])
  const [dbCategories, setDbCategories] = useState<MarketplaceCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [statusFilter, setStatusFilter] = useState<string>('pending_review')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [sellerFilter, setSellerFilter] = useState<string>('all')
  const [ownershipFilter, setOwnershipFilter] = useState<string>('all')
  const [visibilityFilter, setVisibilityFilter] = useState<string>('all')
  const [sellers, setSellers] = useState<SellerDirectoryEntry[]>([])
  const [query, setQuery] = useState('')

  const [selected, setSelected] = useState<MarketplaceProduct | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formProductId, setFormProductId] = useState<string | null>(null)
  const [shop, setShop] = useState<SellerShop | null>(null)
  const [auditEntries, setAuditEntries] = useState<ProductAuditEntry[]>([])
  const [imageUrl, setImageUrl] = useState('')
  const [variantName, setVariantName] = useState('')
  const [variantStock, setVariantStock] = useState('0')
  const [images, setImages] = useState<MarketplaceProductImage[]>([])
  const [variants, setVariants] = useState<MarketplaceProductVariant[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [confirming, setConfirming] = useState<'approve' | 'reject' | null>(null)
  const [acting, setActing] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [pRes, cRes, sRes] = await Promise.all([
      adminProductsService.getAdminProducts({ status: statusFilter === 'all' ? undefined : statusFilter, limit: 100 }),
      categoriesService.listAll(),
      adminDirectoryService.listVerifiedSellers(),
    ])
    if (pRes.error) {
      setError(pRes.error.message)
      setProducts([])
    } else {
      setError(null)
      setProducts(pRes.data ?? [])
    }
    setDbCategories(cRes.data ?? [])
    setSellers(sRes.data ?? [])
  }, [statusFilter])

  const sellerName = (sellerId: string): string => {
    const s = sellers.find((x) => x.id === sellerId)
    if (s && (s.name || s.email)) return s.name ?? s.email ?? sellerId
    return `${sellerId.slice(0, 8)}…`
  }

  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      await load()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [load, reloadKey])

  const categoryName = (id: string): string =>
    dbCategories.find((c) => c.id === id)?.name ?? '—'

  const filtered = products.filter((p) => {
    if (categoryFilter !== 'all' && p.categoryId !== categoryFilter) return false
    if (sellerFilter !== 'all' && p.sellerId !== sellerFilter) return false
    if (ownershipFilter !== 'all' && p.ownerType !== ownershipFilter) return false
    if (visibilityFilter === 'hidden' && !p.hiddenByAdmin) return false
    if (visibilityFilter === 'visible' && p.hiddenByAdmin) return false
    const q = query.trim().toLowerCase()
    if (q && !`${p.name} ${p.sku ?? ''} ${p.brand ?? ''}`.toLowerCase().includes(q)) return false
    return true
  })

  // Deep-link from Home "+ Add Product": ?action=new opens the existing
  // admin add flow (no duplicate form). Same pattern as the seller page.
  useEffect(() => {
    if (searchParams.get('action') === 'new' && !showForm) {
      setFormProductId(null)
      setShowForm(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, showForm])

  async function openDetail(p: MarketplaceProduct): Promise<void> {
    setSelected(p)
    setShop(null)
    setImages([])
    setVariants([])
    setAuditEntries([])
    setConfirming(null)
    setActionMsg(null)
    setDetailLoading(true)
    // Admin-owned products are shopless (shop_id NULL) — skip shop fetch.
    // Product audit comes from the migration-010 RPCs (redacted for
    // normal admins, full actor identity only when the database
    // permits it) — never a direct admin_audit_log SELECT.
    const [sRes, iRes, vRes, aRes] = await Promise.all([
      p.shopId ? sellerShopService.getById(p.shopId) : Promise.resolve({ data: null as SellerShop | null, error: null }),
      sellerProductsService.listImages(p.id),
      sellerProductsService.listVariants(p.id),
      getProductAudit(p.id),
    ])
    setShop(sRes.data)
    setImages(iRes.data ?? [])
    setVariants(vRes.data ?? [])
    setAuditEntries(aRes.data ?? [])
    setDetailLoading(false)
  }

  /** Deactivate: approved -> inactive (trigger-permitted direct step). */
  async function handleDeactivateProduct(p: MarketplaceProduct): Promise<void> {
    setActing(true)
    setActionMsg(null)
    const { error: err } = await sellerProductsService.adminSetStatus(p.id, 'inactive')
    setActing(false)
    if (err) {
      setActionMsg(err.message)
      return
    }
    setActionMsg('Product deactivated (unlisted). Use Activate to bring it back through review.')
    setLoading(true)
    setReloadKey((k) => k + 1)
    setSelected(null)
  }

  /**
   * Activate: inactive -> draft -> pending_review (direct steps) then the
   * audited approve RPC. Each step is individually authorized; any failure
   * stops the chain with the product left in a safe intermediate state.
   */
  async function handleActivateProduct(p: MarketplaceProduct): Promise<void> {
    setActing(true)
    setActionMsg(null)
    const step1 = await sellerProductsService.adminSetStatus(p.id, 'draft')
    if (step1.error) {
      setActing(false)
      setActionMsg(step1.error.message)
      return
    }
    const step2 = await sellerProductsService.adminSetStatus(p.id, 'pending_review')
    if (step2.error) {
      setActing(false)
      setActionMsg(`Moved to draft, but review submission failed: ${step2.error.message}`)
      setLoading(true)
      setReloadKey((k) => k + 1)
      setSelected(null)
      return
    }
    const { error: err } = await sellerProductsService.moderate(p.id, 'approved', '')
    setActing(false)
    if (err) {
      setActionMsg(`In review queue, but approval failed: ${err.message}`)
    } else {
      setActionMsg(null)
    }
    setLoading(true)
    setReloadKey((k) => k + 1)
    setSelected(null)
  }

  /**
   * Hide / restore via the audited SECURITY DEFINER RPCs. Ownership
   * columns are never touched — the RPCs only flip hidden_by_admin /
   * hidden_at and append an audit row.
   */
  async function handleHideProduct(p: MarketplaceProduct): Promise<void> {
    setActing(true)
    setActionMsg(null)
    const { error: err } = await adminProductsService.hideProduct(p.id)
    setActing(false)
    if (err) {
      setActionMsg(err.message)
      return
    }
    setSelected({ ...p, hiddenByAdmin: true, hiddenAt: new Date().toISOString() })
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  async function handleRestoreProduct(p: MarketplaceProduct): Promise<void> {
    setActing(true)
    setActionMsg(null)
    const { error: err } = await adminProductsService.restoreProduct(p.id)
    setActing(false)
    if (err) {
      setActionMsg(err.message)
      return
    }
    setSelected({ ...p, hiddenByAdmin: false, hiddenAt: null })
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  return (
    <div className="container-shop py-8 sm:py-10">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800 mb-5">
        <ArrowLeft className="h-4 w-4" />
        Back to Admin Dashboard
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Product Catalog</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Inspect, curate, and moderate the seller catalog. Approvals and rejections run only through the audited moderation workflow.
          </p>
        </div>
        <Button type="button" variant="secondary" size="md" onClick={() => { setFormProductId(null); setShowForm(true) }}>
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      {showForm && (
        <AdminProductForm
          key={formProductId ?? 'new'}
          categories={dbCategories}
          sellers={sellers}
          initial={formProductId ? (products.find((p) => p.id === formProductId) ?? null) : null}
          onClose={() => { setShowForm(false); setFormProductId(null) }}
          onSaved={() => { setShowForm(false); setFormProductId(null); setLoading(true); setReloadKey((k) => k + 1) }}
        />
      )}

      <div className="card-premium p-4 mb-5 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, SKU, brand…"
            aria-label="Search products"
            className="w-full rounded-xl border border-neutral-300 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all placeholder:text-neutral-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-medium text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 cursor-pointer"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.replace('_', ' ')}</option>
          ))}
        </select>
        <select
          value={ownershipFilter}
          onChange={(e) => setOwnershipFilter(e.target.value)}
          aria-label="Filter by ownership"
          className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-medium text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 cursor-pointer"
        >
          <option value="all">All products</option>
          <option value="admin">Admin products</option>
          <option value="seller">Seller products</option>
        </select>
        <select
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value)}
          aria-label="Filter by visibility"
          className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-medium text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 cursor-pointer"
        >
          <option value="all">Hidden/visible</option>
          <option value="visible">Visible only</option>
          <option value="hidden">Hidden only</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
          className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-medium text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 cursor-pointer"
        >
          <option value="all">All categories</option>
          {dbCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={sellerFilter}
          onChange={(e) => setSellerFilter(e.target.value)}
          aria-label="Filter by seller"
          className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-medium text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 cursor-pointer"
        >
          <option value="all">All sellers</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>{s.name ?? s.email ?? s.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>

      {loading && <LoadingState message="Loading catalog…" />}
      {!loading && error && (
        <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
          <div className="lg:col-span-2 card-premium p-3 sm:p-4 space-y-2 max-h-[70vh] overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-sm text-neutral-500 text-center py-8">No products match these filters.</p>
            )}
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void openDetail(p)}
                className={`w-full text-left rounded-xl border p-4 transition-all cursor-pointer ${
                  selected?.id === p.id
                    ? 'border-primary-500 bg-primary-50/60 ring-1 ring-primary-500'
                    : 'border-neutral-200 hover:border-navy-200 hover:bg-neutral-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-navy-900 text-sm truncate">{p.name}</p>
                  {statusBadge(p.status)}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {ownershipBadge(p.ownerType)}
                  {visibilityBadge(p.hiddenByAdmin)}
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {formatBDT(p.price)} · Stock {p.stockQuantity} · {categoryName(p.categoryId)}
                </p>
              </button>
            ))}
          </div>

          <div className="lg:col-span-3 card-premium p-5 sm:p-6">
            {!selected && (
              <EmptyState
                title="Select a product"
                message="Choose a product to inspect seller, shop, pricing, stock, images, and variants."
              />
            )}
            {selected && detailLoading && <LoadingState message="Loading details…" />}
            {selected && !detailLoading && (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-display font-bold text-navy-900">{selected.name}</h2>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      /{selected.slug} · SKU {selected.sku ?? '—'} · {selected.brand ?? 'No brand'}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {ownershipBadge(selected.ownerType)}
                      {statusBadge(selected.status)}
                      {visibilityBadge(selected.hiddenByAdmin)}
                    </div>
                    <p className="text-xs text-neutral-500 mt-2">
                      {selected.ownerType === 'admin' ? (
                        <>Ownership: <span className="font-semibold text-navy-900">Admin Product</span>{' · '}Shop: <span className="font-semibold text-navy-900">—</span></>
                      ) : (
                        <>Seller: <span className="font-semibold text-navy-900">{sellerName(selected.sellerId)}</span>{' · '}Shop: <span className="font-semibold text-navy-900">{shop?.shopName ?? '—'}</span></>
                      )}
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      Category: <span className="font-semibold text-navy-900">{categoryName(selected.categoryId)}</span>
                      {' · '}Visibility: <span className="font-semibold text-navy-900">{selected.hiddenByAdmin ? 'Hidden by Admin' : 'Visible'}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={acting}
                    onClick={() => { setFormProductId(selected.id); setShowForm(true) }}
                  >
                    <Pencil className="h-4 w-4" /> Edit Details
                  </Button>
                  {selected.status === 'approved' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={acting}
                      onClick={() => void handleDeactivateProduct(selected)}
                    >
                      <Power className="h-4 w-4" /> Deactivate
                    </Button>
                  )}
                  {selected.status === 'inactive' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={acting}
                      onClick={() => void handleActivateProduct(selected)}
                    >
                      <Power className="h-4 w-4" /> Activate via Review
                    </Button>
                  )}
                  {!selected.hiddenByAdmin ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={acting}
                      onClick={() => void handleHideProduct(selected)}
                    >
                      <EyeOff className="h-4 w-4" /> Hide Product
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={acting}
                      onClick={() => void handleRestoreProduct(selected)}
                    >
                      <Eye className="h-4 w-4" /> Restore Product
                    </Button>
                  )}
                </div>

                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3">
                    <dt className="text-xs text-neutral-400">Price</dt>
                    <dd className="font-bold text-navy-900">{formatBDT(selected.price)}</dd>
                  </div>
                  <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3">
                    <dt className="text-xs text-neutral-400">Stock</dt>
                    <dd className="font-bold text-navy-900">{selected.stockQuantity}</dd>
                  </div>
                  <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3">
                    <dt className="text-xs text-neutral-400">Category</dt>
                    <dd className="font-bold text-navy-900">{categoryName(selected.categoryId)}</dd>
                  </div>
                  <div className="rounded-xl bg-neutral-50 border border-neutral-200/70 p-3">
                    <dt className="text-xs text-neutral-400">Shop</dt>
                    <dd className="font-bold text-navy-900 truncate">{shop?.shopName ?? '—'}</dd>
                  </div>
                </dl>

                {selected.shortDescription && (
                  <p className="text-sm text-neutral-600 leading-relaxed">{selected.shortDescription}</p>
                )}
                {selected.rejectionReason && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-4">
                    <p className="text-xs font-semibold text-rose-700 mb-1">Rejection reason</p>
                    <p className="text-sm text-rose-800">{selected.rejectionReason}</p>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-semibold text-navy-900 mb-2">Images ({images.length})</h3>
                  {images.length === 0 ? (
                    <p className="text-xs text-neutral-400 mb-2">No images uploaded.</p>
                  ) : (
                    <div className="flex gap-2 flex-wrap mb-3">
                      {images.map((img) => (
                        <div key={img.id} className="relative group">
                          <img src={img.imageUrl} alt={img.altText ?? selected.name} loading="lazy" className="h-16 w-16 rounded-xl object-cover border border-neutral-200" />
                          <button
                            type="button"
                            onClick={() => void sellerProductsService.removeImage(img.id).then((r) => {
                              if (r.error) {
                                setActionMsg(r.error.message)
                                return
                              }
                              setImages((prev) => prev.filter((x) => x.id !== img.id))
                            })}
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-rose-600 text-white text-xs font-bold flex items-center justify-center cursor-pointer shadow-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-600"
                            aria-label="Remove image"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://… image link"
                      aria-label="Image URL"
                      className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void (async () => {
                        const url = imageUrl.trim()
                        if (!url) return
                        setActionMsg(null)
                        const { data, error: err } = await sellerProductsService.addImage(selected.id, url, null, images.length === 0)
                        if (err) {
                          setActionMsg(err.message)
                          return
                        }
                        if (data) setImages((prev) => [...prev, data])
                        setImageUrl('')
                      })()}
                    >
                      Add
                    </Button>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-navy-900 mb-2">Variants ({variants.length})</h3>
                  {variants.length === 0 ? (
                    <p className="text-xs text-neutral-400 mb-2">Simple product — sells from base price and stock.</p>
                  ) : (
                    <ul className="space-y-1.5 mb-2">
                      {variants.map((v) => (
                        <li key={v.id} className="text-xs rounded-lg bg-neutral-50 border border-neutral-200/70 px-3 py-2 flex flex-wrap gap-x-3 items-center">
                          <span className="font-semibold text-navy-900">{v.name}</span>
                          <span className="text-neutral-500">{[v.attributes.size, v.attributes.color].filter(Boolean).join(' · ') || 'standard'}</span>
                          <span className="ml-auto text-neutral-600">
                            {v.priceOverride !== null ? formatBDT(v.priceOverride) : formatBDT(selected.price)} · {v.stockQuantity} pcs
                          </span>
                          <button
                            type="button"
                            onClick={() => void sellerProductsService.removeVariant(v.id).then((r) => {
                              if (r.error) {
                                setActionMsg(r.error.message)
                                return
                              }
                              setVariants((prev) => prev.filter((x) => x.id !== v.id))
                            })}
                            className="text-rose-600 hover:underline font-semibold cursor-pointer"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={variantName}
                      onChange={(e) => setVariantName(e.target.value)}
                      placeholder="Variant name"
                      aria-label="Variant name"
                      className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                    />
                    <input
                      value={variantStock}
                      onChange={(e) => setVariantStock(e.target.value)}
                      placeholder="Stock"
                      aria-label="Variant stock"
                      type="number"
                      min={0}
                      step={1}
                      className="w-24 rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void (async () => {
                        if (!variantName.trim()) {
                          setActionMsg('Variant needs a name.')
                          return
                        }
                        const stock = Number(variantStock)
                        if (!Number.isInteger(stock) || stock < 0) {
                          setActionMsg('Variant stock must be a whole number, 0 or more.')
                          return
                        }
                        setActionMsg(null)
                        const { data, error: err } = await sellerProductsService.addVariant(selected.id, {
                          name: variantName.trim(),
                          size: null,
                          color: null,
                          sku: null,
                          priceOverride: null,
                          stockQuantity: stock,
                        })
                        if (err) {
                          setActionMsg(err.message)
                          return
                        }
                        if (data) setVariants((prev) => [...prev, data])
                        setVariantName('')
                        setVariantStock('0')
                      })()}
                    >
                      Add
                    </Button>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-navy-900 mb-2">
                    Audit Trail {auditEntries.length > 0 && `(${auditEntries.length})`}
                  </h3>
                  {auditEntries.length === 0 ? (
                    <p className="text-xs text-neutral-400">No linked audit entries for this product yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {auditEntries.map((e, i) => (
                        <li key={`${e.action}-${e.createdAt}-${i}`} className="text-xs rounded-lg bg-neutral-50 border border-neutral-200/70 px-3 py-2 flex flex-wrap gap-x-2">
                          <span className="font-mono font-semibold text-navy-900">{e.action}</span>
                          <span className="text-neutral-400">{formatDate(e.createdAt)}</span>
                          <span className="text-neutral-500">{e.actorLabel}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {(selected.status === 'pending_review' || selected.status === 'approved') && (
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4 space-y-3">
                    {confirming === null && (
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        {selected.status === 'pending_review' && (
                          <Button type="button" variant="primary" size="md" className="flex-1" disabled={acting} onClick={() => setConfirming('approve')}>
                            <Check className="h-4 w-4" /> Approve Product
                          </Button>
                        )}
                        <Button type="button" variant="danger" size="md" className="flex-1" disabled={acting} onClick={() => setConfirming('reject')}>
                          <X className="h-4 w-4" /> Reject
                        </Button>
                      </div>
                    )}
                    {confirming === 'approve' && (
                      <div className="space-y-3">
                        <p className="text-sm text-navy-900">Approve <strong>{selected.name}</strong>? It becomes publicly visible immediately.</p>
                        <div className="flex gap-2.5">
                          <Button type="button" variant="primary" size="md" className="flex-1" disabled={acting} onClick={() => void (async () => {
                            setActing(true)
                            setActionMsg(null)
                            const { error: err } = await sellerProductsService.moderate(selected.id, 'approved', '')
                            setActing(false)
                            if (err) {
                              setActionMsg(err.message)
                              return
                            }
                            setConfirming(null)
                            setLoading(true)
                            setReloadKey((k) => k + 1)
                            setSelected(null)
                          })()}>
                            {acting ? 'Approving…' : 'Confirm Approval'}
                          </Button>
                          <Button type="button" variant="outline" size="md" disabled={acting} onClick={() => setConfirming(null)}>Cancel</Button>
                        </div>
                      </div>
                    )}
                    {confirming === 'reject' && (
                      <ModerateRejectBox
                        productName={selected.name}
                        acting={acting}
                        onCancel={() => setConfirming(null)}
                        onConfirm={(reason) => void (async () => {
                          setActing(true)
                          setActionMsg(null)
                          const { error: err } = await sellerProductsService.moderate(selected.id, 'rejected', reason)
                          setActing(false)
                          if (err) {
                            setActionMsg(err.message)
                            return
                          }
                          setConfirming(null)
                          setLoading(true)
                          setReloadKey((k) => k + 1)
                          setSelected(null)
                        })()}
                      />
                    )}
                    {actionMsg && (
                      <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">{actionMsg}</p>
                    )}
                    <p className="text-[11px] text-neutral-400">Moderation runs as an audited database workflow. No direct privileged writes from this page.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const adminInputClass =
  'w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 bg-white transition-all placeholder:text-neutral-400'

function slugifyAdmin(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
  return `${base || 'product'}-${Date.now().toString(36)}`
}

/**
 * Admin product create/edit form. Creation supports two Migration 009
 * paths: admin-owned (owner_type 'admin', shopless, owned by the calling
 * admin — never a fake seller) or seller-owned (explicit verified seller
 * + their shop). Edits never touch owner_type/seller_id/shop_id —
 * updateBasics excludes them and the trigger rejects them regardless.
 */
function AdminProductForm({ categories, sellers, initial, onClose, onSaved }: {
  categories: MarketplaceCategory[]
  sellers: SellerDirectoryEntry[]
  initial: MarketplaceProduct | null
  onClose: () => void
  onSaved: () => void
}): React.ReactNode {
  const isEdit = initial !== null
  const [ownership, setOwnership] = useState<'admin' | 'seller'>('seller')
  const [sellerId, setSellerId] = useState(initial?.sellerId ?? '')
  // Per-admin code for the seller-bound path: held only for the
  // submit call below, cleared immediately afterwards either way.
  const [adminCode, setAdminCode] = useState('')
  const [shopId, setShopId] = useState(initial?.shopId ?? '')
  const [shopNote, setShopNote] = useState<string | null>(null)
  const [name, setName] = useState(initial?.name ?? '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [price, setPrice] = useState(initial ? String(initial.price) : '')
  const [stock, setStock] = useState(initial ? String(initial.stockQuantity) : '10')
  const [compareAt, setCompareAt] = useState(initial?.compareAtPrice !== null && initial?.compareAtPrice !== undefined ? String(initial.compareAtPrice) : '')
  const [discount, setDiscount] = useState(initial?.discountPrice !== null && initial?.discountPrice !== undefined ? String(initial.discountPrice) : '')
  const [sku, setSku] = useState(initial?.sku ?? '')
  const [brand, setBrand] = useState(initial?.brand ?? '')
  const [shortDesc, setShortDesc] = useState(initial?.shortDescription ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [isActive, setIsActive] = useState(initial ? initial.isActive : true)
  const [status, setStatus] = useState<'draft' | 'pending_review' | 'approved'>('draft')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSellerChange(id: string): Promise<void> {
    setSellerId(id)
    setShopId('')
    setShopNote(null)
    if (!id) return
    const { data, error } = await sellerShopService.getShopBySeller(id)
    if (error || !data) {
      setShopNote('This seller has no shop yet — products require one.')
      return
    }
    setShopId(data.id)
    setShopNote(`Shop: ${data.shopName}`)
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setFormError(null)
    const parsedPrice = Number(price)
    const parsedStock = Number(stock)
    const parsedCompare = compareAt.trim() === '' ? null : Number(compareAt)
    const parsedDiscount = discount.trim() === '' ? null : Number(discount)
    if (name.trim().length < 3 || name.trim().length > 200) {
      setFormError('Product name must be 3–200 characters.')
      return
    }
    if (!categoryId) {
      setFormError('Choose a category.')
      return
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setFormError('Price must be 0 or more.')
      return
    }
    if (!Number.isInteger(parsedStock) || parsedStock < 0) {
      setFormError('Stock must be a whole number, 0 or more.')
      return
    }
    if (parsedCompare !== null && (!Number.isFinite(parsedCompare) || parsedCompare < 0)) {
      setFormError('Compare price must be 0 or more.')
      return
    }
    if (parsedDiscount !== null && (!Number.isFinite(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > parsedPrice)) {
      setFormError('Discount price must be between 0 and the selling price.')
      return
    }
    setSaving(true)
    try {
      if (isEdit && initial) {
        const { error: err } = await sellerProductsService.updateBasics(initial.id, {
          categoryId,
          name: name.trim(),
          shortDescription: shortDesc.trim() ? shortDesc.trim() : null,
          description: description.trim() ? description.trim() : null,
          sku: sku.trim() ? sku.trim() : null,
          price: parsedPrice,
          compareAtPrice: parsedCompare,
          discountPrice: parsedDiscount,
          stockQuantity: parsedStock,
          brand: brand.trim() ? brand.trim() : null,
          isActive,
        })
        if (err) {
          setFormError(err.message)
          return
        }
      } else {
        if (ownership === 'admin') {
          const { error: err } = await sellerProductsService.adminCreateAdminOwned({
            categoryId,
            name: name.trim(),
            slug: slugifyAdmin(name),
            shortDescription: shortDesc.trim() ? shortDesc.trim() : null,
            description: description.trim() ? description.trim() : null,
            sku: sku.trim() ? sku.trim() : null,
            price: parsedPrice,
            compareAtPrice: parsedCompare,
            discountPrice: parsedDiscount,
            stockQuantity: parsedStock,
            brand: brand.trim() ? brand.trim() : null,
            status,
          })
          if (err) {
            setFormError(err.message)
            return
          }
          onSaved()
          return
        }
        if (!sellerId) {
          setFormError('Select the owning seller first.')
          return
        }
        if (!shopId) {
          setFormError('The selected seller has no shop — products require one.')
          return
        }
        if (!adminCode) {
          setFormError('Enter your Admin Code to create a seller-bound product.')
          return
        }
        // Seller-bound creation goes ONLY through the code-gated RPC:
        // ownership, actor, slug, and audit are all derived server-side.
        // No direct-INSERT fallback exists (retired with migration 010).
        const code = adminCode
        setAdminCode('')
        const { error: err } = await createSellerProduct({
          targetSellerId: sellerId,
          shopId,
          categoryId,
          name: name.trim(),
          shortDescription: shortDesc.trim() ? shortDesc.trim() : null,
          description: description.trim() ? description.trim() : null,
          sku: sku.trim() ? sku.trim() : null,
          price: parsedPrice,
          compareAtPrice: parsedCompare,
          discountPrice: parsedDiscount,
          stockQuantity: parsedStock,
          brand: brand.trim() ? brand.trim() : null,
          status,
          adminCode: code,
        })
        if (err) {
          setFormError(err.message)
          return
        }
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="card-premium p-5 sm:p-6 space-y-4 mb-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-lg text-navy-900">
          {isEdit ? 'Edit Product (admin)' : 'Add Product (admin)'}
        </h2>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 cursor-pointer" aria-label="Close product form">
          <X className="h-5 w-5" />
        </button>
      </div>
      {!isEdit && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2.5 rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm cursor-pointer has-checked:border-primary-500 has-checked:bg-primary-50/50">
              <input
                type="radio"
                name="ap-ownership"
                value="seller"
                checked={ownership === 'seller'}
                onChange={() => setOwnership('seller')}
                className="h-4 w-4 accent-primary-600 cursor-pointer"
              />
              <span><span className="font-semibold text-navy-900">Seller Product</span> <span className="text-neutral-500">— owned by a verified seller shop</span></span>
            </label>
            <label className="flex items-center gap-2.5 rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm cursor-pointer has-checked:border-primary-500 has-checked:bg-primary-50/50">
              <input
                type="radio"
                name="ap-ownership"
                value="admin"
                checked={ownership === 'admin'}
                onChange={() => setOwnership('admin')}
                className="h-4 w-4 accent-primary-600 cursor-pointer"
              />
              <span><span className="font-semibold text-navy-900">Admin Product</span> <span className="text-neutral-500">— owned by you, no shop</span></span>
            </label>
          </div>
          {ownership === 'seller' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ap-seller" className="block text-sm font-semibold text-navy-900 mb-1.5">Owning Seller <span className="text-rose-600">*</span></label>
            <select id="ap-seller" value={sellerId} onChange={(e) => void handleSellerChange(e.target.value)} className={`${adminInputClass} cursor-pointer`}>
              <option value="">Select verified seller</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>{s.name ?? s.email ?? s.id.slice(0, 8)}</option>
              ))}
            </select>
            {shopNote && <p className="text-[11px] text-neutral-500 mt-1">{shopNote}</p>}
          </div>
          <div>
            <label htmlFor="ap-status" className="block text-sm font-semibold text-navy-900 mb-1.5">Initial Status</label>
            <select id="ap-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={`${adminInputClass} cursor-pointer`}>
              <option value="draft">Draft</option>
              <option value="pending_review">Pending Review</option>
              <option value="approved">Approved (live immediately)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="ap-code" className="block text-sm font-semibold text-navy-900 mb-1.5">Your Admin Code <span className="text-rose-600">*</span></label>
            <input
              id="ap-code"
              type="password"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
              placeholder="Required to create seller-bound products"
              autoComplete="new-password"
              maxLength={256}
              className={adminInputClass}
            />
            <p className="text-[11px] text-neutral-400 mt-1">Verified server-side. Never stored, logged, or shown again.</p>
          </div>
        </div>
          )}
          {ownership === 'admin' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 rounded-xl bg-primary-50/60 border border-primary-100 px-4 py-3 text-xs text-primary-900">
            This product will be owned by your admin account (Admin Product) with no shop. Seller and shop assignment are not needed.
          </div>
          <div>
            <label htmlFor="ap-status-admin" className="block text-sm font-semibold text-navy-900 mb-1.5">Initial Status</label>
            <select id="ap-status-admin" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={`${adminInputClass} cursor-pointer`}>
              <option value="draft">Draft</option>
              <option value="pending_review">Pending Review</option>
              <option value="approved">Approved (live immediately)</option>
            </select>
          </div>
        </div>
          )}
        </>
      )}
      {isEdit && initial && (
        <div className="flex flex-wrap items-center gap-1.5">
          {ownershipBadge(initial.ownerType)}
          {initial.hiddenByAdmin && visibilityBadge(true)}
          <span className="text-[11px] text-neutral-400">Ownership never changes when an admin manages a product.</span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label htmlFor="ap-name" className="block text-sm font-semibold text-navy-900 mb-1.5">Product Name <span className="text-rose-600">*</span></label>
          <input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="e.g. Premium Cotton Panjabi" className={adminInputClass} />
        </div>
        <div>
          <label htmlFor="ap-cat" className="block text-sm font-semibold text-navy-900 mb-1.5">Category <span className="text-rose-600">*</span></label>
          <select id="ap-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${adminInputClass} cursor-pointer`}>
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ap-brand" className="block text-sm font-semibold text-navy-900 mb-1.5">Brand <span className="text-neutral-400 font-normal">(optional)</span></label>
          <input id="ap-brand" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={100} className={adminInputClass} />
        </div>
        <div>
          <label htmlFor="ap-price" className="block text-sm font-semibold text-navy-900 mb-1.5">Price (৳) <span className="text-rose-600">*</span></label>
          <input id="ap-price" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={adminInputClass} />
        </div>
        <div>
          <label htmlFor="ap-stock" className="block text-sm font-semibold text-navy-900 mb-1.5">Stock <span className="text-rose-600">*</span></label>
          <input id="ap-stock" type="number" min={0} step={1} value={stock} onChange={(e) => setStock(e.target.value)} className={adminInputClass} />
        </div>
        <div>
          <label htmlFor="ap-compare" className="block text-sm font-semibold text-navy-900 mb-1.5">Compare-at Price <span className="text-neutral-400 font-normal">(optional)</span></label>
          <input id="ap-compare" type="number" min={0} step="0.01" value={compareAt} onChange={(e) => setCompareAt(e.target.value)} className={adminInputClass} />
        </div>
        <div>
          <label htmlFor="ap-discount" className="block text-sm font-semibold text-navy-900 mb-1.5">Discount Price <span className="text-neutral-400 font-normal">(optional)</span></label>
          <input id="ap-discount" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className={adminInputClass} />
        </div>
        <div>
          <label htmlFor="ap-sku" className="block text-sm font-semibold text-navy-900 mb-1.5">SKU <span className="text-neutral-400 font-normal">(optional)</span></label>
          <input id="ap-sku" value={sku} onChange={(e) => setSku(e.target.value)} maxLength={100} className={adminInputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ap-short" className="block text-sm font-semibold text-navy-900 mb-1.5">Short Description <span className="text-neutral-400 font-normal">(optional)</span></label>
          <input id="ap-short" value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} maxLength={500} className={adminInputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ap-desc" className="block text-sm font-semibold text-navy-900 mb-1.5">Full Description <span className="text-neutral-400 font-normal">(optional)</span></label>
          <textarea id="ap-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={10000} className={`${adminInputClass} resize-y`} />
        </div>
        {isEdit && (
          <label className="flex items-center gap-2.5 text-sm font-medium text-navy-900 cursor-pointer sm:col-span-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 accent-primary-600 cursor-pointer"
            />
            Visible in marketplace (uncheck to hide without changing moderation status)
          </label>
        )}
      </div>
      {formError && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">{formError}</div>
      )}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <Button type="submit" variant="secondary" size="md" className="flex-1" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Product'}
        </Button>
        <Button type="button" variant="outline" size="md" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] text-neutral-400">
        Ownership, approval, and featured placement stay database-controlled: new products enter the chosen safe
        status, and approval remains a separate audited moderation action.
      </p>
    </form>
  )
}

function ModerateRejectBox({ productName, acting, onCancel, onConfirm }: {
  productName: string
  acting: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}): React.ReactNode {
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  return (
    <div className="space-y-3">
      <p className="text-sm text-navy-900">
        Reject <strong>{productName}</strong>? The seller will see your reason.
      </p>
      <label htmlFor="mod-reject-reason" className="block text-sm font-semibold text-navy-900">
        Rejection reason <span className="text-rose-600">*</span>
      </label>
      <textarea
        id="mod-reject-reason"
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Blurry images, please re-upload…"
        maxLength={2000}
        className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 bg-white resize-y"
      />
      {localError && <p className="text-xs text-rose-600">{localError}</p>}
      <div className="flex gap-2.5">
        <Button
          type="button"
          variant="danger"
          size="md"
          className="flex-1"
          disabled={acting}
          onClick={() => {
            if (!reason.trim()) {
              setLocalError('Please enter a rejection reason first.')
              return
            }
            setLocalError(null)
            onConfirm(reason.trim())
          }}
        >
          {acting ? 'Rejecting…' : 'Confirm Rejection'}
        </Button>
        <Button type="button" variant="outline" size="md" disabled={acting} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
