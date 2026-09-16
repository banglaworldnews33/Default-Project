/**
 * Domain types for Nextgen Shop.
 *
 * These interfaces are designed to map 1:1 onto future database tables
 * (Supabase / Firebase / MySQL / PostgreSQL). The data layer in
 * `src/services` + `src/data` is the only place that should change when a
 * real backend is connected.
 */

export type CategorySlug = 'men' | 'women' | 'baby-moms' | 'clothes'

export interface Category {
  id: string
  slug: CategorySlug
  name: string
  tagline: string
  image: string
}

export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock'

export interface Product {
  id: string
  slug: string
  name: string
  category: CategorySlug
  shortDescription: string
  description: string
  price: number
  /** Original price before discount. Omit when not discounted. */
  oldPrice?: number
  /** Percentage discount, derived from price vs oldPrice. */
  discount: number
  image: string
  /** Additional gallery images; falls back to [image]. */
  images?: string[]
  stock: number
  rating: number
  reviews: number
  sizes: string[]
  colors: string[]
  isFeatured?: boolean
  isNewArrival?: boolean
  isBestSeller?: boolean
  createdAt: string
}

export interface CartItem {
  productId: string
  slug: string
  name: string
  image: string
  price: number
  quantity: number
  size?: string
  color?: string
  /** Max purchasable quantity at the time of adding. */
  maxStock: number
  /**
   * Database variant reference for REAL marketplace products only.
   * Absent for demo items. Display snapshot only — create_order()
   * re-validates the variant server-side.
   */
  variantId?: string | null
}

export interface Cart {
  items: CartItem[]
  itemCount: number
  subtotal: number
}

export type OrderStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Processing'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  'Pending',
  'Confirmed',
  'Processing',
  'Shipped',
  'Delivered',
]

export type PaymentMethod = 'Cash on Delivery' | 'bKash' | 'Nagad'

export type DeliveryZone = 'inside-dhaka' | 'outside-dhaka'

export interface OrderItem {
  productId: string
  name: string
  image: string
  price: number
  quantity: number
  size?: string
  color?: string
}

export interface Order {
  orderId: string
  orderDate: string
  customerName: string
  mobile: string
  alternativeMobile?: string
  address: string
  division: string
  district: string
  upazila: string
  postalCode?: string
  orderNotes?: string
  items: OrderItem[]
  subtotal: number
  deliveryZone: DeliveryZone
  deliveryCharge: number
  discount: number
  total: number
  paymentMethod: PaymentMethod
  status: OrderStatus
}

export interface Customer {
  id: string
  name: string
  mobile: string
  address: string
  totalOrders: number
  totalSpent: number
  lastOrderAt?: string
  status: 'active' | 'blocked'
}

export type SellerApplicationStatus = 'pending' | 'approved' | 'rejected'

/**
 * Seller application row (public.seller_applications).
 * Mirrors migrations 003 (+ 005 storefront fields). The database is
 * authoritative for status/reviewer fields — clients can only INSERT
 * their own pending row; all transitions happen in secure RPCs.
 */
export interface SellerApplication {
  id: string
  userId: string
  businessName: string
  phone: string | null
  description: string | null
  shopCategory: string | null
  status: SellerApplicationStatus
  reviewerId: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  createdAt: string
  updatedAt: string
}

export interface SellerAuditEntry {
  id: string
  action: string
  adminId: string | null
  targetUserId: string | null
  applicationId: string | null
  createdAt: string
}

export type UserRole = 'admin' | 'customer'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  avatarUrl?: string
}

/**
 * REAL marketplace catalog types (migration 006).
 *
 * These live alongside the legacy demo-catalog types above (Category,
 * Product, CartItem…), which still drive the localStorage storefront.
 * The `Marketplace*` prefix marks DB-backed rows; the demo catalog is
 * intentionally NOT migrated or renamed in this phase.
 */

export type ShopStatus = 'active' | 'inactive' | 'suspended'

export interface SellerShop {
  id: string
  sellerId: string
  shopName: string
  shopSlug: string
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  logoPublicId: string | null
  bannerPublicId: string | null
  status: ShopStatus
  createdAt: string
  updatedAt: string
}

export interface MarketplaceCategory {
  id: string
  name: string
  slug: string
  description: string | null
  imageUrl: string | null
  parentId: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type MarketplaceProductStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'inactive'

export type MarketplaceProductOwnerType = 'seller' | 'admin'

export interface MarketplaceProduct {
  id: string
  sellerId: string
  /** Nullable since Migration 009: admin-owned products have no shop. */
  shopId: string | null
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
  status: MarketplaceProductStatus
  brand: string | null
  isFeatured: boolean
  isActive: boolean
  rejectionReason: string | null
  /** Migration 009: admin vs seller ownership (default 'seller'). */
  ownerType: MarketplaceProductOwnerType
  /** Migration 009: admin visibility controls (never written directly). */
  hiddenByAdmin: boolean
  hiddenAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MarketplaceProductImage {
  id: string
  productId: string
  imageUrl: string
  altText: string | null
  sortOrder: number
  isPrimary: boolean
  createdAt: string
  cloudinaryPublicId: string | null
}

export interface MarketplaceVariantAttributes {
  size?: string
  color?: string
}

export interface MarketplaceProductVariant {
  id: string
  productId: string
  sku: string | null
  name: string
  attributes: MarketplaceVariantAttributes
  priceOverride: number | null
  stockQuantity: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type CouponType = 'percentage' | 'fixed'

export interface Coupon {
  code: string
  type: CouponType
  value: number
  minOrderAmount: number
  active: boolean
  expiresAt?: string
}
