import { supabase } from '@/lib/supabase'
import {
  asNumber,
  asString,
  collect,
  isRecord,
  requireConfigured,
  type DbResult,
} from './db'

export interface AdminVariantAttributes {
  size?: string
  color?: string
}

function toVariantAttributes(row: unknown): AdminVariantAttributes {
  if (!isRecord(row)) return {}
  const size = row.size
  const color = row.color
  return {
    ...(typeof size === 'string' ? { size } : {}),
    ...(typeof color === 'string' ? { color } : {}),
  }
}

/**
 * One real order from get_admin_orders().
 * Field names match the RPC output exactly. Minimal operational
 * columns only — no internal identifiers (customer/seller/shop/
 * product/variant ids), no admin/audit data, no payment secrets.
 * The list carries no customer PII by design; identity lives on
 * the detail RPC only.
 */
export interface AdminOrderRow {
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

function toAdminOrderRow(row: unknown): AdminOrderRow | null {
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
 * One real order-item row from get_admin_order_detail().
 * Header fields repeat per row for a simple client render.
 * Includes the customer delivery snapshot because order
 * oversight is an operational admin function. No internal
 * identifiers, secrets, or audit internals.
 */
export interface AdminOrderDetailRow {
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
  variantAttributes: AdminVariantAttributes
  quantity: number
  unitPrice: number
  lineSubtotal: number
  fulfillmentStatus: string
  itemCreatedAt: string
  itemUpdatedAt: string
}

function toAdminOrderDetailRow(row: unknown): AdminOrderDetailRow | null {
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

/**
 * Keyset cursor for get_admin_orders(). Taken verbatim from the
 * last row of the previous page. Both fields must be set for the
 * cursor to apply; the RPC ignores a half-provided cursor and
 * returns the first page (fail closed to the start).
 */
export interface AdminOrdersCursor {
  createdBefore: string
  idBefore: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Server-requested page size for get_admin_orders(). */
export const ADMIN_ORDERS_PAGE_SIZE = 25

function friendlyError(message: string): string {
  if (/network|fetch|failed to send/i.test(message)) {
    return 'Network error. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Admin real-order reads (migration 015).
 *
 * Authorization is server-side only: both RPCs gate rows on
 * public.is_admin(). The frontend never sends role/admin flags
 * or identity, never decides authorization, and never queries
 * orders/order_items tables directly. Read-only: no status,
 * payment, refund, or cancellation path exists here.
 */
export const adminOrdersService = {
  /** One page of real orders, newest first (server-ordered). */
  async listAdminOrders(cursor?: AdminOrdersCursor): Promise<DbResult<AdminOrderRow[]>> {
    const missing = requireConfigured<AdminOrderRow[]>()
    if (missing) return missing
    const { data, error } = await supabase.rpc('get_admin_orders', {
      p_limit: ADMIN_ORDERS_PAGE_SIZE,
      p_created_before: cursor?.createdBefore ?? null,
      p_id_before: cursor?.idBefore ?? null,
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    return { data: collect(data, toAdminOrderRow), error: null }
  },

  /**
   * Real order slice for one order. Empty result means unavailable
   * (nonexistent or unauthorized) — callers show a generic
   * not-found state and never probe further.
   */
  async getAdminOrderDetail(orderId: string): Promise<DbResult<AdminOrderDetailRow[]>> {
    const missing = requireConfigured<AdminOrderDetailRow[]>()
    if (missing) return missing
    if (!UUID_RE.test(orderId)) return { data: [], error: null }
    const { data, error } = await supabase.rpc('get_admin_order_detail', {
      p_order_id: orderId,
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    return { data: collect(data, toAdminOrderDetailRow), error: null }
  },
}
