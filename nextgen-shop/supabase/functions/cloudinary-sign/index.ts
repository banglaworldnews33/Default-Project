// POST /functions/v1/cloudinary-sign
// Issues short-lived Cloudinary signed-upload parameters after
// verifying (JWT -> profile -> ownership) entirely server-side.
//
// Request body (minimum intent only):
//   { "kind": "product" | "shop-logo" | "shop-banner", "productId"?: "<uuid>" }
// Never accepted: sellerId, folder, public_id, transformations,
// resource_type, or any privilege claim.
//
// Success: { cloudName, apiKey, uploadUrl, timestamp, expiresAt,
//            folder, publicId, allowedFormats }
// apiKey (Cloudinary) is publishable; the API SECRET never leaves here.

import {
  auditEvent,
  checkRateLimit,
  handleOptions,
  HttpError,
  jsonResponse,
  loadOwnedProduct,
  loadOwnedShop,
  readEnv,
  requireUser,
  requireVerifiedSeller,
  serviceClient,
  signParams,
} from '../_shared/media-auth.ts'

const SIGN_TTL_SECONDS = 300
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_FORMATS = 'jpg,png,webp'

type SignKind = 'product' | 'shop-logo' | 'shop-banner'

function parseBody(body: unknown): { kind: SignKind; productId: string | null } {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'invalid request body')
  const row = body as Record<string, unknown>
  const kind = row.kind
  if (kind !== 'product' && kind !== 'shop-logo' && kind !== 'shop-banner') {
    throw new HttpError(400, 'kind must be product, shop-logo, or shop-banner')
  }
  const productId = row.productId
  if (kind === 'product') {
    if (typeof productId !== 'string' || !UUID_RE.test(productId)) {
      throw new HttpError(400, 'productId must be a valid UUID for product uploads')
    }
    return { kind, productId }
  }
  if (productId !== undefined && productId !== null) {
    throw new HttpError(400, 'productId is only valid for product uploads')
  }
  return { kind, productId: null }
}

// Statuses whose presentation may still change (live products need a
// re-review workflow before image refresh — deliberately out of scope).
function uploadEligible(status: string): boolean {
  return status === 'draft' || status === 'pending_review' || status === 'inactive'
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    const early = handleOptions(req)
    if (early) return early

    const env = readEnv()
    const svc = serviceClient(env)
    const user = await requireUser(req, svc)

    if (!checkRateLimit(`sign:${user.id}`, 30, 60 * 60 * 1000)) {
      await auditEvent(svc, 'media.sign.denied', null, user.id, null)
      throw new HttpError(429, 'signature rate limit exceeded')
    }

    let body: unknown = null
    try {
      body = await req.json()
    } catch {
      throw new HttpError(400, 'invalid JSON body')
    }
    const { kind, productId } = parseBody(body)

    // Admins moderate through RPCs, not uploads: seller flow only.
    await requireVerifiedSeller(svc, user.id)

    // Derive everything server-side. The browser controls nothing here.
    let folder = ''
    let entityId = ''
    if (kind === 'product' && productId) {
      const product = await loadOwnedProduct(svc, user.id, productId)
      if (!product) {
        await auditEvent(svc, 'media.sign.denied', null, user.id, null)
        throw new HttpError(403, 'product not found or not owned by caller')
      }
      if (!uploadEligible(product.status)) {
        throw new HttpError(403, 'product is not eligible for image changes in its current status')
      }
      entityId = product.id
    } else {
      const shop = await loadOwnedShop(svc, user.id)
      if (!shop) throw new HttpError(404, 'create your shop before uploading branding')
      entityId = shop.id
    }

    const assetId = crypto.randomUUID().replace(/-/g, '')
    folder = `ngs/${user.id}/${kind}/${entityId}`
    const publicId = `${folder}/${assetId}`
    const timestamp = String(Math.floor(Date.now() / 1000))
    // Signed set mirrors EXACTLY what the browser will POST (minus file,
    // cloud_name, resource_type, api_key, which Cloudinary excludes from
    // the signature base string). Format/size/dimension enforcement runs
    // post-upload (response validation + DB CHECKs) and client-side;
    // account-level upload-preset caps are recommended hardening.
    const signable: Record<string, string> = {
      folder,
      overwrite: 'false',
      public_id: publicId,
      timestamp,
      type: 'upload',
      unique_filename: 'false',
    }
    const signature = await signParams(signable, env.apiSecret)

    return jsonResponse({
      cloudName: env.cloudName,
      apiKey: env.apiKey,
      uploadUrl: `https://api.cloudinary.com/v1_1/${env.cloudName}/image/upload`,
      timestamp: Number(timestamp),
      expiresAt: Number(timestamp) + SIGN_TTL_SECONDS,
      folder,
      publicId,
      signature,
      allowedFormats: ALLOWED_FORMATS.split(','),
    })
  } catch (err) {
    if (err instanceof HttpError) return jsonResponse({ error: err.message }, err.status)
    return jsonResponse({ error: 'signature service unavailable' }, 500)
  }
})
