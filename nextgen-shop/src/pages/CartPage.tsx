import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, Truck, Tag, ShieldCheck, ArrowLeft } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { useCoupon } from '@/context/CouponContext'
import { formatBDT, STORE_CONFIG } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { DELIVERY_CHARGES } from '@/data/storeConfig'

export const CartPage: React.FC = () => {
  const { items, itemCount, subtotal, updateQuantity, removeItem } = useCart()
  const { applyCoupon, discountAmount, removeCoupon } = useCoupon()
  const [couponCode, setCouponCode] = useState('')
  const [couponError, setCouponError] = useState('')

  const deliveryZone: 'inside-dhaka' | 'outside-dhaka' = 'inside-dhaka'
  const deliveryCharge = DELIVERY_CHARGES[deliveryZone]
  const freeShipping = subtotal >= STORE_CONFIG.freeShippingOver
  const finalDelivery = freeShipping ? 0 : deliveryCharge
  const total = subtotal + finalDelivery - discountAmount

  const handleApplyCoupon = () => {
    if (!couponCode.trim()) return
    const result = applyCoupon(couponCode.trim(), subtotal)
    if (!result.ok) {
      setCouponError(result.message)
    } else {
      setCouponError('')
      setCouponCode('')
    }
  }

  const handleRemoveCoupon = () => {
    removeCoupon()
    setCouponCode('')
    setCouponError('')
  }

  if (items.length === 0) {
    return (
      <div className="container-shop py-16 sm:py-24 text-center">
        <div className="h-20 w-20 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto mb-4">
          <Truck className="h-10 w-10" />
        </div>
        <h1 className="text-3xl font-display font-bold text-neutral-900">
          Your cart is empty
        </h1>
        <p className="mt-3 text-neutral-500 max-w-md mx-auto">
          Looks like you haven&rsquo;t added anything to your cart yet.
          Start shopping to find products you love.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button to="/shop" variant="secondary" size="lg">
            <ArrowLeft className="h-4 w-4" />
            <span>Continue Shopping</span>
          </Button>
          <Link to="/" className="text-sm font-semibold text-accent-700 hover:underline">
            Browse by category
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container-shop py-8 sm:py-12">
      <h1 className="text-3xl sm:text-4xl font-display font-bold text-neutral-900 mb-8">
        Shopping Cart ({itemCount} {itemCount === 1 ? 'item' : 'items'})
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cart items */}
        <div className="lg:col-span-2 space-y-6">
          {items.map((item) => (
            <div
              key={`${item.productId}-${item.size ?? ''}-${item.color ?? ''}`}
              className="flex gap-4 bg-white rounded-xl border border-neutral-200/80 p-4 hover:shadow-md transition-shadow"
            >
              <Link to={`/product/${item.slug}`} className="shrink-0">
                <img
                  src={item.image}
                  alt={item.name}
                  className="h-24 w-24 rounded-lg object-cover"
                />
              </Link>

              <div className="flex-1 min-w-0">
                <Link
                  to={`/product/${item.slug}`}
                  className="text-sm font-semibold text-neutral-900 hover:text-accent-700 line-clamp-1"
                >
                  {item.name}
                </Link>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {item.size && <>Size: {item.size} &middot; </>}
                  {item.color && <span>Color: {item.color}</span>}
                </p>
                <p className="text-sm font-bold text-neutral-900 mt-1">
                  {formatBDT(item.price)}
                </p>

                {/* Quantity */}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateQuantity(item.productId, (item.quantity ?? 1) - 1, item.size, item.color)
                    }
                    className="h-8 w-8 rounded border border-neutral-200 flex items-center justify-center hover:bg-neutral-100 transition-colors cursor-pointer"
                    aria-label="Decrease quantity"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                  <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() =>
                      updateQuantity(item.productId, (item.quantity ?? 1) + 1, item.size, item.color)
                    }
                    disabled={(item.quantity ?? 1) >= item.maxStock}
                    className="h-8 w-8 rounded border border-neutral-200 flex items-center justify-center hover:bg-neutral-100 transition-colors disabled:opacity-40 cursor-pointer"
                    aria-label="Increase quantity"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex flex-col items-end justify-between shrink-0">
                <p className="text-sm font-bold text-neutral-900">
                  {formatBDT(item.price * (item.quantity ?? 1))}
                </p>
                <button
                  onClick={() => removeItem(item.productId, item.size, item.color)}
                  className="text-neutral-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                  aria-label={`Remove ${item.name} from cart`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {/* Continue shopping */}
          <div className="pt-4">
            <Button variant="outline" size="md" to="/shop">
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span>Continue Shopping</span>
            </Button>
          </div>
        </div>

        {/* Order summary */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 bg-white rounded-xl border border-neutral-200/80 p-6 space-y-4 shadow-xs">
            <h2 className="font-display font-bold text-lg text-neutral-900">
              Order Summary
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal ({itemCount} items)</span>
                <span className="font-medium text-neutral-900">{formatBDT(subtotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Delivery ({deliveryZone === 'inside-dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'})</span>
                {freeShipping ? (
                  <span className="text-emerald-600 font-medium flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Free
                  </span>
                ) : (
                  <span className="font-medium text-neutral-900">{formatBDT(deliveryCharge)}</span>
                )}
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Discount</span>
                {discountAmount > 0 ? (
                  <span className="font-medium text-emerald-600">-{formatBDT(discountAmount)}</span>
                ) : (
                  <span className="font-medium text-neutral-900">৳0</span>
                )}
              </div>

              <div className="border-t border-neutral-200 pt-3 flex justify-between font-bold text-base text-neutral-900">
                <span>Total</span>
                <span>{formatBDT(total)}</span>
              </div>
            </div>

            {/* Coupon */}
            <div className="pt-3">
              {discountAmount > 0 ? (
                <div className="flex items-center justify-between bg-emerald-50 text-emerald-700 text-xs rounded-lg p-3">
                  <span>Coupon applied! -{formatBDT(discountAmount)}</span>
                  <button type="button" onClick={handleRemoveCoupon} className="hover:underline cursor-pointer">Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value); setCouponError('') }}
                    placeholder="Coupon code"
                    className="flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-accent-600"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              )}
              {couponError && <p className="text-xs text-rose-600 mt-1">{couponError}</p>}
            </div>

            {freeShipping && (
              <div className="bg-emerald-50 text-emerald-700 text-xs rounded-lg p-3 flex items-center gap-2">
                <Tag className="h-4 w-4 shrink-0" />
                <span>You&rsquo;re eligible for free delivery!</span>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <Link to="/checkout" className="block">
                <Button size="lg" className="w-full">
                  <Truck className="h-5 w-5" />
                  <span>Proceed to Checkout</span>
                </Button>
              </Link>
              <Link to="/checkout" className="block">
                <Button variant="primary" size="lg" className="w-full">
                  Buy Now
                </Button>
              </Link>
              <Link to="/checkout/real" className="block">
                <Button variant="outline" size="lg" className="w-full">
                  <ShieldCheck className="h-5 w-5" />
                  <span>Real Checkout (signed-in)</span>
                </Button>
              </Link>
            </div>

            <div className="pt-4 border-t border-neutral-100 space-y-2.5 text-xs text-neutral-500">
              <div className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5 text-accent-600" />
                <span>Cash on Delivery available</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-accent-600" />
                <span>Secure checkout</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
