// Shared auth + ownership helpers for media Edge Functions.
// Deno runtime. Secrets come ONLY from function environment secrets
// (never from the request body, never echoed back).
//
// Security model: the JWT in the Authorization header identifies the
// caller; every authorization fact (role, verified status, product and
// shop ownership) is re-read from Postgres through the service_role
// client, which never leaves this server context.

import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.116.0'

export interface FunctionEnv {
  supabaseUrl: string
  serviceRoleKey: string
  cloudName: string
  apiKey: string
  apiSecret: string
}

export function readEnv(): FunctionEnv {
  const need = (k: string): string => {
    const v = Deno.env.get(k) ?? ''
    if (!v) throw HttpError(500, `server misconfigured: missing ${k}`)
    return v
  }
  return {
    supabaseUrl: need('SUPABASE_URL'),
    serviceRoleKey: need('SUPABASE_SERVICE_ROLE_KEY'),
    cloudName: need('CLOUDINARY_CLOUD_NAME'),
    apiKey: need('CLOUDINARY_API_KEY'),
    apiSecret: need('CLOUDINARY_API_SECRET'),
  }
}

export function serviceClient(env: FunctionEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, apikey',
    },
  })
}

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true })
  if (req.method !== 'POST') throw new HttpError(405, 'method not allowed')
  return null
}

/** Validate the Bearer JWT and return the authenticated user. */
export async function requireUser(req: Request, svc: SupabaseClient): Promise<User> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) throw new HttpError(401, 'authentication required')
  const { data, error } = await svc.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'invalid or expired session')
  return data.user
}

export interface CallerProfile {
  id: string
  role: string
  verificationStatus: string
}

/** Authoritative profile read (service-side; never trusts client claims). */
export async function readProfile(svc: SupabaseClient, userId: string): Promise<CallerProfile | null> {
  const { data, error } = await svc
    .from('profiles')
    .select('id,role,verification_status')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.role !== 'string' || typeof row.verification_status !== 'string') {
    return null
  }
  return { id: row.id, role: row.role, verificationStatus: row.verification_status }
}

export async function requireVerifiedSeller(svc: SupabaseClient, userId: string): Promise<CallerProfile> {
  const profile = await readProfile(svc, userId)
  if (!profile || profile.role !== 'seller' || profile.verificationStatus !== 'verified') {
    throw new HttpError(403, 'verified seller access required')
  }
  return profile
}

export async function isAdmin(svc: SupabaseClient, userId: string): Promise<boolean> {
  const profile = await readProfile(svc, userId)
  return profile?.role === 'admin'
}

export interface OwnedProduct {
  id: string
  sellerId: string
  shopId: string
  status: string
}

/** Load a product AND prove it belongs to the caller. Null when foreign. */
export async function loadOwnedProduct(
  svc: SupabaseClient,
  userId: string,
  productId: string,
): Promise<OwnedProduct | null> {
  const { data, error } = await svc
    .from('products')
    .select('id,seller_id,shop_id,status')
    .eq('id', productId)
    .maybeSingle()
  if (error || !data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  if (row.seller_id !== userId) return null
  if (typeof row.id !== 'string' || typeof row.shop_id !== 'string' || typeof row.status !== 'string') {
    return null
  }
  return { id: row.id, sellerId: userId, shopId: row.shop_id, status: row.status }
}

export interface OwnedShop {
  id: string
  sellerId: string
}

/** Load the caller's own shop (null when none — caller must create it first). */
export async function loadOwnedShop(svc: SupabaseClient, userId: string): Promise<OwnedShop | null> {
  const { data, error } = await svc
    .from('seller_shops')
    .select('id,seller_id')
    .eq('seller_id', userId)
    .maybeSingle()
  if (error || !data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  if (typeof row.id !== 'string' || row.seller_id !== userId) return null
  return { id: row.id, sellerId: userId }
}

/** Append-only security audit (service-side insert; no client write path). */
export async function auditEvent(
  svc: SupabaseClient,
  action: string,
  adminId: string | null,
  targetUserId: string | null,
  applicationId: string | null,
): Promise<void> {
  try {
    await svc.from('admin_audit_log').insert({
      action,
      admin_id: adminId,
      target_user_id: targetUserId,
      application_id: applicationId,
    })
  } catch {
    // Audit must never break the security decision itself.
  }
}

// ---------------------------------------------------------------------------
// Best-effort per-user rate limiting (in-isolate sliding window).
// Stops casual single-client abuse loops. NOT a DDoS defense: isolates
// do not share counters. Documented residual risk; upgrade path is a
// Postgres-backed counter table if abuse is ever observed.
// ---------------------------------------------------------------------------

const buckets = new Map<string, number[]>()

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (hits.length >= limit) {
    buckets.set(key, hits)
    return false
  }
  hits.push(now)
  buckets.set(key, hits)
  return true
}

// ---------------------------------------------------------------------------
// Cloudinary helpers (no SDK: SHA-1 + fetch keeps the bundle tiny).
// ---------------------------------------------------------------------------

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Cloudinary upload signature: SHA-1 over sorted params + api_secret. */
export async function signParams(params: Record<string, string>, apiSecret: string): Promise<string> {
  const payload = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(payload + apiSecret))
  return toHex(digest)
}

export interface DestroyResult {
  ok: boolean
  rawResult: string
}

/** Server-side Cloudinary destroy (secret never leaves this context). */
export async function cloudinaryDestroy(
  env: FunctionEnv,
  publicId: string,
): Promise<DestroyResult> {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = await signParams({ public_id: publicId, timestamp }, env.apiSecret)
  const form = new FormData()
  form.append('public_id', publicId)
  form.append('timestamp', timestamp)
  form.append('api_key', env.apiKey)
  form.append('signature', signature)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudName}/image/destroy`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) return { ok: false, rawResult: `http-${res.status}` }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    return { ok: false, rawResult: 'unparseable-response' }
  }
  const result = typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>).result
    : null
  return { ok: result === 'ok' || result === 'not found', rawResult: typeof result === 'string' ? result : 'unknown' }
}
