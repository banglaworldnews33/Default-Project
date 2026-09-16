import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Store } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { catalogService } from '@/services/catalog'
import { sellerShopService } from '@/services/sellerShop'
import { RealProductCard } from '@/components/product/RealProductCard'
import { LoadingState, ErrorState, EmptyState } from '@/components/seller/SellerWidgets'
import { Button } from '@/components/ui/Button'
import type {
  MarketplaceCategory,
  MarketplaceProduct,
  MarketplaceProductImage,
} from '@/types'

/**
 * Live marketplace browser (database products only).
 *
 * Separate from the demo Shop/Category pages: rows arrive through
 * RLS public policies (approved + active + visible), so hidden,
 * draft, rejected, and inactive products can never list here.
 * Reads require a signed-in user (table grants are
 * authenticated-only by design) — guests see a sign-in panel.
 */
export const MarketPage: React.FC = () => {
  const { user, isLoading: authLoading, isConfigured } = useAuth()
  const [products, setProducts] = useState<MarketplaceProduct[]>([])
  const [categories, setCategories] = useState<MarketplaceCategory[]>([])
  const [primaryImages, setPrimaryImages] = useState<Record<string, MarketplaceProductImage>>({})
  const [shopNames, setShopNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [submittedQuery, setSubmittedQuery] = useState('')

  const load = useCallback(async () => {
    const [pRes, cRes] = await Promise.all([
      catalogService.listPublicProducts({
        categoryId: categoryFilter === 'all' ? undefined : categoryFilter,
        search: submittedQuery || undefined,
        limit: 48,
      }),
      catalogService.listActiveCategories(),
    ])
    if (pRes.error) {
      setError(pRes.error.message)
      setProducts([])
      setPrimaryImages({})
      setShopNames({})
      return
    }
    const list = pRes.data ?? []
    setError(null)
    setProducts(list)
    // Batched follow-ups (two rounds total, never per-row awaits).
    const [imgRes] = await Promise.all([
      catalogService.mapPrimaryImages(list.map((p) => p.id)),
    ])
    setPrimaryImages(imgRes.data)
    const shopIds = [...new Set(list.map((p) => p.shopId).filter((id): id is string => id !== null))]
    const names: Record<string, string> = {}
    await Promise.all(
      shopIds.map(async (id) => {
        const res = await sellerShopService.getById(id)
        if (res.data) names[id] = res.data.shopName
      }),
    )
    setShopNames(names)
    setCategories(cRes.data ?? [])
  }, [categoryFilter, submittedQuery])

  useEffect(() => {
    if (!isConfigured || authLoading || !user) return
    let active = true
    void (async () => {
      setLoading(true)
      await load()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [isConfigured, authLoading, user, load, reloadKey])

  if (!isConfigured || (!authLoading && !user)) {
    return (
      <div className="container-shop py-10">
        <div className="max-w-md mx-auto card-premium p-8 text-center space-y-4">
          <Store className="h-10 w-10 text-primary-600 mx-auto" />
          <h1 className="text-xl font-display font-bold text-navy-900">Live Marketplace</h1>
          <p className="text-sm text-neutral-500">
            Real seller and NextGen Shop products live here. Sign in to browse the live catalog —
            the demo shop stays open to everyone.
          </p>
          <Link to="/login?return=/market">
            <Button variant="primary" size="md" className="w-full">
              Sign In to Browse
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="py-10 sm:py-14">
      <div className="container-shop">
        <p className="text-xs font-bold uppercase tracking-widest text-primary-600">Live Catalog</p>
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-navy-900 mt-1">
          Marketplace
        </h1>
        <p className="text-sm text-neutral-500 mt-2 max-w-xl">
          Real products from verified sellers{products.some((p) => p.shopId === null) ? ' and NextGen Shop' : ''}.
          Only publicly visible items appear here.
        </p>

        <form
          className="card-premium p-4 mt-6 flex flex-col sm:flex-row gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            setSubmittedQuery(query.trim())
            setLoading(true)
            setReloadKey((k) => k + 1)
          }}
        >
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search live products…"
              aria-label="Search live products"
              className="w-full rounded-xl border border-neutral-300 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all placeholder:text-neutral-400"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setLoading(true); setReloadKey((k) => k + 1) }}
            aria-label="Filter by category"
            className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-medium text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 cursor-pointer"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </form>

        {loading && <div className="mt-6"><LoadingState message="Loading live products…" /></div>}
        {!loading && error && (
          <div className="mt-6">
            <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />
          </div>
        )}
        {!loading && !error && products.length === 0 && (
          <div className="mt-6 card-premium p-5 sm:p-6">
            <EmptyState
              title="No live products yet"
              message="No publicly visible products match. Approved seller and NextGen Shop products appear here automatically."
            />
          </div>
        )}
        {!loading && !error && products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6 mt-6">
            {products.map((p) => (
              <RealProductCard
                key={p.id}
                product={p}
                image={primaryImages[p.id] ?? null}
                shopName={p.shopId ? (shopNames[p.shopId] ?? null) : null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
