import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield, ArrowLeft } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { formatBDT, isValidBDMobile } from '@/lib/utils'
import {
  DELIVERY_CHARGES,
  deliveryZoneLabel,
  DIVISIONS,
  PAYMENT_METHODS,
} from '@/data/storeConfig'
import {
  mapDemoCartToRealItems,
  ordersService,
  type RealDeliveryZone,
  type RealPaymentMethod,
} from '@/services/orders'
import { Button } from '@/components/ui/Button'

const inputClass =
  'w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white transition-colors'

/**
 * REAL authenticated checkout (migration 012).
 *
 * Separate from the demo guest checkout (CheckoutPage): requires a
 * signed-in customer (route is ProtectedRoute-guarded), sends ONLY
 * item references + fulfillment text + zone/method selectors to the
 * atomic create_order() RPC, and never trusts client prices. Totals
 * shown here are labeled estimates; the database confirms the total.
 */
export const RealCheckoutPage: React.FC = () => {
  const navigate = useNavigate()
  const { items, subtotal, clearCart } = useCart()

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
  const [deliveryZone, setDeliveryZone] = useState<RealDeliveryZone>('inside-dhaka')
  const [paymentMethod, setPaymentMethod] = useState<RealPaymentMethod>('cod')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const districts = form.division ? DIVISIONS[form.division] ?? [] : []
  const estimateDelivery = DELIVERY_CHARGES[deliveryZone]

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (form.customerName.trim().length < 2) next.customerName = 'Name is required'
    if (!isValidBDMobile(form.mobile)) next.mobile = 'Enter a valid BD mobile (01XXXXXXXXX)'
    if (form.alternativeMobile && !isValidBDMobile(form.alternativeMobile)) {
      next.alternativeMobile = 'Invalid BD mobile format'
    }
    if (form.address.trim().length < 5) next.address = 'Address is required'
    if (!form.division) next.division = 'Select a division'
    if (!form.district) next.district = 'Select a district'
    if (!form.upazila.trim()) next.upazila = 'Select an upazila/thana'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function friendlyError(message: string): string {
    if (message.startsWith('order: ')) return message.slice('order: '.length)
    if (/network|fetch|failed to send/i.test(message)) {
      return 'Network error. Check your connection and try again.'
    }
    return 'Something went wrong. Please try again.'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    const mapped = mapDemoCartToRealItems(items)
    if (!mapped.ok) {
      setErrors({ submit: mapped.message })
      return
    }
    setSubmitting(true)
    try {
      const { data, error } = await ordersService.createOrder({
        items: mapped.items,
        address: {
          customerName: form.customerName.trim(),
          mobile: form.mobile.trim(),
          alternativeMobile: form.alternativeMobile.trim() || null,
          address: form.address.trim(),
          division: form.division,
          district: form.district,
          upazila: form.upazila.trim(),
          postalCode: form.postalCode.trim() || null,
          orderNotes: form.orderNotes.trim() || null,
        },
        deliveryZone,
        paymentMethod,
      })
      if (error || !data) {
        setErrors({ submit: friendlyError(error?.message ?? 'Order failed.') })
        return
      }
      // Only clear after the database confirms the order.
      clearCart()
      navigate('/order-success', { state: { realOrderId: data.orderId }, replace: true })
    } catch {
      setErrors({ submit: 'Something went wrong. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container-shop py-8 sm:py-12">
      <h1 className="text-3xl sm:text-4xl font-display font-bold text-neutral-900">
        Real Checkout
      </h1>
      <p className="text-sm text-neutral-500 mt-2 mb-8 max-w-2xl">
        Authenticated marketplace order. Prices, stock, sellers, and totals are confirmed
        securely by the database — the estimate below is for reference only.
      </p>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200/80 p-8 text-center">
          <p className="text-sm text-neutral-500">Your cart is empty.</p>
          <Link to="/shop" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent-700">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Shop</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6">
            <fieldset className="bg-white rounded-xl border border-neutral-200/80 p-5 space-y-4">
              <legend className="font-semibold text-neutral-900">Contact &amp; Address</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="rc-name" className="block text-sm font-medium text-neutral-700 mb-1">
                    Full Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="rc-name"
                    type="text"
                    value={form.customerName}
                    onChange={(e) => handleChange('customerName', e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Rakib Hasan"
                  />
                  {errors.customerName && <p className="text-xs text-rose-600 mt-1">{errors.customerName}</p>}
                </div>
                <div>
                  <label htmlFor="rc-mobile" className="block text-sm font-medium text-neutral-700 mb-1">
                    Mobile Number <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="rc-mobile"
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    value={form.mobile}
                    onChange={(e) => handleChange('mobile', e.target.value)}
                    className={inputClass}
                    placeholder="01XXXXXXXXX"
                  />
                  {errors.mobile && <p className="text-xs text-rose-600 mt-1">{errors.mobile}</p>}
                </div>
              </div>
              <div>
                <label htmlFor="rc-alt" className="block text-sm font-medium text-neutral-700 mb-1">
                  Alternative Mobile <span className="text-neutral-400">(optional)</span>
                </label>
                <input
                  id="rc-alt"
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  value={form.alternativeMobile}
                  onChange={(e) => handleChange('alternativeMobile', e.target.value)}
                  className={inputClass}
                  placeholder="01XXXXXXXXX"
                />
                {errors.alternativeMobile && <p className="text-xs text-rose-600 mt-1">{errors.alternativeMobile}</p>}
              </div>
              <div>
                <label htmlFor="rc-address" className="block text-sm font-medium text-neutral-700 mb-1">
                  Full Address <span className="text-rose-600">*</span>
                </label>
                <textarea
                  id="rc-address"
                  rows={3}
                  value={form.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  className={`${inputClass} resize-y`}
                  placeholder="House no., Road no., Block, Area, City"
                />
                {errors.address && <p className="text-xs text-rose-600 mt-1">{errors.address}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="rc-division" className="block text-sm font-medium text-neutral-700 mb-1">
                    Division <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="rc-division"
                    value={form.division}
                    onChange={(e) => handleChange('division', e.target.value)}
                    className={`${inputClass} cursor-pointer`}
                  >
                    <option value="">Select</option>
                    {Object.keys(DIVISIONS).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  {errors.division && <p className="text-xs text-rose-600 mt-1">{errors.division}</p>}
                </div>
                <div>
                  <label htmlFor="rc-district" className="block text-sm font-medium text-neutral-700 mb-1">
                    District <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="rc-district"
                    value={form.district}
                    onChange={(e) => handleChange('district', e.target.value)}
                    disabled={!form.division}
                    className={`${inputClass} cursor-pointer disabled:bg-neutral-100 disabled:text-neutral-400`}
                  >
                    <option value="">Select</option>
                    {districts.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  {errors.district && <p className="text-xs text-rose-600 mt-1">{errors.district}</p>}
                </div>
                <div>
                  <label htmlFor="rc-upazila" className="block text-sm font-medium text-neutral-700 mb-1">
                    Upazila/Thana <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="rc-upazila"
                    type="text"
                    value={form.upazila}
                    onChange={(e) => handleChange('upazila', e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Dhanmondi"
                  />
                  {errors.upazila && <p className="text-xs text-rose-600 mt-1">{errors.upazila}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="rc-postal" className="block text-sm font-medium text-neutral-700 mb-1">
                    Postal Code <span className="text-neutral-400">(optional)</span>
                  </label>
                  <input
                    id="rc-postal"
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={form.postalCode}
                    onChange={(e) => handleChange('postalCode', e.target.value)}
                    className={inputClass}
                    placeholder="e.g. 1205"
                  />
                </div>
                <div>
                  <label htmlFor="rc-notes" className="block text-sm font-medium text-neutral-700 mb-1">
                    Order Notes <span className="text-neutral-400">(optional)</span>
                  </label>
                  <input
                    id="rc-notes"
                    type="text"
                    value={form.orderNotes}
                    onChange={(e) => handleChange('orderNotes', e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Ring at door"
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="bg-white rounded-xl border border-neutral-200/80 p-5 space-y-3">
              <legend className="font-semibold text-neutral-900">Delivery Zone</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(['inside-dhaka', 'outside-dhaka'] as const).map((zone) => (
                  <label
                    key={zone}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      deliveryZone === zone ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="delivery-zone"
                      checked={deliveryZone === zone}
                      onChange={() => setDeliveryZone(zone)}
                      className="accent-neutral-900"
                    />
                    <span className="text-sm font-semibold text-neutral-900">
                      {deliveryZoneLabel(zone)} · {formatBDT(DELIVERY_CHARGES[zone])}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="bg-white rounded-xl border border-neutral-200/80 p-5 space-y-2">
              <legend className="font-semibold text-neutral-900">Payment Method</legend>
              {PAYMENT_METHODS.map((pm) => {
                const value = pm.id === 'Cash on Delivery' ? 'cod' : pm.id === 'bKash' ? 'bkash' : 'nagad'
                return (
                  <label
                    key={pm.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      paymentMethod === value ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="real-payment"
                      checked={paymentMethod === value}
                      onChange={() => setPaymentMethod(value as RealPaymentMethod)}
                      className="accent-neutral-900"
                    />
                    <span className="text-sm font-semibold text-neutral-900">{pm.id}</span>
                  </label>
                )
              })}
              <p className="text-[11px] text-neutral-400">
                Online wallets are recorded as pending until gateway verification arrives in a later phase.
              </p>
            </fieldset>

            {errors.submit && (
              <div className="bg-rose-50 text-rose-700 text-sm rounded-lg p-3 border border-rose-200">
                {errors.submit}
              </div>
            )}

            <Button type="submit" variant="secondary" size="lg" className="w-full" disabled={submitting}>
              <Shield className="h-5 w-5" />
              <span>{submitting ? 'Placing Secure Order…' : 'Place Secure Order'}</span>
            </Button>
          </form>

          <div className="lg:col-span-1">
            <div className="sticky top-24 bg-white rounded-xl border border-neutral-200/80 p-6 space-y-3 text-sm">
              <h2 className="font-display font-bold text-lg text-neutral-900">Estimate</h2>
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</span>
                <span className="font-medium text-neutral-900">{formatBDT(subtotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Delivery ({deliveryZoneLabel(deliveryZone)})</span>
                <span className="font-medium text-neutral-900">{formatBDT(estimateDelivery)}</span>
              </div>
              <p className="text-[11px] text-neutral-400 pt-1">
                Reference only — the database confirms prices, stock, sellers, and the final total.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
