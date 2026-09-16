import { supabase } from '@/lib/supabase'
import {
  asNumber,
  asString,
  collect,
  isRecord,
  requireConfigured,
  type DbResult,
} from './db'

export interface CustomerVariantAttributes {
  size?: string
  color?: string
}

function toVariantAttributes(row: unknown): CustomerVariantAttributes {
  if (!isRecord(row)) return {}
  const size = row.size
  const color = row.color
  return {
    ...(typeof size === 'string' ? { size } : {}),
    ...(typeof color === 'string' ? { color } : {}),
  }
}

/**
 * One own order from get_customer_orders().
 * Field names match the RPC output exactly. Minimal customer-safe
 * columns only — no internal identifiers (customer/seller/shop/
 * product/variant ids), no admin/audit data, no payment secrets.
 */
export interface CustomerOrderRow {
  orderId: string
  orderNumber: string
  createdAt: string
  orderStatus: string
  paymentMethod: string
  paymentStatus: string
  subtotal: number
  deliveryCharge: number
  discount: number
  total: number
  deliveryZone: string
  itemCount: number
  totalQuantity: number
}

function toCustomerOrderRow(row: unknown): CustomerOrderRow | null {
  if (!isRecord(row)) return null
  const orderId = asString(row.order_id)
  const orderNumber = asString(row.order_number)
  const createdAt = asString(row.created_at)
  const orderStatus = asString(row.order_status)
  const paymentMethod = asString(row.payment_method)
  const paymentStatus = asString(row.payment_status)
  const subtotal = asNumber(row.subtotal)
  const deliveryCharge = asNumber(row.delivery_charge)
  const discount = asNumber(row.discount)
  const total = asNumber(row.total)
  const deliveryZone = asString(row.delivery_zone)
  const itemCount = asNumber(row.item_count)
  const totalQuantity = asNumber(row.total_quantity)
  if (
    !orderId || !orderNumber || !createdAt || !orderStatus ||
    !paymentMethod || !paymentStatus ||
    subtotal === null || deliveryCharge === null || discount === null ||
    total === null || !deliveryZone ||
    itemCount === null || totalQuantity === null
  ) {
    return null
  }
  return {
    orderId,
    orderNumber,
    createdAt,
    orderStatus,
    paymentMethod,
    paymentStatus,
    subtotal,
    deliveryCharge,
    discount,
    total,
    deliveryZone,
    itemCount,
    totalQuantity,
  }
}

/**
 * One own order-item row from get_customer_order_detail().
 * Header fields repeat per row for a simple client render.
 * The customer owns the complete order, so per-item
 * fulfillment_status is included. No internal identifiers.
 */
export interface CustomerOrderDetailRow {
  orderId: string
  orderNumber: string
  createdAt: string
  orderStatus: string
  paymentMethod: string
  paymentStatus: string
  subtotal: number
  deliveryCharge: number
  discount: number
  total: number
  deliveryZone: string
  customerName: string | null
  customerMobile: string | null
  addressLine: string | null
  division: string | null
  district: string | null
  upazila: string | null
  postalCode: string | null
  orderNotes: string | null
  productName: string
  sku: string | null
  variantName: string | null
  variantAttributes: CustomerVariantAttributes
  quantity: number
  unitPrice: number
  lineSubtotal: number
  fulfillmentStatus: string
  itemCreatedAt: string
  itemUpdatedAt: string
}

function toCustomerOrderDetailRow(row: unknown): CustomerOrderDetailRow | null {
  if (!isRecord(row)) return null
  const orderId = asString(row.order_id)
  const orderNumber = asString(row.order_number)
  const createdAt = asString(row.created_at)
  const orderStatus = asString(row.order_status)
  const paymentMethod = asString(row.payment_method)
  const paymentStatus = asString(row.payment_status)
  const subtotal = asNumber(row.subtotal)
  const deliveryCharge = asNumber(row.delivery_charge)
  const discount = asNumber(row.discount)
  const total = asNumber(row.total)
  const deliveryZone = asString(row.delivery_zone)
  const productName = asString(row.product_name)
  const quantity = asNumber(row.quantity)
  const unitPrice = asNumber(row.unit_price)
  const lineSubtotal = asNumber(row.line_subtotal)
  const fulfillmentStatus = asString(row.fulfillment_status)
  const itemCreatedAt = asString(row.item_created_at)
  const itemUpdatedAt = asString(row.item_updated_at)
  if (
    !orderId || !orderNumber || !createdAt || !orderStatus ||
    !paymentMethod || !paymentStatus ||
    subtotal === null || deliveryCharge === null || discount === null ||
    total === null || !deliveryZone ||
    !productName || quantity === null || unitPrice === null ||
    lineSubtotal === null || !fulfillmentStatus ||
    !itemCreatedAt || !itemUpdatedAt
  ) {
    return null
  }
  return {
    orderId,
    orderNumber,
    createdAt,
    orderStatus,
    paymentMethod,
    paymentStatus,
    subtotal,
    deliveryCharge,
    discount,
    total,
    deliveryZone,
    customerName: asString(row.customer_name),
    customerMobile: asString(row.customer_mobile),
    addressLine: asString(row.address_line),
    division: asString(row.division),
    district: asString(row.district),
    upazila: asString(row.upazila),
    postalCode: asString(row.postal_code),
    orderNotes: asString(row.order_notes),
    productName,
    sku: asString(row.sku),
    variantName: asString(row.variant_name),
    variantAttributes: toVariantAttributes(row.variant_attributes),
    quantity,
    unitPrice,
    lineSubtotal,
    fulfillmentStatus,
    itemCreatedAt,
    itemUpdatedAt,
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function friendlyError(message: string): string {
  if (/network|fetch|failed to send/i.test(message)) {
    return 'Network error. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Customer order history reads (migration 014).
 *
 * Authorization is server-side only: both RPCs scope rows to
 * orders.customer_id = auth.uid(). The frontend never sends
 * customer/user identity, never decides ownership, and never
 * queries orders/order_items tables directly.
 */
export const customerOrdersService = {
  /** Own orders, one row per order, newest first (server-ordered). */
  async listCustomerOrders(): Promise<DbResult<CustomerOrderRow[]>> {
    const missing = requireConfigured<CustomerOrderRow[]>()
    if (missing) return missing
    const { data, error } = await supabase.rpc('get_customer_orders')
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    return { data: collect(data, toCustomerOrderRow), error: null }
  },

  /**
   * Own order slice for one order. Empty result means unavailable
   * (nonexistent, foreign, or unauthorized) — callers show a
   * generic not-found state and never probe further.
   */
  async getCustomerOrderDetail(orderId: string): Promise<DbResult<CustomerOrderDetailRow[]>> {
    const missing = requireConfigured<CustomerOrderDetailRow[]>()
    if (missing) return missing
    if (!UUID_RE.test(orderId)) return { data: [], error: null }
    const { data, error } = await supabase.rpc('get_customer_order_detail', {
      p_order_id: orderId,
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    return { data: collect(data, toCustomerOrderDetailRow), error: null }
  },
}
