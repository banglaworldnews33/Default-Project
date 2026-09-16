import { supabase } from '@/lib/supabase'
import {
  asNumber,
  asString,
  collect,
  isRecord,
  requireConfigured,
  type DbResult,
} from './db'

/**
 * One customer of the calling seller, exactly as returned by
 * get_seller_customers() (migration 023 contract). This is the
 * minimal operational summary: latest name/mobile snapshot plus
 * per-seller counts. No email, no address, no payment data, no
 * unrelated profile fields exist here by construction.
 */
export interface SellerCustomer {
  customerId: string
  customerName: string
  customerMobile: string
  totalOrders: number
  totalItems: number
  lastOrderAt: string
}

function asCount(value: unknown): number | null {
  const n = asNumber(value)
  if (n === null || !Number.isInteger(n) || n < 0) return null
  return n
}

/**
 * Local date guard (same rule as the reviews service keeps
 * locally so frozen modules stay untouched): only non-empty
 * strings that parse as dates are accepted, so an
 * "Invalid Date" can never reach the UI.
 */
function toValidDateString(value: unknown): string | null {
  const s = asString(value)
  if (!s || Number.isNaN(Date.parse(s))) return null
  return s
}

function toSellerCustomer(row: unknown): SellerCustomer | null {
  if (!isRecord(row)) return null
  const customerId = asString(row.customer_id)
  const customerName = asString(row.customer_name)
  const customerMobile = asString(row.customer_mobile)
  const totalOrders = asCount(row.total_orders_with_this_seller)
  const totalItems = asCount(row.total_items_with_this_seller)
  const lastOrderAt = toValidDateString(row.last_order_at)
  if (
    !customerId || !customerName || !customerMobile ||
    totalOrders === null || totalItems === null || !lastOrderAt
  ) {
    return null
  }
  return { customerId, customerName, customerMobile, totalOrders, totalItems, lastOrderAt }
}

/**
 * Keyset cursor for get_seller_customers(). Taken verbatim from
 * the last row of the previous page. A malformed cursor fails
 * closed to the first page (never to an error state).
 */
export interface SellerCustomersCursor {
  cursorAt: string
  cursorId: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const SELLER_CUSTOMERS_PAGE_SIZE = 25

function friendlyError(message: string): string {
  if (/network|fetch|failed to send/i.test(message)) {
    return 'Network error. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Seller customer directory reads (migration 023 RPC contract).
 *
 * Authorization is server-side only: the RPC derives the seller
 * from auth.uid() plus the verified-seller predicate and scopes
 * rows to orders containing the caller's own items. The
 * frontend never sends seller identity, never queries
 * profiles/orders/order_items directly, and never aggregates.
 * Read-only: no customer write path exists here.
 */
export const sellerCustomersService = {
  /** Own customers, most-recent-first (server-ordered). */
  async listCustomers(
    cursor?: SellerCustomersCursor,
    search?: string | null,
  ): Promise<DbResult<SellerCustomer[]>> {
    const missing = requireConfigured<SellerCustomer[]>()
    if (missing) return missing
    const cursorValid =
      cursor !== undefined &&
      !!cursor.cursorAt &&
      UUID_RE.test(cursor.cursorId)
    const { data, error } = await supabase.rpc('get_seller_customers', {
      p_limit: SELLER_CUSTOMERS_PAGE_SIZE,
      p_cursor_at: cursorValid ? cursor.cursorAt : null,
      p_cursor_id: cursorValid ? cursor.cursorId : null,
      p_search: search ?? null,
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    return { data: collect(data, toSellerCustomer), error: null }
  },
}
