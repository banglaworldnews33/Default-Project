import { supabase } from '@/lib/supabase'
import {
  asNumber,
  asString,
  collect,
  isRecord,
  requireConfigured,
  type DbResult,
} from './db'

export type FulfillmentStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

const FULFILLMENT_STATUSES: readonly FulfillmentStatus[] = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
] as const

function asFulfillmentStatus(value: unknown): FulfillmentStatus | null {
  return (FULFILLMENT_STATUSES as readonly string[]).includes(value as string)
    ? (value as FulfillmentStatus)
    : null
}

/**
 * UX-only transition map. Mirrors the database transition table
 * exactly; the update RPC re-validates server-side and remains the
 * authority. No other transition may be offered or sent.
 */
export const FULFILLMENT_NEXT: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

export interface VariantAttributes {
  size?: string
  color?: string
}

function toVariantAttributes(row: unknown): VariantAttributes {
  if (!isRecord(row)) return {}
  const size = row.size
  const color = row.color
  return {
    ...(typeof size === 'string' ? { size } : {}),
    ...(typeof color === 'string' ? { color } : {}),
  }
}

/**
 * One seller-owned order-item row from get_seller_orders().
 * Field names match the RPC output exactly. No customer PII exists
 * on this shape by construction (the RPC selects none).
 */
export interface SellerOrderItemRow {
  orderId: string
  orderNumber: string
  orderCreatedAt: string
  parentOrderStatus: string
  itemId: string
  productName: string
  sku: string | null
  variantName: string | null
  variantAttributes: VariantAttributes
  quantity: number
  unitPrice: number
  lineSubtotal: number
  fulfillmentStatus: FulfillmentStatus
  itemCreatedAt: string
}

function toSellerOrderItemRow(row: unknown): SellerOrderItemRow | null {
  if (!isRecord(row)) return null
  const orderId = asString(row.order_id)
  const orderNumber = asString(row.order_number)
  const orderCreatedAt = asString(row.order_created_at)
  const parentOrderStatus = asString(row.parent_order_status)
  const itemId = asString(row.item_id)
  const productName = asString(row.product_name)
  const quantity = asNumber(row.quantity)
  const unitPrice = asNumber(row.unit_price)
  const lineSubtotal = asNumber(row.line_subtotal)
  const fulfillmentStatus = asFulfillmentStatus(row.fulfillment_status)
  const itemCreatedAt = asString(row.item_created_at)
  if (
    !orderId || !orderNumber || !orderCreatedAt || !parentOrderStatus ||
    !itemId || !productName || quantity === null || unitPrice === null ||
    lineSubtotal === null || !fulfillmentStatus || !itemCreatedAt
  ) {
    return null
  }
  return {
    orderId,
    orderNumber,
    orderCreatedAt,
    parentOrderStatus,
    itemId,
    productName,
    sku: asString(row.sku),
    variantName: asString(row.variant_name),
    variantAttributes: toVariantAttributes(row.variant_attributes),
    quantity,
    unitPrice,
    lineSubtotal,
    fulfillmentStatus,
    itemCreatedAt,
  }
}

/**
 * Detail row from get_seller_order_detail(). Same as the list row
 * plus nullable delivery contact/address fields. NULL means the
 * server redacted them (terminal items) or they were never set —
 * callers render `—` and must never seek them elsewhere.
 */
export interface SellerOrderDetailRow extends SellerOrderItemRow {
  customerName: string | null
  customerMobile: string | null
  deliveryAddress: string | null
  deliveryDivision: string | null
  deliveryDistrict: string | null
  deliveryUpazila: string | null
  deliveryPostalCode: string | null
}

function toSellerOrderDetailRow(row: unknown): SellerOrderDetailRow | null {
  const base = toSellerOrderItemRow(row)
  if (!base || !isRecord(row)) return null
  return {
    ...base,
    customerName: asString(row.customer_name),
    customerMobile: asString(row.customer_mobile),
    deliveryAddress: asString(row.delivery_address),
    deliveryDivision: asString(row.delivery_division),
    deliveryDistrict: asString(row.delivery_district),
    deliveryUpazila: asString(row.delivery_upazila),
    deliveryPostalCode: asString(row.delivery_postal_code),
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function friendlyError(message: string): string {
  if (message.startsWith('fulfillment: ')) return message.slice('fulfillment: '.length)
  if (/network|fetch|failed to send/i.test(message)) {
    return 'Network error. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Seller order reads + fulfillment writes (migration 013).
 *
 * All authorization is server-side: list/detail RPCs scope rows to
 * the caller's own items, and the update RPC re-checks ownership,
 * verification, and transitions. The frontend never decides
 * ownership, identity, money, or status.
 */
export const sellerOrdersService = {
  /** Own order-item rows with parent reference fields (no PII). */
  async listSellerOrders(): Promise<DbResult<SellerOrderItemRow[]>> {
    const missing = requireConfigured<SellerOrderItemRow[]>()
    if (missing) return missing
    const { data, error } = await supabase.rpc('get_seller_orders', {})
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    return { data: collect(data, toSellerOrderItemRow), error: null }
  },

  /**
   * Own item rows for one order. Empty result means unavailable
   * (nonexistent, foreign, or unauthorized) — callers show a
   * generic not-found state and never probe further.
   */
  async getSellerOrderDetail(orderId: string): Promise<DbResult<SellerOrderDetailRow[]>> {
    const missing = requireConfigured<SellerOrderDetailRow[]>()
    if (missing) return missing
    if (!UUID_RE.test(orderId)) return { data: [], error: null }
    const { data, error } = await supabase.rpc('get_seller_order_detail', {
      p_order_id: orderId,
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    return { data: collect(data, toSellerOrderDetailRow), error: null }
  },

  /**
   * Advance one item's fulfillment stage. Guards (UUID shape,
   * transition membership, dedupe) are UX-only; the RPC enforces.
   * Callers must refetch from the database after success.
   */
  async updateFulfillment(itemId: string, status: FulfillmentStatus): Promise<{ error: Error | null }> {
    const missing = requireConfigured<null>()
    if (missing) return { error: missing.error }
    if (!UUID_RE.test(itemId)) return { error: new Error('Invalid order item reference.') }
    const { error } = await supabase.rpc('update_seller_fulfillment', {
      p_item_id: itemId,
      p_status: status,
    })
    if (error) return { error: new Error(friendlyError(error.message)) }
    return { error: null }
  },
}
