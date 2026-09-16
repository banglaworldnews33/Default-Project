import { supabase } from '@/lib/supabase'
import {
  asBoolean,
  asNumber,
  asString,
  collect,
  isRecord,
  requireConfigured,
  type DbResult,
} from './db'

/**
 * One commission rule version from get_commission_rules() /
 * get_commission_rule_history(). Field names match the RPC
 * output exactly. Rates are percentages (0-100).
 */
export interface CommissionRule {
  ruleId: string
  categoryId: string | null
  categoryName: string | null
  rate: number
  effectiveFrom: string
  effectiveTo: string | null
  inEffect: boolean
  createdBy: string | null
  createdAt: string
}

function toCommissionRule(row: unknown): CommissionRule | null {
  if (!isRecord(row)) return null
  const ruleId = asString(row.rule_id)
  const rate = asNumber(row.rate)
  const effectiveFrom = asString(row.effective_from)
  const inEffect = asBoolean(row.in_effect)
  const createdAt = asString(row.created_at)
  if (!ruleId || rate === null || !effectiveFrom || inEffect === null || !createdAt) {
    return null
  }
  return {
    ruleId,
    categoryId: asString(row.category_id),
    categoryName: asString(row.category_name),
    rate,
    effectiveFrom,
    effectiveTo: asString(row.effective_to),
    inEffect,
    createdBy: asString(row.created_by),
    createdAt,
  }
}

export interface CommissionRuleInput {
  /** Null selects the global default scope. */
  categoryId: string | null
  /** Percentage, 0-100. */
  rate: number
  /** ISO timestamp the version takes effect. */
  effectiveFrom: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Super-admin commission configuration (migration 017).
 *
 * Authorization lives entirely in the database RPCs, which
 * enforce is_super_admin() server-side. There is deliberately
 * no client-side super-admin check: pages may render for
 * normal admins, but the RPCs deny them. No direct table
 * access to commission_rules exists anywhere here, and no
 * earning/ledger math happens client-side.
 */
export const commissionService = {
  /** Currently open rule versions (super-admin-only RPC). */
  async listRules(): Promise<DbResult<CommissionRule[]>> {
    const missing = requireConfigured<CommissionRule[]>()
    if (missing) return missing
    const { data, error } = await supabase.rpc('get_commission_rules')
    if (error) return { data: null, error }
    return { data: collect(data, toCommissionRule), error: null }
  },

  /** Full version history, optionally scoped to one category. */
  async ruleHistory(categoryId: string | null): Promise<DbResult<CommissionRule[]>> {
    const missing = requireConfigured<CommissionRule[]>()
    if (missing) return missing
    if (categoryId !== null && !UUID_RE.test(categoryId)) return { data: [], error: null }
    const { data, error } = await supabase.rpc('get_commission_rule_history', {
      p_category_id: categoryId,
    })
    if (error) return { data: null, error }
    return { data: collect(data, toCommissionRule), error: null }
  },

  /**
   * Create a new rule version (super-admin-only RPC). Client
   * checks are UX-only; the RPC re-validates rate, scope,
   * effective date, and overlap server-side.
   */
  async createRule(input: CommissionRuleInput): Promise<DbResult<{ ruleId: string }>> {
    const missing = requireConfigured<{ ruleId: string }>()
    if (missing) return missing
    if (input.categoryId !== null && !UUID_RE.test(input.categoryId)) {
      return { data: null, error: new Error('Invalid category reference.') }
    }
    if (!Number.isFinite(input.rate) || input.rate < 0 || input.rate > 100) {
      return { data: null, error: new Error('Rate must be between 0 and 100.') }
    }
    if (!input.effectiveFrom) {
      return { data: null, error: new Error('Effective date is required.') }
    }
    const { data, error } = await supabase.rpc('create_commission_rule', {
      p_category_id: input.categoryId,
      p_rate: input.rate,
      p_effective_from: input.effectiveFrom,
    })
    if (error) return { data: null, error }
    const ruleId = asString(data)
    if (!ruleId) return { data: null, error: new Error('Unexpected response from rule creation.') }
    return { data: { ruleId }, error: null }
  },
}
