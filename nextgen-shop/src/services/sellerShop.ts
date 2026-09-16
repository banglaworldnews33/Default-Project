import { supabase } from '@/lib/supabase'
import type { SellerShop, ShopStatus } from '@/types'
import {
  asString,
  currentUserId,
  isRecord,
  requireConfigured,
  type DbResult,
} from './db'

function asShopStatus(value: unknown): ShopStatus | null {
  return value === 'active' || value === 'inactive' || value === 'suspended' ? value : null
}

export function toSellerShop(row: unknown): SellerShop | null {
  if (!isRecord(row)) return null
  const id = asString(row.id)
  const sellerId = asString(row.seller_id)
  const shopName = asString(row.shop_name)
  const shopSlug = asString(row.shop_slug)
  const status = asShopStatus(row.status)
  const createdAt = asString(row.created_at)
  const updatedAt = asString(row.updated_at)
  if (!id || !sellerId || !shopName || !shopSlug || !status || !createdAt || !updatedAt) return null
  return {
    id,
    sellerId,
    shopName,
    shopSlug,
    description: asString(row.description),
    logoUrl: asString(row.logo_url),
    bannerUrl: asString(row.banner_url),
    logoPublicId: asString(row.logo_public_id),
    bannerPublicId: asString(row.banner_public_id),
    status,
    createdAt,
    updatedAt,
  }
}

export interface ShopInput {
  shopName: string
  shopSlug: string
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
}

export interface ShopBasicsInput {
  shopName?: string
  description?: string | null
  logoUrl?: string | null
  bannerUrl?: string | null
  logoPublicId?: string | null
  bannerPublicId?: string | null
}

function isHttpsUrl(value: string | null): boolean {
  return value === null || value.startsWith('https://')
}

export const sellerShopService = {
  /** Own shop for the signed-in seller (RLS owner-read). */
  async getMine(): Promise<DbResult<SellerShop>> {
    const missing = requireConfigured<SellerShop>()
    if (missing) return missing
    const uid = await currentUserId()
    if (!uid) return { data: null, error: new Error('Sign in required.') }
    const { data, error } = await supabase
      .from('seller_shops')
      .select('*')
      .eq('seller_id', uid)
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toSellerShop(data), error: null }
  },

  /**
   * Create the caller's shop. seller_id is derived from the session
   * (never input); status is forced active by RLS; slug uniqueness is
   * enforced by the database constraint.
   */
  async create(input: ShopInput): Promise<DbResult<SellerShop>> {
    const missing = requireConfigured<SellerShop>()
    if (missing) return missing
    const uid = await currentUserId()
    if (!uid) return { data: null, error: new Error('Sign in required.') }
    if (!isHttpsUrl(input.logoUrl) || !isHttpsUrl(input.bannerUrl)) {
      return { data: null, error: new Error('Logo and banner must be https:// URLs.') }
    }
    const { data, error } = await supabase
      .from('seller_shops')
      .insert({
        seller_id: uid,
        shop_name: input.shopName,
        shop_slug: input.shopSlug,
        description: input.description,
        logo_url: input.logoUrl,
        banner_url: input.bannerUrl,
        status: 'active',
      })
      .select()
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toSellerShop(data), error: null }
  },

  /**
   * Update safe shop fields only. Ownership, slug and status are
   * excluded from the payload itself (defense in depth: the RLS WITH
   * CHECK plus the immutability trigger reject them regardless).
   */
  async updateBasics(shopId: string, input: ShopBasicsInput): Promise<DbResult<SellerShop>> {
    const missing = requireConfigured<SellerShop>()
    if (missing) return missing
    // Only defined keys are sent: ownership, slug and status can never
    // appear here (RLS WITH CHECK + trigger reject them regardless).
    const patch: Record<string, string | null> = {}
    if (input.shopName !== undefined) patch.shop_name = input.shopName
    if (input.description !== undefined) patch.description = input.description
    if (input.logoUrl !== undefined) patch.logo_url = input.logoUrl
    if (input.bannerUrl !== undefined) patch.banner_url = input.bannerUrl
    if (input.logoPublicId !== undefined) patch.logo_public_id = input.logoPublicId
    if (input.bannerPublicId !== undefined) patch.banner_public_id = input.bannerPublicId
    for (const key of ['logo_url', 'banner_url'] as const) {
      const value = patch[key]
      if (value !== undefined && !isHttpsUrl(value)) {
        return { data: null, error: new Error('Logo and banner must be https:// URLs.') }
      }
    }
    if (Object.keys(patch).length === 0) {
      return { data: null, error: new Error('Nothing to update.') }
    }
    const { data, error } = await supabase
      .from('seller_shops')
      .update(patch)
      .eq('id', shopId)
      .select()
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toSellerShop(data), error: null }
  },

  /** Public storefront lookup by slug (public-active policy). */
  async getBySlug(slug: string): Promise<DbResult<SellerShop>> {
    const missing = requireConfigured<SellerShop>()
    if (missing) return missing
    const { data, error } = await supabase
      .from('seller_shops')
      .select('*')
      .eq('shop_slug', slug)
      .maybeSingle()
    if (error) return { data: null, error }
    const shop = toSellerShop(data)
    if (!shop || shop.status !== 'active') return { data: null, error: null }
    return { data: shop, error: null }
  },

  /** Single shop by id (public-active or admin policy decides visibility). */
  async getById(shopId: string): Promise<DbResult<SellerShop>> {
    const missing = requireConfigured<SellerShop>()
    if (missing) return missing
    const { data, error } = await supabase
      .from('seller_shops')
      .select('*')
      .eq('id', shopId)
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toSellerShop(data), error: null }
  },

  /**
   * Shop owned by a given seller (admin use: applicant/shop inspection).
   * RLS decides visibility — non-admins only ever match their own id.
   */
  async getShopBySeller(sellerId: string): Promise<DbResult<SellerShop>> {
    const missing = requireConfigured<SellerShop>()
    if (missing) return missing
    const { data, error } = await supabase
      .from('seller_shops')
      .select('*')
      .eq('seller_id', sellerId)
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toSellerShop(data), error: null }
  },

  /** Product count for a shop (counts only rows the caller may see). */
  async countProducts(shopId: string): Promise<number> {
    if (!shopId) return 0
    const { count, error } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId)
    if (error || typeof count !== 'number') return 0
    return count
  },
}
