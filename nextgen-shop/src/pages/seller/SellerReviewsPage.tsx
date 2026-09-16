import React, { useEffect, useRef, useState } from 'react'
import { Star } from 'lucide-react'
import {
  sellerReviewsService,
  SELLER_REVIEWS_PAGE_SIZE,
  SELLER_REPLY_MAX_LENGTH,
  type SellerReview,
  type SellerReviewRating,
} from '@/services/sellerReviews'
import { sellerProductsService } from '@/services/sellerProducts'
import { EmptyState, ErrorState, LoadingState } from '@/components/seller/SellerWidgets'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'

interface AppliedFilters {
  productId: string | null
  rating: SellerReviewRating | null
  from: string | null
  to: string | null
}

const EMPTY_FILTERS: AppliedFilters = { productId: null, rating: null, from: null, to: null }

interface ProductOption {
  id: string
  name: string
}

interface ReplyDraft {
  open: boolean
  text: string
  saving: boolean
  error: string | null
}

const selectClass =
  'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white text-navy-900'

const dateInputClass =
  'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white'

function RatingStars({ value }: { value: SellerReviewRating }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={
            star <= value
              ? 'h-4 w-4 fill-amber-400 text-amber-400'
              : 'h-4 w-4 text-neutral-300'
          }
          aria-hidden="true"
        />
      ))}
    </span>
  )
}

/**
 * Seller review management (migration 022 RPC contracts).
 *
 * Reads and replies flow exclusively through get_seller_reviews /
 * reply_seller_review: the seller is derived server-side from
 * auth.uid(), visibility is hard-coded approved, and only the
 * allowlisted non-PII fields above are ever consumed. No
 * aggregates are computed here — product_rating_stats is not
 * part of this task and page counts are never presented as
 * totals.
 */
export const SellerReviewsPage: React.FC = () => {
  const [rows, setRows] = useState<SellerReview[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [moreError, setMoreError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [applied, setApplied] = useState<AppliedFilters>(EMPTY_FILTERS)
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')
  const [products, setProducts] = useState<ProductOption[]>([])
  const [replies, setReplies] = useState<Record<string, ReplyDraft>>({})
  const requestId = useRef(0)

  // First page for the current filters. Runs on mount, on filter
  // change, and on explicit retry/refresh — never on any state it
  // writes itself, so no effect loop is possible.
  useEffect(() => {
    let active = true
    const id = requestId.current + 1
    requestId.current = id
    void (async () => {
      setLoading(true)
      setError(null)
      setMoreError(null)
      // NOTE: notice is intentionally NOT cleared here so a reply
      // success message survives the refetch it triggers. Filter
      // changes and explicit retries clear it instead.
      const { data, error: err } = await sellerReviewsService.listReviews(undefined, {
        productId: applied.productId ?? undefined,
        rating: applied.rating ?? undefined,
        from: applied.from,
        to: applied.to,
      })
      if (!active || requestId.current !== id) return
      if (err || !data) {
        setError(err ? err.message : 'Something went wrong. Please try again.')
        setRows([])
        setHasMore(false)
      } else {
        setRows(data)
        setHasMore(data.length === SELLER_REVIEWS_PAGE_SIZE)
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [reloadKey, applied])

  // Own-product options for the product filter. Mount-only: the
  // catalog rarely changes and this must not refetch with reviews.
  useEffect(() => {
    let active = true
    void (async () => {
      const { data } = await sellerProductsService.listMine()
      if (!active || !data) return
      setProducts(data.map((p) => ({ id: p.id, name: p.name })))
    })()
    return () => {
      active = false
    }
  }, [])

  function toIsoStart(dateStr: string): string {
    return new Date(`${dateStr}T00:00:00`).toISOString()
  }

  function toIsoEnd(dateStr: string): string {
    return new Date(`${dateStr}T23:59:59.999`).toISOString()
  }

  function applyRange(): void {
    if (fromInput !== '' && toInput !== '' && fromInput > toInput) {
      setError('The start date must not be after the end date.')
      return
    }
    setApplied((prev) => ({
      ...prev,
      from: fromInput === '' ? null : toIsoStart(fromInput),
      to: toInput === '' ? null : toIsoEnd(toInput),
    }))
    setNotice(null)
  }

  function clearFilters(): void {
    setFromInput('')
    setToInput('')
    setApplied(EMPTY_FILTERS)
    setNotice(null)
  }

  function setProductFilter(productId: string): void {
    setApplied((prev) => ({ ...prev, productId: productId === '' ? null : productId }))
    setNotice(null)
  }

  function setRatingFilter(value: string): void {
    const n = Number(value)
    setApplied((prev) => ({
      ...prev,
      rating: n === 1 || n === 2 || n === 3 || n === 4 || n === 5 ? n : null,
    }))
    setNotice(null)
  }

  const filtersActive =
    applied.productId !== null || applied.rating !== null || applied.from !== null || applied.to !== null

  async function loadMore(): Promise<void> {
    const last = rows[rows.length - 1]
    if (!last || loadingMore) return
    setLoadingMore(true)
    setMoreError(null)
    const { data, error: err } = await sellerReviewsService.listReviews(
      { createdBefore: last.createdAt, idBefore: last.reviewId },
      {
        productId: applied.productId ?? undefined,
        rating: applied.rating ?? undefined,
        from: applied.from,
        to: applied.to,
      },
    )
    setLoadingMore(false)
    if (err || !data) {
      setMoreError(err ? err.message : 'Something went wrong. Please try again.')
      return
    }
    setRows((prev) => {
      const seen = new Set(prev.map((r) => r.reviewId))
      return [...prev, ...data.filter((r) => !seen.has(r.reviewId))]
    })
    setHasMore(data.length === SELLER_REVIEWS_PAGE_SIZE)
  }

  function openReply(review: SellerReview): void {
    setReplies((prev) => ({
      ...prev,
      [review.reviewId]: { open: true, text: review.sellerReply ?? '', saving: false, error: null },
    }))
  }

  function closeReply(reviewId: string): void {
    setReplies((prev) => ({
      ...prev,
      [reviewId]: { open: false, text: '', saving: false, error: null },
    }))
  }

  function setReplyText(reviewId: string, text: string): void {
    setReplies((prev) => ({
      ...prev,
      [reviewId]: { ...(prev[reviewId] ?? { open: true, saving: false, error: null }), open: true, text },
    }))
  }

  async function submitReply(review: SellerReview): Promise<void> {
    const draft = replies[review.reviewId]
    if (!draft || draft.saving) return
    const text = draft.text
    // Clearing an untouched box is a no-op (avoids a pointless RPC).
    if (text.trim() === '' && !review.sellerReply) {
      closeReply(review.reviewId)
      return
    }
    setReplies((prev) => ({ ...prev, [review.reviewId]: { ...draft, saving: true, error: null } }))
    const { error: err } = await sellerReviewsService.replyToReview(review.reviewId, text)
    if (err) {
      setReplies((prev) => ({
        ...prev,
        [review.reviewId]: { ...(prev[review.reviewId] ?? draft), open: true, saving: false, error: err.message },
      }))
      return
    }
    closeReply(review.reviewId)
    setNotice(text.trim() === '' ? 'Reply cleared.' : 'Reply saved.')
    // Refresh from the server rather than inventing updated fields.
    setReloadKey((k) => k + 1)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Reviews</h1>
        <p className="text-sm text-neutral-500 mt-1">What buyers say about your products.</p>
      </div>

      <div className="card-premium p-4 sm:p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="rev-product" className="block text-xs font-medium text-neutral-500 mb-1">Product</label>
            <select
              id="rev-product"
              value={applied.productId ?? ''}
              onChange={(e) => setProductFilter(e.target.value)}
              className={selectClass}
            >
              <option value="">All products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rev-rating" className="block text-xs font-medium text-neutral-500 mb-1">Rating</label>
            <select
              id="rev-rating"
              value={applied.rating === null ? '' : String(applied.rating)}
              onChange={(e) => setRatingFilter(e.target.value)}
              className={selectClass}
            >
              <option value="">All ratings</option>
              <option value="5">5 stars</option>
              <option value="4">4 stars</option>
              <option value="3">3 stars</option>
              <option value="2">2 stars</option>
              <option value="1">1 star</option>
            </select>
          </div>
          <div>
            <label htmlFor="rev-from" className="block text-xs font-medium text-neutral-500 mb-1">From</label>
            <input
              id="rev-from"
              type="date"
              value={fromInput}
              max={toInput !== '' ? toInput : undefined}
              onChange={(e) => setFromInput(e.target.value)}
              className={dateInputClass}
            />
          </div>
          <div>
            <label htmlFor="rev-to" className="block text-xs font-medium text-neutral-500 mb-1">To</label>
            <input
              id="rev-to"
              type="date"
              value={toInput}
              min={fromInput !== '' ? fromInput : undefined}
              onChange={(e) => setToInput(e.target.value)}
              className={dateInputClass}
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="button" variant="secondary" size="md" onClick={applyRange}>
            <span>Apply dates</span>
          </Button>
          {filtersActive && (
            <Button type="button" variant="outline" size="md" onClick={clearFilters}>
              <span>Clear filters</span>
            </Button>
          )}
        </div>
        <p className="text-xs text-neutral-500">Only approved reviews on your products appear here.</p>
      </div>

      {notice && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3">{notice}</div>
      )}

      {loading && <LoadingState message="Loading your reviews…" />}
      {!loading && error && (
        <ErrorState message={error} onRetry={() => { setLoading(true); setNotice(null); setReloadKey((k) => k + 1) }} />
      )}

      {!loading && !error && rows.length === 0 && !filtersActive && (
        <div className="card-premium p-5 sm:p-6">
          <EmptyState
            title="No approved reviews yet."
            message="Approved reviews on your products will appear here after moderation. Only reviews on your own products are ever visible."
          />
        </div>
      )}

      {!loading && !error && rows.length === 0 && filtersActive && (
        <div className="card-premium p-5 sm:p-6">
          <EmptyState
            title="No matching reviews"
            message="No approved reviews match the current product, rating, or date filters. Try widening them."
          />
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((review) => {
            const draft = replies[review.reviewId]
            const replyOpen = draft?.open ?? false
            return (
              <article key={review.reviewId} className="card-premium p-5 sm:p-6 space-y-3 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0">
                  <h2 className="text-sm font-semibold text-navy-900 truncate flex-1 min-w-0">{review.productName}</h2>
                  <span className="text-xs text-neutral-400 shrink-0">{formatDate(review.createdAt)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RatingStars value={review.rating} />
                  <Badge variant="muted">{review.rating} / 5</Badge>
                  <span className="text-xs text-neutral-500">by {review.reviewerName}</span>
                </div>
                {review.title && (
                  <p className="text-sm font-semibold text-navy-900 break-words">{review.title}</p>
                )}
                {review.body && (
                  <p className="text-sm text-neutral-600 leading-relaxed break-words whitespace-pre-wrap">{review.body}</p>
                )}
                {review.sellerReply && !replyOpen && (
                  <div className="rounded-xl bg-primary-50/60 border border-primary-100 px-4 py-3 space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Your reply</p>
                    <p className="text-sm text-neutral-700 leading-relaxed break-words whitespace-pre-wrap">{review.sellerReply}</p>
                    {review.sellerRepliedAt && (
                      <p className="text-[11px] text-neutral-400">{formatDate(review.sellerRepliedAt)}</p>
                    )}
                  </div>
                )}
                {!replyOpen ? (
                  <div>
                    <Button type="button" variant="outline" size="sm" onClick={() => openReply(review)}>
                      <span>{review.sellerReply ? 'Edit reply' : 'Reply'}</span>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <label htmlFor={`reply-${review.reviewId}`} className="block text-xs font-medium text-neutral-500">
                      {review.sellerReply ? 'Edit your reply' : 'Write a reply'}
                    </label>
                    <textarea
                      id={`reply-${review.reviewId}`}
                      rows={3}
                      value={draft?.text ?? ''}
                      maxLength={SELLER_REPLY_MAX_LENGTH}
                      onChange={(e) => setReplyText(review.reviewId, e.target.value)}
                      placeholder="Thank the buyer, address their feedback…"
                      className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 bg-white transition-all placeholder:text-neutral-400 resize-y"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-neutral-400">
                        {(draft?.text ?? '').length}/{SELLER_REPLY_MAX_LENGTH}
                        {review.sellerReply ? ' · clearing the text removes your reply' : ''}
                      </span>
                    </div>
                    {draft?.error && (
                      <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">{draft.error}</div>
                    )}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={draft?.saving}
                        onClick={() => void submitReply(review)}
                      >
                        <span>{draft?.saving ? 'Saving…' : 'Save reply'}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={draft?.saving}
                        onClick={() => closeReply(review.reviewId)}
                      >
                        <span>Cancel</span>
                      </Button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
          {moreError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="flex-1">{moreError}</span>
              <Button type="button" variant="outline" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
                <span>Retry</span>
              </Button>
            </div>
          )}
          {hasMore && (
            <div className="text-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                <span>{loadingMore ? 'Loading…' : 'Load more'}</span>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
