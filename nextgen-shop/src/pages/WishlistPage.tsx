import React from 'react'
import { Link } from 'react-router-dom'
import { Heart, ArrowLeft } from 'lucide-react'
import { useWishlist } from '@/context/WishlistContext'
import { productService } from '@/services'
import { ProductCard } from '@/components/product/ProductCard'

export const WishlistPage: React.FC = () => {
  const { ids, toggleWishlist, count } = useWishlist()

  const wishlistProducts = ids
    .map((id) => productService.byId(id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)

  if (count === 0) {
    return (
      <div className="container-shop py-16 sm:py-24 text-center">
        <div className="h-20 w-20 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto mb-4">
          <Heart className="h-10 w-10" />
        </div>
        <h1 className="text-3xl font-display font-bold text-neutral-900">Your Wishlist is empty</h1>
        <p className="mt-3 text-neutral-500 max-w-md mx-auto">
          Items you save here will appear when you browse products and tap the heart icon.
        </p>
        <Link to="/shop" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-accent-700">
          <ArrowLeft className="h-4 w-4" />
          <span>Start Shopping</span>
        </Link>
      </div>
    )
  }

  return (
    <div className="container-shop py-8 sm:py-12">
      <h1 className="text-3xl sm:text-4xl font-display font-bold text-neutral-900 mb-8">
        My Wishlist ({count} {count === 1 ? 'item' : 'items'})
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {wishlistProducts.map((product) => (
          <div key={product.id} className="relative group">
            <ProductCard product={product} />
            <button
              type="button"
              onClick={() => toggleWishlist(product.id)}
              className="absolute top-2.5 right-2.5 h-8 w-8 rounded-full bg-white/90 hover:bg-white text-rose-600 shadow-sm flex items-center justify-center transition-colors z-10 cursor-pointer"
              aria-label={`Remove ${product.name} from wishlist`}
            >
              <Heart className="h-4 w-4 fill-rose-600" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
