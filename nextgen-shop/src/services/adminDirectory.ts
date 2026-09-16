import { supabase } from '@/lib/supabase'
import {
  asString,
  collect,
  isRecord,
  requireConfigured,
  type DbResult,
} from './db'

export interface SellerDirectoryEntry {
  id: string
  name: string | null
  email: string | null
}

function toDirectoryEntry(row: unknown): SellerDirectoryEntry | null {
  if (!isRecord(row)) return null
  const id = asString(row.id)
  if (!id) return null
  return { id, name: asString(row.name), email: asString(row.email) }
}

/**
 * Admin directory reads. Every query relies on the admin-only RLS
 * policies — non-admin callers receive errors/empty sets, never rows.
 */
export const adminDirectoryService = {
  /** All verified sellers (for assignment dropdowns, filters). */
  async listVerifiedSellers(): Promise<DbResult<SellerDirectoryEntry[]>> {
    const missing = requireConfigured<SellerDirectoryEntry[]>()
    if (missing) return missing
    const { data, error } = await supabase
      .from('profiles')
      .select('id,name,email')
      .eq('role', 'seller')
      .eq('verification_status', 'verified')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return { data: null, error }
    return { data: collect(data, toDirectoryEntry), error: null }
  },
}
