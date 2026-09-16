import React, { useCallback, useEffect, useState } from 'react'
import { Store } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { sellerShopService } from '@/services/sellerShop'
import { ImageUploader } from '@/components/seller/ImageUploader'
import {
  cleanupOrphan,
  persistShopBranding,
  type ValidatedAsset,
} from '@/services/mediaUpload'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { LoadingState, ErrorState } from '@/components/seller/SellerWidgets'
import { formatDate } from '@/lib/utils'
import type { SellerShop } from '@/types'

const inputClass =
  'w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 bg-white transition-all placeholder:text-neutral-400'

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return base || 'shop'
}

export const SellerShopPage: React.FC = () => {
  const { user } = useAuth()
  const [shop, setShop] = useState<SellerShop | null>(null)
  const [productCount, setProductCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [editing, setEditing] = useState(false)
  const [shopName, setShopName] = useState('')
  const [shopSlug, setShopSlug] = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [brandingMsg, setBrandingMsg] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  /** Replace branding: upload → persist new pointers → clean up the old asset. */
  async function handleBrandingUpload(which: 'logo' | 'banner', asset: ValidatedAsset): Promise<void> {
    if (!shop) return
    setBrandingMsg(null)
    const oldPublicId = which === 'logo' ? shop.logoPublicId : shop.bannerPublicId
    const { error } = await persistShopBranding(shop.id, which, asset)
    if (error) {
      setBrandingMsg(error.message)
      return
    }
    if (oldPublicId && oldPublicId !== asset.publicId) {
      await cleanupOrphan(oldPublicId)
    }
    setBrandingMsg(`${which === 'logo' ? 'Logo' : 'Banner'} updated.`)
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  const load = useCallback(async () => {
    const { data, error: err } = await sellerShopService.getMine()
    if (err) {
      setError(err.message)
      setShop(null)
      setProductCount(null)
    } else {
      setError(null)
      setShop(data)
      if (data) {
        setShopName(data.shopName)
        setDescription(data.description ?? '')
        setLogoUrl(data.logoUrl ?? '')
        setBannerUrl(data.bannerUrl ?? '')
        setProductCount(await sellerShopService.countProducts(data.id))
      }
    }
  }, [])

  useEffect(() => {
    if (!user) return
    let active = true
    void (async () => {
      setLoading(true)
      await load()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [user, load, reloadKey])

  function startCreate(): void {
    setShopName('')
    setShopSlug('')
    setDescription('')
    setLogoUrl('')
    setBannerUrl('')
    setFormError(null)
    setSaveMsg(null)
    setEditing(true)
  }

  /** Exit edit mode restoring the last loaded values. */
  function cancelEdit(): void {
    if (shop) {
      setShopName(shop.shopName)
      setDescription(shop.description ?? '')
      setLogoUrl(shop.logoUrl ?? '')
      setBannerUrl(shop.bannerUrl ?? '')
    }
    setFormError(null)
    setEditing(false)
  }

  async function handleSave(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setFormError(null)
    setSaveMsg(null)
    const name = shopName.trim()
    if (name.length < 3 || name.length > 200) {
      setFormError('Shop name must be 3–200 characters.')
      return
    }
    const logo = logoUrl.trim() ? logoUrl.trim() : null
    const banner = bannerUrl.trim() ? bannerUrl.trim() : null
    if ((logo && !logo.startsWith('https://')) || (banner && !banner.startsWith('https://'))) {
      setFormError('Logo and banner must be https:// URLs (image upload arrives with Storage).')
      return
    }
    setSaving(true)
    try {
      if (!shop) {
        const slug = slugify(shopSlug.trim() ? shopSlug : name)
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
          setFormError('Shop URL may contain only lowercase letters, numbers, and hyphens.')
          return
        }
        const { data, error: err } = await sellerShopService.create({
          shopName: name,
          shopSlug: slug,
          description: description.trim() ? description.trim() : null,
          logoUrl: logo,
          bannerUrl: banner,
        })
        if (err || !data) {
          setFormError(err?.message ?? 'Could not create your shop.')
          return
        }
      } else {
        const { data, error: err } = await sellerShopService.updateBasics(shop.id, {
          shopName: name,
          description: description.trim() ? description.trim() : null,
          logoUrl: logo,
          bannerUrl: banner,
        })
        if (err || !data) {
          setFormError(err?.message ?? 'Could not save your shop.')
          return
        }
      }
      setEditing(false)
      setSaveMsg(shop ? 'Shop details saved.' : 'Shop created.')
      setLoading(true)
      setReloadKey((k) => k + 1)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">My Shop</h1>
        <p className="text-sm text-neutral-500 mt-1">Your public storefront identity. Only you can see and edit this page.</p>
      </div>

      {loading && <LoadingState message="Loading your shop…" />}
      {!loading && error && (
        <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />
      )}
      {!loading && !error && saveMsg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3">{saveMsg}</div>
      )}

      {!loading && !error && !shop && !editing && (
        <div className="card-premium p-8 text-center space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-primary-50 border border-primary-100 text-primary-600 flex items-center justify-center mx-auto">
            <Store className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-display font-bold text-navy-900">Set up your shop</h2>
          <p className="text-sm text-neutral-500 max-w-sm mx-auto">
            Create your one shop profile. Your shop URL is permanent once chosen.
          </p>
          <Button type="button" variant="secondary" size="lg" onClick={startCreate}>
            Create My Shop
          </Button>
        </div>
      )}

      {!loading && !error && (shop || editing) && (
        <div className="card-premium p-5 sm:p-6">
          {!editing ? (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {shop?.logoUrl ? (
                  <img src={shop.logoUrl} alt={`${shop?.shopName ?? 'Shop'} logo`} className="h-16 w-16 rounded-2xl object-cover border border-neutral-200" />
                ) : (
                  <div className="h-16 w-16 rounded-2xl bg-primary-600 text-white flex items-center justify-center shrink-0">
                    <Store className="h-8 w-8" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-display font-bold text-navy-900 truncate">{shop?.shopName}</h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    /shop/{shop?.shopSlug} · {productCount ?? 0} products · since {formatDate(shop?.createdAt ?? new Date().toISOString())}
                  </p>
                </div>
                <Badge variant={shop?.status === 'active' ? 'success' : 'muted'}>{shop?.status}</Badge>
              </div>
              {shop?.description && (
                <p className="text-sm text-neutral-600 leading-relaxed">{shop.description}</p>
              )}
              <Button type="button" variant="outline" size="md" onClick={() => { setSaveMsg(null); setEditing(true) }}>
                Edit Shop Details
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <h2 className="font-display font-bold text-lg text-navy-900">
                {shop ? 'Edit Shop Details' : 'Create Your Shop'}
              </h2>
              <div>
                <label htmlFor="shop-name" className="block text-sm font-semibold text-navy-900 mb-1.5">
                  Shop Name <span className="text-rose-600">*</span>
                </label>
                <input id="shop-name" type="text" value={shopName} onChange={(e) => setShopName(e.target.value)} maxLength={200} placeholder="e.g. Dhaka Fashion House" className={inputClass} />
              </div>
              {!shop && (
                <div>
                  <label htmlFor="shop-slug" className="block text-sm font-semibold text-navy-900 mb-1.5">
                    Shop URL <span className="text-rose-600">*</span>
                  </label>
                  <div className="flex items-center gap-0">
                    <span className="rounded-l-xl border border-r-0 border-neutral-300 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-500">/shop/</span>
                    <input id="shop-slug" type="text" value={shopSlug} onChange={(e) => setShopSlug(e.target.value.toLowerCase())} placeholder="dhaka-fashion-house" maxLength={100} className={`${inputClass} rounded-l-none`} />
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">Lowercase letters, numbers, hyphens. Permanent — cannot be changed later.</p>
                </div>
              )}
              <div>
                <label htmlFor="shop-desc" className="block text-sm font-semibold text-navy-900 mb-1.5">
                  Description <span className="text-neutral-400 font-normal">(optional)</span>
                </label>
                <textarea id="shop-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="What makes your shop special?" className={`${inputClass} resize-y`} />
              </div>
              {shop && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="block text-sm font-semibold text-navy-900">Upload Logo</p>
                    <ImageUploader
                      kind="shop-logo"
                      productId={null}
                      minShortSide={400}
                      label="Upload shop logo"
                      onUploaded={(asset) => void handleBrandingUpload('logo', asset)}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="block text-sm font-semibold text-navy-900">Upload Banner</p>
                    <ImageUploader
                      kind="shop-banner"
                      productId={null}
                      minShortSide={400}
                      label="Upload shop banner"
                      onUploaded={(asset) => void handleBrandingUpload('banner', asset)}
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="shop-logo" className="block text-sm font-semibold text-navy-900 mb-1.5">
                    Logo URL <span className="text-neutral-400 font-normal">(optional)</span>
                  </label>
                  <input id="shop-logo" type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="shop-banner" className="block text-sm font-semibold text-navy-900 mb-1.5">
                    Banner URL <span className="text-neutral-400 font-normal">(optional)</span>
                  </label>
                  <input id="shop-banner" type="url" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://…" className={inputClass} />
                </div>
              </div>
              {brandingMsg && (
                <div className="rounded-xl bg-primary-50 border border-primary-100 text-primary-900 text-sm px-4 py-3">{brandingMsg}</div>
              )}
              <p className="text-[11px] text-neutral-400">Uploads are signed, validated, and stored on Cloudinary; links remain supported as fallback.</p>
              {formError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">{formError}</div>
              )}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <Button type="submit" variant="secondary" size="md" className="flex-1" disabled={saving}>
                  {saving ? 'Saving…' : shop ? 'Save Changes' : 'Create Shop'}
                </Button>
                {shop && (
                  <Button type="button" variant="outline" size="md" disabled={saving} onClick={cancelEdit}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
