import React from 'react'
import { Link } from 'react-router-dom'
import { Store } from 'lucide-react'
import type { MarketplaceProduct, MarketplaceProductImage } from '@/types'
import { formatBDT } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'

interface RealProductCardProps {
  product: MarketplaceProduct
  image: MarketplaceProductImage | null
  /** Public shop display name; null means NextGen Shop owned. */
  shopName: string | null
}

/**
 * Customer card for REAL database products. Renders only public
 * fields (RLS already restricted the row): never admin identity,
 * audit, or hidden flags. Prices/stock are display snapshots —
 * create_order() re-derives everything server-side.
 */
export const RealProductCard: React.FC<RealProductCardProps> = ({ product, image, shopName }) => {
  const sellPrice = product.discountPrice ?? product.price
  const hasDiscount = product.discountPrice !== null && product.discountPrice < product.price
  const outOfStock = product.stockQuantity <= 0

  return (
    <article className="group card-premium overflow-hidden hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200">
      <Link to={`/product/${product.slug}`} className="block aspect-square bg-neutral-100 overflow-hidden">
        {image ? (
          <img
            src={image.imageUrl}
            alt={image.altText ?? product.name}
            loading="lazy"
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <span className="h-full w-full flex items-center justify-center">
            <Store className="h-10 w-10 text-neutral-300" />
          </span>
        )}
      </Link>
      <div className="p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
          {shopName ?? 'NextGen Shop'}
        </p>
        <Link to={`/product/${product.slug}`}>
          <h3 className="mt-1 text-sm font-semibold text-navy-900 line-clamp-1 hover:text-primary-700 transition-colors">
            {product.name}
          </h3>
        </Link>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-base font-bold text-navy-900">{formatBDT(sellPrice)}</span>
          {hasDiscount && (
            <span className="text-xs text-neutral-400 line-through">{formatBDT(product.price)}</span>
          )}
        </div>
        <div className="mt-1.5">
          {outOfStock ? (
            <Badge variant="danger">Out of Stock</Badge>
          ) : (
            <span className="text-[11px] font-medium text-emerald-600">In Stock</span>
          )}
        </div>
      </div>
    </article>
  )
}
