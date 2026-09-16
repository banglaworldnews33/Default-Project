// Cloudinary public configuration + derived-URL helpers.
// ONLY the cloud name is public. The API key returned inside signed
// upload payloads is Cloudinary-publishable; the API SECRET never
// appears here (it lives in Edge Function secrets only).

const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined ?? ''

export const isCloudinaryConfigured = cloudName.length > 0

export function getCloudName(): string {
  return cloudName
}

/** Allowed upload kinds (must match the signing endpoint exactly). */
export type MediaUploadKind = 'product' | 'shop-logo' | 'shop-banner'

/** Short-lived signed upload parameters issued by cloudinary-sign. */
export interface SignedUpload {
  cloudName: string
  apiKey: string
  uploadUrl: string
  timestamp: number
  expiresAt: number
  folder: string
  publicId: string
  signature: string
  allowedFormats: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Narrow the untyped signing response; null when malformed. */
export function toSignedUpload(value: unknown): SignedUpload | null {
  if (!isRecord(value)) return null
  const { cloudName: cn, apiKey, uploadUrl, timestamp, expiresAt, folder, publicId, signature, allowedFormats } = value
  if (
    typeof cn !== 'string' || cn.length === 0 ||
    typeof apiKey !== 'string' || apiKey.length === 0 ||
    typeof uploadUrl !== 'string' || !uploadUrl.startsWith('https://') ||
    typeof timestamp !== 'number' || typeof expiresAt !== 'number' ||
    typeof folder !== 'string' || typeof publicId !== 'string' || publicId.length === 0 ||
    typeof signature !== 'string' || signature.length === 0 ||
    !Array.isArray(allowedFormats)
  ) {
    return null
  }
  return { cloudName: cn, apiKey, uploadUrl, timestamp, expiresAt, folder, publicId, signature, allowedFormats: allowedFormats.filter((f): f is string => typeof f === 'string') }
}

export interface CloudinaryAsset {
  secureUrl: string
  publicId: string
  resourceType: string
  format: string
  bytes: number
  width: number
  height: number
}

/** Narrow the untyped Cloudinary upload response; null when malformed. */
export function toCloudinaryAsset(value: unknown): CloudinaryAsset | null {
  if (!isRecord(value)) return null
  const { secure_url, public_id, resource_type, format, bytes, width, height } = value
  if (
    typeof secure_url !== 'string' ||
    typeof public_id !== 'string' ||
    typeof resource_type !== 'string' ||
    typeof format !== 'string' ||
    typeof bytes !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return null
  }
  return {
    secureUrl: secure_url,
    publicId: public_id,
    resourceType: resource_type,
    format,
    bytes,
    width,
    height,
  }
}

// ---------------------------------------------------------------------------
// Centralized derived-URL presets. Rendering NEVER invents transforms;
// callers pick a preset key. public_id comes from database rows only.
// ---------------------------------------------------------------------------

const PRESETS = {
  'product-thumb': 'c_fill,g_auto,w_200,h_200',
  'product-listing': 'c_limit,w_600',
  'product-detail': 'c_limit,w_1200',
  'shop-logo': 'c_fill,g_auto,w_400,h_400',
  'shop-banner': 'c_fill,g_auto,w_1600,h_600',
} as const

export type CloudinaryPreset = keyof typeof PRESETS

const PUBLIC_ID_RE = /^[A-Za-z0-9_][A-Za-z0-9_/.-]*$/

export function buildCloudinaryUrl(publicId: string, preset: CloudinaryPreset): string | null {
  if (!cloudName || !PUBLIC_ID_RE.test(publicId) || publicId.includes('..')) return null
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,dpr_auto/${PRESETS[preset]}/${publicId}`
}

/** Direct browser-to-Cloudinary upload using signed params (with progress). */
export async function uploadFileToCloudinary(
  file: File,
  signed: SignedUpload,
  onProgress?: (percent: number) => void,
): Promise<CloudinaryAsset> {
  if (Date.now() / 1000 > signed.expiresAt - 30) {
    throw new Error('Upload signature expired. Please try again.')
  }
  const form = new FormData()
  form.append('file', file)
  form.append('api_key', signed.apiKey)
  form.append('timestamp', String(signed.timestamp))
  form.append('folder', signed.folder)
  form.append('public_id', signed.publicId)
  form.append('resource_type', 'image')
  form.append('type', 'upload')
  form.append('overwrite', 'false')
  form.append('unique_filename', 'false')
  form.append('signature', signed.signature)

  const result = await new Promise<unknown>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', signed.uploadUrl)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      try {
        // Parsed payload stays unknown until toCloudinaryAsset() narrows it.
        const payload: unknown = JSON.parse(xhr.responseText)
        resolve(payload)
      } catch {
        reject(new Error(`Cloudinary upload failed (http ${xhr.status}).`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error during Cloudinary upload.'))
    xhr.send(form)
  })
  const asset = toCloudinaryAsset(result)
  if (!asset) throw new Error('Cloudinary returned an unreadable response.')
  return asset
}

