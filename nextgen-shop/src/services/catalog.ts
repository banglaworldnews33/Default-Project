import { supabase } from '@/lib/supabase'
import type {
  MarketplaceCategory,
  MarketplaceProduct,
  MarketplaceProductImage,
} from '@/types'
import {
  asBoolean,
  asNumber,
  asString,
  collect,
  isRecord,
  requireConfigured,
  type DbError,
  type DbResult,
} from './db'

export function toMarketplaceCategory(row: unknown): MarketplaceCategory | null {
  if (!isRecord(row)) return null
  const id = asString(row.id)
  const name = asString(row.name)
  const slug = asString(row.slug)
  const createdAt = asString(row.created_at)
  const updatedAt = asString(row.updated_at)
  const sortOrder = asNumber(row.sort_order)
  const isActive = asBoolean(row.is_active)
  if (!id || !name || !slug || !createdAt || !updatedAt || sortOrder === null || isActive === null) {
    return null
  }
  return {
    id,
    name,
    slug,
    description: asString(row.description),
    imageUrl: asString(row.image_url),
    parentId: asString(row.parent_id),
    isActive,
    sortOrder,
    createdAt,
    updatedAt,
  }
}

function asProductStatus(value: unknown): MarketplaceProduct['status'] | null {
  return value === 'draft' ||
    value === 'pending_review' ||
    value === 'approved' ||
    value === 'rejected' ||
    value === 'inactive'
    ? value
    : null
}

export function toMarketplaceProduct(row: unknown): MarketplaceProduct | null {
  if (!isRecord(row)) return null
  const id = asString(row.id)
  const sellerId = asString(row.seller_id)
  const shopId = asString(row.shop_id)
  const categoryId = asString(row.category_id)
  const name = asString(row.name)
  const slug = asString(row.slug)
  const price = asNumber(row.price)
  const stockQuantity = asNumber(row.stock_quantity)
  const status = asProductStatus(row.status)
  const createdAt = asString(row.created_at)
  const updatedAt = asString(row.updated_at)
  const isFeatured = asBoolean(row.is_featured)
  const isActive = asBoolean(row.is_active)
  // Migration 009 columns: default safely when absent (old cached rows).
  const ownerRaw = asString(row.owner_type)
  const ownerType: MarketplaceProduct['ownerType'] =
    ownerRaw === 'admin' ? 'admin' : 'seller'
  const hiddenByAdmin = asBoolean(row.hidden_by_admin) ?? false
  const hiddenAt = asString(row.hidden_at)
  if (
    !id || !sellerId || !categoryId || !name || !slug ||
    price === null || stockQuantity === null || !status ||
    !createdAt || !updatedAt || isFeatured === null || isActive === null
  ) {
    return null
  }
  return {
    id,
    sellerId,
    shopId,
    categoryId,
    name,
    slug,
    shortDescription: asString(row.short_description),
    description: asString(row.description),
    sku: asString(row.sku),
    price,
    compareAtPrice: asNumber(row.compare_at_price),
    discountPrice: asNumber(row.discount_price),
    stockQuantity,
    status,
    brand: asString(row.brand),
    isFeatured,
    isActive,
    rejectionReason: asString(row.rejection_reason),
    ownerType,
    hiddenByAdmin,
    hiddenAt,
    createdAt,
    updatedAt,
  }
}

export function toMarketplaceProductImage(row: unknown): MarketplaceProductImage | null {
  if (!isRecord(row)) return null
  const id = asString(row.id)
  const productId = asString(row.product_id)
  const imageUrl = asString(row.image_url)
  const sortOrder = asNumber(row.sort_order)
  const isPrimary = asBoolean(row.is_primary)
  const createdAt = asString(row.created_at)
  if (!id || !productId || !imageUrl || sortOrder === null || isPrimary === null || !createdAt) {
    return null
  }
  return {
    id,
    productId,
    imageUrl,
    altText: asString(row.alt_text),
    sortOrder,
    isPrimary,
    createdAt,
    cloudinaryPublicId: asString(row.cloudinary_public_id),
  }
}

export interface ProductListParams {
  shopId?: string
  categoryId?: string
  limit?: number
  offset?: number
}

export interface PublicProductListParams {
  categoryId?: string
  /** UX-only substring search on name; RLS stays the security boundary. */
  search?: string
  limit?: number
  offset?: number
}

/** Escape LIKE wildcards so search input cannot widen the match. */
function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/** Public marketplace reads (RLS public policies apply). */
export const catalogService = {
  async listActiveCategories(): Promise<DbResult<MarketplaceCategory[]>> {
    const missing = requireConfigured<MarketplaceCategory[]>()
    if (missing) return missing
    const { data, error } = await supabase
      .from('categories')
      .select('id,name,slug,description,image_url,parent_id,is_active,sort_order,created_at,updated_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) return { data: null, error }
    return { data: collect(data, toMarketplaceCategory), error: null }
  },

  async listShopProducts(params: ProductListParams): Promise<DbResult<MarketplaceProduct[]>> {
    const missing = requireConfigured<MarketplaceProduct[]>()
    if (missing) return missing
    const limit = Math.min(Math.max(params.limit ?? 24, 1), 100)
    const offset = Math.max(params.offset ?? 0, 0)
    let query = supabase
      .from('products')
      .select(
        'id,seller_id,shop_id,category_id,name,slug,short_description,price,compare_at_price,discount_price,stock_quantity,status,brand,is_featured,is_active,owner_type,hidden_by_admin,hidden_at,created_at,updated_at',
      )
      .eq('status', 'approved')
      .eq('is_active', true)
      // Defense in depth: RLS already excludes hidden products, but the
      // client explicitly asks only for visible rows too.
      .eq('hidden_by_admin', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (params.shopId) query = query.eq('shop_id', params.shopId)
    if (params.categoryId) query = query.eq('category_id', params.categoryId)
    const { data, error } = await query
    if (error) return { data: null, error }
    return { data: collect(data, toMarketplaceProduct), error: null }
  },

  /**
   * Public marketplace listing across all shops (RLS public policies
   * apply: approved + active + visible only). Hidden/draft/rejected
   * rows can never surface here regardless of these filters.
   */
  async listPublicProducts(params: PublicProductListParams): Promise<DbResult<MarketplaceProduct[]>> {
    const missing = requireConfigured<MarketplaceProduct[]>()
    if (missing) return missing
    const limit = Math.min(Math.max(params.limit ?? 24, 1), 100)
    const offset = Math.max(params.offset ?? 0, 0)
    let query = supabase
      .from('products')
      .select(
        'id,seller_id,shop_id,category_id,name,slug,short_description,price,compare_at_price,discount_price,stock_quantity,status,brand,is_featured,is_active,owner_type,hidden_by_admin,hidden_at,created_at,updated_at',
      )
      .eq('status', 'approved')
      .eq('is_active', true)
      .eq('hidden_by_admin', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (params.categoryId) query = query.eq('category_id', params.categoryId)
    const search = params.search?.trim()
    if (search) query = query.ilike('name', `%${escapeLike(search)}%`)
    const { data, error } = await query
    if (error) return { data: null, error }
    return { data: collect(data, toMarketplaceProduct), error: null }
  },

  async getProductBySlug(slug: string): Promise<DbResult<MarketplaceProduct>> {    const missing = requireConfigured<MarketplaceProduct>()
    if (missing) return missing
    const { data, error } = await supabase
      .from('products')
      .select(
        'id,seller_id,shop_id,category_id,name,slug,short_description,description,sku,price,compare_at_price,discount_price,stock_quantity,status,brand,is_featured,is_active,rejection_reason,owner_type,hidden_by_admin,hidden_at,created_at,updated_at',
      )
      .eq('slug', slug)
      .maybeSingle()
    if (error) return { data: null, error }
    const product = toMarketplaceProduct(data)
    // RLS already hides non-public rows; treat hidden/non-approved as
    // not-found so direct access to a hidden product is safe.
    if (!product || product.status !== 'approved' || !product.isActive || product.hiddenByAdmin) {
      return { data: null, error: null }
    }
    return { data: product, error: null }
  },

  /**
   * Primary images for many products in ONE query (avoids N+1 on
   * listing pages). Returns productId -> image map.
   */
  async mapPrimaryImages(productIds: string[]): Promise<{ data: Record<string, MarketplaceProductImage>; error: DbError | null }> {
    const out: Record<string, MarketplaceProductImage> = {}
    if (productIds.length === 0) return { data: out, error: null }
    const missing = requireConfigured<MarketplaceProductImage[]>()
    if (missing) return { data: out, error: missing.error }
    const { data, error } = await supabase
      .from('product_images')
      .select('id,product_id,image_url,alt_text,sort_order,is_primary,created_at')
      .in('product_id', productIds)
      .eq('is_primary', true)
    if (error) return { data: out, error }
    for (const img of collect(data, toMarketplaceProductImage)) {
      out[img.productId] = img
    }
    return { data: out, error: null }
  },

  async listProductImages(productId: string): Promise<DbResult<MarketplaceProductImage[]>> {
    const missing = requireConfigured<MarketplaceProductImage[]>()
    if (missing) return missing
    const { data, error } = await supabase
      .from('product_images')
      .select('id,product_id,image_url,alt_text,sort_order,is_primary,created_at')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true })
    if (error) return { data: null, error }
    return { data: collect(data, toMarketplaceProductImage), error: null }
  },
}
