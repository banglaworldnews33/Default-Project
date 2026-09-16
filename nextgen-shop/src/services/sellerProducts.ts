import { supabase } from '@/lib/supabase'
import type {
  MarketplaceProduct,
  MarketplaceProductImage,
  MarketplaceProductStatus,
  MarketplaceProductVariant,
  MarketplaceVariantAttributes,
} from '@/types'
import {
  asBoolean,
  asNumber,
  asString,
  collect,
  currentUserId,
  isRecord,
  requireConfigured,
  type DbResult,
} from './db'
import { toMarketplaceProduct, toMarketplaceProductImage } from './catalog'

export function toMarketplaceVariant(row: unknown): MarketplaceProductVariant | null {
  if (!isRecord(row)) return null
  const id = asString(row.id)
  const productId = asString(row.product_id)
  const name = asString(row.name)
  const stockQuantity = asNumber(row.stock_quantity)
  const createdAt = asString(row.created_at)
  const updatedAt = asString(row.updated_at)
  const isActive = asBoolean(row.is_active)
  if (!id || !productId || !name || stockQuantity === null || !createdAt || !updatedAt || isActive === null) {
    return null
  }
  let attributes: MarketplaceVariantAttributes = {}
  if (isRecord(row.attributes)) {
    const size = row.attributes.size
    const color = row.attributes.color
    attributes = {
      ...(typeof size === 'string' ? { size } : {}),
      ...(typeof color === 'string' ? { color } : {}),
    }
  }
  return {
    id,
    productId,
    sku: asString(row.sku),
    name,
    attributes,
    priceOverride: asNumber(row.price_override),
    stockQuantity,
    isActive,
    createdAt,
    updatedAt,
  }
}

export interface ProductInput {
  shopId: string
  categoryId: string
  name: string
  slug: string
  shortDescription: string | null
  description: string | null
  sku: string | null
  price: number
  compareAtPrice: number | null
  discountPrice: number | null
  stockQuantity: number
  brand: string | null
}

export interface ProductPatch {
  name?: string
  categoryId?: string
  shortDescription?: string | null
  description?: string | null
  sku?: string | null
  price?: number
  compareAtPrice?: number | null
  discountPrice?: number | null
  stockQuantity?: number
  brand?: string | null
  isActive?: boolean
}

export interface VariantInput {
  name: string
  size: string | null
  color: string | null
  sku: string | null
  priceOverride: number | null
  stockQuantity: number
}

const PRODUCT_COLUMNS =
  'id,seller_id,shop_id,category_id,name,slug,short_description,description,sku,price,compare_at_price,discount_price,stock_quantity,status,brand,is_featured,is_active,rejection_reason,owner_type,hidden_by_admin,hidden_at,created_at,updated_at'

/** Seller-owned catalog writes. Identity always from the session. */
export const sellerProductsService = {
  async listMine(): Promise<DbResult<MarketplaceProduct[]>> {
    const missing = requireConfigured<MarketplaceProduct[]>()
    if (missing) return missing
    const uid = await currentUserId()
    if (!uid) return { data: null, error: new Error('Sign in required.') }
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('seller_id', uid)
      .order('updated_at', { ascending: false })
      .limit(200)
    if (error) return { data: null, error }
    return { data: collect(data, toMarketplaceProduct), error: null }
  },

  async getMine(productId: string): Promise<DbResult<MarketplaceProduct>> {
    const missing = requireConfigured<MarketplaceProduct>()
    if (missing) return missing
    const uid = await currentUserId()
    if (!uid) return { data: null, error: new Error('Sign in required.') }
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('id', productId)
      .eq('seller_id', uid)
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toMarketplaceProduct(data), error: null }
  },

  /** Create as draft (status forced; RLS rejects approved). */
  async create(input: ProductInput): Promise<DbResult<MarketplaceProduct>> {
    const missing = requireConfigured<MarketplaceProduct>()
    if (missing) return missing
    const uid = await currentUserId()
    if (!uid) return { data: null, error: new Error('Sign in required.') }
    const { data, error } = await supabase
      .from('products')
      .insert({
        seller_id: uid,
        shop_id: input.shopId,
        category_id: input.categoryId,
        name: input.name,
        slug: input.slug,
        short_description: input.shortDescription,
        description: input.description,
        sku: input.sku,
        price: input.price,
        compare_at_price: input.compareAtPrice,
        discount_price: input.discountPrice,
        stock_quantity: input.stockQuantity,
        brand: input.brand,
        status: 'draft',
        // Migration 009: sellers may only create seller-owned products.
        owner_type: 'seller',
      })
      .select(PRODUCT_COLUMNS)
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toMarketplaceProduct(data), error: null }
  },

  /**
   * Update safe fields of an owned product. Ownership, shop and status
   * are excluded from the payload itself (RLS WITH CHECK + trigger
   * reject them regardless — defense in depth).
   */
  async updateBasics(productId: string, patch: ProductPatch): Promise<DbResult<MarketplaceProduct>> {
    const missing = requireConfigured<MarketplaceProduct>()
    if (missing) return missing
    const uid = await currentUserId()
    if (!uid) return { data: null, error: new Error('Sign in required.') }
    const { data, error } = await supabase
      .from('products')
      .update({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.categoryId !== undefined ? { category_id: patch.categoryId } : {}),
        ...(patch.shortDescription !== undefined ? { short_description: patch.shortDescription } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.sku !== undefined ? { sku: patch.sku } : {}),
        ...(patch.price !== undefined ? { price: patch.price } : {}),
        ...(patch.compareAtPrice !== undefined ? { compare_at_price: patch.compareAtPrice } : {}),
        ...(patch.discountPrice !== undefined ? { discount_price: patch.discountPrice } : {}),
        ...(patch.stockQuantity !== undefined ? { stock_quantity: patch.stockQuantity } : {}),
        ...(patch.brand !== undefined ? { brand: patch.brand } : {}),
        ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
      })
      .eq('id', productId)
      .eq('seller_id', uid)
      .select(PRODUCT_COLUMNS)
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toMarketplaceProduct(data), error: null }
  },

  /** Move own product draft|rejected|inactive -> pending_review (RLS allows; trigger maps it). */
  async submitForReview(productId: string): Promise<DbResult<MarketplaceProduct>> {
    const missing = requireConfigured<MarketplaceProduct>()
    if (missing) return missing
    const uid = await currentUserId()
    if (!uid) return { data: null, error: new Error('Sign in required.') }
    const { data, error } = await supabase
      .from('products')
      .update({ status: 'pending_review' satisfies MarketplaceProductStatus })
      .eq('id', productId)
      .eq('seller_id', uid)
      .select(PRODUCT_COLUMNS)
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toMarketplaceProduct(data), error: null }
  },

  /** Voluntarily unlist an owned product (approved -> inactive). */
  async deactivate(productId: string): Promise<DbResult<MarketplaceProduct>> {
    const missing = requireConfigured<MarketplaceProduct>()
    if (missing) return missing
    const uid = await currentUserId()
    if (!uid) return { data: null, error: new Error('Sign in required.') }
    const { data, error } = await supabase
      .from('products')
      .update({ status: 'inactive' satisfies MarketplaceProductStatus })
      .eq('id', productId)
      .eq('seller_id', uid)
      .select(PRODUCT_COLUMNS)
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toMarketplaceProduct(data), error: null }
  },

  async listImages(productId: string): Promise<DbResult<MarketplaceProductImage[]>> {
    const missing = requireConfigured<MarketplaceProductImage[]>()
    if (missing) return missing
    const { data, error } = await supabase
      .from('product_images')
      .select('id,product_id,image_url,alt_text,sort_order,is_primary,created_at,cloudinary_public_id')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true })
    if (error) return { data: null, error }
    return { data: collect(data, toMarketplaceProductImage), error: null }
  },

  /**
   * Add an image row. The optional metadata comes from a validated
   * Cloudinary upload (see services/mediaUpload.ts); legacy plain-URL
   * rows keep working with metadata omitted (columns stay NULL).
   */
  async addImage(
    productId: string,
    imageUrl: string,
    altText: string | null,
    isPrimary: boolean,
    metadata?: { publicId: string; width: number; height: number; bytes: number; format: string },
  ): Promise<DbResult<MarketplaceProductImage>> {
    const missing = requireConfigured<MarketplaceProductImage>()
    if (missing) return missing
    if (!imageUrl.startsWith('https://')) {
      return { data: null, error: new Error('Image URL must start with https://') }
    }
    const { data, error } = await supabase
      .from('product_images')
      .insert({
        product_id: productId,
        image_url: imageUrl,
        alt_text: altText,
        is_primary: isPrimary,
        // Provider is 'cloudinary' ONLY for validated uploads; legacy
        // plain-URL rows stay NULL so they are never mislabeled.
        storage_provider: metadata ? 'cloudinary' : null,
        cloudinary_public_id: metadata?.publicId ?? null,
        width: metadata?.width ?? null,
        height: metadata?.height ?? null,
        bytes: metadata?.bytes ?? null,
        format: metadata?.format ?? null,
      })
      .select('id,product_id,image_url,alt_text,sort_order,is_primary,created_at')
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toMarketplaceProductImage(data), error: null }
  },

  async removeImage(imageId: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<MarketplaceProductImage>()
    if (missing) return { error: missing.error }
    const { error } = await supabase.from('product_images').delete().eq('id', imageId)
    return { error }
  },

  async listVariants(productId: string): Promise<DbResult<MarketplaceProductVariant[]>> {
    const missing = requireConfigured<MarketplaceProductVariant[]>()
    if (missing) return missing
    const { data, error } = await supabase
      .from('product_variants')
      .select('id,product_id,sku,name,attributes,price_override,stock_quantity,is_active,created_at,updated_at')
      .eq('product_id', productId)
      .order('created_at', { ascending: true })
    if (error) return { data: null, error }
    return { data: collect(data, toMarketplaceVariant), error: null }
  },

  async addVariant(productId: string, input: VariantInput): Promise<DbResult<MarketplaceProductVariant>> {
    const missing = requireConfigured<MarketplaceProductVariant>()
    if (missing) return missing
    const { data, error } = await supabase
      .from('product_variants')
      .insert({
        product_id: productId,
        name: input.name,
        attributes: { ...(input.size ? { size: input.size } : {}), ...(input.color ? { color: input.color } : {}) },
        sku: input.sku,
        price_override: input.priceOverride,
        stock_quantity: input.stockQuantity,
      })
      .select('id,product_id,sku,name,attributes,price_override,stock_quantity,is_active,created_at,updated_at')
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toMarketplaceVariant(data), error: null }
  },

  async removeVariant(variantId: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<MarketplaceProductVariant>()
    if (missing) return { error: missing.error }
    const { error } = await supabase.from('product_variants').delete().eq('id', variantId)
    return { error }
  },

  /**
   * All products (admin SELECT-all policy; RLS denies non-admins).
   * Paginated server-side; never fetch the whole catalog at once.
   */
  async listAllForAdmin(params: { status?: string; limit?: number; offset?: number } = {}): Promise<DbResult<MarketplaceProduct[]>> {
    const missing = requireConfigured<MarketplaceProduct[]>()
    if (missing) return missing
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100)
    const offset = Math.max(params.offset ?? 0, 0)
    let query = supabase
      .from('products')
      .select(PRODUCT_COLUMNS)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (params.status && params.status !== 'all') query = query.eq('status', params.status)
    const { data, error } = await query
    if (error) return { data: null, error }
    return { data: collect(data, toMarketplaceProduct), error: null }
  },

  /**
  * Admin-owned product creation (Migration 009 path (a), narrowed by
  * 010 to the only direct admin INSERT): owned by the calling admin
  * profile, shopless (shop_id NULL, owner_type 'admin'). No fake
  * seller account is ever created.
  *
  * NOTE: seller-owned admin creation was retired here on purpose.
  * Admins create seller-bound products ONLY through the code-gated
  * admin_create_seller_product() RPC (see adminProducts service),
  * so no direct-INSERT fallback exists anywhere in the frontend.
  */
  async adminCreateAdminOwned(input: Omit<ProductInput, 'shopId'> & { status: 'draft' | 'pending_review' | 'approved' }): Promise<DbResult<MarketplaceProduct>> {
    const missing = requireConfigured<MarketplaceProduct>()
    if (missing) return missing
    const uid = await currentUserId()
    if (!uid) return { data: null, error: new Error('Sign in required.') }
    const { data, error } = await supabase
      .from('products')
      .insert({
        seller_id: uid,
        shop_id: null,
        category_id: input.categoryId,
        name: input.name,
        slug: input.slug,
        short_description: input.shortDescription,
        description: input.description,
        sku: input.sku,
        price: input.price,
        compare_at_price: input.compareAtPrice,
        discount_price: input.discountPrice,
        stock_quantity: input.stockQuantity,
        brand: input.brand,
        status: input.status,
        is_featured: false,
        rejection_reason: null,
        owner_type: 'admin',
      })
      .select(PRODUCT_COLUMNS)
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toMarketplaceProduct(data), error: null }
  },

  /**
   * Admin status step (activate/deactivate path). Only transitions the
   * product guard trigger permits without the moderation flag can
   * succeed (e.g. approved -> inactive); approval itself stays RPC-only.
   */
  async adminSetStatus(productId: string, status: 'draft' | 'pending_review' | 'inactive'): Promise<DbResult<MarketplaceProduct>> {
    const missing = requireConfigured<MarketplaceProduct>()
    if (missing) return missing
    const { data, error } = await supabase
      .from('products')
      .update({ status })
      .eq('id', productId)
      .select(PRODUCT_COLUMNS)
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toMarketplaceProduct(data), error: null }
  },

  /** Admin moderation via secure RPC — never a direct privileged write. */
  async moderate(productId: string, decision: 'approved' | 'rejected', reason: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<MarketplaceProduct>()
    if (missing) return { error: missing.error }
    const { error } = await supabase.rpc('moderate_product', {
      p_product_id: productId,
      p_decision: decision,
      p_reason: reason,
    })
    return { error }
  },

  /**
   * Generic "Added by Admin" flags for the caller's own products
   * (migration 010, seller-scoped DEFINER RPC). Returns only
   * productId -> boolean: no admin identity, no audit rows. Callers
   * merge this over their full management dataset for display.
   */
  async listOwnProductFlags(): Promise<DbResult<Record<string, boolean>>> {
    const missing = requireConfigured<Record<string, boolean>>()
    if (missing) return missing
    const { data, error } = await supabase.rpc('list_own_products_with_admin_flag', {})
    if (error) return { data: null, error }
    const flags: Record<string, boolean> = {}
    if (Array.isArray(data)) {
      for (const row of data) {
        if (!isRecord(row)) continue
        const productId = asString(row.product_id)
        const addedByAdmin = asBoolean(row.added_by_admin)
        if (productId && addedByAdmin !== null) flags[productId] = addedByAdmin
      }
    }
    return { data: flags, error: null }
  },
}
