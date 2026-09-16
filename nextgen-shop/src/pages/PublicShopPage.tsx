import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Store, ArrowLeft } from 'lucide-react'
import { sellerShopService } from '@/services/sellerShop'
import { catalogService } from '@/services/catalog'
import { formatBDT } from '@/lib/utils'
import { LoadingState, EmptyState } from '@/components/seller/SellerWidgets'
import type { MarketplaceProduct, MarketplaceProductImage, SellerShop } from '@/types'

export const PublicShopPage: React.FC = () => {
  const { shopSlug } = useParams<{ shopSlug: string }>()
  const [shop, setShop] = useState<SellerShop | null>(null)
  const [products, setProducts] = useState<MarketplaceProduct[]>([])
  const [primaryImages, setPrimaryImages] = useState<Record<string, MarketplaceProductImage>>({})
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!shopSlug) return
    let active = true
    void (async () => {
      setLoading(true)
      const shopRes = await sellerShopService.getBySlug(shopSlug)
      if (!active) return
      if (!shopRes.data) {
        setMissing(true)
        setLoading(false)
        return
      }
      setShop(shopRes.data)
      const prodRes = await catalogService.listShopProducts({ shopId: shopRes.data.id, limit: 48 })
      if (!active) return
      const list = prodRes.data ?? []
      setProducts(list)
      const imgRes = await catalogService.mapPrimaryImages(list.map((p) => p.id))
      if (!active) return
      setPrimaryImages(imgRes.data)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [shopSlug])

  if (loading) {
    return (
      <div className="container-shop py-10">
        <LoadingState message="Opening shop…" />
      </div>
    )
  }

  if (missing || !shop) {
    return (
      <div className="container-shop py-10">
        <div className="max-w-md mx-auto card-premium p-8 text-center space-y-4">
          <h1 className="text-xl font-display font-bold text-navy-900">Shop not found</h1>
          <p className="text-sm text-neutral-500">This shop doesn&apos;t exist or isn&apos;t public.</p>
          <Link to="/shop" className="inline-block text-sm font-semibold text-primary-700 hover:underline">
            <span className="inline-flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back to Shop
            </span>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Shop header */}
      <section className="bg-navy-950 text-white overflow-hidden">
        <div className="container-shop py-10 sm:py-14">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            {shop.logoUrl ? (
              <img src={shop.logoUrl} alt={`${shop.shopName} logo`} className="h-20 w-20 rounded-3xl object-cover border border-white/20 bg-white" />
            ) : (
              <div className="h-20 w-20 rounded-3xl bg-primary-600 flex items-center justify-center shrink-0">
                <Store className="h-10 w-10 text-white" />
              </div>
            )}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary-300">Verified Seller Shop</p>
              <h1 className="text-3xl sm:text-4xl font-display font-bold text-white mt-1">{shop.shopName}</h1>
              {shop.description && (
                <p className="text-sm text-navy-200 mt-2 max-w-xl leading-relaxed">{shop.description}</p>
              )}
              <p className="text-xs text-navy-300 mt-2">
                {products.length} product{products.length === 1 ? '' : 's'} · Cash on Delivery available
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Approved + visible products only (RLS guarantees visibility set) */}
      <section className="py-10 sm:py-14">
        <div className="container-shop">
          <h2 className="text-xl sm:text-2xl font-display font-bold text-navy-900 mb-6">
            Products by {shop.shopName}
          </h2>
          {products.length === 0 ? (
            <EmptyState
              title="No products yet"
              message="This shop hasn't published any approved products. Check back soon."
              actionLabel="Browse the marketplace"
              actionTo="/shop"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
              {products.map((p) => (
                <article key={p.id} className="group card-premium overflow-hidden hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200">
                  <div className="aspect-square bg-neutral-100 flex items-center justify-center overflow-hidden">
                    {primaryImages[p.id] ? (
                      <img src={primaryImages[p.id].imageUrl} alt={primaryImages[p.id].altText ?? p.name} loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <Store className="h-10 w-10 text-neutral-300" />
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">{shop.shopName}</p>
                    <h3 className="mt-1 text-sm font-semibold text-navy-900 line-clamp-1">{p.name}</h3>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-base font-bold text-navy-900">{formatBDT(p.price)}</span>
                      {p.compareAtPrice !== null && p.compareAtPrice > p.price && (
                        <span className="text-xs text-neutral-400 line-through">{formatBDT(p.compareAtPrice)}</span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] font-medium text-emerald-600">
                      {p.stockQuantity > 0 ? `In Stock (${p.stockQuantity})` : 'Out of Stock'}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="text-[11px] text-neutral-400 mt-6">
            Only approved, active, visible products appear here. Drafts, rejected, inactive and hidden items are never public.
          </p>
        </div>
      </section>
    </div>
  )
}
