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
 * Derived seller totals from get_seller_financial_summary().
 * Every value is aggregated server-side from the caller's own
 * immutable ledger rows. A missing row means no data (or no
 * authorization) — never a fabricated zero.
 */
export interface SellerFinancialSummary {
  totalEarnings: number
  totalCommission: number
  pendingEarnings: number
  availableBalance: number
  currency: string
  earningCount: number
  lastEarningAt: string | null
  /** Funds locked by active withdrawal requests (019). */
  reservedAmount: number
  /** Returned seller money from processed refunds, >= 0 (020). */
  refundedAmount: number
  /** Signed correction total, may be positive or negative (020). */
  adjustmentAmount: number
  /** True position: total + refunds + adjustments (020). */
  netEarnings: number
  /** Reversed commission snapshots from refunds, >= 0 (020). */
  refundedCommission: number
}

function toSellerFinancialSummary(row: unknown): SellerFinancialSummary | null {
  if (!isRecord(row)) return null
  const totalEarnings = asNumber(row.total_earnings)
  const totalCommission = asNumber(row.total_commission)
  const pendingEarnings = asNumber(row.pending_earnings)
  const availableBalance = asNumber(row.available_balance)
  const currency = asString(row.currency)
  const earningCount = asNumber(row.earning_count)
  const reservedAmount = asNumber(row.reserved_amount)
  const refundedAmount = asNumber(row.refunded_amount)
  const adjustmentAmount = asNumber(row.adjustment_amount)
  const netEarnings = asNumber(row.net_earnings)
  const refundedCommission = asNumber(row.refunded_commission)
  if (
    totalEarnings === null || totalCommission === null ||
    pendingEarnings === null || availableBalance === null ||
    !currency || earningCount === null || reservedAmount === null ||
    refundedAmount === null || adjustmentAmount === null ||
    netEarnings === null || refundedCommission === null
  ) {
    return null
  }
  return {
    totalEarnings,
    totalCommission,
    pendingEarnings,
    availableBalance,
    currency,
    earningCount,
    lastEarningAt: asString(row.last_earning_at),
    reservedAmount,
    refundedAmount,
    adjustmentAmount,
    netEarnings,
    refundedCommission,
  }
}

/**
 * One own ledger row from get_seller_ledger(). clearingStatus
 * is derived server-side against now() — the frontend never
 * computes availability from browser time. No customer PII.
 */
export interface SellerLedgerRow {
  entryId: string
  entryType: string
  orderId: string | null
  orderNumber: string | null
  orderItemId: string | null
  grossAmount: number | null
  commissionRate: number | null
  commissionAmount: number | null
  netAmount: number | null
  currency: string
  clearingStatus: string
  createdAt: string
  source: string | null
  /** Original earning this leg compensates, if any (020). */
  reversesEntryId: string | null
  /** Signed money movement; authoritative for refund/adjustment rows (020). */
  amount: number | null
}

function toSellerLedgerRow(row: unknown): SellerLedgerRow | null {
  if (!isRecord(row)) return null
  const entryId = asString(row.entry_id)
  const entryType = asString(row.entry_type)
  const currency = asString(row.currency)
  const clearingStatus = asString(row.clearing_status)
  const createdAt = asString(row.created_at)
  if (!entryId || !entryType || !currency || !clearingStatus || !createdAt) {
    return null
  }
  return {
    entryId,
    entryType,
    orderId: asString(row.order_id),
    orderNumber: asString(row.order_number),
    orderItemId: asString(row.order_item_id),
    grossAmount: asNumber(row.gross_amount),
    commissionRate: asNumber(row.commission_rate),
    commissionAmount: asNumber(row.commission_amount),
    netAmount: asNumber(row.net_amount),
    currency,
    clearingStatus,
    createdAt,
    source: asString(row.source),
    reversesEntryId: asString(row.reverses_entry_id),
    amount: asNumber(row.amount),
  }
}

/**
 * Keyset cursor for get_seller_ledger(). Taken verbatim from
 * the last row of the previous page. A malformed cursor fails
 * closed to the first page (never to an error state).
 */
export interface SellerLedgerCursor {
  createdBefore: string
  idBefore: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PAGE_SIZE = 25

function friendlyError(message: string): string {
  if (/network|fetch|failed to send/i.test(message)) {
    return 'Network error. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}

/**
 * One own withdrawal request from get_seller_withdrawals().
 * Status follows the server state machine; amounts and dates
 * are authoritative snapshots. No other seller's data.
 */
export interface SellerWithdrawalRow {
  withdrawalId: string
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

function toSellerWithdrawalRow(row: unknown): SellerWithdrawalRow | null {
  if (!isRecord(row)) return null
  const withdrawalId = asString(row.withdrawal_id)
  const amount = asNumber(row.amount)
  const currency = asString(row.currency)
  const status = asString(row.status)
  const createdAt = asString(row.created_at)
  if (!withdrawalId || amount === null || !currency || !status || !createdAt) {
    return null
  }
  return {
    withdrawalId,
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

/**
 * Keyset cursor for get_seller_withdrawals(). Taken verbatim
 * from the last row of the previous page. A malformed cursor
 * fails closed to the first page (never to an error state).
 */
export interface SellerWithdrawalCursor {
  createdBefore: string
  idBefore: string
}

export const WITHDRAWAL_MIN_AMOUNT = 500

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
 * Own period report from get_seller_finance_report() (021).
 * Flow totals honor the requested period; reserved, available,
 * and debt are always current point-in-time values.
 */
export interface SellerFinanceReport {
  grossEarnings: number
  totalCommission: number
  refundedAmount: number
  adjustmentAmount: number
  netEarnings: number
  paidOutAmount: number
  reservedAmount: number
  availableBalance: number
  debtAmount: number
  earningCount: number
  refundCount: number
  currency: string
  periodFrom: string | null
  periodTo: string | null
}

function toSellerFinanceReport(row: unknown): SellerFinanceReport | null {
  if (!isRecord(row)) return null
  const grossEarnings = asNumber(row.gross_earnings)
  const totalCommission = asNumber(row.total_commission)
  const refundedAmount = asNumber(row.refunded_amount)
  const adjustmentAmount = asNumber(row.adjustment_amount)
  const netEarnings = asNumber(row.net_earnings)
  const paidOutAmount = asNumber(row.paid_out_amount)
  const reservedAmount = asNumber(row.reserved_amount)
  const availableBalance = asNumber(row.available_balance)
  const debtAmount = asNumber(row.debt_amount)
  const earningCount = asNumber(row.earning_count)
  const refundCount = asNumber(row.refund_count)
  const currency = asString(row.currency)
  if (
    grossEarnings === null || totalCommission === null ||
    refundedAmount === null || adjustmentAmount === null ||
    netEarnings === null || paidOutAmount === null ||
    reservedAmount === null || availableBalance === null ||
    debtAmount === null || earningCount === null ||
    refundCount === null || !currency
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
    availableBalance,
    debtAmount,
    earningCount,
    refundCount,
    currency,
    periodFrom: asString(row.period_from),
    periodTo: asString(row.period_to),
  }
}

function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Seller financial reads (migration 018).
 *
 * Authorization is server-side only: both RPCs scope rows to
 * auth.uid() plus the verified-seller predicate. The frontend
 * never sends seller identity, never aggregates money, and
 * never decides clearing status. Read-only: no withdrawal,
 * payout, or refund path exists here.
 */
export const sellerFinanceService = {
  /** Own derived totals. Null data with null error means no earnings yet. */
  async getSummary(): Promise<DbResult<SellerFinancialSummary>> {
    const missing = requireConfigured<SellerFinancialSummary>()
    if (missing) return missing
    const { data, error } = await supabase.rpc('get_seller_financial_summary')
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    const rows = collect(data, toSellerFinancialSummary)
    return { data: rows[0] ?? null, error: null }
  },

  /** Own ledger history, newest first (server-ordered). */
  async listLedger(cursor?: SellerLedgerCursor, range?: ReportDateRange): Promise<DbResult<SellerLedgerRow[]>> {
    const missing = requireConfigured<SellerLedgerRow[]>()
    if (missing) return missing
    const cursorValid =
      cursor !== undefined &&
      !!cursor.createdBefore &&
      UUID_RE.test(cursor.idBefore)
    const { data, error } = await supabase.rpc('get_seller_ledger', {
      p_limit: PAGE_SIZE,
      p_created_before: cursorValid ? cursor.createdBefore : null,
      p_id_before: cursorValid ? cursor.idBefore : null,
      p_from: range?.from ?? null,
      p_to: range?.to ?? null,
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    return { data: collect(data, toSellerLedgerRow), error: null }
  },

  /**
   * Own period report (migration 021 get_seller_finance_report).
   * Flows honor the range; balances stay current. Null data
   * with null error means no rows in scope — never a fake zero.
   */
  async getReport(range?: ReportDateRange): Promise<DbResult<SellerFinanceReport>> {
    const missing = requireConfigured<SellerFinanceReport>()
    if (missing) return missing
    const { data, error } = await supabase.rpc('get_seller_finance_report', {
      p_from: range?.from ?? null,
      p_to: range?.to ?? null,
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    const rows = collect(data, toSellerFinanceReport)
    return { data: rows[0] ?? null, error: null }
  },

  /**
   * Request a withdrawal (migration 019 request_withdrawal).
   * Amount checks here are UX-only; the RPC re-validates the
   * minimum (BDT 500), scale, capacity, one-active rule, and
   * idempotency server-side. Returns the withdrawal id only.
   */
  async requestWithdrawal(
    amount: number,
    idempotencyKey?: string,
  ): Promise<DbResult<{ withdrawalId: string }>> {
    const missing = requireConfigured<{ withdrawalId: string }>()
    if (missing) return missing
    if (!Number.isFinite(amount) || amount < WITHDRAWAL_MIN_AMOUNT) {
      return { data: null, error: new Error(`Minimum withdrawal is BDT ${WITHDRAWAL_MIN_AMOUNT}.`) }
    }
    const { data, error } = await supabase.rpc('request_withdrawal', {
      p_amount: amount,
      p_idempotency_key: idempotencyKey ?? newIdempotencyKey(),
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    const withdrawalId = asString(data)
    if (!withdrawalId) return { data: null, error: new Error('Unexpected response from withdrawal request.') }
    return { data: { withdrawalId }, error: null }
  },

  /** Own withdrawal history, newest first (server-ordered). */
  async listWithdrawals(cursor?: SellerLedgerCursor, range?: ReportDateRange): Promise<DbResult<SellerWithdrawalRow[]>> {
    const missing = requireConfigured<SellerWithdrawalRow[]>()
    if (missing) return missing
    const cursorValid =
      cursor !== undefined &&
      !!cursor.createdBefore &&
      UUID_RE.test(cursor.idBefore)
    const { data, error } = await supabase.rpc('get_seller_withdrawals', {
      p_limit: PAGE_SIZE,
      p_created_before: cursorValid ? cursor.createdBefore : null,
      p_id_before: cursorValid ? cursor.idBefore : null,
      p_from: range?.from ?? null,
      p_to: range?.to ?? null,
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    return { data: collect(data, toSellerWithdrawalRow), error: null }
  },
}
