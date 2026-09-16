import React, { useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { isCloudinaryConfigured, type MediaUploadKind } from '@/lib/cloudinary'
import {
  uploadValidatedImage,
  type ValidatedAsset,
} from '@/services/mediaUpload'

interface ImageUploaderProps {
  kind: MediaUploadKind
  productId: string | null
  minShortSide: number
  label: string
  onUploaded: (asset: ValidatedAsset) => void
}

/**
 * File picker + preview + progress + error/success states for secure
 * Cloudinary uploads (signed server-side, validated client + DB side).
 * Calls onUploaded with the validated asset; the parent persists it.
 */
export const ImageUploader: React.FC<ImageUploaderProps> = ({
  kind,
  productId,
  minShortSide,
  label,
  onUploaded,
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!isCloudinaryConfigured) {
    return (
      <p className="text-xs text-neutral-400 rounded-xl bg-neutral-50 border border-neutral-200 px-4 py-3">
        Cloud uploads are not configured yet — paste an https:// image link instead.
      </p>
    )
  }

  function pickFile(file: File | undefined): void {
    setError(null)
    setProgress(null)
    if (preview) URL.revokeObjectURL(preview)
    if (!file) {
      setPreview(null)
      setFileName(null)
      return
    }
    setPreview(URL.createObjectURL(file))
    setFileName(file.name)
    void startUpload(file)
  }

  async function startUpload(file: File): Promise<void> {
    setBusy(true)
    setProgress(0)
    try {
      const { asset, error: err } = await uploadValidatedImage(
        file,
        kind,
        productId,
        minShortSide,
        (p) => setProgress(p),
      )
      if (!asset || err) {
        setError(err?.message ?? 'Upload failed.')
        setProgress(null)
        return
      }
      onUploaded(asset)
      setPreview(null)
      setFileName(null)
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 p-4 space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        aria-label={label}
        disabled={busy}
        onChange={(e) => pickFile(e.target.files?.[0])}
        className="block w-full text-xs text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-navy-900 file:px-3.5 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-navy-800 file:cursor-pointer cursor-pointer disabled:opacity-50"
      />
      {preview && fileName && (
        <div className="flex items-center gap-3">
          <img src={preview} alt="Upload preview" className="h-14 w-14 rounded-xl object-cover border border-neutral-200" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-navy-900 truncate">{fileName}</p>
            {progress !== null ? (
              <div className="mt-1.5 h-1.5 rounded-full bg-neutral-200 overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-primary-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
            ) : (
              <p className="text-[11px] text-neutral-400">{busy ? 'Uploading…' : 'Ready'}</p>
            )}
          </div>
          {!busy && (
            <button
              type="button"
              onClick={() => pickFile(undefined)}
              className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-200 cursor-pointer"
              aria-label="Clear selected file"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
      )}
      <p className="text-[11px] text-neutral-400 flex items-center gap-1.5">
        <ImagePlus className="h-3.5 w-3.5" />
        JPG, PNG or WebP · max 5 MB · min {minShortSide}px · signed &amp; validated upload
      </p>
    </div>
  )
}
