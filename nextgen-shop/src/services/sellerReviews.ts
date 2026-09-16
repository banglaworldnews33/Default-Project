import { supabase } from '@/lib/supabase'
import {
  asNumber,
  asString,
  collect,
  isRecord,
  requireConfigured,
  type DbResult,
} from './db'

export type SellerReviewRating = 1 | 2 | 3 | 4 | 5

/**
 * One approved review on the seller's own product, exactly as
 * returned by get_seller_reviews() (migration 022 contract).
 * Only allowlisted, non-PII fields exist here by construction:
 * no customer/order linkage, no contact data, no payment data,
 * no moderator identity. Rating is a validated 1-5 union.
 */
export interface SellerReview {
  reviewId: string
  productId: string
  productName: string
  rating: SellerReviewRating
  title: string | null
  body: string | null
  reviewerName: string
  sellerReply: string | null
  sellerRepliedAt: string | null
  createdAt: string
}

function toReviewRating(value: unknown): SellerReviewRating | null {
  const n = asNumber(value)
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n
  return null
}

/**
 * Accepts only non-empty strings that parse as dates. Anything
 * else (missing, non-string, malformed) becomes null so an
 * "Invalid Date" can never reach the UI.
 */
function toValidDateString(value: unknown): string | null {
  const s = asString(value)
  if (!s || Number.isNaN(Date.parse(s))) return null
  return s
}

function toSellerReview(row: unknown): SellerReview | null {
  if (!isRecord(row)) return null
  const reviewId = asString(row.review_id)
  const productId = asString(row.product_id)
  const productName = asString(row.product_name)
  const rating = toReviewRating(row.rating)
  const reviewerName = asString(row.reviewer_name)
  const createdAt = toValidDateString(row.created_at)
  if (!reviewId || !productId || !productName || rating === null || !reviewerName || !createdAt) {
    return null
  }
  return {
    reviewId,
    productId,
    productName,
    rating,
    title: asString(row.title),
    body: asString(row.body),
    reviewerName,
    sellerReply: asString(row.seller_reply),
    sellerRepliedAt: toValidDateString(row.seller_replied_at),
    createdAt,
  }
}

/**
 * Keyset cursor for get_seller_reviews(). Taken verbatim from
 * the last row of the previous page. A malformed cursor fails
 * closed to the first page (never to an error state).
 */
export interface SellerReviewsCursor {
  createdBefore: string
  idBefore: string
}

export interface SellerReviewFilters {
  productId?: string
  rating?: SellerReviewRating
  from?: string | null
  to?: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const SELLER_REVIEWS_PAGE_SIZE = 25

export const SELLER_REPLY_MAX_LENGTH = 2000

function friendlyError(message: string): string {
  if (/network|fetch|failed to send/i.test(message)) {
    return 'Network error. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Seller review reads + replies (migration 022 RPC contracts).
 *
 * Authorization is server-side only: both RPCs derive the seller
 * from auth.uid() plus the verified-seller predicate, and the
 * read RPC hard-codes approved visibility. The frontend never
 * sends seller/customer identity, never touches the
 * product_reviews table directly, and never aggregates ratings.
 * Read-only except reply_seller_review (the sole mutation path).
 */
export const sellerReviewsService = {
  /** Own approved reviews, newest first (server-ordered). */
  async listReviews(
    cursor?: SellerReviewsCursor,
    filters?: SellerReviewFilters,
  ): Promise<DbResult<SellerReview[]>> {
    const missing = requireConfigured<SellerReview[]>()
    if (missing) return missing
    const cursorValid =
      cursor !== undefined &&
      !!cursor.createdBefore &&
      UUID_RE.test(cursor.idBefore)
    const rating = filters?.rating
    const { data, error } = await supabase.rpc('get_seller_reviews', {
      p_limit: SELLER_REVIEWS_PAGE_SIZE,
      p_created_before: cursorValid ? cursor.createdBefore : null,
      p_id_before: cursorValid ? cursor.idBefore : null,
      p_product_id: filters?.productId ?? null,
      p_rating: rating === 1 || rating === 2 || rating === 3 || rating === 4 || rating === 5 ? rating : null,
      p_from: filters?.from ?? null,
      p_to: filters?.to ?? null,
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    return { data: collect(data, toSellerReview), error: null }
  },

  /**
   * Reply to (or clear) the seller's own reply on one approved
   * review. Ownership, approved status, and length are enforced
   * server-side; blank text clears the reply per the RPC
   * contract. Success is error === null (no row is returned).
   */
  async replyToReview(reviewId: string, reply: string): Promise<DbResult<null>> {
    const missing = requireConfigured<null>()
    if (missing) return missing
    if (!UUID_RE.test(reviewId)) {
      return { data: null, error: new Error('Invalid review reference.') }
    }
    if (reply.length > SELLER_REPLY_MAX_LENGTH) {
      return { data: null, error: new Error(`Replies must be ${SELLER_REPLY_MAX_LENGTH} characters or fewer.`) }
    }
    const { error } = await supabase.rpc('reply_seller_review', {
      p_review_id: reviewId,
      p_reply: reply,
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    return { data: null, error: null }
  },
}
