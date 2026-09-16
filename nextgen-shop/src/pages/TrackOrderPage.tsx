import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Truck,
  ArrowLeft,
  Check,
  Clock,
  Package,
  MapPin,
  Phone,
} from 'lucide-react'
import { orderService } from '@/services'
import { formatBDT, formatDate } from '@/lib/utils'
import { ORDER_STATUS_FLOW } from '@/types'
import { deliveryZoneLabel } from '@/data/storeConfig'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

const STATUS_ICONS: Record<string, React.ReactNode> = {
  Pending: <Clock className="h-4 w-4" />,
  Confirmed: <Package className="h-4 w-4" />,
  Processing: <Package className="h-4 w-4" />,
  Shipped: <Truck className="h-4 w-4" />,
  Delivered: <Check className="h-4 w-4" />,
}

export const TrackOrderPage: React.FC = () => {
  const [orderId, setOrderId] = useState('')
  const [mobile, setMobile] = useState('')
  const [order, setOrder] = useState<ReturnType<typeof orderService.byId> | null>(null)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSearched(false)

    if (!orderId.trim()) {
      setError('Please enter an order ID.')
      return
    }
    if (!mobile.trim()) {
      setError('Please enter your mobile number.')
      return
    }

    const found = orderService.byId(orderId.trim())
    if (!found) {
      setError('No order found with that ID.')
      setOrder(null)
      setSearched(true)
      return
    }
    if (found.mobile !== mobile.trim()) {
      // Also check alternative mobile
      if (found.alternativeMobile !== mobile.trim()) {
        setError('Mobile number doesn&rsquo;t match our records.')
        setOrder(null)
        setSearched(true)
        return
      }
    }
    setOrder(found)
    setSearched(true)
  }

  const currentIndex = ORDER_STATUS_FLOW.indexOf(order?.status as typeof ORDER_STATUS_FLOW[number] ?? 'Pending')

  return (
    <div className="container-shop py-8 sm:py-12">
      <h1 className="text-3xl sm:text-4xl font-display font-bold text-neutral-900 mb-8">
        Track Order
      </h1>

      {/* Search form */}
      <form onSubmit={handleSearch} className="bg-white rounded-xl border border-neutral-200/80 p-6 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="track-orderId" className="block text-sm font-medium text-neutral-700 mb-1">
              Order ID
            </label>
            <input
              id="track-orderId"
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white transition-colors"
              placeholder="e.g. NGS-20260908-4821"
            />
          </div>
          <div>
            <label htmlFor="track-mobile" className="block text-sm font-medium text-neutral-700 mb-1">
              Mobile Number
            </label>
            <input
              id="track-mobile"
              type="tel"
              inputMode="numeric"
              maxLength={11}
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white transition-colors"
              placeholder="01XXXXXXXXX"
            />
          </div>
        </div>
        {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
        <Button type="submit" variant="secondary" size="md">
          <Search className="h-4 w-4" />
          <span>Track Order</span>
        </Button>
      </form>

      {/* Order found */}
      {order && (
        <div className="space-y-6">
          {/* Order info card */}
          <div className="bg-white rounded-xl border border-neutral-200/80 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="font-display font-bold text-lg text-neutral-900">{order.orderId}</h2>
                <p className="text-xs text-neutral-500">Placed on {formatDate(order.orderDate)}</p>
              </div>
              <Badge variant="default">{order.status}</Badge>
            </div>

            {/* Status timeline */}
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                {ORDER_STATUS_FLOW.map((status, i) => {
                  const isCompleted = i < currentIndex
                  const isCurrent = i === currentIndex
                  return (
                    <React.Fragment key={status}>
                      <div className="flex flex-col items-center relative z-10">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                            isCompleted
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : isCurrent
                              ? 'bg-white border-accent-600 text-accent-600'
                              : 'bg-white border-neutral-300 text-neutral-400'
                          }`}
                        >
                          {isCompleted ? <Check className="h-4 w-4" /> : STATUS_ICONS[status] ?? <Clock className="h-4 w-4" />}
                        </div>
                        <span
                          className={`text-[10px] mt-1.5 font-medium ${
                            isCompleted || isCurrent ? 'text-neutral-900' : 'text-neutral-400'
                          }`}
                        >
                          {status}
                        </span>
                      </div>
                      {i < ORDER_STATUS_FLOW.length - 1 && (
                        <div className={`flex-1 h-0.5 mx-1 rounded ${i < currentIndex ? 'bg-emerald-600' : 'bg-neutral-200'}`} />
                      )}
                    </React.Fragment>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Order details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-neutral-200/80 p-6 space-y-4">
              <h3 className="font-semibold text-neutral-900">Order Details</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-neutral-500">Address</p>
                    <p className="font-medium text-neutral-900">
                      {order.address}, {order.upazila}, {order.district}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Phone className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-neutral-500">Mobile</p>
                    <p className="font-medium text-neutral-900">{order.mobile}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Truck className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-neutral-500">Delivery Zone</p>
                    <p className="font-medium text-neutral-900">{deliveryZoneLabel(order.deliveryZone)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200/80 p-6 space-y-4">
              <h3 className="font-semibold text-neutral-900">Order Items</h3>
              <div className="space-y-3">
                {order.items.map((item, i) => (
                  <div key={i} className="flex gap-3">
                    <img src={item.image} alt={item.name} className="h-12 w-12 rounded-lg object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 line-clamp-1">{item.name}</p>
                      <p className="text-xs text-neutral-500">
                        Qty: {item.quantity} · {formatBDT(item.price * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-neutral-200 pt-3 text-sm">
                <div className="flex justify-between text-neutral-600">
                  <span>Total</span>
                  <span className="font-bold text-neutral-900">{formatBDT(order.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {searched && !order && (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center bg-neutral-50/50">
          <div className="h-12 w-12 rounded-full bg-neutral-200 text-neutral-500 flex items-center justify-center mx-auto mb-3">
            <Search className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900">No order found</h3>
          <p className="text-sm text-neutral-500 mt-1">Check the order ID and mobile number and try again.</p>
          <Link to="/" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent-700">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Home</span>
          </Link>
        </div>
      )}

      {!searched && (
        <div className="text-center py-12">
          <Truck className="h-16 w-16 text-neutral-300 mx-auto mb-4" />
          <p className="text-neutral-500">Enter your order ID and mobile number to track your order.</p>
        </div>
      )}
    </div>
  )
}
