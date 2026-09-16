import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, ShoppingBag, Eye, Star, Check } from 'lucide-react'
import type { Product } from '@/types'
import { formatBDT } from '@/lib/utils'
import { useCart } from '@/context/CartContext'
import { useWishlist } from '@/context/WishlistContext'
import { stockStatusOf } from '@/data/products'

interface ProductCardProps {
  product: Product
  priority?: boolean
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { addItem } = useCart()
  const { isWishlisted, toggleWishlist } = useWishlist()
  const [justAdded, setJustAdded] = useState(false)

  const status = stockStatusOf(product)
  const isOutOfStock = status === 'out-of-stock'
  const isLowStock = status === 'low-stock'
  const wish = isWishlisted(product.id)

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isOutOfStock) return

    const res = addItem(product, { quantity: 1 })
    if (res.ok) {
      setJustAdded(true)
      setTimeout(() => setJustAdded(false), 1400)
    }
  }

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    toggleWishlist(product.id)
  }

  return (
    <div className="group relative flex flex-col rounded-2xl bg-white border border-neutral-200/80 hover:border-primary-200 transition-all duration-200 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 overflow-hidden">
      {/* Image container */}
      <div className="relative aspect-square w-full bg-neutral-100 overflow-hidden">
        <Link to={`/product/${product.slug}`} className="block h-full w-full">
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
          />
        </Link>

        {/* Top badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10">
          {product.discount > 0 && (
            <span className="rounded-md bg-promo-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm">
              -{product.discount}%
            </span>
          )}
          {product.isNewArrival && (
            <span className="rounded-md bg-navy-900 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">
              New
            </span>
          )}
        </div>

        {/* Wishlist button */}
        <button
          onClick={handleWishlist}
          aria-label={wish ? 'Remove from wishlist' : 'Add to wishlist'}
          className="absolute top-2.5 right-2.5 h-8 w-8 rounded-full bg-white/90 hover:bg-white text-neutral-700 hover:text-rose-600 shadow-sm flex items-center justify-center transition-colors z-10 cursor-pointer"
        >
          <Heart className={`h-4 w-4 ${wish ? 'fill-rose-600 text-rose-600' : ''}`} />
        </button>

        {/* Stock status overlay banner when out of stock */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] flex items-center justify-center z-10 pointer-events-none">
            <span className="rounded-full bg-neutral-900 text-white px-3 py-1 text-xs font-bold uppercase tracking-wider">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
          {product.category.replace('-', ' & ')}
        </span>

        <h3 className="mt-1 text-sm sm:text-base font-semibold text-navy-900 line-clamp-1 group-hover:text-primary-700 transition-colors">
          <Link to={`/product/${product.slug}`}>{product.name}</Link>
        </h3>

        {/* Rating */}
        <div className="mt-1 flex items-center gap-1.5">
          <div className="flex items-center text-amber-500">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="ml-1 text-xs font-semibold text-neutral-800">{product.rating}</span>
          </div>
          <span className="text-xs text-neutral-400">({product.reviews})</span>
        </div>

        {/* Price & Stock */}
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-base sm:text-lg font-bold text-neutral-900">
            {formatBDT(product.price)}
          </span>
          {product.oldPrice && (
            <span className="text-xs sm:text-sm text-neutral-400 line-through">
              {formatBDT(product.oldPrice)}
            </span>
          )}
        </div>

        {/* Stock indicator badge */}
        <div className="mt-1 text-[11px]">
          {isOutOfStock ? (
            <span className="text-rose-600 font-medium">Out of Stock</span>
          ) : isLowStock ? (
            <span className="text-amber-600 font-medium">Only {product.stock} left</span>
          ) : (
            <span className="text-emerald-600 font-medium">In Stock</span>
          )}
        </div>

        {/* Actions */}
        <div className="mt-3.5 flex items-center gap-2 pt-2 border-t border-neutral-100">
          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              isOutOfStock
                ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                : justAdded
                ? 'bg-emerald-600 text-white'
                : 'bg-primary-600 hover:bg-primary-700 text-white shadow-sm'
            }`}
          >
            {justAdded ? (
              <>
                <Check className="h-4 w-4" /> Added
              </>
            ) : (
              <>
                <ShoppingBag className="h-4 w-4" /> Add to Cart
              </>
            )}
          </button>

          <Link
            to={`/product/${product.slug}`}
            className="p-2 rounded-lg border border-neutral-200 text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
            title="View Details"
            aria-label={`View details for ${product.name}`}
          >
            <Eye className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
