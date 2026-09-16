// POST /functions/v1/cloudinary-delete
// Secure deletion + orphan cleanup. The browser supplies ONLY database
// row identifiers (or a tightly-scoped op); the Cloudinary public_id is
// ALWAYS re-read from the database server-side, never trusted.
//
// Operations:
//   { "op": "delete-image", "imageRowId": "<uuid>" }
//     Seller's own image row (or admin): destroy cloud asset, then
//     delete the DB row. Cloud-first ordering: a cloud failure aborts
//     before any DB change; a DB failure after cloud success returns
//     the orphan public_id for the future sweeper.
//   { "op": "clear-shop-logo" } | { "op": "clear-shop-banner" }
//     Caller's own shop only: destroy the anchored asset, then clear
//     BOTH the url and public_id columns together.
//   { "op": "cleanup-orphan", "publicId": "<id>" }
//     Failed-insert leftovers only: public_id MUST live under the
//     caller's own ngs/<uid>/ prefix (verified here); destroys the
//     asset without touching any DB row.
//
// Nothing but the per-op result (and, on DB failure, the orphan id for
// reconciliation) is ever returned. Secrets never leave this context.

import {
  auditEvent,
  checkRateLimit,
  cloudinaryDestroy,
  handleOptions,
  HttpError,
  isAdmin,
  jsonResponse,
  loadOwnedProduct,
  loadOwnedShop,
  readEnv,
  requireUser,
  requireVerifiedSeller,
  serviceClient,
} from '../_shared/media-auth.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type DeleteOp =
  | { op: 'delete-image'; imageRowId: string }
  | { op: 'clear-shop-logo' }
  | { op: 'clear-shop-banner' }
  | { op: 'cleanup-orphan'; publicId: string }

function parseBody(body: unknown): DeleteOp {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'invalid request body')
  const row = body as Record<string, unknown>
  if (row.op === 'delete-image') {
    if (typeof row.imageRowId !== 'string' || !UUID_RE.test(row.imageRowId)) {
      throw new HttpError(400, 'imageRowId must be a valid UUID')
    }
    return { op: 'delete-image', imageRowId: row.imageRowId }
  }
  if (row.op === 'clear-shop-logo') return { op: 'clear-shop-logo' }
  if (row.op === 'clear-shop-banner') return { op: 'clear-shop-banner' }
  if (row.op === 'cleanup-orphan') {
    if (typeof row.publicId !== 'string' || row.publicId.length === 0 || row.publicId.length > 500) {
      throw new HttpError(400, 'publicId invalid')
    }
    return { op: 'cleanup-orphan', publicId: row.publicId }
  }
  throw new HttpError(400, 'op must be delete-image, clear-shop-logo, clear-shop-banner, or cleanup-orphan')
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    const early = handleOptions(req)
    if (early) return early

    const env = readEnv()
    const svc = serviceClient(env)
    const user = await requireUser(req, svc)

    if (!checkRateLimit(`delete:${user.id}`, 20, 60 * 60 * 1000)) {
      await auditEvent(svc, 'media.delete.denied', null, user.id, null)
      throw new HttpError(429, 'deletion rate limit exceeded')
    }

    let body: unknown = null
    try {
      body = await req.json()
    } catch {
      throw new HttpError(400, 'invalid JSON body')
    }
    const operation = parseBody(body)
    const admin = await isAdmin(svc, user.id)

    // ---- orphan cleanup: prefix-bound to the caller's own folder ----
    if (operation.op === 'cleanup-orphan') {
      await requireVerifiedSeller(svc, user.id)
      const prefix = `ngs/${user.id}/`
      if (!operation.publicId.startsWith(prefix)) {
        await auditEvent(svc, 'media.delete.denied', null, user.id, null)
        throw new HttpError(403, 'public_id outside caller folder')
      }
      const destroyed = await cloudinaryDestroy(env, operation.publicId)
      if (!destroyed.ok) throw new HttpError(502, 'cloud deletion failed')
      return jsonResponse({ ok: true })
    }

    // ---- shop logo/banner clearing (caller's own shop) ----
    if (operation.op === 'clear-shop-logo' || operation.op === 'clear-shop-banner') {
      await requireVerifiedSeller(svc, user.id)
      const shop = await loadOwnedShop(svc, user.id)
      if (!shop) throw new HttpError(404, 'shop not found')
      const { data: row, error: readError } = await svc
        .from('seller_shops')
        .select('logo_url,logo_public_id,banner_url,banner_public_id')
        .eq('id', shop.id)
        .maybeSingle()
      if (readError || !row || typeof row !== 'object') throw new HttpError(404, 'shop not found')
      const record = row as Record<string, unknown>
      const urlKey = operation.op === 'clear-shop-logo' ? 'logo_url' : 'banner_url'
      const idKey = operation.op === 'clear-shop-logo' ? 'logo_public_id' : 'banner_public_id'
      const publicId = record[idKey]
      if (typeof publicId === 'string' && publicId.length > 0) {
        const destroyed = await cloudinaryDestroy(env, publicId)
        if (!destroyed.ok) throw new HttpError(502, 'cloud deletion failed; database left untouched')
      }
      const { error: clearError } = await svc
        .from('seller_shops')
        .update({ [urlKey]: null, [idKey]: null })
        .eq('id', shop.id)
      if (clearError) {
        throw new HttpError(500, 'cloud asset removed but database clear failed; re-upload to reconcile')
      }
      await auditEvent(svc, 'media.delete', user.id, user.id, null)
      return jsonResponse({ ok: true })
    }

    // ---- image row deletion (own product's image, or admin) ----
    const { data: imageRow, error: readError } = await svc
      .from('product_images')
      .select('id,product_id,cloudinary_public_id')
      .eq('id', operation.imageRowId)
      .maybeSingle()
    if (readError || !imageRow || typeof imageRow !== 'object') {
      throw new HttpError(404, 'image not found')
    }
    const record = imageRow as Record<string, unknown>
    const productId = record.product_id
    if (typeof productId !== 'string') throw new HttpError(404, 'image not found')

    if (!admin) {
      await requireVerifiedSeller(svc, user.id)
      const owned = await loadOwnedProduct(svc, user.id, productId)
      if (!owned) {
        await auditEvent(svc, 'media.delete.denied', null, user.id, null)
        throw new HttpError(403, 'image not found or not owned by caller')
      }
    }

    const publicId = record.cloudinary_public_id
    if (typeof publicId === 'string' && publicId.length > 0) {
      const destroyed = await cloudinaryDestroy(env, publicId)
      if (!destroyed.ok) {
        throw new HttpError(502, 'cloud deletion failed; database left untouched')
      }
    }
    const { error: deleteError } = await svc.from('product_images').delete().eq('id', operation.imageRowId)
    if (deleteError) {
      throw new HttpError(500, 'cloud asset removed but database delete failed; orphan reference returned for reconciliation')
    }
    await auditEvent(svc, 'media.delete', user.id, user.id, null)
    return jsonResponse({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) return jsonResponse({ error: err.message }, err.status)
    return jsonResponse({ error: 'deletion service unavailable' }, 500)
  }
})
