import { supabase } from '@/lib/supabase'
import { requireConfigured, type DbResult } from './db'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function friendlyError(message: string): string {
  if (/network|fetch|failed to send/i.test(message)) {
    return 'Network error. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Seller profile settings (existing update_profile RPC, 002).
 *
 * The RPC is SECURITY DEFINER with a server-side ownership guard:
 * a non-admin caller can only ever update the row whose id equals
 * auth.uid(), and the statement writes ONLY name/phone/updated_at.
 * Role, verification_status, id, and created_at are additionally
 * trigger-immutable for every writer. The userId below is taken
 * from the authenticated session (never user input) and exists
 * only to satisfy the RPC signature — authorization does not
 * depend on it.
 */
export const sellerSettingsService = {
  async updateMyProfile(userId: string, name: string, phone: string): Promise<DbResult<null>> {
    const missing = requireConfigured<null>()
    if (missing) return missing
    if (!UUID_RE.test(userId)) {
      return { data: null, error: new Error('Sign in required.') }
    }
    const { error } = await supabase.rpc('update_profile', {
      p_id: userId,
      p_name: name,
      p_phone: phone,
    })
    if (error) return { data: null, error: new Error(friendlyError(error.message)) }
    return { data: null, error: null }
  },
}
