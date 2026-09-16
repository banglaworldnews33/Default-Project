import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { commissionService, type CommissionRule } from '@/services/commission'
import { categoriesService } from '@/services/categories'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { LoadingState, ErrorState, EmptyState } from '@/components/seller/SellerWidgets'
import { formatDate } from '@/lib/utils'
import type { MarketplaceCategory } from '@/types'

const inputClass =
  'w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 bg-white transition-all placeholder:text-neutral-400'

function nowLocalInput(): string {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}

function scopeLabel(rule: CommissionRule): string {
  if (rule.categoryId === null) return 'Global default'
  return rule.categoryName ?? 'Category override'
}

/**
 * Super-admin commission console (migration 017).
 *
 * Authorization lives entirely in the database RPCs, which
 * enforce is_super_admin() server-side. This page may render
 * for normal admins, but list/create/history calls deny them
 * there; denials surface honestly and are never interpreted
 * as role signals. No commission math happens here — rates
 * are configuration only, and earnings are derived
 * server-side at recognition time.
 */
export const AdminCommissionPage: React.FC = () => {
  const [rules, setRules] = useState<CommissionRule[]>([])
  const [history, setHistory] = useState<CommissionRule[]>([])
  const [dbCategories, setDbCategories] = useState<MarketplaceCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [scope, setScope] = useState<'global' | 'category'>('global')
  const [categoryId, setCategoryId] = useState('')
  const [rate, setRate] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(nowLocalInput)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [rRes, hRes, cRes] = await Promise.all([
      commissionService.listRules(),
      commissionService.ruleHistory(null),
      categoriesService.listAll(),
    ])
    // RPC denials (normal admins) surface honestly; category
    // reads use the separate admin RLS policy and may succeed.
    const firstErr = rRes.error ?? hRes.error
    if (firstErr) {
      setError(firstErr.message)
      setRules([])
      setHistory([])
    } else {
      setError(null)
      setRules(rRes.data ?? [])
      setHistory(hRes.data ?? [])
    }
    setDbCategories(cRes.data ?? [])
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

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setFormError(null)
    setNotice(null)
    const parsedRate = Number(rate)
    if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 100) {
      setFormError('Rate must be a number between 0 and 100.')
      return
    }
    const targetCategory = scope === 'category' ? categoryId : null
    if (scope === 'category' && !targetCategory) {
      setFormError('Choose a category for a category override.')
      return
    }
    const effectiveIso = effectiveFrom ? new Date(effectiveFrom).toISOString() : ''
    if (!effectiveIso) {
      setFormError('Effective date is required.')
      return
    }
    setSaving(true)
    try {
      const { error: err } = await commissionService.createRule({
        categoryId: targetCategory === '' ? null : targetCategory,
        rate: parsedRate,
        effectiveFrom: effectiveIso,
      })
      if (err) {
        setFormError(err.message)
        return
      }
      setNotice('Commission version created. Historical versions are preserved unchanged.')
      setRate('')
      setCategoryId('')
      setLoading(true)
      setReloadKey((k) => k + 1)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container-shop py-8 sm:py-10">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800 mb-5">
        <ArrowLeft className="h-4 w-4" />
        Back to Admin Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Commission</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Versioned platform rates. New versions take effect from their date; history is never rewritten.
        </p>
      </div>

      {notice && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 mb-5">
          {notice}
        </div>
      )}

      {loading && <LoadingState message="Loading commission rules…" />}
      {!loading && error && (
        <div className="mb-5">
          <ErrorState
            message={error}
            onRetry={() => { setLoading(true); setReloadKey((k) => k + 1) }}
          />
          <p className="text-xs text-neutral-400 mt-2">
            Commission management requires super-admin access. This page renders for all admins; the database decides.
          </p>
        </div>
      )}

      {!loading && !error && rules.length === 0 && (
        <div className="card-premium p-5 sm:p-6 mb-5">
          <EmptyState
            title="No commission rules yet"
            message="Create the global default below before any earning can be recognized — recognition fails closed without an applicable rule."
          />
        </div>
      )}

      {!loading && !error && rules.length > 0 && (
        <div className="card-premium p-3 sm:p-4 space-y-2 mb-5">
          {rules.map((rule) => (
            <div key={rule.ruleId} className="rounded-xl border border-neutral-200 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-white">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy-900 text-sm truncate">
                    {scopeLabel(rule)}
                    <span className="ml-2 text-sm font-bold text-primary-700">{rule.rate}%</span>
                  </p>
                  <p className="text-xs text-neutral-400">
                    Effective {formatDate(rule.effectiveFrom)}
                    {rule.effectiveTo ? ` – ${formatDate(rule.effectiveTo)}` : ' – present'}
                  </p>
                </div>
                {rule.inEffect
                  ? <Badge variant="success">In effect</Badge>
                  : <Badge variant="muted">Scheduled</Badge>}
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleCreate} className="card-premium p-5 sm:p-6 space-y-4 mb-5">
        <h2 className="font-display font-bold text-lg text-navy-900">New commission version</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="block text-sm font-semibold text-navy-900 mb-1.5">Scope</span>
            <div className="flex gap-2">
              <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors ${scope === 'global' ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200'}`}>
                <input
                  type="radio"
                  name="commission-scope"
                  checked={scope === 'global'}
                  onChange={() => setScope('global')}
                  className="accent-neutral-900"
                />
                <span className="text-sm font-semibold text-neutral-900">Global default</span>
              </label>
              <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors ${scope === 'category' ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200'}`}>
                <input
                  type="radio"
                  name="commission-scope"
                  checked={scope === 'category'}
                  onChange={() => setScope('category')}
                  className="accent-neutral-900"
                />
                <span className="text-sm font-semibold text-neutral-900">Category</span>
              </label>
            </div>
          </div>
          <div>
            <label htmlFor="comm-cat" className="block text-sm font-semibold text-navy-900 mb-1.5">Category</label>
            <select
              id="comm-cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={scope !== 'category'}
              className={`${inputClass} cursor-pointer disabled:bg-neutral-100 disabled:text-neutral-400`}
            >
              <option value="">Select category</option>
              {dbCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="comm-rate" className="block text-sm font-semibold text-navy-900 mb-1.5">Rate (%) <span className="text-rose-600">*</span></label>
            <input
              id="comm-rate"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="e.g. 12"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="comm-from" className="block text-sm font-semibold text-navy-900 mb-1.5">Effective from <span className="text-rose-600">*</span></label>
            <input
              id="comm-from"
              type="datetime-local"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        {formError && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">{formError}</div>
        )}
        <Button type="submit" variant="secondary" size="md" className="w-full sm:w-auto" disabled={saving}>
          <Plus className="h-4 w-4" />
          <span>{saving ? 'Saving…' : 'Create version'}</span>
        </Button>
        <p className="text-[11px] text-neutral-400">
          Creates a new version — the previous version keeps its history and is closed at the new effective date.
        </p>
      </form>

      {!loading && !error && history.length > 0 && (
        <div className="card-premium p-5 sm:p-6">
          <h2 className="font-display font-bold text-lg text-navy-900 mb-4">Version history</h2>
          <div className="space-y-2">
            {history.map((rule) => (
              <div key={rule.ruleId} className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 border border-neutral-200/70 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900 truncate">
                    {scopeLabel(rule)} · <span className="font-bold">{rule.rate}%</span>
                  </p>
                  <p className="text-xs text-neutral-500">
                    {formatDate(rule.effectiveFrom)}
                    {rule.effectiveTo ? ` – ${formatDate(rule.effectiveTo)}` : ' – present'}
                  </p>
                </div>
                {rule.inEffect
                  ? <Badge variant="success">In effect</Badge>
                  : <Badge variant="muted">Superseded</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
