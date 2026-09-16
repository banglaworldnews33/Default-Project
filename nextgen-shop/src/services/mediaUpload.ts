import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import {
  isCloudinaryConfigured,
  toCloudinaryAsset,
  toSignedUpload,
  uploadFileToCloudinary,
  type CloudinaryAsset,
  type MediaUploadKind,
  type SignedUpload,
} from '@/lib/cloudinary'
import { sellerProductsService } from './sellerProducts'
import { sellerShopService } from './sellerShop'

export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const MAX_DIMENSION = 3000
export const MIN_PRODUCT_SHORT_SIDE = 400
export const MIN_LOGO_SHORT_SIDE = 400

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp'] as const

export interface FileCheck {
  ok: boolean
  message: string
  width: number
  height: number
}

/** Client-side validation (UX only — server + DB re-enforce everything). */
export async function validateImageFile(file: File, minShortSide: number): Promise<FileCheck> {
  const fail = (message: string): FileCheck => ({ ok: false, message, width: 0, height: 0 })
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return fail('Only JPG, PNG, or WebP images are allowed. SVG and other formats are rejected for security.')
  }
  if (!(ALLOWED_EXT as readonly string[]).includes(ext)) {
    return fail('File extension must be .jpg, .jpeg, .png, or .webp.')
  }
  if (file.size > MAX_FILE_BYTES) return fail('Image must be 5 MB or smaller.')
  if (file.size === 0) return fail('Empty file.')
  let width = 0
  let height = 0
  try {
    const bitmap = await createImageBitmap(file)
    width = bitmap.width
    height = bitmap.height
    bitmap.close()
  } catch {
    return fail('Could not read this image. Try a different file.')
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return fail('Image must be 3000px or smaller on each side.')
  }
  if (Math.min(width, height) < minShortSide) {
    return fail(`Image is too small — at least ${minShortSide}px on the shortest side.`)
  }
  return { ok: true, message: 'OK', width, height }
}

export interface SignResult {
  signed: SignedUpload | null
  error: Error | null
}

async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<{ data: T | null; error: Error | null }> {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase is not configured.') }
  try {
    const { data, error } = await supabase.functions.invoke(name, { body })
    if (error) return { data: null, error: new Error(error.message || `${name} request failed.`) }
    return { data: data as T | null, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(`${name} request failed.`) }
  }
}

/** Request short-lived signed upload params (server authorizes ownership). */
export async function requestUploadSignature(
  kind: MediaUploadKind,
  productId: string | null,
): Promise<SignResult> {
  if (!isCloudinaryConfigured) {
    return { signed: null, error: new Error('Image uploads are not configured yet.') }
  }
  const { data, error } = await invokeFunction<unknown>('cloudinary-sign', {
    kind,
    ...(kind === 'product' ? { productId } : {}),
  })
  if (error || !data) return { signed: null, error: error ?? new Error('Signing failed.') }
  const signed = toSignedUpload(data)
  if (!signed) return { signed: null, error: new Error('Signing service returned an unreadable response.') }
  return { signed, error: null }
}

export interface ValidatedAsset extends CloudinaryAsset {
  expectedPublicId: string
}

/**
 * Validate the Cloudinary response against the signed operation.
 * Rejects: non-HTTPS urls, non-image resources, disallowed formats,
 * oversize/over-dimension assets, and — critically — any public_id
 * that is not byte-identical to the server-issued one.
 */
export function validateCloudinaryResponse(value: unknown, expectedPublicId: string): ValidatedAsset | null {
  const asset = toCloudinaryAsset(value)
  if (!asset) return null
  if (!asset.secureUrl.startsWith('https://')) return null
  if (asset.resourceType !== 'image') return null
  const format = asset.format.toLowerCase()
  if (format !== 'jpg' && format !== 'jpeg' && format !== 'png' && format !== 'webp') return null
  if (asset.bytes <= 0 || asset.bytes > MAX_FILE_BYTES) return null
  if (asset.width <= 0 || asset.width > MAX_DIMENSION || asset.height <= 0 || asset.height > MAX_DIMENSION) {
    return null
  }
  if (asset.publicId !== expectedPublicId) return null
  return { ...asset, format, expectedPublicId }
}

export interface UploadOutcome {
  asset: ValidatedAsset | null
  error: Error | null
}

/** Full flow: validate → sign → upload → validate response. No DB writes. */
export async function uploadValidatedImage(
  file: File,
  kind: MediaUploadKind,
  productId: string | null,
  minShortSide: number,
  onProgress?: (percent: number) => void,
): Promise<UploadOutcome> {
  const check = await validateImageFile(file, minShortSide)
  if (!check.ok) return { asset: null, error: new Error(check.message) }
  const { signed, error: signError } = await requestUploadSignature(kind, productId)
  if (!signed || signError) return { asset: null, error: signError ?? new Error('Signing failed.') }
  let asset: CloudinaryAsset
  try {
    asset = await uploadFileToCloudinary(file, signed, onProgress)
  } catch (e) {
    return { asset: null, error: e instanceof Error ? e : new Error('Upload failed.') }
  }
  const validated = validateCloudinaryResponse(asset, signed.publicId)
  if (!validated) return { asset: null, error: new Error('Cloud storage returned an unexpected response. Nothing was saved.') }
  return { asset: validated, error: null }
}

/** Best-effort orphan cleanup (server destroys ONLY caller-prefixed assets). */
export async function cleanupOrphan(publicId: string): Promise<void> {
  const { error } = await invokeFunction<unknown>('cloudinary-delete', {
    op: 'cleanup-orphan',
    publicId,
  })
  if (error) {
    console.warn('Orphan cleanup deferred (future sweeper will reconcile):', error.message)
  }
}

export interface PersistOutcome {
  error: Error | null
}

/** Persist a validated product image row (RLS still authoritative). */
export async function persistProductImage(
  productId: string,
  asset: ValidatedAsset,
  altText: string | null,
  isPrimary: boolean,
): Promise<PersistOutcome> {
  const { error } = await sellerProductsService.addImage(
    productId,
    asset.secureUrl,
    altText,
    isPrimary,
    {
      publicId: asset.publicId,
      width: asset.width,
      height: asset.height,
      bytes: asset.bytes,
      format: asset.format,
    },
  )
  if (error) {
    await cleanupOrphan(asset.publicId)
    return { error }
  }
  return { error: null }
}

/**
 * Delete a product image row (cloud destroy + DB delete happen
 * server-side; the row id is the only input — public_id is re-read
 * from the database, never trusted from the caller).
 */
export async function deleteProductImage(imageRowId: string): Promise<PersistOutcome> {
  const { error } = await invokeFunction<unknown>('cloudinary-delete', {
    op: 'delete-image',
    imageRowId,
  })
  return { error }
}

/** Persist shop logo/banner (URL + public_id together; RLS authoritative). */
export async function persistShopBranding(
  shopId: string,
  which: 'logo' | 'banner',
  asset: ValidatedAsset,
): Promise<PersistOutcome> {
  const { error } = await sellerShopService.updateBasics(shopId,
    which === 'logo'
      ? { logoUrl: asset.secureUrl, logoPublicId: asset.publicId }
      : { bannerUrl: asset.secureUrl, bannerPublicId: asset.publicId },
  )
  if (error) {
    await cleanupOrphan(asset.publicId)
    return { error }
  }
  return { error: null }
}
