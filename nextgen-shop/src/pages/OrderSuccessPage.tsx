import React from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Check, Truck, ArrowLeft, CreditCard, Smartphone, Shield } from 'lucide-react'
import { orderService } from '@/services'
import { formatBDT, formatDate } from '@/lib/utils'
import { deliveryZoneLabel } from '@/data/storeConfig'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PAYMENT_METHODS } from '@/data/storeConfig'

export const OrderSuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const orderId = searchParams.get('orderId')
  const order = orderId ? orderService.byId(orderId) : undefined
  // Real marketplace orders arrive via navigation state (never URLs
  // or browser storage): only the database reference is shown here.
  const locationState = location.state as { realOrderId?: string } | null
  const realOrderId =
    locationState && typeof locationState.realOrderId === 'string'
      ? locationState.realOrderId
      : null

  if (realOrderId) {
    return (
      <div className="container-shop py-8 sm:py-12">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 sm:p-8 mb-8 text-center">
          <div className="h-16 w-16 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-4">
            <Check className="h-8 w-8" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-neutral-900">
            Real Order Placed Successfully!
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Prices, stock, sellers, and totals were confirmed securely by the database.
          </p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200/80 p-6 max-w-xl mx-auto text-center space-y-3">
          <p className="text-neutral-500 text-sm">Order Reference</p>
          <p className="font-mono font-semibold text-navy-900 break-all">{realOrderId}</p>
          <p className="text-xs text-neutral-400">
            View the full order from your authenticated order history.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
            <Link to={`/orders/${realOrderId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-accent-700">
              <span>View This Order</span>
            </Link>
            <span className="hidden sm:inline text-neutral-300">·</span>
            <Link to="/orders" className="inline-flex items-center gap-2 text-sm font-semibold text-accent-700">
              <span>View My Orders</span>
            </Link>
          </div>
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-accent-700">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Home</span>
          </Link>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="container-shop py-24 text-center">
        <div className="h-20 w-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
          <Check className="h-10 w-10" />
        </div>
        <h1 className="text-3xl font-display font-bold text-neutral-900">
          Order Placed Successfully!
        </h1>
        <p className="mt-3 text-neutral-500 max-w-md mx-auto">
          We couldn&rsquo;t find an order with that ID. It may have been just placed.
        </p>
        <Link to="/" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-accent-700">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Home</span>
        </Link>
      </div>
    )
  }

  const paymentMethod = PAYMENT_METHODS.find((pm) => pm.id === order.paymentMethod)

  return (
    <div className="container-shop py-8 sm:py-12">
      {/* Success banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 sm:p-8 mb-8 text-center">
        <div className="h-16 w-16 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-4">
          <Check className="h-8 w-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-neutral-900">
          Order Placed Successfully!
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Thank you for your order. We&rsquo;ll prepare it right away.
        </p>
      </div>

      {/* Order details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order ID */}
          <div className="bg-white rounded-xl border border-neutral-200/80 p-6">
            <h2 className="font-display font-bold text-lg text-neutral-900 mb-3">
              Order Summary
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-neutral-500">Order ID</p>
                <p className="font-semibold text-neutral-900">{order.orderId}</p>
              </div>
              <div>
                <p className="text-neutral-500">Order Date</p>
                <p className="font-semibold text-neutral-900">{formatDate(order.orderDate)}</p>
              </div>
              <div>
                <p className="text-neutral-500">Status</p>
                <Badge variant="default">{order.status}</Badge>
              </div>
              <div>
                <p className="text-neutral-500">Payment</p>
                <p className="font-semibold text-neutral-900">{order.paymentMethod}</p>
              </div>
            </div>
          </div>

          {/* Customer info */}
          <div className="bg-white rounded-xl border border-neutral-200/80 p-6 space-y-4">
            <h2 className="font-display font-bold text-lg text-neutral-900 flex items-center gap-2">
              <Shield className="h-5 w-5 text-accent-600" />
              Customer Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-neutral-500">Name</p>
                <p className="font-medium text-neutral-900">{order.customerName}</p>
              </div>
              <div>
                <p className="text-neutral-500">Mobile</p>
                <p className="font-medium text-neutral-900">{order.mobile}</p>
              </div>
              {order.alternativeMobile && (
                <div>
                  <p className="text-neutral-500">Alternative Mobile</p>
                  <p className="font-medium text-neutral-900">{order.alternativeMobile}</p>
                </div>
              )}
              <div>
                <p className="text-neutral-500">Delivery Zone</p>
                <p className="font-medium text-neutral-900">{deliveryZoneLabel(order.deliveryZone)}</p>
              </div>
            </div>
            <div>
              <p className="text-neutral-500 mb-1">Address</p>
              <p className="text-sm font-medium text-neutral-900">
                {order.address}, {order.upazila}, {order.district}, {order.division}
                {order.postalCode && ` (${order.postalCode})`}
              </p>
            </div>
            {order.orderNotes && (
              <div>
                <p className="text-neutral-500 mb-1">Order Notes</p>
                <p className="text-sm text-neutral-700">{order.orderNotes}</p>
              </div>
            )}
          </div>

          {/* Items */}
          <div className="bg-white rounded-xl border border-neutral-200/80 p-6">
            <h2 className="font-display font-bold text-lg text-neutral-900 mb-4">
              Items ({order.items.length})
            </h2>
            <div className="space-y-4">
              {order.items.map((item, i) => (
                <div key={i} className="flex gap-4">
                  <img src={item.image} alt={item.name} className="h-16 w-16 rounded-lg object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">{item.name}</p>
                    <p className="text-xs text-neutral-500">
                      Qty: {item.quantity}
                      {item.size && <span> · {item.size}</span>}
                      {item.color && <span> · {item.color}</span>}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-neutral-900">{formatBDT(item.price * item.quantity)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Order total */}
          <div className="bg-white rounded-xl border border-neutral-200/80 p-6 space-y-3">
            <h2 className="font-display font-bold text-lg text-neutral-900">Total</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span>
                <span>{formatBDT(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Delivery ({deliveryZoneLabel(order.deliveryZone)})</span>
                <span>{formatBDT(order.deliveryCharge)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Discount</span>
                <span>৳0</span>
              </div>
              <div className="border-t border-neutral-200 pt-3 flex justify-between font-bold text-base text-neutral-900">
                <span>Total Paid</span>
                <span>{formatBDT(order.total)}</span>
              </div>
            </div>
          </div>

          {/* Payment method */}
          <div className="bg-white rounded-xl border border-neutral-200/80 p-6">
            <h3 className="font-semibold text-neutral-900 mb-3">Payment Method</h3>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center">
                {order.paymentMethod === 'Cash on Delivery' ? (
                  <Smartphone className="h-5 w-5" />
                ) : (
                  <CreditCard className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900">{order.paymentMethod}</p>
                <p className="text-xs text-neutral-500">{paymentMethod?.description}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Link to="/track-order" className="block">
              <Button variant="secondary" size="lg" className="w-full">
                <Truck className="h-5 w-5" />
                <span>Track Order</span>
              </Button>
            </Link>
            <Link to="/" className="block">
              <Button variant="outline" size="lg" className="w-full">
                <ArrowLeft className="h-5 w-5" />
                <span>Continue Shopping</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
