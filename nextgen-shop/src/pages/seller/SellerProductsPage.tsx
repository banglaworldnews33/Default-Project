import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, Plus, Pencil, Send, EyeOff, ImagePlus, Layers, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { sellerProductsService, type ProductInput } from '@/services/sellerProducts'
import { sellerShopService } from '@/services/sellerShop'
import { categoriesService } from '@/services/categories'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ImageUploader } from '@/components/seller/ImageUploader'
import { ProductForm, EMPTY_PRODUCT_FORM, type ProductFormInitial } from '@/components/seller/ProductForm'
import {
  deleteProductImage,
  persistProductImage,
  type ValidatedAsset,
} from '@/services/mediaUpload'
import { EmptyState, LoadingState, ErrorState } from '@/components/seller/SellerWidgets'
import { formatBDT } from '@/lib/utils'
import type {
  MarketplaceCategory,
  MarketplaceProduct,
  MarketplaceProductImage,
  MarketplaceProductVariant,
  SellerShop,
} from '@/types'

function statusBadge(status: MarketplaceProduct['status']): React.ReactNode {
  if (status === 'approved') return <Badge variant="success">Approved</Badge>
  if (status === 'rejected') return <Badge variant="danger">Rejected</Badge>
  if (status === 'pending_review') return <Badge variant="accent">In Review</Badge>
  if (status === 'inactive') return <Badge variant="muted">Inactive</Badge>
  return <Badge variant="muted">Draft</Badge>
}

export const SellerProductsPage: React.FC = () => {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [products, setProducts] = useState<MarketplaceProduct[]>([])
  const [shop, setShop] = useState<SellerShop | null>(null)
  const [dbCategories, setDbCategories] = useState<MarketplaceCategory[]>([])
  const [categoriesBlocked, setCategoriesBlocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  // Generic admin-origin flags by product id (secure RPC; no identity).
  const [adminFlags, setAdminFlags] = useState<Record<string, boolean>>({})
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<MarketplaceProduct | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [images, setImages] = useState<MarketplaceProductImage[]>([])
  const [variants, setVariants] = useState<MarketplaceProductVariant[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [variantName, setVariantName] = useState('')
  const [variantSize, setVariantSize] = useState('')
  const [variantColor, setVariantColor] = useState('')
  const [variantPrice, setVariantPrice] = useState('')
  const [variantStock, setVariantStock] = useState('0')

  const reload = useCallback(async () => {
    const [pRes, sRes, cRes, fRes] = await Promise.all([
      sellerProductsService.listMine(),
      sellerShopService.getMine(),
      categoriesService.listActive(),
      sellerProductsService.listOwnProductFlags(),
    ])
    if (pRes.error) {
      setError(pRes.error.message)
      setProducts([])
    } else {
      setError(null)
      setProducts(pRes.data ?? [])
    }
    // Flag fetch failure must never block management: badges simply hide.
    setAdminFlags(fRes.data ?? {})
    setShop(sRes.data)
    setDbCategories(cRes.data ?? [])
    // Every product requires a category. If the catalog has none (or the
    // fetch failed), submission can never validate — surface that openly
    // instead of failing silently on "Choose a category."
    setCategoriesBlocked(!!cRes.error || (cRes.data ?? []).length === 0)
  }, [])

  useEffect(() => {
    if (!user) return
    let active = true
    void (async () => {
      setLoading(true)
      await reload()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [user, reload, reloadKey])

  useEffect(() => {
    if (searchParams.get('action') === 'new' && !formOpen) {
      openCreate()
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, formOpen, setSearchParams])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (q && !`${p.name} ${p.sku ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [products, query, statusFilter])

  function openCreate(): void {
    setEditing(null)
    setActionMsg(null)
    setFormOpen(true)
  }

  function openEdit(p: MarketplaceProduct): void {
    if (p.status === 'approved') {
      setActionMsg('Live products must be deactivated before editing — this keeps the marketplace catalog trustworthy.')
      return
    }
    setEditing(p)
    setActionMsg(null)
    setFormOpen(true)
  }

  function editingInitial(): ProductFormInitial {
    const p = editing
    if (!p) return EMPTY_PRODUCT_FORM
    return {
      name: p.name,
      categoryId: p.categoryId,
      shortDescription: p.shortDescription ?? '',
      description: p.description ?? '',
      sku: p.sku ?? '',
      price: String(p.price),
      compareAtPrice: p.compareAtPrice !== null ? String(p.compareAtPrice) : '',
      discountPrice: p.discountPrice !== null ? String(p.discountPrice) : '',
      stockQuantity: String(p.stockQuantity),
      brand: p.brand ?? '',
    }
  }

  async function handleFormSubmit(input: Omit<ProductInput, 'shopId'>): Promise<string | null> {
    if (!shop) {
      return 'Create your shop first (My Shop page), then add products to it.'
    }
    if (categoriesBlocked) {
      return 'No categories exist yet — ask an administrator to create them before submitting products.'
    }
    if (editing) {
      // Slug is intentionally excluded: shop/product URLs are immutable.
      const { error: err } = await sellerProductsService.updateBasics(editing.id, {
        categoryId: input.categoryId,
        name: input.name,
        shortDescription: input.shortDescription,
        description: input.description,
        sku: input.sku,
        price: input.price,
        compareAtPrice: input.compareAtPrice,
        discountPrice: input.discountPrice,
        stockQuantity: input.stockQuantity,
        brand: input.brand,
      })
      if (err) return err.message
      return null
    }
    const { error: err } = await sellerProductsService.create({ ...input, shopId: shop.id })
    if (err) return err.message
    return null
  }

  function handleFormSuccess(): void {
    setFormOpen(false)
    setEditing(null)
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  async function handleSubmitReview(id: string): Promise<void> {
    setActionMsg(null)
    const { error: err } = await sellerProductsService.submitForReview(id)
    if (err) {
      setActionMsg(err.message)
      return
    }
    setActionMsg('Submitted for review. Our team will approve or reject it shortly.')
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  async function handleDeactivate(id: string): Promise<void> {
    setActionMsg(null)
    const { error: err } = await sellerProductsService.deactivate(id)
    if (err) {
      setActionMsg(err.message)
      return
    }
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  async function toggleExpand(p: MarketplaceProduct): Promise<void> {
    if (expandedId === p.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(p.id)
    setDetailLoading(true)
    const [iRes, vRes] = await Promise.all([
      sellerProductsService.listImages(p.id),
      sellerProductsService.listVariants(p.id),
    ])
    setImages(iRes.data ?? [])
    setVariants(vRes.data ?? [])
    setDetailLoading(false)
  }

  async function handleAddImage(productId: string): Promise<void> {
    const url = imageUrl.trim()
    if (!url) return
    setActionMsg(null)
    const existing = images.filter((i) => i.productId === productId)
    const { data, error: err } = await sellerProductsService.addImage(
      productId,
      url,
      null,
      existing.length === 0,
    )
    if (err) {
      setActionMsg(err.message)
      return
    }
    if (data) setImages((prev) => [...prev, data])
    setImageUrl('')
  }

  /** Persist an uploaded Cloudinary asset as a product image row. */
  async function handleUploadedImage(productId: string, asset: ValidatedAsset): Promise<void> {
    setActionMsg(null)
    const existing = images.filter((i) => i.productId === productId)
    const { error: err } = await persistProductImage(productId, asset, null, existing.length === 0)
    if (err) {
      setActionMsg(err.message)
      return
    }
    const { data } = await sellerProductsService.listImages(productId)
    setImages(data ?? [])
  }

  /** Delete via the secure endpoint for cloud assets, direct row delete for legacy URLs. */
  async function handleRemoveImage(img: MarketplaceProductImage): Promise<void> {
    setActionMsg(null)
    if (img.cloudinaryPublicId) {
      const { error: err } = await deleteProductImage(img.id)
      if (err) {
        setActionMsg(err.message)
        return
      }
    } else {
      const { error: err } = await sellerProductsService.removeImage(img.id)
      if (err) {
        setActionMsg(err.message)
        return
      }
    }
    setImages((prev) => prev.filter((x) => x.id !== img.id))
  }

  async function handleAddVariant(productId: string): Promise<void> {
    if (!variantName.trim()) {
      setActionMsg('Variant needs a name (e.g. “Large / Red”).')
      return
    }
    const stock = Number(variantStock)
    const priceOverride = variantPrice.trim() === '' ? null : Number(variantPrice)
    if (!Number.isInteger(stock) || stock < 0) {
      setActionMsg('Variant stock must be a whole number, 0 or more.')
      return
    }
    if (priceOverride !== null && (!Number.isFinite(priceOverride) || priceOverride < 0)) {
      setActionMsg('Variant price override must be 0 or more.')
      return
    }
    setActionMsg(null)
    const { data, error: err } = await sellerProductsService.addVariant(productId, {
      name: variantName.trim(),
      size: variantSize.trim() ? variantSize.trim() : null,
      color: variantColor.trim() ? variantColor.trim() : null,
      sku: null,
      priceOverride,
      stockQuantity: stock,
    })
    if (err) {
      setActionMsg(err.message)
      return
    }
    if (data) setVariants((prev) => [...prev, data])
    setVariantName('')
    setVariantSize('')
    setVariantColor('')
    setVariantPrice('')
    setVariantStock('0')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Products</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {shop ? `Selling as ${shop.shopName}` : 'Set up your shop first to add products.'}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={openCreate}
          disabled={!shop || categoriesBlocked}
          title={!shop ? 'Create your shop first' : categoriesBlocked ? 'No categories available yet' : 'Add a new product'}
        >
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      {!loading && !shop && (
        <div className="flex items-start gap-3 rounded-2xl bg-primary-50 border border-primary-100 p-4">
          <AlertTriangle className="h-5 w-5 text-primary-600 shrink-0 mt-0.5" />
          <p className="text-xs text-primary-900 leading-relaxed">
            You need a shop before adding products.{' '}
            <Link to="/seller/shop" className="font-semibold underline">
              Create your shop first
            </Link>
            , then come back here.
          </p>
        </div>
      )}

      {!loading && !!shop && categoriesBlocked && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-200 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            No product categories exist yet, so new products cannot be submitted — every product
            requires a category. Please ask an administrator to create categories in the admin
            Categories section. Nothing about your account or permissions is wrong.
          </p>
        </div>
      )}

      {actionMsg && (
        <div className="rounded-xl bg-primary-50 border border-primary-100 text-primary-900 text-sm px-4 py-3">
          {actionMsg}
        </div>
      )}

      {formOpen && (
        <ProductForm
          categories={dbCategories}
          initial={editingInitial()}
          heading={editing ? 'Edit Product' : 'New Product (Draft)'}
          submitLabel={editing ? 'Save Changes' : 'Create Draft'}
          onSubmit={handleFormSubmit}
          onSuccess={handleFormSuccess}
          onCancel={() => { setFormOpen(false); setEditing(null) }}
        />
      )}

      <div className="card-premium p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your products…"
            aria-label="Search your products"
            className="w-full rounded-xl border border-neutral-300 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all placeholder:text-neutral-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-medium text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 cursor-pointer"
        >
          {['all', 'draft', 'pending_review', 'approved', 'rejected', 'inactive'].map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      {loading && <LoadingState message="Loading your products…" />}
      {!loading && error && (
        <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="card-premium p-5 sm:p-6">
          <EmptyState
            title={products.length === 0 ? 'No products yet' : 'No matching products'}
            message={
              products.length === 0
                ? 'Create your first draft above. It stays private until our team approves it for the marketplace.'
                : 'Try a different search term or status filter.'
            }
          />
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((p) => (
            <div key={p.id} className="card-premium p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy-900 truncate">{p.name}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {formatBDT(p.price)} · Stock {p.stockQuantity} · {p.sku ?? 'no SKU'}
                  </p>
                </div>
                {statusBadge(p.status)}
                {adminFlags[p.id] === true && <Badge variant="accent">Added by Admin</Badge>}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" onClick={() => void toggleExpand(p)} className="text-xs font-semibold text-primary-700 hover:underline cursor-pointer px-1 py-1">
                  {expandedId === p.id ? 'Hide details' : 'Images & Variants'}
                </button>
                {p.status !== 'approved' && (
                  <button type="button" onClick={() => openEdit(p)} className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800 hover:underline cursor-pointer px-1 py-1">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
                {(p.status === 'draft' || p.status === 'rejected' || p.status === 'inactive') && (
                  <button type="button" onClick={() => void handleSubmitReview(p.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline cursor-pointer px-1 py-1">
                    <Send className="h-3.5 w-3.5" /> Submit for Review
                  </button>
                )}
                {p.status === 'approved' && (
                  <button type="button" onClick={() => void handleDeactivate(p.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline cursor-pointer px-1 py-1">
                    <EyeOff className="h-3.5 w-3.5" /> Deactivate to Edit
                  </button>
                )}
                {p.status === 'pending_review' && (
                  <span className="text-[11px] text-neutral-400 px-1 py-1">Locked while under review</span>
                )}
              </div>

              {expandedId === p.id && (
                <div className="mt-4 pt-4 border-t border-neutral-100 space-y-5">
                  {detailLoading && <LoadingState message="Loading details…" />}
                  {!detailLoading && (
                    <>
                      <div>
                        <h4 className="text-sm font-semibold text-navy-900 mb-2">Images ({images.length})</h4>
                        {images.length === 0 && (
                          <p className="text-xs text-neutral-400 mb-3">No images yet — paste https:// image links below. File upload arrives with Storage.</p>
                        )}
                        <ul className="space-y-2 mb-3">
                          {images.map((img) => (
                            <li key={img.id} className="flex items-center gap-3 text-xs rounded-xl bg-neutral-50 border border-neutral-200/70 px-3 py-2">
                              <img src={img.imageUrl} alt={img.altText ?? p.name} className="h-10 w-10 rounded-lg object-cover shrink-0" loading="lazy" />
                              <span className="flex-1 truncate text-neutral-600">{img.imageUrl}</span>
                              {img.isPrimary && <span className="font-semibold text-primary-700 shrink-0">Primary</span>}
                              <button
                                type="button"
                                onClick={() => void handleRemoveImage(img)}
                                className="text-rose-600 hover:underline font-semibold shrink-0 cursor-pointer"
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                        <div className="space-y-2.5">
                          <ImageUploader
                            kind="product"
                            productId={p.id}
                            minShortSide={400}
                            label={`Upload image for ${p.name}`}
                            onUploaded={(asset) => void handleUploadedImage(p.id, asset)}
                          />
                          <div className="flex gap-2">
                            <input
                              type="url"
                              value={imageUrl}
                              onChange={(e) => setImageUrl(e.target.value)}
                              placeholder="…or paste https:// image link"
                              aria-label="Image URL"
                              className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                            />
                            <Button type="button" variant="outline" size="sm" onClick={() => void handleAddImage(p.id)}>
                              <ImagePlus className="h-4 w-4" /> Add
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-navy-900 mb-2">Variants ({variants.length})</h4>
                        {variants.length === 0 && (
                          <p className="text-xs text-neutral-400 mb-3">No variants yet. Simple products sell from base price + stock above.</p>
                        )}
                        <ul className="space-y-2 mb-3">
                          {variants.map((v) => (
                            <li key={v.id} className="flex items-center gap-2 text-xs rounded-xl bg-neutral-50 border border-neutral-200/70 px-3 py-2">
                              <Layers className="h-4 w-4 text-neutral-400 shrink-0" />
                              <span className="font-semibold text-navy-900">{v.name}</span>
                              <span className="text-neutral-500 truncate">
                                {[v.attributes.size, v.attributes.color].filter(Boolean).join(' · ') || 'standard'}
                              </span>
                              <span className="ml-auto text-neutral-600 shrink-0">
                                {v.priceOverride !== null ? formatBDT(v.priceOverride) : formatBDT(p.price)} · {v.stockQuantity} pcs
                              </span>
                              <button
                                type="button"
                                onClick={() => void sellerProductsService.removeVariant(v.id).then(() => setVariants((prev) => prev.filter((x) => x.id !== v.id)))}
                                className="text-rose-600 hover:underline font-semibold shrink-0 cursor-pointer"
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                          <input value={variantName} onChange={(e) => setVariantName(e.target.value)} placeholder="Variant name *" aria-label="Variant name" className="col-span-2 rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500" />
                          <input value={variantSize} onChange={(e) => setVariantSize(e.target.value)} placeholder="Size" aria-label="Variant size" className="rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500" />
                          <input value={variantColor} onChange={(e) => setVariantColor(e.target.value)} placeholder="Color" aria-label="Variant color" className="rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500" />
                          <input value={variantPrice} onChange={(e) => setVariantPrice(e.target.value)} placeholder="Price override" aria-label="Variant price override" type="number" min={0} step="0.01" className="rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500" />
                          <input value={variantStock} onChange={(e) => setVariantStock(e.target.value)} placeholder="Stock" aria-label="Variant stock" type="number" min={0} step={1} className="rounded-xl border border-neutral-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500" />
                        </div>
                        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void handleAddVariant(p.id)}>
                          <Plus className="h-4 w-4" /> Add Variant
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
