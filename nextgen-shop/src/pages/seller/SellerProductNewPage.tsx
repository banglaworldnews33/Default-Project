import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { sellerProductsService, type ProductInput } from '@/services/sellerProducts'
import { sellerShopService } from '@/services/sellerShop'
import { categoriesService } from '@/services/categories'
import { ProductForm } from '@/components/seller/ProductForm'
import { LoadingState, ErrorState } from '@/components/seller/SellerWidgets'
import type { MarketplaceCategory, SellerShop } from '@/types'

/**
 * Dedicated Add Product page (route: /seller/products/new).
 *
 * Create-only entry point for verified sellers. Uses the same shared
 * ProductForm (same validation, same draft rules) as the products
 * list. Writes go through sellerProductsService — the database
 * remains the final authority on ownership and review lifecycle.
 * Route protection comes from SellerRoute (verified-seller profile),
 * never from client-supplied role values.
 */
export const SellerProductNewPage: React.FC = () => {
  const navigate = useNavigate()
  const [shop, setShop] = useState<SellerShop | null>(null)
  const [dbCategories, setDbCategories] = useState<MarketplaceCategory[]>([])
  const [categoriesBlocked, setCategoriesBlocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      const [sRes, cRes] = await Promise.all([
        sellerShopService.getMine(),
        categoriesService.listActive(),
      ])
      if (!active) return
      if (sRes.error || cRes.error) {
        setError((sRes.error ?? cRes.error)?.message ?? 'Something went wrong. Please try again.')
        setShop(null)
        setDbCategories([])
        setCategoriesBlocked(true)
      } else {
        setError(null)
        setShop(sRes.data)
        setDbCategories(cRes.data ?? [])
        setCategoriesBlocked((cRes.data ?? []).length === 0)
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [reloadKey])

  async function handleSubmit(input: Omit<ProductInput, 'shopId'>): Promise<string | null> {
    if (!shop) {
      return 'Create your shop first (My Shop page), then add products to it.'
    }
    if (categoriesBlocked) {
      return 'No categories exist yet — ask an administrator to create them before submitting products.'
    }
    const { error: err } = await sellerProductsService.create({ ...input, shopId: shop.id })
    if (err) return err.message
    return null
  }

  return (
    <div className="space-y-5">
      <Link to="/seller/products" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800">
        <ArrowLeft className="h-4 w-4" />
        Back to Products
      </Link>

      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Add Product</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {shop ? `New draft for ${shop.shopName}. It stays private until our team approves it.` : 'Create a new product draft.'}
        </p>
      </div>

      {loading && <LoadingState message="Preparing the form…" />}
      {!loading && error && (
        <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />
      )}

      {!loading && !error && !shop && (
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

      {!loading && !error && !!shop && categoriesBlocked && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-200 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            No product categories exist yet, so new products cannot be submitted — every product
            requires a category. Please ask an administrator to create categories in the admin
            Categories section. Nothing about your account or permissions is wrong.
          </p>
        </div>
      )}

      {!loading && !error && (
        <ProductForm
          categories={dbCategories}
          heading="New Product (Draft)"
          submitLabel="Create Draft"
          onSubmit={handleSubmit}
          onSuccess={() => navigate('/seller/products', { replace: true })}
          onCancel={() => navigate('/seller/products')}
        />
      )}
    </div>
  )
}
