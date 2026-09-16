import type { PostgrestError } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { SellerApplication, SellerApplicationStatus, SellerAuditEntry } from '@/types'

export type SellerServiceError = PostgrestError | Error

export interface SellerResult<T> {
  data: T | null
  error: SellerServiceError | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asStatus(value: unknown): SellerApplicationStatus | null {
  return value === 'pending' || value === 'approved' || value === 'rejected' ? value : null
}

/** Narrow an untyped row into SellerApplication; null when malformed. */
export function toSellerApplication(row: unknown): SellerApplication | null {
  if (!isRecord(row)) return null
  const id = asString(row.id)
  const userId = asString(row.user_id)
  const businessName = asString(row.business_name)
  const status = asStatus(row.status)
  const createdAt = asString(row.created_at)
  const updatedAt = asString(row.updated_at)
  if (!id || !userId || !businessName || !status || !createdAt || !updatedAt) return null
  return {
    id,
    userId,
    businessName,
    phone: asString(row.phone),
    description: asString(row.description),
    shopCategory: asString(row.shop_category),
    status,
    reviewerId: asString(row.reviewer_id),
    reviewedAt: asString(row.reviewed_at),
    rejectionReason: asString(row.rejection_reason),
    createdAt,
    updatedAt,
  }
}

export function toSellerAuditEntry(row: unknown): SellerAuditEntry | null {
  if (!isRecord(row)) return null
  const id = asString(row.id)
  const action = asString(row.action)
  const createdAt = asString(row.created_at)
  if (!id || !action || !createdAt) return null
  return {
    id,
    action,
    adminId: asString(row.admin_id),
    targetUserId: asString(row.target_user_id),
    applicationId: asString(row.application_id),
    createdAt,
  }
}

function notConfigured(): SellerResult<never> {
  return { data: null, error: new Error('Supabase is not configured.') }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export interface SellerApplicationInput {
  businessName: string
  phone: string
  description: string | null
  shopCategory: string | null
}

export const sellerService = {
  /** Own applications for the signed-in user (RLS owner-read). */
  async listMine(): Promise<SellerResult<SellerApplication[]>> {
    if (!isSupabaseConfigured) return notConfigured()
    const uid = await currentUserId()
    if (!uid) return { data: null, error: new Error('Sign in required.') }
    const { data, error } = await supabase
      .from('seller_applications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    if (error) return { data: null, error }
    const rows: SellerApplication[] = []
    if (Array.isArray(data)) {
      for (const row of data) {
        const app = toSellerApplication(row)
        if (app) rows.push(app)
      }
    }
    return { data: rows, error: null }
  },

  /** All applications (admin SELECT-all policy; RLS denies non-admins). */
  async listAll(): Promise<SellerResult<SellerApplication[]>> {
    if (!isSupabaseConfigured) return notConfigured()
    const { data, error } = await supabase
      .from('seller_applications')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return { data: null, error }
    const rows: SellerApplication[] = []
    if (Array.isArray(data)) {
      for (const row of data) {
        const app = toSellerApplication(row)
        if (app) rows.push(app)
      }
    }
    return { data: rows, error: null }
  },

  async byId(id: string): Promise<SellerResult<SellerApplication>> {
    if (!isSupabaseConfigured) return notConfigured()
    const { data, error } = await supabase
      .from('seller_applications')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toSellerApplication(data), error: null }
  },

  /**
   * File a seller application for the signed-in user. The user id is
   * derived from the session (never accepted as input), status is
   * forced pending, reviewer fields stay null — the RLS WITH CHECK
   * rejects anything else.
   */
  async create(input: SellerApplicationInput): Promise<SellerResult<SellerApplication>> {
    if (!isSupabaseConfigured) return notConfigured()
    const uid = await currentUserId()
    if (!uid) return { data: null, error: new Error('Sign in required.') }
    const { data, error } = await supabase
      .from('seller_applications')
      .insert({
        user_id: uid,
        business_name: input.businessName,
        phone: input.phone,
        description: input.description,
        shop_category: input.shopCategory,
        status: 'pending',
      })
      .select()
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toSellerApplication(data), error: null }
  },

  /** Admin approve via secure RPC — never a direct profile write. */
  async approve(applicationId: string): Promise<{ error: SellerServiceError | null }> {
    if (!isSupabaseConfigured) return { error: new Error('Supabase is not configured.') }
    const { error } = await supabase.rpc('approve_seller_application', {
      p_application_id: applicationId,
    })
    return { error }
  },

  /** Admin reject via secure RPC — application-only change. */
  async reject(applicationId: string, reason: string): Promise<{ error: SellerServiceError | null }> {
    if (!isSupabaseConfigured) return { error: new Error('Supabase is not configured.') }
    const { error } = await supabase.rpc('reject_seller_application', {
      p_application_id: applicationId,
      p_reason: reason,
    })
    return { error }
  },

  /** Audit entries for one application (admin-only read policy). */
  async listAudit(applicationId: string): Promise<SellerResult<SellerAuditEntry[]>> {
    if (!isSupabaseConfigured) return notConfigured()
    const { data, error } = await supabase
      .from('admin_audit_log')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: true })
    if (error) return { data: null, error }
    const rows: SellerAuditEntry[] = []
    if (Array.isArray(data)) {
      for (const row of data) {
        const entry = toSellerAuditEntry(row)
        if (entry) rows.push(entry)
      }
    }
    return { data: rows, error: null }
  },
}
