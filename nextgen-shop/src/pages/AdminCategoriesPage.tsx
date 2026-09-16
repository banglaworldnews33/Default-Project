import React, { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, X } from 'lucide-react'
import { categoriesService, type CategoryInput } from '@/services/categories'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { LoadingState, ErrorState, EmptyState } from '@/components/seller/SellerWidgets'
import type { MarketplaceCategory } from '@/types'

const inputClass =
  'w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 bg-white transition-all placeholder:text-neutral-400'

const EMPTY_FORM: CategoryInput = {
  name: '',
  slug: '',
  description: null,
  imageUrl: null,
  parentId: null,
  sortOrder: 0,
  isActive: true,
}

function slugifyName(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return base || 'category'
}

function levelLabel(depth: number): string {
  if (depth === 0) return 'Main Category'
  if (depth === 1) return 'Subcategory'
  return 'Child Category'
}

/** Recursive hierarchy node: Main → Sub → Child → … (cycle-safe by DB trigger). */
function CategoryNode({ node, all, depth = 0, onEdit, onToggle }: {
  node: MarketplaceCategory
  all: MarketplaceCategory[]
  depth?: number
  onEdit: (c: MarketplaceCategory) => void
  onToggle: (c: MarketplaceCategory) => void
}): React.ReactNode {
  const children = all.filter((c) => c.parentId === node.id)
  return (
    <div className="rounded-xl border border-neutral-200 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-white">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-navy-900 text-sm truncate">
            {node.name}
            <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-primary-600">
              {levelLabel(depth)}
            </span>
          </p>
          <p className="text-xs text-neutral-400">/{node.slug} · order {node.sortOrder}</p>
        </div>
        <Badge variant={node.isActive ? 'success' : 'muted'}>{node.isActive ? 'Active' : 'Hidden'}</Badge>
        <button type="button" onClick={() => onEdit(node)} className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-navy-900 transition-colors cursor-pointer" aria-label={`Edit ${node.name}`}>
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onToggle(node)}
          className="text-xs font-semibold text-primary-700 hover:underline cursor-pointer px-1"
        >
          {node.isActive ? 'Deactivate' : 'Activate'}
        </button>
      </div>
      {children.length > 0 && (
        <div className="bg-neutral-50/70 border-t border-neutral-200/70 px-3 sm:px-4 py-2 space-y-2">
          {children.map((child) => (
            <div key={child.id} className="pl-3 sm:pl-4 border-l-2 border-primary-200">
              <CategoryNode node={child} all={all} depth={depth + 1} onEdit={onEdit} onToggle={onToggle} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const AdminCategoriesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [categories, setCategories] = useState<MarketplaceCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CategoryInput>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: err } = await categoriesService.listAll()
    if (err) {
      setError(err.message)
      setCategories([])
    } else {
      setError(null)
      setCategories(data ?? [])
    }
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      await load()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [load, reloadKey])

  function openCreate(): void {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setNotice(null)
    setFormOpen(true)
  }

  // Deep-link from Home "+ Add Category": ?action=new opens the
  // existing add flow (no duplicate form). Same pattern as seller products.
  useEffect(() => {
    if (searchParams.get('action') === 'new' && !formOpen) {
      openCreate()
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, formOpen])

  function openEdit(c: MarketplaceCategory): void {
    setEditingId(c.id)
    setForm({
      name: c.name,
      slug: c.slug,
      description: c.description,
      imageUrl: c.imageUrl,
      parentId: c.parentId,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
    })
    setFormError(null)
    setNotice(null)
    setFormOpen(true)
  }

  async function handleSave(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setFormError(null)
    const name = form.name.trim()
    const slug = (form.slug.trim() ? form.slug.trim() : slugifyName(name)).toLowerCase()
    if (name.length < 2 || name.length > 150) {
      setFormError('Category name must be 2–150 characters.')
      return
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setFormError('Slug may contain only lowercase letters, numbers, and hyphens.')
      return
    }
    if (!Number.isInteger(form.sortOrder) || form.sortOrder < 0) {
      setFormError('Sort order must be 0 or more.')
      return
    }
    if (form.parentId === editingId) {
      setFormError('A category cannot be its own parent.')
      return
    }
    const duplicate = categories.some(
      (c) => c.id !== editingId && c.name.trim().toLowerCase() === name.toLowerCase(),
    )
    if (duplicate) {
      setFormError('A category with this name already exists. Names must be unique.')
      return
    }
    setSaving(true)
    try {
      const payload: CategoryInput = {
        ...form,
        name,
        slug,
        description: form.description?.trim() ? form.description.trim() : null,
        imageUrl: form.imageUrl?.trim() ? form.imageUrl.trim() : null,
      }
      const { error: err } = editingId
        ? await categoriesService.update(editingId, payload)
        : await categoriesService.create(payload)
      if (err) {
        setFormError(err.message)
        return
      }
      setFormOpen(false)
      setEditingId(null)
      setLoading(true)
      setReloadKey((k) => k + 1)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(c: MarketplaceCategory): Promise<void> {
    setNotice(null)
    const { error: err } = await categoriesService.setActive(c.id, !c.isActive)
    if (err) {
      setNotice(err.message)
      return
    }
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  const topLevel = categories.filter((c) => !c.parentId)

  return (
    <div className="container-shop py-8 sm:py-10">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800 mb-5">
        <ArrowLeft className="h-4 w-4" />
        Back to Admin Dashboard
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Categories</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Organize the marketplace catalog. Deactivate instead of deleting — products depend on categories.
          </p>
        </div>
        <Button type="button" variant="secondary" size="md" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Category
        </Button>
      </div>

      {notice && (
        <div className="rounded-xl bg-primary-50 border border-primary-100 text-primary-900 text-sm px-4 py-3 mb-5">
          {notice}
        </div>
      )}

      {formOpen && (
        <form onSubmit={handleSave} className="card-premium p-5 sm:p-6 space-y-4 mb-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg text-navy-900">
              {editingId ? 'Edit Category' : 'New Category'}
            </h2>
            <button type="button" onClick={() => setFormOpen(false)} className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 cursor-pointer" aria-label="Close category form">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cat-name" className="block text-sm font-semibold text-navy-900 mb-1.5">Name <span className="text-rose-600">*</span></label>
              <input id="cat-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={150} placeholder="e.g. Winter Wear" className={inputClass} />
            </div>
            <div>
              <label htmlFor="cat-slug" className="block text-sm font-semibold text-navy-900 mb-1.5">Slug</label>
              <input id="cat-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} maxLength={150} placeholder="auto from name" className={inputClass} />
            </div>
            <div>
              <label htmlFor="cat-parent" className="block text-sm font-semibold text-navy-900 mb-1.5">Parent Category</label>
              <select
                id="cat-parent"
                value={form.parentId ?? ''}
                onChange={(e) => setForm({ ...form, parentId: e.target.value ? e.target.value : null })}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="">None (top level)</option>
                {categories.filter((c) => c.id !== editingId).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cat-sort" className="block text-sm font-semibold text-navy-900 mb-1.5">Sort Order</label>
              <input id="cat-sort" type="number" min={0} step={1} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="cat-desc" className="block text-sm font-semibold text-navy-900 mb-1.5">Description <span className="text-neutral-400 font-normal">(optional)</span></label>
              <textarea id="cat-desc" rows={2} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={2000} className={`${inputClass} resize-y`} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="cat-img" className="block text-sm font-semibold text-navy-900 mb-1.5">Image URL <span className="text-neutral-400 font-normal">(optional, https://)</span></label>
              <input id="cat-img" type="url" value={form.imageUrl ?? ''} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" className={inputClass} />
            </div>
            <label className="flex items-center gap-2.5 text-sm font-medium text-navy-900 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 accent-primary-600 cursor-pointer"
              />
              Active (visible in marketplace)
            </label>
          </div>
          {formError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">{formError}</div>
          )}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <Button type="submit" variant="secondary" size="md" className="flex-1" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Category'}
            </Button>
            <Button type="button" variant="outline" size="md" disabled={saving} onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {loading && <LoadingState message="Loading categories…" />}
      {!loading && error && (
        <ErrorState message={error} onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }} />
      )}

      {!loading && !error && categories.length === 0 && (
        <div className="card-premium p-5 sm:p-6">
          <EmptyState
            title="No catalog categories yet"
            message="Create the first marketplace categories above. The storefront demo categories are separate and untouched."
          />
        </div>
      )}

      {!loading && !error && categories.length > 0 && (
        <div className="card-premium p-3 sm:p-4 space-y-2">
          {topLevel.map((c) => (
            <CategoryNode
              key={c.id}
              node={c}
              all={categories}
              onEdit={openEdit}
              onToggle={(node) => void handleToggle(node)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
