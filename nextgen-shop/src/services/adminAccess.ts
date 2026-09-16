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

export interface AdminCodeStatus {
  adminId: string
  isActive: boolean
  failedAttempts: number
  lockedUntil: string | null
  updatedAt: string
}

function toAdminCodeStatus(row: unknown): AdminCodeStatus | null {
  if (!isRecord(row)) return null
  const adminId = asString(row.admin_id)
  const isActive = asBoolean(row.is_active)
  const failedAttempts = asNumber(row.failed_attempts)
  const updatedAt = asString(row.updated_at)
  if (!adminId || isActive === null || failedAttempts === null || !updatedAt) {
    return null
  }
  // NOTE: code_hash is never selected by any reader here by design.
  return {
    adminId,
    isActive,
    failedAttempts,
    lockedUntil: asString(row.locked_until),
    updatedAt,
  }
}

/**
 * Super-admin code management (migration 010).
 *
 * Every operation runs through a SECURITY DEFINER RPC that enforces
 * is_super_admin() inside the database. There is deliberately no
 * client-side super-admin check: the page may render for normal
 * admins, but the RPCs deny them. No direct table access to
 * admin_product_codes exists anywhere here (the table is fully
 * revoked). verify_admin_product_code is intentionally NOT exposed:
 * it runs only inside admin_create_seller_product().
 */
export const adminAccessService = {
  /** Issue or rotate an admin's product code (super-admin-only RPC). */
  async setAdminProductCode(targetAdminId: string, newCode: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<null>()
    if (missing) return { error: missing.error }
    const { error } = await supabase.rpc('set_admin_product_code', {
      p_target_admin: targetAdminId,
      p_new_code: newCode,
    })
    return { error }
  },

  /** Revoke (disable) an admin's product code (super-admin-only RPC). */
  async revokeAdminProductCode(targetAdminId: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<null>()
    if (missing) return { error: missing.error }
    const { error } = await supabase.rpc('revoke_admin_product_code', {
      p_target_admin: targetAdminId,
    })
    return { error }
  },

  /**
   * Code status list (super-admin-only RPC). Returns status fields
   * only — never code material. Normal admins receive zero rows;
   * callers must NOT interpret an empty list as a role signal.
   */
  async listAdminProductCodes(): Promise<DbResult<AdminCodeStatus[]>> {
    const missing = requireConfigured<AdminCodeStatus[]>()
    if (missing) return missing
    const { data, error } = await supabase.rpc('list_admin_product_codes', {})
    if (error) return { data: null, error }
    return { data: collect(data, toAdminCodeStatus), error: null }
  },

  /**
   * Grant admin permission (migration 011, super-admin-only RPC).
   * No client-side privilege logic: the database enforces
   * is_super_admin() and the customer-only target rule.
   */
  async grantAdminPermission(targetUserId: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<null>()
    if (missing) return { error: missing.error }
    const { error } = await supabase.rpc('grant_admin_permission', {
      p_target: targetUserId,
    })
    return { error }
  },

  /**
   * Revoke admin permission (migration 011, super-admin-only RPC).
   * Never touches super_admins membership; revoking a super admin
   * is refused server-side. No profiles table access from here.
   */
  async revokeAdminPermission(targetUserId: string): Promise<{ error: Error | null }> {
    const missing = requireConfigured<null>()
    if (missing) return { error: missing.error }
    const { error } = await supabase.rpc('revoke_admin_permission', {
      p_target: targetUserId,
    })
    return { error }
  },
}
