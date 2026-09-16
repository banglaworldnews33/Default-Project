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
 * Platform aggregates from get_admin_financial_summary().
 * All values derive server-side from earning ledger rows.
 * Gated on the existing is_admin() mechanism (normal admins
 * included, consistent with the 015 admin order reads).
 */
export interface AdminFinancialSummary {
  totalEarnings: number
  totalCommission: number
  pendingEarnings: number
  availableEarnings: number
  earningCount: number
  sellersWithEarnings: number
  currency: string
  /** Returned seller money from processed refunds, >= 0 (020). */
  refundedAmount: number
  /** Signed correction total (020). */
  adjustmentAmount: number
  /** True position: total + refunds + adjustments (020). */
  netEarnings: number
  /** Reversed commission snapshots from refunds, >= 0 (020). */
  refundedCommission: number
}

function toAdminFinancialSummary(row: unknown): AdminFinancialSummary | null {
  if (!isRecord(row)) return null
  const totalEarnings = asNumber(row.total_earnings)
  const totalCommission = asNumber(row.total_commission)
  const pendingEarnings = asNumber(row.pending_earnings)
  const availableEarnings = asNumber(row.available_earnings)
  const earningCount = asNumber(row.earning_count)
  const sellersWithEarnings = asNumber(row.sellers_with_earnings)
  const currency = asString(row.currency)
  const refundedAmount = asNumber(row.refunded_amount)
  const adjustmentAmount = asNumber(row.adjustment_amount)
  const netEarnings = asNumber(row.net_earnings)
  const refundedCommission = asNumber(row.refunded_commission)
  if (
    totalEarnings === null || totalCommission === null ||
    pendingEarnings === null || availableEarnings === null ||
    earningCount === null || sellersWithEarnings === null || !currency ||
    refundedAmount === null || adjustmentAmount === null ||
    netEarnings === null || refundedCommission === null
  ) {
    return null
  }
  return {
    totalEarnings,
    totalCommission,
    pendingEarnings,
    availableEarnings,
    earningCount,
    sellersWithEarnings,
    currency,
    refundedAmount,
    adjustmentAmount,
    netEarnings,
    refundedCommission,
  }
}

/**
 * One per-seller aggregate from get_admin_seller_financials().
 * Shop names are already public marketplace data. No customer
 * PII, no per-order detail.
 */
export interface AdminSellerFinancialRow {
  sellerId: string
  shopName: string | null
  totalEarnings: number
  pendingEarnings: number
  availableEarnings: number
  totalCommission: number
  earningCount: number
  currency: string
  /** Returned seller money from processed refunds, >= 0 (020). */
  refundedAmount: number
  /** Signed correction total (020). */
  adjustmentAmount: number
  /** True position: total + refunds + adjustments (020). */
  netEarnings: number
  /** Reversed commission snapshots from refunds, >= 0 (020). */
  refundedCommission: number
}

function toAdminSellerFinancialRow(row: unknown): AdminSellerFinancialRow | null {
  if (!isRecord(row)) return null
  const sellerId = asString(row.seller_id)
  const totalEarnings = asNumber(row.total_earnings)
  const pendingEarnings = asNumber(row.pending_earnings)
  const availableEarnings = asNumber(row.available_earnings)
  const totalCommission = asNumber(row.total_commission)
  const earningCount = asNumber(row.earning_count)
  const currency = asString(row.currency)
  const refundedAmount = asNumber(row.refunded_amount)
  const adjustmentAmount = asNumber(row.adjustment_amount)
  const netEarnings = asNumber(row.net_earnings)
  const refundedCommission = asNumber(row.refunded_commission)
  if (
    !sellerId || totalEarnings === null || pendingEarnings === null ||
    availableEarnings === null || totalCommission === null ||
    earningCount === null || !currency ||
    refundedAmount === null || adjustmentAmount === null ||
    netEarnings === null || refundedCommission === null
  ) {
    return null
  }
  return {
    sellerId,
    shopName: asString(row.shop_name),
    totalEarnings,
    pendingEarnings,
    availableEarnings,
    totalCommission,
    earningCount,
    currency,
    refundedAmount,
    adjustmentAmount,
    netEarnings,
    refundedCommission,
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PAGE_SIZE = 25

/**
 * Date range for period reporting. ISO timestamps; null/undefined
 * means unbounded. The server fails an inverted range closed
 * (zero rows); bounds never affect point-in-time balances.
 */
export interface ReportDateRange {
  from?: string | null
  to?: string | null
}

/**
 * Platform period report from get_admin_finance_report() (021).
 * Flow totals honor the requested period; reserved, available,
 * and debt are always current point-in-time values.
 */
export interface AdminFinanceReport {
  grossEarnings: number
  totalCommission: number
  refundedAmount: number
  adjustmentAmount: number
  netEarnings: number
  paidOutAmount: number
  reservedAmount: number
  availableEarnings: number
  debtAmount: number
  earningCount: number
  sellersWithActivity: number
  currency: string
  periodFrom: string | null
  periodTo: string | null
}

function toAdminFinanceReport(row: unknown): AdminFinanceReport | null {
  if (!isRecord(row)) return null
  const grossEarnings = asNumber(row.gross_earnings)
  const totalCommission = asNumber(row.total_commission)
  const refundedAmount = asNumber(row.refunded_amount)
  const adjustmentAmount = asNumber(row.adjustment_amount)
  const netEarnings = asNumber(row.net_earnings)
  const paidOutAmount = asNumber(row.paid_out_amount)
  const reservedAmount = asNumber(row.reserved_amount)
  const availableEarnings = asNumber(row.available_earnings)
  const debtAmount = asNumber(row.debt_amount)
  const earningCount = asNumber(row.earning_count)
  const sellersWithActivity = asNumber(row.sellers_with_activity)
  const currency = asString(row.currency)
  if (
    grossEarnings === null || totalCommission === null ||
    refundedAmount === null || adjustmentAmount === null ||
    netEarnings === null || paidOutAmount === null ||
    reservedAmount === null || availableEarnings === null ||
    debtAmount === null || earningCount === null ||
    sellersWithActivity === null || !currency
  ) {
    return null
  }
  return {
    grossEarnings,
    totalCommission,
    refundedAmount,
    adjustmentAmount,
    netEarnings,
    paidOutAmount,
    reservedAmount,
    availableEarnings,
    debtAmount,
    earningCount,
    sellersWithActivity,
    currency,
    periodFrom: asString(row.period_from),
    periodTo: asString(row.period_to),
  }
}

function friendlyError(message: string): string {
  if (/network|fetch|failed to send/i.test(message)) {
    return 'Network error. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}

/**
 * One withdrawal request from get_admin_withdrawals().
 * Shop names are already public marketplace data. No customer
 * PII, no secrets — references, amounts, statuses, and safe
 * reason text only.
 */
export interface AdminWithdrawalRow {
  withdrawalId: string
  sellerId: string
  shopName: string | null
  amount: number
  currency: string
  status: string
  createdAt: string
  approvedAt: string | null
  processingAt: string | null
  completedAt: string | null
  rejectedAt: string | null
  failedAt: string | null
  rejectionReason: string | null
  failureReason: string | null
  externalReference: string | null
}

function toAdminWithdrawalRow(row: unknown): AdminWithdrawalRow | null {
  if (!isRecord(row)) return null
  const withdrawalId = asString(row.withdrawal_id)
  const sellerId = asString(row.seller_id)
  const amount = asNumber(row.amount)
  const currency = asString(row.currency)
  const status = asString(row.status)
  const createdAt = asString(row.created_at)
  if (!withdrawalId || !sellerId || amount === null || !currency || !status || !createdAt) {
    return null
  }
  return {
    withdrawalId,
    sellerId,
    shopName: asString(row.shop_name),
    amount,
    currency,
    status,
    createdAt,
    approvedAt: asString(row.approved_at),
    processingAt: asString(row.processing_at),
    completedAt: asString(row.completed_at),
    rejectedAt: asString(row.rejected_at),
    failedAt: asString(row.failed_at),
    rejectionReason: asString(row.rejection_reason),
    failureReason: asString(row.failure_reason),
    externalReference: asString(row.external_reference),
  }
}

export type AdminWithdrawalStatusFilter =
  | 'pending'
  | 'approved'
  | 'processing'
  | 'completed'
  | 'rejected'
  | 'failed'

function isWithdrawalStatus(value: string): value is AdminWithdrawalStatusFilter {
  return (
    value === 'pending' || value === 'approved' || value === 'processing' ||
    value === 'completed' || value === 'rejected' || value === 'failed'
  )
}

/**
 * Keyset cursor for get_admin_withdrawals(). Taken verbatim
 * from the last row of the previous page. A malformed cursor
 * fails closed to the first page (never to an error state).
 */
export interface AdminWithdrawalCursor {
  createdBefore: string
  idBefore: string
}

export type AdminRefundStatusFilter = 'pending' | 'approved' | 'rejected' | 'processed'

function isRefundStatus(value: string): value is AdminRefundStatusFilter {
  return (
    value === 'pending' || value === 'approved' ||
    value === 'rejected' || value === 'processed'
  )
}

/**
 * One refund case from get_admin_refunds(). References and
 * money are authoritative snapshots; no customer PII beyond
 * the order number already visible on admin order screens.
 */
export interface AdminRefundRow {
  refundId: string
  orderId: string
  orderNumber: string | null
  orderItemId: string
  sellerId: string
  shopName: string | null
  requestedNetAmount: number
  currency: string
  status: string
  reason: string | null
  rejectionReason: string | null
  createdAt: string
  approvedAt: string | null
  processedAt: string | null
  rejectedAt: string | null
}

function toAdminRefundRow(row: unknown): AdminRefundRow | null {
  if (!isRecord(row)) return null
  const refundId = asString(row.refund_id)
  const orderId = asString(row.order_id)
  const orderItemId = asString(row.order_item_id)
  const sellerId = asString(row.seller_id)
  const requestedNetAmount = asNumber(row.requested_net_amount)
  const currency = asString(row.currency)
  const status = asString(row.status)
  const createdAt = asString(row.created_at)
  if (
    !refundId || !orderId || !orderItemId || !sellerId ||
    requestedNetAmount === null || !currency || !status || !createdAt
  ) {
    return null
  }
  return {
    refundId,
    orderId,
    orderNumber: asString(row.order_number),
    orderItemId,
    sellerId,
    shopName: asString(row.shop_name),
    requestedNetAmount,
    currency,
    status,
    reason: asString(row.reason),
    rejectionReason: asString(row.rejection_reason),
    createdAt,
    approvedAt: asString(row.approved_at),
    processedAt: asString(row.processed_at),
    rejectedAt: asString(row.rejected_at),
  }
}

/**
 * Keyset cursor for get_admin_refunds(). Taken verbatim from
 * the last row of the previous page. A malformed cursor fails
 * closed to the first page (never to an error state).
 */
export interface AdminRefundCursor {
  createdBefore: string
  idBefore: string
}

/**
 * Admin financial reads (migrations 018-019).
 *
 * Read-only aggregates plus the withdrawal review/action set,
 * all gated on is_admin(). No per-customer data, no secrets.
 * Guards in this file are UX-only; every RPC re-checks
 * authorization, state legality, and idempotency server-side.
 */
export const adminFinanceService = {
  /** Platform totals. Null data with null error means no earnings yet. */
  async getSummary(): Promise<DbResult<AdminFinancialSummary>> {
    const missing = requireConfigured<AdminFinancialSummary>()
    if (missing) return missing
    const { data, error } = await supabase.rpc('get_admin_financial_summary')
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    const rows = collect(data, toAdminFinancialSummary)
    return { data: rows[0] ?? null, error: null }
  },

  /** Per-seller aggregates ordered by seller (stable keyset). */
  async listSellerFinancials(sellerBefore?: string): Promise<DbResult<AdminSellerFinancialRow[]>> {
    const missing = requireConfigured<AdminSellerFinancialRow[]>()
    if (missing) return missing
    const cursor = sellerBefore !== undefined && UUID_RE.test(sellerBefore) ? sellerBefore : null
    const { data, error } = await supabase.rpc('get_admin_seller_financials', {
      p_limit: PAGE_SIZE,
      p_seller_before: cursor,
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    return { data: collect(data, toAdminSellerFinancialRow), error: null }
  },

  /**
   * Platform period report (migration 021 get_admin_finance_report).
   * Flows honor the range; reserved, available, and debt stay
   * current. Null data with null error means no rows in scope.
   */
  async getReport(range?: ReportDateRange): Promise<DbResult<AdminFinanceReport>> {
    const missing = requireConfigured<AdminFinanceReport>()
    if (missing) return missing
    const { data, error } = await supabase.rpc('get_admin_finance_report', {
      p_from: range?.from ?? null,
      p_to: range?.to ?? null,
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    const rows = collect(data, toAdminFinanceReport)
    return { data: rows[0] ?? null, error: null }
  },

  /**
   * Withdrawal history for review (migration 019
   * get_admin_withdrawals). Newest first, optional status
   * filter validated client-side (UX-only; the RPC
   * re-validates). Callers must refetch after any action —
   * submitted values are never trusted.
   */
  async listWithdrawals(
    cursor?: AdminWithdrawalCursor,
    status?: AdminWithdrawalStatusFilter,
  ): Promise<DbResult<AdminWithdrawalRow[]>> {
    const missing = requireConfigured<AdminWithdrawalRow[]>()
    if (missing) return missing
    if (status !== undefined && !isWithdrawalStatus(status)) {
      return { data: [], error: null }
    }
    const cursorValid =
      cursor !== undefined &&
      !!cursor.createdBefore &&
      UUID_RE.test(cursor.idBefore)
    const { data, error } = await supabase.rpc('get_admin_withdrawals', {
      p_limit: PAGE_SIZE,
      p_created_before: cursorValid ? cursor.createdBefore : null,
      p_id_before: cursorValid ? cursor.idBefore : null,
      p_status: status ?? null,
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    return { data: collect(data, toAdminWithdrawalRow), error: null }
  },

  /**
   * Withdrawal state actions (migration 019). Guards (UUID
   * shape, non-empty reason/reference) are UX-only; every RPC
   * re-checks authorization, ownership, state legality, and
   * idempotency server-side. Callers must refetch afterwards.
   */
  async approveWithdrawal(withdrawalId: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<null>()
    if (missing) return { error: missing.error }
    if (!UUID_RE.test(withdrawalId)) return { error: new Error('Invalid withdrawal reference.') }
    const { error } = await supabase.rpc('approve_withdrawal', {
      p_withdrawal_id: withdrawalId,
    })
    if (error) return { error: new Error(friendlyError(error.message)) }
    return { error: null }
  },

  async rejectWithdrawal(withdrawalId: string, reason: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<null>()
    if (missing) return { error: missing.error }
    if (!UUID_RE.test(withdrawalId)) return { error: new Error('Invalid withdrawal reference.') }
    if (!reason.trim()) return { error: new Error('A rejection reason is required.') }
    const { error } = await supabase.rpc('reject_withdrawal', {
      p_withdrawal_id: withdrawalId,
      p_reason: reason.trim(),
    })
    if (error) return { error: new Error(friendlyError(error.message)) }
    return { error: null }
  },

  async startPayout(withdrawalId: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<null>()
    if (missing) return { error: missing.error }
    if (!UUID_RE.test(withdrawalId)) return { error: new Error('Invalid withdrawal reference.') }
    const { error } = await supabase.rpc('start_payout', {
      p_withdrawal_id: withdrawalId,
    })
    if (error) return { error: new Error(friendlyError(error.message)) }
    return { error: null }
  },

  async completePayout(withdrawalId: string, reference: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<null>()
    if (missing) return { error: missing.error }
    if (!UUID_RE.test(withdrawalId)) return { error: new Error('Invalid withdrawal reference.') }
    if (!reference.trim()) return { error: new Error('An external payout reference is required.') }
    const { error } = await supabase.rpc('complete_payout', {
      p_withdrawal_id: withdrawalId,
      p_external_reference: reference.trim(),
    })
    if (error) return { error: new Error(friendlyError(error.message)) }
    return { error: null }
  },

  async failPayout(withdrawalId: string, reason: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<null>()
    if (missing) return { error: missing.error }
    if (!UUID_RE.test(withdrawalId)) return { error: new Error('Invalid withdrawal reference.') }
    if (!reason.trim()) return { error: new Error('A failure reason is required.') }
    const { error } = await supabase.rpc('fail_payout', {
      p_withdrawal_id: withdrawalId,
      p_reason: reason.trim(),
    })
    if (error) return { error: new Error(friendlyError(error.message)) }
    return { error: null }
  },

  /**
   * Refund review queue (migration 020 get_admin_refunds).
   * Newest first, optional status filter validated client-side
   * (UX-only; the RPC re-validates). Callers must refetch after
   * any action — submitted values are never trusted.
   */
  async listRefunds(
    cursor?: AdminRefundCursor,
    status?: AdminRefundStatusFilter,
    range?: ReportDateRange,
  ): Promise<DbResult<AdminRefundRow[]>> {
    const missing = requireConfigured<AdminRefundRow[]>()
    if (missing) return missing
    if (status !== undefined && !isRefundStatus(status)) {
      return { data: [], error: null }
    }
    const cursorValid =
      cursor !== undefined &&
      !!cursor.createdBefore &&
      UUID_RE.test(cursor.idBefore)
    const { data, error } = await supabase.rpc('get_admin_refunds', {
      p_limit: PAGE_SIZE,
      p_created_before: cursorValid ? cursor.createdBefore : null,
      p_id_before: cursorValid ? cursor.idBefore : null,
      p_status: status ?? null,
      p_from: range?.from ?? null,
      p_to: range?.to ?? null,
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    return { data: collect(data, toAdminRefundRow), error: null }
  },

  /**
   * Refund case actions (migration 020). Guards (UUID shape,
   * positive 2dp amount, non-empty reason) are UX-only; every
   * RPC re-checks authorization, earning existence, remaining
   * caps, and idempotency server-side. Callers must refetch
   * afterwards.
   */
  async requestRefund(
    orderItemId: string,
    netAmount: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<DbResult<{ refundId: string }>> {
    const missing = requireConfigured<{ refundId: string }>()
    if (missing) return missing
    if (!UUID_RE.test(orderItemId)) return { data: null, error: new Error('Invalid order item reference.') }
    if (!Number.isFinite(netAmount) || netAmount <= 0) {
      return { data: null, error: new Error('Refund amount must be greater than zero.') }
    }
    if (!reason.trim()) return { data: null, error: new Error('A refund reason is required.') }
    if (!idempotencyKey.trim()) return { data: null, error: new Error('An idempotency key is required.') }
    const { data, error } = await supabase.rpc('request_refund', {
      p_order_item_id: orderItemId,
      p_net_amount: netAmount,
      p_reason: reason.trim(),
      p_idempotency_key: idempotencyKey.trim(),
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    const refundId = asString(data)
    if (!refundId) return { data: null, error: new Error('Unexpected response from refund request.') }
    return { data: { refundId }, error: null }
  },

  async approveRefund(refundId: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<null>()
    if (missing) return { error: missing.error }
    if (!UUID_RE.test(refundId)) return { error: new Error('Invalid refund reference.') }
    const { error } = await supabase.rpc('approve_refund', {
      p_request_id: refundId,
    })
    if (error) return { error: new Error(friendlyError(error.message)) }
    return { error: null }
  },

  async rejectRefund(refundId: string, reason: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<null>()
    if (missing) return { error: missing.error }
    if (!UUID_RE.test(refundId)) return { error: new Error('Invalid refund reference.') }
    if (!reason.trim()) return { error: new Error('A rejection reason is required.') }
    const { error } = await supabase.rpc('reject_refund', {
      p_request_id: refundId,
      p_reason: reason.trim(),
    })
    if (error) return { error: new Error(friendlyError(error.message)) }
    return { error: null }
  },

  async processRefund(refundId: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<null>()
    if (missing) return { error: missing.error }
    if (!UUID_RE.test(refundId)) return { error: new Error('Invalid refund reference.') }
    const { error } = await supabase.rpc('process_refund', {
      p_request_id: refundId,
    })
    if (error) return { error: new Error(friendlyError(error.message)) }
    return { error: null }
  },

  /**
   * Rare accounting correction (migration 020
   * create_adjustment, super-admin-only RPC). The signed
   * amount and reason are UX-validated here; the RPC anchors
   * everything to the referenced ledger row server-side.
   */
  async createAdjustment(
    ledgerEntryId: string,
    amount: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<DbResult<{ adjustmentId: string }>> {
    const missing = requireConfigured<{ adjustmentId: string }>()
    if (missing) return missing
    if (!UUID_RE.test(ledgerEntryId)) return { data: null, error: new Error('Invalid ledger reference.') }
    if (!Number.isFinite(amount) || amount === 0) {
      return { data: null, error: new Error('Adjustment amount must be non-zero.') }
    }
    if (!reason.trim()) return { data: null, error: new Error('A correction reason is required.') }
    if (!idempotencyKey.trim()) return { data: null, error: new Error('An idempotency key is required.') }
    const { data, error } = await supabase.rpc('create_adjustment', {
      p_ledger_entry_id: ledgerEntryId,
      p_amount: amount,
      p_reason: reason.trim(),
      p_idempotency_key: idempotencyKey.trim(),
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    const adjustmentId = asString(data)
    if (!adjustmentId) return { data: null, error: new Error('Unexpected response from adjustment.') }
    return { data: { adjustmentId }, error: null }
  },
}
