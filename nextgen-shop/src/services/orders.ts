import { supabase } from '@/lib/supabase'
import type { CartItem } from '@/types'
import {
  asString,
  requireConfigured,
  type DbResult,
} from './db'

/**
 * REAL Supabase order flow (migration 012) — preparation only.
 *
 * This module is intentionally NOT wired into CheckoutPage: the live
 * checkout remains the DEMO flow (services/index.ts orderService,
 * guest-friendly, localStorage). Use these functions only from a
 * future authenticated real-checkout behind a signed-in customer.
 *
 * The database derives everything authoritative (customer, prices,
 * sellers, totals, statuses). Arguments here are references +
 * fulfillment text + method/zone selectors — never money totals.
 */

export type RealDeliveryZone = 'inside-dhaka' | 'outside-dhaka'
export type RealPaymentMethod = 'cod' | 'bkash' | 'nagad'

export interface RealOrderItemInput {
  productId: string
  variantId: string | null
  quantity: number
}

export interface RealOrderAddressInput {
  customerName: string
  mobile: string
  alternativeMobile: string | null
  address: string
  division: string
  district: string
  upazila: string
  postalCode: string | null
  orderNotes: string | null
}

export interface RealCreateOrderInput {
  items: RealOrderItemInput[]
  address: RealOrderAddressInput
  deliveryZone: RealDeliveryZone
  paymentMethod: RealPaymentMethod
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validInput(input: RealCreateOrderInput): string | null {
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) {
    return 'Between 1 and 50 items are required.'
  }
  for (const item of input.items) {
    if (!UUID_RE.test(item.productId)) return 'Invalid product reference.'
    if (item.variantId !== null && !UUID_RE.test(item.variantId)) return 'Invalid variant reference.'
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      return 'Quantity must be 1-99.'
    }
  }
  // Client-side format checks are UX only; the RPC re-validates all
  // of this (plus everything money/ownership-related) server-side.
  if (input.address.customerName.trim().length < 2) return 'Enter the customer name.'
  if (!/^01[3-9]\d{8}$/.test(input.address.mobile.trim())) return 'Enter a valid BD mobile number.'
  if (input.address.address.trim().length < 5) return 'Enter the delivery address.'
  return null
}

export const ordersService = {  /**
   * Create a REAL order via the atomic create_order() RPC.
   * Requires a signed-in customer; the database derives customer,
   * prices, sellers, stock checks, and totals. Returns the order id
   * only — callers re-read the order through RLS-scoped queries.
   */
  async createOrder(input: RealCreateOrderInput): Promise<DbResult<{ orderId: string }>> {
    const missing = requireConfigured<{ orderId: string }>()
    if (missing) return missing
    const invalid = validInput(input)
    if (invalid) return { data: null, error: new Error(invalid) }
    const { data, error } = await supabase.rpc('create_order', {
      p_items: input.items.map((item) => ({
        product_id: item.productId,
        variant_id: item.variantId,
        quantity: item.quantity,
      })),
      p_customer_name: input.address.customerName.trim(),
      p_mobile: input.address.mobile.trim(),
      p_alternative_mobile: input.address.alternativeMobile,
      p_address: input.address.address.trim(),
      p_division: input.address.division,
      p_district: input.address.district,
      p_upazila: input.address.upazila.trim(),
      p_postal_code: input.address.postalCode,
      p_order_notes: input.address.orderNotes,
      p_delivery_zone: input.deliveryZone,
      p_payment_method: input.paymentMethod,
    })
    if (error) return { data: null, error }
    const orderId = asString(data)
    if (!orderId) return { data: null, error: new Error('Unexpected response from order creation.') }
    return { data: { orderId }, error: null }
  },
}

/**
 * Adapter: demo cart model -> REAL order RPC item references.
 *
 * Sends ONLY product references + quantities. Prices, names,
 * sellers, and totals are intentionally dropped here: the
 * database re-derives everything authoritative. Demo catalog
 * entries (non-UUID ids) fail closed with a clear message —
 * they can only ever use the DEMO checkout, never this path.
 */
export function mapDemoCartToRealItems(
  items: CartItem[],
): { ok: true; items: RealOrderItemInput[] } | { ok: false; message: string } {
  if (items.length < 1) return { ok: false, message: 'Your cart is empty.' }
  if (items.length > 50) return { ok: false, message: 'Real checkout supports up to 50 items.' }
  const mapped: RealOrderItemInput[] = []
  for (const item of items) {
    if (!UUID_RE.test(item.productId)) {
      return {
        ok: false,
        message: 'Your cart contains demo products, which cannot use real checkout. Please use the demo checkout for demo items.',
      }
    }
    // variantId passes through only when it is a valid UUID (set by
    // the real product page via addRealItem); otherwise null, and the
    // RPC enforces the variant rule server-side.
    const variantId =
      item.variantId !== undefined && item.variantId !== null && UUID_RE.test(item.variantId)
        ? item.variantId
        : null
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      return { ok: false, message: 'Quantities must be whole numbers from 1 to 99.' }
    }
    mapped.push({ productId: item.productId, variantId, quantity: item.quantity })
  }
  return { ok: true, items: mapped }
}
