import React, { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ShoppingBag,
  Truck,
  ShieldCheck,
  Package,
  Star,
  Check,
  X,
  Minus,
  Plus,
} from 'lucide-react'
import { productService, customerService } from '@/services'
import { catalogService } from '@/services/catalog'
import { sellerProductsService } from '@/services/sellerProducts'
import { sellerShopService } from '@/services/sellerShop'
import { useAuth } from '@/context/AuthContext'
import type {
  MarketplaceProduct,
  MarketplaceProductImage,
  MarketplaceProductVariant,
} from '@/types'
import { formatBDT } from '@/lib/utils'
import { stockStatusOf } from '@/data/products'
import { ProductCard } from '@/components/product/ProductCard'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useCart } from '@/context/CartContext'
import { useWishlist } from '@/context/WishlistContext'

const COLORS_HEX: Record<string, string> = {
  Black: '#171717',
  White: '#fafafa',
  Navy: '#1e3a5f',
  'Sky Blue': '#7cb9e8',
  Maroon: '#7c2d3a',
  Teal: '#1f6e68',
  Mustard: '#c99a2c',
  Pink: '#e8a4b5',
  Olive: '#6b705c',
  Red: '#c0202c',
  Gold: '#c9a227',
  'Bottle Green': '#2d5a27',
  Charcoal: '#44403c',
  'Off White': '#f0ead6',
  Yellow: '#ca8a04',
  'Denim Blue': '#4a6b8a',
  Gray: '#6b7280',
  Peach: '#e8a487',
  Mint: '#79b4a1',
  Cream: '#f6f1e7',
  Brown: '#92644f',
}

export const ProductDetailsPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const product = slug ? productService.bySlug(slug) : undefined

  const { addItem } = useCart()
  const { isWishlisted, toggleWishlist } = useWishlist()

  const [quantity, setQuantity] = useState(1)
  const [addedFlash, setAddedFlash] = useState<'cart' | 'buy' | null>(null)
  const [activeImage, setActiveImage] = useState(0)

  // Initialize size & color from the product; component remounts when product changes
  const [selectedSize, setSelectedSize] = useState<string | undefined>(() => product?.sizes[0])
  const [selectedColor, setSelectedColor] = useState<string | undefined>(() => product?.colors[0])

  const status = product ? stockStatusOf(product) : null
  const isOutOfStock = status === 'out-of-stock'

  // Related products (same category, excluding this product)
  const relatedProducts = useMemo(() => {
    if (!product) return []
    return productService
      .list()
      .filter((p) => p.category === product.category && p.id !== product.id)
      .slice(0, 4)
  }, [product])

  const customerSummaries = customerService.list().slice(0, 3)

  if (!product) {
    // Demo catalog missed: fall back to the live database catalog.
    // Hidden/unavailable rows resolve to null and reuse the same
    // not-found UI, so nothing private can leak through this route.
    return <RealProductDetails slug={slug ?? ''} />
  }

  const handleAddToCart = () => {
    if (isOutOfStock || !product) return
    const size = selectedSize ?? product.sizes[0]
    const color = selectedColor ?? product.colors[0]
    const current = productService.bySlug(product.slug)
    if (!current || current.stock <= 0) return
    const clampedQty = Math.min(quantity, current.stock)
    const res = addItem(product, { quantity: clampedQty, size, color })
    if (res.ok) {
      setAddedFlash('cart')
      setTimeout(() => setAddedFlash(null), 1400)
    }
  }

  const handleBuyNow = () => {
    if (isOutOfStock || !product) return
    const size = selectedSize ?? product.sizes[0]
    const color = selectedColor ?? product.colors[0]
    const current = productService.bySlug(product.slug)
    if (!current || current.stock <= 0) return
    const clampedQty = Math.min(quantity, current.stock)
    navigate('/checkout', {
      state: {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: product.image,
        price: product.price,
        quantity: clampedQty,
        size,
        color,
        maxStock: current.stock,
      },
    })
  }

  const images = [product.image, ...(product.images ?? [])]
  const wish = isWishlisted(product.id)

  return (
    <div className="container-shop py-6 sm:py-10">
      {/* Breadcrumb */}
      <nav className="text-xs text-neutral-400 mb-6 flex items-center gap-1.5">
        <Link to="/" className="hover:text-neutral-700">Home</Link>
        <span>/</span>
        <Link to={`/category/${product.category}`} className="hover:text-neutral-700 capitalize">
          {product.category.replace('-', ' & ')}
        </Link>
        <span>/</span>
        <span className="text-neutral-700 font-medium line-clamp-1">{product.name}</span>
      </nav>

      {/* Main layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* Gallery */}
        <div className="space-y-4">
          <div className="aspect-square rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-200/80">
            <img
              src={images[activeImage] ?? product.image}
              alt={product.name}
              className="h-full w-full object-cover object-center"
            />
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {images.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveImage(i)}
                className={`shrink-0 w-16 h-16 rounded-lg border-2 overflow-hidden transition-all cursor-pointer ${
                  i === activeImage
                    ? 'border-neutral-900 ring-2 ring-offset-1 ring-neutral-900'
                    : 'border-transparent hover:border-neutral-300'
                }`}
                aria-label={`View image ${i + 1}`}
              >
                <img src={img} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Details */}
        <div className="space-y-6">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-accent-700">
              {product.category.replace('-', ' & ')}
            </span>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-neutral-900 mt-1 leading-tight">
              {product.name}
            </h1>
          </div>

          {/* Rating */}
          <div className="flex items-center gap-2">
            <div className="flex items-center text-amber-500">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-4 w-4 ${
                    i < Math.floor(product.rating)
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-neutral-300'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm font-semibold text-neutral-800">{product.rating}</span>
            <span className="text-xs text-neutral-400">({product.reviews} reviews)</span>
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-neutral-900">
              {formatBDT(product.price)}
            </span>
            {product.oldPrice && (
              <>
                <span className="text-lg text-neutral-400 line-through">
                  {formatBDT(product.oldPrice)}
                </span>
                <Badge variant="promo">-{product.discount}%</Badge>
              </>
            )}
          </div>

          {/* Stock */}
          <div className="flex items-center gap-2 text-sm">
            {isOutOfStock ? (
              <span className="inline-flex items-center gap-1.5 text-rose-600 font-semibold">
                <X className="h-4 w-4" /> Out of Stock
              </span>
            ) : status === 'low-stock' ? (
              <span className="inline-flex items-center gap-1.5 text-amber-600 font-semibold">
                <Package className="h-4 w-4" /> Only {product.stock} left in stock
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-emerald-600 font-semibold">
                <Check className="h-4 w-4" /> In Stock
              </span>
            )}
          </div>

          {/* Short description */}
          <p className="text-sm text-neutral-600 leading-relaxed">{product.shortDescription}</p>
          <div className="space-y-2 text-sm text-neutral-600 leading-relaxed">
            {product.description.split('. ').map((sentence, i) => (
              <p key={i}>{sentence}.</p>
            ))}
          </div>

          {/* Color selector */}
          <fieldset>
            <legend className="text-sm font-semibold text-neutral-900 mb-2">
              Color:{' '}
              <span className="font-normal text-neutral-600">{selectedColor}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {product.colors.map((color) => {
                const active = selectedColor === color
                const hex = COLORS_HEX[color] ?? '#999'
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`relative h-9 w-9 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center ${
                      active ? 'border-neutral-900 ring-2 ring-offset-2 ring-neutral-900' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: hex }}
                    title={color}
                    aria-label={`Color: ${color}`}
                  >
                    {active && (
                      <Check className="h-4 w-4 text-white drop-shadow" />
                    )}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Size selector */}
          <fieldset>
            <legend className="text-sm font-semibold text-neutral-900 mb-2">
              Size:{' '}
              <span className="font-normal text-neutral-600">{selectedSize}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((size) => {
                const active = selectedSize === size
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    className={`min-w-[48px] px-3 py-1.5 text-sm rounded-lg border transition-all font-medium cursor-pointer ${
                      active
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    {size}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Quantity */}
          <fieldset>
            <legend className="text-sm font-semibold text-neutral-900 mb-2">Quantity</legend>
            <div className="inline-flex items-center border border-neutral-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="p-2 hover:bg-neutral-100 transition-colors"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-12 text-center text-sm font-semibold border-x border-neutral-200 py-2">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => {
                  const current = productService.bySlug(product.slug)
                  if (current) setQuantity((q) => Math.min(q + 1, current.stock))
                }}
                className="p-2 hover:bg-neutral-100 transition-colors"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">
              Max available: {product.stock}
            </p>
          </fieldset>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={handleAddToCart}
              disabled={isOutOfStock || addedFlash === 'buy'}
            >
              {addedFlash === 'cart' ? (
                <>
                  <Check className="h-5 w-5" />
                  Added to Cart
                </>
              ) : (
                <>
                  <ShoppingBag className="h-5 w-5" />
                  Add to Cart
                </>
              )}
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={handleBuyNow}
              disabled={isOutOfStock}
            >
              <Truck className="h-5 w-5" />
              Buy Now
            </Button>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap gap-4 pt-2 border-t border-neutral-100 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-accent-600" /> Quality Guaranteed
            </span>
            <span className="flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-accent-600" /> Cash on Delivery
            </span>
          </div>

          {/* Wishlist */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => toggleWishlist(product.id)}
              className={`inline-flex items-center gap-1.5 text-sm cursor-pointer transition-colors ${
                wish ? 'text-rose-600 font-semibold' : 'text-neutral-500 hover:text-rose-600'
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill={wish ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              {wish ? 'In Wishlist' : 'Add to Wishlist'}
            </button>
          </div>

          {/* Social proof */}
          {customerSummaries.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-neutral-400 mb-2">Recently bought by:</p>
              <div className="flex -space-x-2">
                {customerSummaries.slice(0, 3).map((c, i) => (
                  <div
                    key={i}
                    className="h-8 w-8 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-bold border-2 border-white"
                    title={c.name}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <section className="mt-16 pt-10 border-t border-neutral-200">
          <h2 className="text-2xl font-display font-bold text-neutral-900">
            Related Products
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
            {relatedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function RealProductNotFound(): React.ReactNode {
  return (
    <div className="container-shop py-24 text-center">
      <h1 className="text-3xl font-display font-bold text-neutral-900">
        Product not found
      </h1>
      <p className="mt-3 text-neutral-500">
        The product you&rsquo;re looking for doesn&rsquo;t exist or has been removed.
      </p>
      <Link to="/shop" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent-700">
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Shop</span>
      </Link>
    </div>
  )
}

/**
 * Live database product view (fallback when the demo catalog has no
 * matching slug). Rows arrive through RLS public policies, so hidden
 * or unavailable products resolve to null and reuse the not-found
 * UI. Prices and stock are display snapshots only — create_order()
 * re-derives everything server-side. Reads require sign-in
 * (table grants are authenticated-only by design).
 */
const RealProductDetails: React.FC<{ slug: string }> = ({ slug }) => {
  const navigate = useNavigate()
  const { user, isLoading: authLoading, isConfigured } = useAuth()
  const { addRealItem } = useCart()

  const [product, setProduct] = useState<MarketplaceProduct | null>(null)
  const [images, setImages] = useState<MarketplaceProductImage[]>([])
  const [variants, setVariants] = useState<MarketplaceProductVariant[]>([])
  const [shopName, setShopName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [selectedVariantId, setSelectedVariantId] = useState<string>('')
  const [quantity, setQuantity] = useState(1)
  const [addedFlash, setAddedFlash] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [activeImage, setActiveImage] = useState(0)

  useEffect(() => {
    if (!isConfigured || authLoading || !user || !slug) return
    let active = true
    void (async () => {
      setLoading(true)
      const pRes = await catalogService.getProductBySlug(slug)
      if (!active) return
      if (!pRes.data) {
        setMissing(true)
        setLoading(false)
        return
      }
      const item = pRes.data
      setProduct(item)
      const [iRes, vRes] = await Promise.all([
        catalogService.listProductImages(item.id),
        sellerProductsService.listVariants(item.id),
      ])
      if (!active) return
      setImages(iRes.data ?? [])
      const liveVariants = (vRes.data ?? []).filter((v) => v.isActive)
      setVariants(liveVariants)
      const firstVariant = liveVariants.length > 0 ? liveVariants[0].id : ''
      setSelectedVariantId(firstVariant)
      if (item.shopId) {
        const sRes = await sellerShopService.getById(item.shopId)
        if (!active) return
        setShopName(sRes.data?.shopName ?? null)
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [isConfigured, authLoading, user, slug])

  if (!isConfigured || (!authLoading && !user)) {
    return (
      <div className="container-shop py-24 text-center">
        <h1 className="text-3xl font-display font-bold text-neutral-900">
          Sign in to view this product
        </h1>
        <p className="mt-3 text-neutral-500">
          Live marketplace products are available to signed-in shoppers.
        </p>
        <Link to={`/login?return=/product/${slug}`} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent-700">
          <ArrowLeft className="h-4 w-4" />
          <span>Sign In</span>
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container-shop py-24 text-center">
        <p className="text-sm text-neutral-500">Loading product…</p>
      </div>
    )
  }

  if (missing || !product) return <RealProductNotFound />

  const selectedVariant = variants.find((v) => v.id === selectedVariantId) ?? null
  const sellPrice =
    selectedVariant?.priceOverride ?? product.discountPrice ?? product.price
  const availableStock = selectedVariant ? selectedVariant.stockQuantity : product.stockQuantity
  const isOutOfStock = availableStock <= 0
  const gallery = images.length > 0 ? images.map((img) => img.imageUrl) : []
  const ownerLabel = product.shopId ? (shopName ?? 'Verified Seller') : 'NextGen Shop'

  function handleAddToCart(): void {
    const item = product
    if (!item || isOutOfStock) return
    const res = addRealItem({
      productId: item.id,
      slug: item.slug,
      name: item.name,
      image: gallery[activeImage] ?? '',
      price: sellPrice,
      quantity: Math.min(quantity, availableStock),
      size: selectedVariant?.attributes.size,
      color: selectedVariant?.attributes.color,
      variantId: selectedVariant ? selectedVariant.id : null,
      maxStock: availableStock,
    })
    if (res.ok) {
      setAddedFlash(true)
      setTimeout(() => setAddedFlash(false), 1400)
    } else {
      setActionMsg(res.message)
    }
  }

  function handleBuyNow(): void {
    const item = product
    if (!item || isOutOfStock) return
    const res = addRealItem({
      productId: item.id,
      slug: item.slug,
      name: item.name,
      image: gallery[activeImage] ?? '',
      price: sellPrice,
      quantity: Math.min(quantity, availableStock),
      size: selectedVariant?.attributes.size,
      color: selectedVariant?.attributes.color,
      variantId: selectedVariant ? selectedVariant.id : null,
      maxStock: availableStock,
    })
    if (!res.ok) {
      setActionMsg(res.message)
      return
    }
    // Real checkout only: never route live products into demo checkout.
    navigate('/checkout/real')
  }

  return (
    <div className="container-shop py-6 sm:py-10">
      <nav className="text-xs text-neutral-400 mb-6 flex items-center gap-1.5">
        <Link to="/" className="hover:text-neutral-700">Home</Link>
        <span>/</span>
        <Link to="/market" className="hover:text-neutral-700">Market</Link>
        <span>/</span>
        <span className="text-neutral-700 font-medium line-clamp-1">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        <div className="space-y-4">
          <div className="aspect-square rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-200/80 flex items-center justify-center">
            {gallery.length > 0 ? (
              <img
                src={gallery[activeImage] ?? gallery[0]}
                alt={product.name}
                className="h-full w-full object-cover object-center"
              />
            ) : (
              <Package className="h-16 w-16 text-neutral-300" />
            )}
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {gallery.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={`shrink-0 w-16 h-16 rounded-lg border-2 overflow-hidden transition-all cursor-pointer ${
                    i === activeImage
                      ? 'border-neutral-900 ring-2 ring-offset-1 ring-neutral-900'
                      : 'border-transparent hover:border-neutral-300'
                  }`}
                  aria-label={`View image ${i + 1}`}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-accent-700">
              {ownerLabel}
            </span>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-neutral-900 mt-1 leading-tight">
              {product.name}
            </h1>
            {product.brand && (
              <p className="text-sm text-neutral-500 mt-1">{product.brand}</p>
            )}
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-neutral-900">
              {formatBDT(sellPrice)}
            </span>
            {sellPrice < product.price && (
              <span className="text-lg text-neutral-400 line-through">
                {formatBDT(product.price)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm">
            {isOutOfStock ? (
              <span className="inline-flex items-center gap-1.5 text-rose-600 font-semibold">
                <X className="h-4 w-4" /> Out of Stock
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-emerald-600 font-semibold">
                <Check className="h-4 w-4" /> In Stock
              </span>
            )}
          </div>

          {product.shortDescription && (
            <p className="text-sm text-neutral-600 leading-relaxed">{product.shortDescription}</p>
          )}
          {product.description && (
            <p className="text-sm text-neutral-600 leading-relaxed">{product.description}</p>
          )}

          {variants.length > 0 && (
            <fieldset>
              <legend className="text-sm font-semibold text-neutral-900 mb-2">Variant</legend>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVariantId(v.id)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-all font-medium cursor-pointer ${
                      v.id === selectedVariantId
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset>
            <legend className="text-sm font-semibold text-neutral-900 mb-2">Quantity</legend>
            <div className="inline-flex items-center border border-neutral-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="p-2 hover:bg-neutral-100 transition-colors"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-12 text-center text-sm font-semibold border-x border-neutral-200 py-2">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(q + 1, availableStock))}
                className="p-2 hover:bg-neutral-100 transition-colors"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </fieldset>

          {actionMsg && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">{actionMsg}</p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={handleAddToCart}
              disabled={isOutOfStock}
            >
              {addedFlash ? (
                <>
                  <Check className="h-5 w-5" />
                  Added to Cart
                </>
              ) : (
                <>
                  <ShoppingBag className="h-5 w-5" />
                  Add to Cart
                </>
              )}
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={handleBuyNow}
              disabled={isOutOfStock}
            >
              <Truck className="h-5 w-5" />
              Buy Now
            </Button>
          </div>
          <p className="text-[11px] text-neutral-400">
            Live marketplace item{product.shopId ? ` from ${ownerLabel}` : ' from NextGen Shop'}.
            Final price and availability are confirmed securely at checkout.
          </p>
        </div>
      </div>
    </div>
  )
}
