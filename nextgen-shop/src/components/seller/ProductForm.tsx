import React, { useState } from 'react'
import { X } from 'lucide-react'
import type { ProductInput } from '@/services/sellerProducts'
import type { MarketplaceCategory } from '@/types'
import { Button } from '@/components/ui/Button'

const inputClass =
  'w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 bg-white transition-all placeholder:text-neutral-400'

export interface ProductFormInitial {
  name: string
  categoryId: string
  shortDescription: string
  description: string
  sku: string
  price: string
  compareAtPrice: string
  discountPrice: string
  stockQuantity: string
  brand: string
}

export const EMPTY_PRODUCT_FORM: ProductFormInitial = {
  name: '',
  categoryId: '',
  shortDescription: '',
  description: '',
  sku: '',
  price: '',
  compareAtPrice: '',
  discountPrice: '',
  stockQuantity: '10',
  brand: '',
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return `${base || 'product'}-${Date.now().toString(36)}`
}

function parseDraft(draft: ProductFormInitial): { ok: false; message: string } | { ok: true; input: Omit<ProductInput, 'shopId'> } {
  const price = Number(draft.price)
  const stock = Number(draft.stockQuantity)
  const compare = draft.compareAtPrice.trim() === '' ? null : Number(draft.compareAtPrice)
  const discount = draft.discountPrice.trim() === '' ? null : Number(draft.discountPrice)
  if (draft.name.trim().length < 3 || draft.name.trim().length > 200) {
    return { ok: false, message: 'Product name must be 3–200 characters.' }
  }
  if (!draft.categoryId) return { ok: false, message: 'Choose a category.' }
  if (!Number.isFinite(price) || price < 0) return { ok: false, message: 'Price must be 0 or more.' }
  if (!Number.isInteger(stock) || stock < 0) return { ok: false, message: 'Stock must be a whole number, 0 or more.' }
  if (compare !== null && (!Number.isFinite(compare) || compare < 0)) {
    return { ok: false, message: 'Compare price must be 0 or more.' }
  }
  if (discount !== null && (!Number.isFinite(discount) || discount < 0)) {
    return { ok: false, message: 'Discount price must be 0 or more.' }
  }
  if (discount !== null && discount > price) {
    return { ok: false, message: 'Discount price cannot exceed the selling price.' }
  }
  if (compare !== null && compare < price) {
    return { ok: false, message: 'Compare price should be at or above the selling price.' }
  }
  return {
    ok: true,
    input: {
      categoryId: draft.categoryId,
      name: draft.name.trim(),
      slug: slugify(draft.name),
      shortDescription: draft.shortDescription.trim() ? draft.shortDescription.trim() : null,
      description: draft.description.trim() ? draft.description.trim() : null,
      sku: draft.sku.trim() ? draft.sku.trim() : null,
      price,
      compareAtPrice: compare,
      discountPrice: discount,
      stockQuantity: stock,
      brand: draft.brand.trim() ? draft.brand.trim() : null,
    },
  }
}

interface ProductFormProps {
  categories: MarketplaceCategory[]
  initial?: ProductFormInitial
  heading: string
  submitLabel: string
  /**
   * Persist the validated input. Return an error message to display,
   * or null on success. Shop/category preconditions are checked by
   * the caller here so every entry point enforces them identically.
   */
  onSubmit: (input: Omit<ProductInput, 'shopId'>) => Promise<string | null>
  onSuccess: () => void
  onCancel: () => void
}

/**
 * Shared seller product create/edit form (draft validation + fields).
 * Used by the products list (inline create/edit) and the dedicated
 * /seller/products/new page. Writes always go through the secure
 * sellerProductsService — the database remains the final authority
 * on ownership, pricing rules, and review lifecycle.
 */
export const ProductForm: React.FC<ProductFormProps> = ({
  categories,
  initial,
  heading,
  submitLabel,
  onSubmit,
  onSuccess,
  onCancel,
}) => {
  const [draft, setDraft] = useState<ProductFormInitial>(initial ?? EMPTY_PRODUCT_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const parsed = parseDraft(draft)
    if (!parsed.ok) {
      setFormError(parsed.message)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const message = await onSubmit(parsed.input)
      if (message) {
        setFormError(message)
        return
      }
      onSuccess()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="card-premium p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-lg text-navy-900">{heading}</h2>
        <button type="button" onClick={onCancel} className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 cursor-pointer" aria-label="Close product form">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label htmlFor="pf-name" className="block text-sm font-semibold text-navy-900 mb-1.5">Product Name <span className="text-rose-600">*</span></label>
          <input id="pf-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={200} placeholder="e.g. Premium Cotton Panjabi" className={inputClass} />
        </div>
        <div>
          <label htmlFor="pf-cat" className="block text-sm font-semibold text-navy-900 mb-1.5">Category <span className="text-rose-600">*</span></label>
          <select id="pf-cat" value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })} className={`${inputClass} cursor-pointer`}>
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pf-brand" className="block text-sm font-semibold text-navy-900 mb-1.5">Brand <span className="text-neutral-400 font-normal">(optional)</span></label>
          <input id="pf-brand" value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} maxLength={100} placeholder="e.g. Aarong" className={inputClass} />
        </div>
        <div>
          <label htmlFor="pf-price" className="block text-sm font-semibold text-navy-900 mb-1.5">Price (৳) <span className="text-rose-600">*</span></label>
          <input id="pf-price" type="number" min={0} step="0.01" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="0.00" className={inputClass} />
        </div>
        <div>
          <label htmlFor="pf-stock" className="block text-sm font-semibold text-navy-900 mb-1.5">Stock <span className="text-rose-600">*</span></label>
          <input id="pf-stock" type="number" min={0} step={1} value={draft.stockQuantity} onChange={(e) => setDraft({ ...draft, stockQuantity: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label htmlFor="pf-compare" className="block text-sm font-semibold text-navy-900 mb-1.5">Compare-at Price <span className="text-neutral-400 font-normal">(optional)</span></label>
          <input id="pf-compare" type="number" min={0} step="0.01" value={draft.compareAtPrice} onChange={(e) => setDraft({ ...draft, compareAtPrice: e.target.value })} placeholder="0.00" className={inputClass} />
        </div>
        <div>
          <label htmlFor="pf-discount" className="block text-sm font-semibold text-navy-900 mb-1.5">Discount Price <span className="text-neutral-400 font-normal">(optional)</span></label>
          <input id="pf-discount" type="number" min={0} step="0.01" value={draft.discountPrice} onChange={(e) => setDraft({ ...draft, discountPrice: e.target.value })} placeholder="0.00" className={inputClass} />
        </div>
        <div>
          <label htmlFor="pf-sku" className="block text-sm font-semibold text-navy-900 mb-1.5">SKU <span className="text-neutral-400 font-normal">(optional)</span></label>
          <input id="pf-sku" value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} maxLength={100} placeholder="e.g. PANJABI-BLK-L" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="pf-short" className="block text-sm font-semibold text-navy-900 mb-1.5">Short Description <span className="text-neutral-400 font-normal">(optional)</span></label>
          <input id="pf-short" value={draft.shortDescription} onChange={(e) => setDraft({ ...draft, shortDescription: e.target.value })} maxLength={500} placeholder="One-line highlight" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="pf-desc" className="block text-sm font-semibold text-navy-900 mb-1.5">Full Description <span className="text-neutral-400 font-normal">(optional)</span></label>
          <textarea id="pf-desc" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={10000} placeholder="Fabric, fit, care, delivery notes…" className={`${inputClass} resize-y`} />
        </div>
      </div>
      {formError && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">{formError}</div>
      )}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <Button type="submit" variant="secondary" size="md" className="flex-1" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="outline" size="md" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] text-neutral-400">New products are always created as drafts. Submit for review when ready — approval is done by our team, never automatically.</p>
    </form>
  )
}
