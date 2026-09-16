import React, { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Store } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { sellerService } from '@/services/seller'
import { isValidBDMobile } from '@/lib/utils'
import { categories } from '@/data/categories'
import { Button } from '@/components/ui/Button'

const inputClass =
  'w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm text-navy-900 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 bg-white transition-all placeholder:text-neutral-400'

export const SellerRegisterPage: React.FC = () => {
  const { user, profile, isLoading, isConfigured } = useAuth()
  const navigate = useNavigate()

  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [description, setDescription] = useState('')
  const [shopCategory, setShopCategory] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!isConfigured) {
    return (
      <div className="container-shop py-12">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-neutral-200/80 p-8 text-center text-sm text-neutral-500 shadow-card">
          Seller registration needs the online backend. Please configure Supabase first.
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="container-shop py-12">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-neutral-200/80 p-8 text-center text-sm text-neutral-500 shadow-card">
          Checking your account…
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login?return=/seller/register" replace />

  if (profile?.role === 'seller') {
    return (
      <div className="container-shop py-12">
        <div className="max-w-lg mx-auto card-premium p-8 text-center space-y-4">
          <h1 className="text-2xl font-display font-bold text-navy-900">You&apos;re already a seller</h1>
          <p className="text-sm text-neutral-500">Your shop is active. Head to your dashboard to manage it.</p>
          <Button to="/seller" variant="primary" size="lg" className="w-full">
            Go to Seller Dashboard
          </Button>
        </div>
      </div>
    )
  }

  if (profile?.role === 'admin') {
    return (
      <div className="container-shop py-12">
        <div className="max-w-lg mx-auto card-premium p-8 text-center space-y-4">
          <h1 className="text-2xl font-display font-bold text-navy-900">Admin accounts don&apos;t apply</h1>
          <p className="text-sm text-neutral-500">Seller applications are for customer accounts. Review them in the admin area instead.</p>
          <Button to="/admin/sellers" variant="primary" size="lg" className="w-full">
            Review Seller Applications
          </Button>
        </div>
      </div>
    )
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {}
    if (businessName.trim().length < 3 || businessName.trim().length > 200) {
      next.businessName = 'Shop name must be 3–200 characters.'
    }
    if (!isValidBDMobile(phone)) next.phone = 'Enter a valid BD mobile (01XXXXXXXXX).'
    if (description.trim().length > 2000) next.description = 'Keep it under 2000 characters.'
    if (!agreed) next.agreed = 'Please accept the seller terms to continue.'
    return next
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setSubmitError(null)
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    setSubmitting(true)
    try {
      const { data, error } = await sellerService.create({
        businessName: businessName.trim(),
        phone: phone.trim(),
        description: description.trim() ? description.trim() : null,
        shopCategory: shopCategory ? shopCategory : null,
      })
      if (error || !data) {
        if (error && 'code' in error && error.code === '23505') {
          setSubmitError('You already have a pending application under review.')
        } else {
          setSubmitError(error?.message ?? 'Could not submit your application. Please try again.')
        }
        return
      }
      navigate('/seller/application', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-neutral-50/70 border-y border-neutral-200/70">
      <div className="container-shop py-10 sm:py-14">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary-50 border border-primary-100 text-primary-700 text-xs font-semibold tracking-wider uppercase">
              <Store className="h-3.5 w-3.5" />
              Seller Registration
            </span>
            <h1 className="text-3xl sm:text-4xl font-display font-bold text-navy-900 mt-3">
              Open Your Shop
            </h1>
            <p className="text-sm text-neutral-500 mt-2">
              Apply in a minute. Our team reviews every application — you can start selling as soon as you&apos;re approved.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="card-premium p-6 sm:p-8 space-y-5">
            <div>
              <label htmlFor="sr-name" className="block text-sm font-semibold text-navy-900 mb-1.5">
                Business / Shop Name <span className="text-rose-600">*</span>
              </label>
              <input
                id="sr-name"
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Dhaka Fashion House"
                maxLength={200}
                className={inputClass}
              />
              {fieldErrors.businessName && <p className="text-xs text-rose-600 mt-1.5">{fieldErrors.businessName}</p>}
            </div>

            <div>
              <label htmlFor="sr-phone" className="block text-sm font-semibold text-navy-900 mb-1.5">
                Seller Phone <span className="text-rose-600">*</span>
              </label>
              <input
                id="sr-phone"
                type="tel"
                inputMode="numeric"
                maxLength={11}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className={inputClass}
              />
              {fieldErrors.phone && <p className="text-xs text-rose-600 mt-1.5">{fieldErrors.phone}</p>}
            </div>

            <div>
              <label htmlFor="sr-desc" className="block text-sm font-semibold text-navy-900 mb-1.5">
                Business Description <span className="text-neutral-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="sr-desc"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What will you sell? A short intro builds buyer trust."
                maxLength={2000}
                className={`${inputClass} resize-y`}
              />
              {fieldErrors.description && <p className="text-xs text-rose-600 mt-1.5">{fieldErrors.description}</p>}
            </div>

            <div>
              <label htmlFor="sr-cat" className="block text-sm font-semibold text-navy-900 mb-1.5">
                Shop Category <span className="text-neutral-400 font-normal">(optional)</span>
              </label>
              <select
                id="sr-cat"
                value={shopCategory}
                onChange={(e) => setShopCategory(e.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="">Select a category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name} — {c.tagline}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary-600 cursor-pointer"
              />
              <span className="text-xs text-neutral-600 leading-relaxed">
                I confirm this is a genuine business, I will sell only lawful quality products,
                and I accept that approval is at NextGen Shop&apos;s discretion.{' '}
                <span className="text-rose-600">*</span>
              </span>
            </label>
            {fieldErrors.agreed && <p className="text-xs text-rose-600 -mt-2">{fieldErrors.agreed}</p>}

            {submitError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">
                {submitError}
              </div>
            )}

            <Button type="submit" variant="secondary" size="lg" className="w-full" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Application'}
            </Button>

            <p className="text-center text-xs text-neutral-500">
              Already applied?{' '}
              <Link to="/seller/application" className="font-semibold text-primary-700 hover:underline">
                Check application status
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
