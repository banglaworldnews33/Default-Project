import { supabase } from '@/lib/supabase'
import type { MarketplaceProduct } from '@/types'
import {
  asString,
  collect,
  isRecord,
  requireConfigured,
  type DbResult,
} from './db'
import { toMarketplaceProduct } from './catalog'

const ADMIN_PRODUCT_COLUMNS =
  'id,seller_id,shop_id,category_id,name,slug,short_description,description,sku,price,compare_at_price,discount_price,stock_quantity,status,brand,is_featured,is_active,rejection_reason,owner_type,hidden_by_admin,hidden_at,created_at,updated_at'

export interface AdminProductListParams {
  status?: string
  limit?: number
  offset?: number
}

/**
 * Admin product reads + visibility RPCs (Migration 009).
 *
 * All writes go through the audited SECURITY DEFINER RPCs
 * public.hide_product(uuid) / public.restore_product(uuid).
 * hidden_by_admin / hidden_at are NEVER updated directly here —
 * the product guard trigger would reject non-admin writes anyway.
 * Ownership columns (owner_type, seller_id, shop_id) are never
 * written by this service.
 */
export const adminProductsService = {
  async getAdminProducts(params: AdminProductListParams = {}): Promise<DbResult<MarketplaceProduct[]>> {
    const missing = requireConfigured<MarketplaceProduct[]>()
    if (missing) return missing
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 100)
    const offset = Math.max(params.offset ?? 0, 0)
    let query = supabase
      .from('products')
      .select(ADMIN_PRODUCT_COLUMNS)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (params.status && params.status !== 'all') query = query.eq('status', params.status)
    const { data, error } = await query
    if (error) return { data: null, error }
    return { data: collect(data, toMarketplaceProduct), error: null }
  },

  /** Admin-only: hide a product via the audited RPC. */
  async hideProduct(productId: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<MarketplaceProduct>()
    if (missing) return { error: missing.error }
    const { error } = await supabase.rpc('hide_product', {
      p_product_id: productId,
    })
    return { error }
  },

  /** Admin-only: restore a hidden product via the audited RPC. */
  async restoreProduct(productId: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<MarketplaceProduct>()
    if (missing) return { error: missing.error }
    const { error } = await supabase.rpc('restore_product', {
      p_product_id: productId,
    })
    return { error }
  },
}

export interface AdminSellerProductInput {
  targetSellerId: string
  shopId: string
  categoryId: string
  name: string
  shortDescription: string | null
  description: string | null
  sku: string | null
  price: number
  compareAtPrice: number | null
  discountPrice: number | null
  stockQuantity: number
  brand: string | null
  status: 'draft' | 'pending_review' | 'approved'
  /** Per-admin code: transmitted only as an RPC argument, never stored. */
  adminCode: string
}

/**
 * Admin creates a seller-bound product (migration 010/011 RPC).
 *
 * The ONLY seller-owned admin creation path: code-gated, ownership
 * forced server-side (owner_type='seller', target seller/shop),
 * actor from auth.uid(), slug generated server-side, audit-linked.
 * No seller_id/shop_id/actor/slug from the browser is trusted.
 */
export async function createSellerProduct(
  input: AdminSellerProductInput,
): Promise<DbResult<{ productId: string }>> {
  const missing = requireConfigured<{ productId: string }>()
  if (missing) return missing
  const { data, error } = await supabase.rpc('admin_create_seller_product', {
    p_target_seller: input.targetSellerId,
    p_shop_id: input.shopId,
    p_category_id: input.categoryId,
    p_name: input.name,
    p_short_description: input.shortDescription,
    p_description: input.description,
    p_sku: input.sku,
    p_price: input.price,
    p_compare_at_price: input.compareAtPrice,
    p_discount_price: input.discountPrice,
    p_stock_quantity: input.stockQuantity,
    p_brand: input.brand,
    p_status: input.status,
    p_admin_code: input.adminCode,
  })
  if (error) return { data: null, error }
  const productId = asString(data)
  if (!productId) return { data: null, error: new Error('Unexpected response from product creation.') }
  return { data: { productId }, error: null }
}

export interface ProductAuditEntry {
  action: string
  productId: string
  targetUserId: string | null
  shopId: string | null
  createdAt: string
  /** Generic label for normal admins; real name only when the full RPC succeeds. */
  actorLabel: string
  /** Present only when the super-admin RPC succeeds; otherwise null. */
  adminId: string | null
  adminName: string | null
}

function toRedactedAuditEntry(row: unknown): ProductAuditEntry | null {
  if (!isRecord(row)) return null
  const action = asString(row.action)
  const productId = asString(row.product_id)
  const createdAt = asString(row.created_at)
  const actorLabel = asString(row.actor_label)
  if (!action || !productId || !createdAt || !actorLabel) return null
  return {
    action,
    productId,
    targetUserId: asString(row.target_user_id),
    shopId: asString(row.shop_id),
    createdAt,
    actorLabel,
    adminId: null,
    adminName: null,
  }
}

function toFullAuditEntry(row: unknown): ProductAuditEntry | null {
  if (!isRecord(row)) return null
  const action = asString(row.action)
  const productId = asString(row.product_id)
  const createdAt = asString(row.created_at)
  if (!action || !productId || !createdAt) return null
  const adminName = asString(row.admin_name)
  return {
    action,
    productId,
    targetUserId: asString(row.target_user_id),
    shopId: asString(row.shop_id),
    createdAt,
    actorLabel: adminName ? `Created by: ${adminName}` : 'Created by Admin',
    adminId: asString(row.admin_id),
    adminName,
  }
}

function isSuperAdminDenial(error: { message: string }): boolean {
  return error.message.includes('super-administrator access required')
}

/**
 * Product audit for the admin console (migration 010).
 *
 * Tries the super-admin full RPC first; on super-admin denial it
 * falls back to the redacted RPC. This is display routing only —
 * the database remains the authority in both calls, and no client
 * flag records the outcome. Never touches admin_audit_log directly.
 */
export async function getProductAudit(productId: string): Promise<DbResult<ProductAuditEntry[]>> {
  const missing = requireConfigured<ProductAuditEntry[]>()
  if (missing) return missing
  const full = await supabase.rpc('get_product_audit_full', {
    p_product_id: productId,
  })
  if (!full.error) return { data: collect(full.data, toFullAuditEntry), error: null }
  if (!isSuperAdminDenial(full.error)) return { data: null, error: full.error }
  const redacted = await supabase.rpc('get_product_audit_redacted', {
    p_product_id: productId,
  })
  if (redacted.error) return { data: null, error: redacted.error }
  return { data: collect(redacted.data, toRedactedAuditEntry), error: null }
}
