import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Truck,
  Shield,
  MapPin,
  CreditCard,
  Smartphone,
  Tag,
} from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { useCoupon } from '@/context/CouponContext'
import { formatBDT, isValidBDMobile, STORE_CONFIG } from '@/lib/utils'
import { orderService } from '@/services'
import {
  DELIVERY_CHARGES,
  deliveryZoneLabel,
  DIVISIONS,
  PAYMENT_METHODS,
} from '@/data/storeConfig'
import { Button } from '@/components/ui/Button'

export const CheckoutPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { items, subtotal } = useCart()

  // Detect pre-selected item from ProductDetails "Buy Now" or "Add to Cart"
  const locationState = location.state as {
    productId?: string
    slug?: string
    name?: string
    image?: string
    price?: number
    quantity?: number
    size?: string
    color?: string
    maxStock?: number
  } | null

  // Delivery zone — defaults to inside Dhaka for demo. Future: user selects on checkout.
  const deliveryZone: 'inside-dhaka' | 'outside-dhaka' = 'inside-dhaka'

  // Form state
  const [form, setForm] = useState({
    customerName: '',
    mobile: '',
    alternativeMobile: '',
    address: '',
    division: '',
    district: '',
    upazila: '',
    postalCode: '',
    orderNotes: '',
  })

  const [paymentMethod, setPaymentMethod] = useState<'Cash on Delivery' | 'bKash' | 'Nagad'>('Cash on Delivery')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [couponCode, setCouponCode] = useState('')
  const [couponError, setCouponError] = useState('')

  const { applyCoupon, discountAmount } = useCoupon()

  const deliveryCharge = DELIVERY_CHARGES[deliveryZone]
  const freeShipping = subtotal >= STORE_CONFIG.freeShippingOver
  const finalDelivery = freeShipping ? 0 : deliveryCharge
  const discount = discountAmount // from coupon

  // If a pre-selected item from ProductDetails is not yet in the cart, include it in the order.
  // Recalculate subtotal so the order total always matches the ordered items.
  const hasPendingItem = locationState && !items.find((i) => i.productId === locationState.productId)
  const pendingOrderItem = hasPendingItem
    ? {
        productId: locationState.productId!,
        name: locationState.name!,
        image: locationState.image!,
        price: locationState.price!,
        quantity: locationState.quantity ?? 1,
        size: locationState.size,
        color: locationState.color,
      }
    : undefined
  const effectiveItems = hasPendingItem && pendingOrderItem ? [...items, pendingOrderItem] : items
  const effectiveSubtotal = hasPendingItem && pendingOrderItem
    ? effectiveItems.reduce((sum, i) => sum + (i.price ?? 0) * (i.quantity ?? 1), 0)
    : subtotal
  const total = effectiveSubtotal + finalDelivery - discount

  // Districts for selected division
  const districts = form.division ? DIVISIONS[form.division] ?? [] : []

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => { const next = { ...prev }; delete next[field]; return next })
  }

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!form.customerName.trim()) next.customerName = 'Name is required'
    if (!isValidBDMobile(form.mobile)) next.mobile = 'Enter a valid BD mobile (01XXXXXXXXX)'
    if (form.alternativeMobile && !isValidBDMobile(form.alternativeMobile)) {
      next.alternativeMobile = 'Invalid BD mobile format'
    }
    if (!form.address.trim()) next.address = 'Address is required'
    if (!form.division) next.division = 'Select a division'
    if (!form.district) next.district = 'Select a district'
    if (!form.upazila.trim()) next.upazila = 'Select an upazila/thana'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)

    // Simulate brief processing
    await new Promise((r) => setTimeout(r, 800))

    try {
      const order = await orderService.create({
        customerName: form.customerName.trim(),
        mobile: form.mobile.trim(),
        alternativeMobile: form.alternativeMobile.trim() || undefined,
        address: form.address.trim(),
        division: form.division,
        district: form.district,
        upazila: form.upazila.trim(),
        postalCode: form.postalCode.trim() || undefined,
        orderNotes: form.orderNotes.trim() || undefined,
        items: effectiveItems,
        subtotal: effectiveSubtotal,
        deliveryZone,
        deliveryCharge: finalDelivery,
        discount: discount,
        total,
        paymentMethod,
      })

      navigate(`/order-success?orderId=${order.orderId}`, { replace: true })
    } catch {
      setErrors({ submit: 'Something went wrong. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container-shop py-8 sm:py-12">
      <h1 className="text-3xl sm:text-4xl font-display font-bold text-neutral-900 mb-8">
        Checkout
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6">
          {/* Contact info */}
          <fieldset className="bg-white rounded-xl border border-neutral-200/80 p-5 space-y-4">
            <legend className="font-semibold text-neutral-900 flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-accent-600" />
              Contact Information
            </legend>

            <div>
              <label htmlFor="customerName" className="block text-sm font-medium text-neutral-700 mb-1">
                Full Name <span className="text-rose-600">*</span>
              </label>
              <input
                id="customerName"
                type="text"
                value={form.customerName}
                onChange={(e) => handleChange('customerName', e.target.value)}
                className={`w-full rounded-lg border ${errors.customerName ? 'border-rose-500 focus:border-rose-500' : 'border-neutral-300 focus:border-neutral-400'} px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 transition-colors`}
                placeholder="e.g. Rakib Hasan"
              />
              {errors.customerName && <p className="text-xs text-rose-600 mt-1">{errors.customerName}</p>}
            </div>

            <div>
              <label htmlFor="mobile" className="block text-sm font-medium text-neutral-700 mb-1">
                Mobile Number <span className="text-rose-600">*</span>
              </label>
              <input
                id="mobile"
                type="tel"
                inputMode="numeric"
                maxLength={11}
                value={form.mobile}
                onChange={(e) => handleChange('mobile', e.target.value)}
                className={`w-full rounded-lg border ${errors.mobile ? 'border-rose-500 focus:border-rose-500' : 'border-neutral-300 focus:border-neutral-400'} px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 transition-colors`}
                placeholder="01XXXXXXXXX"
              />
              {errors.mobile && <p className="text-xs text-rose-600 mt-1">{errors.mobile}</p>}
            </div>

            <div>
              <label htmlFor="alternativeMobile" className="block text-sm font-medium text-neutral-700 mb-1">
                Alternative Mobile <span className="text-neutral-400">(optional)</span>
              </label>
              <input
                id="alternativeMobile"
                type="tel"
                inputMode="numeric"
                maxLength={11}
                value={form.alternativeMobile}
                onChange={(e) => handleChange('alternativeMobile', e.target.value)}
                className={`w-full rounded-lg border ${errors.alternativeMobile ? 'border-rose-500 focus:border-rose-500' : 'border-neutral-300 focus:border-neutral-400'} px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 transition-colors`}
                placeholder="01XXXXXXXXX"
              />
              {errors.alternativeMobile && <p className="text-xs text-rose-600 mt-1">{errors.alternativeMobile}</p>}
            </div>
          </fieldset>

          {/* Address */}
          <fieldset className="bg-white rounded-xl border border-neutral-200/80 p-5 space-y-4">
            <legend className="font-semibold text-neutral-900 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-accent-600" />
              Delivery Address
            </legend>

            <div>
              <label htmlFor="address" className="block text-sm font-medium text-neutral-700 mb-1">
                Full Address <span className="text-rose-600">*</span>
              </label>
              <textarea
                id="address"
                rows={3}
                value={form.address}
                onChange={(e) => handleChange('address', e.target.value)}
                className={`w-full rounded-lg border ${errors.address ? 'border-rose-500 focus:border-rose-500' : 'border-neutral-300 focus:border-neutral-400'} px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 transition-colors resize-y`}
                placeholder="House no., Road no., Block, Area, City"
              />
              {errors.address && <p className="text-xs text-rose-600 mt-1">{errors.address}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="division" className="block text-sm font-medium text-neutral-700 mb-1">
                  Division <span className="text-rose-600">*</span>
                </label>
                <select
                  id="division"
                  value={form.division}
                  onChange={(e) => handleChange('division', e.target.value)}
                  className={`w-full rounded-lg border ${errors.division ? 'border-rose-500' : 'border-neutral-300'} px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white transition-colors`}
                >
                  <option value="">Select</option>
                  {Object.keys(DIVISIONS).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {errors.division && <p className="text-xs text-rose-600 mt-1">{errors.division}</p>}
              </div>

              <div>
                <label htmlFor="district" className="block text-sm font-medium text-neutral-700 mb-1">
                  District <span className="text-rose-600">*</span>
                </label>
                <select
                  id="district"
                  value={form.district}
                  onChange={(e) => handleChange('district', e.target.value)}
                  disabled={!form.division}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white disabled:bg-neutral-100 disabled:text-neutral-400 transition-colors"
                >
                  <option value="">Select</option>
                  {districts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {errors.district && <p className="text-xs text-rose-600 mt-1">{errors.district}</p>}
              </div>

              <div>
                <label htmlFor="upazila" className="block text-sm font-medium text-neutral-700 mb-1">
                  Upazila/Thana <span className="text-rose-600">*</span>
                </label>
                <input
                  id="upazila"
                  type="text"
                  value={form.upazila}
                  onChange={(e) => handleChange('upazila', e.target.value)}
                  className={`w-full rounded-lg border ${errors.upazila ? 'border-rose-500' : 'border-neutral-300'} px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white transition-colors`}
                  placeholder="e.g. Dhanmondi"
                />
                {errors.upazila && <p className="text-xs text-rose-600 mt-1">{errors.upazila}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="postalCode" className="block text-sm font-medium text-neutral-700 mb-1">
                  Postal Code <span className="text-neutral-400">(optional)</span>
                </label>
                <input
                  id="postalCode"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={form.postalCode}
                  onChange={(e) => handleChange('postalCode', e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white transition-colors"
                  placeholder="e.g. 1205"
                />
              </div>

              <div>
                <label htmlFor="orderNotes" className="block text-sm font-medium text-neutral-700 mb-1">
                  Order Notes <span className="text-neutral-400">(optional)</span>
                </label>
                <input
                  id="orderNotes"
                  type="text"
                  value={form.orderNotes}
                  onChange={(e) => handleChange('orderNotes', e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white transition-colors"
                  placeholder="e.g. Ring at door"
                />
              </div>
            </div>
          </fieldset>

          {/* Payment */}
          <fieldset className="bg-white rounded-xl border border-neutral-200/80 p-5 space-y-3">
            <legend className="font-semibold text-neutral-900 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-accent-600" />
              Payment Method
            </legend>
            <div className="space-y-2">
              {PAYMENT_METHODS.map((pm) => (
                <label
                  key={pm.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    paymentMethod === pm.id
                      ? 'border-neutral-900 bg-neutral-50'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === pm.id}
                    onChange={() => setPaymentMethod(pm.id as typeof paymentMethod)}
                    className="accent-neutral-900"
                  />
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{pm.id}</p>
                    <p className="text-xs text-neutral-500">{pm.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Coupon */}
          <fieldset className="bg-white rounded-xl border border-neutral-200/80 p-5 space-y-3">
            <legend className="font-semibold text-neutral-900 flex items-center gap-2">
              <Tag className="h-5 w-5 text-accent-600" />
              Coupon Code
            </legend>
            <div className="flex gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => { setCouponCode(e.target.value); setCouponError('') }}
                placeholder="e.g. NEXTGEN10"
                className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white"
              />
              <button
                type="button"
                onClick={() => {
                  if (!couponCode.trim()) return
                  const result = applyCoupon(couponCode.trim(), effectiveSubtotal)
                  if (!result.ok) setCouponError(result.message)
                  else setCouponError('')
                }}
                className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 cursor-pointer"
              >
                Apply
              </button>
            </div>
            {couponError && <p className="text-xs text-rose-600">{couponError}</p>}
            {discountAmount > 0 && (
              <p className="text-xs text-emerald-600 font-medium">
                ✅ Coupon applied! -{formatBDT(discountAmount)}
              </p>
            )}
          </fieldset>

          {errors.submit && (
            <div className="bg-rose-50 text-rose-700 text-sm rounded-lg p-3 border border-rose-200">
              {errors.submit}
            </div>
          )}

          {/* Submit */}
           <Button
             type="submit"
             variant="secondary"
             size="lg"
             className="w-full"
             disabled={submitting || effectiveItems.length === 0}
           >
            {submitting ? (
              <>
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <span>Placing Order...</span>
              </>
            ) : (
              <>
                <Shield className="h-5 w-5" />
                <span>Place Order ({formatBDT(total)})</span>
              </>
            )}
          </Button>

          <p className="text-xs text-center text-neutral-400">
            By placing your order you agree to our Terms of Service. Cash on Delivery available everywhere in Bangladesh.
          </p>
        </form>

        {/* Order summary sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 bg-white rounded-xl border border-neutral-200/80 p-6 space-y-4 shadow-xs">
            <h2 className="font-display font-bold text-lg text-neutral-900">
              Order Summary
            </h2>

            {/* Items list */}
            <div className="space-y-3 max-h-64 overflow-y-auto">
               {effectiveItems.map((item) => (
                 <div key={`${item.productId}-${item.size ?? ''}-${item.color ?? ''}`} className="flex gap-3">
                   <img src={item.image} alt={item.name} className="h-14 w-14 rounded-lg object-cover shrink-0" />
                   <div className="flex-1 min-w-0">
                     <p className="text-xs font-semibold text-neutral-900 line-clamp-1">{item.name}</p>
                     <p className="text-xs text-neutral-500">
                       Qty: {item.quantity} &middot;{' '}
                       {item.size && <span>{item.size}</span>}
                       {item.color && <span>{item.color}</span>}
                     </p>
                   </div>
                   <p className="text-xs font-bold text-neutral-900 whitespace-nowrap">
                     {formatBDT(item.price * item.quantity)}
                   </p>
                 </div>
               ))}
            </div>

<div className="border-t border-neutral-200 pt-4 space-y-3 text-sm">
                <div className="flex justify-between text-neutral-600">
                  <span>Subtotal ({effectiveItems.reduce((s, i) => s + i.quantity, 0)} items)</span>
                  <span className="font-medium text-neutral-900">{formatBDT(effectiveSubtotal)}</span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>Delivery ({deliveryZoneLabel(deliveryZone)})</span>
                  {freeShipping ? (
                    <span className="text-emerald-600 font-medium flex items-center gap-1">
                      <Truck className="h-3 w-3" /> Free
                    </span>
                  ) : (
                    <span className="font-medium text-neutral-900">{formatBDT(deliveryCharge)}</span>
                  )}
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>Discount (Coupon)</span>
                  {discount > 0 ? (
                    <span className="font-medium text-emerald-600">-{formatBDT(discount)}</span>
                  ) : (
                    <span className="font-medium text-neutral-900">৳0</span>
                  )}
                </div>
                <div className="border-t border-neutral-200 pt-3 flex justify-between font-bold text-base text-neutral-900">
                  <span>Total</span>
                  <span>{formatBDT(total)}</span>
                </div>
              </div>

            {freeShipping && (
              <div className="bg-emerald-50 text-emerald-700 text-xs rounded-lg p-3">
                🎉 You&rsquo;re eligible for free delivery!
              </div>
            )}

            <div className="space-y-2 pt-2 text-xs text-neutral-500">
              <div className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5 text-accent-600" />
                <span>Inside Dhaka: ৳80 · Outside: ৳130</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-accent-600" />
                <span>Secure COD available</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
