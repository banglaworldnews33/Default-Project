import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'

/**
 * Seller-only route guard. Requires ALL of:
 * - configured backend (demo passthrough otherwise, mirroring ProtectedRoute)
 * - signed-in user
 * - authoritative profile with role === 'seller' AND verification_status === 'verified'
 *
 * Pending / rejected applicants are denied with guidance — never by
 * localStorage, URL, or caller-supplied props. Role comes only from
 * the Supabase profiles row via AuthContext.
 */
export const SellerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, isLoading, profileLoading, isConfigured } = useAuth()

  if (!isConfigured) return <>{children}</>

  if (isLoading || profileLoading) {
    return (
      <div className="container-shop py-12">
        <div className="bg-white rounded-2xl border border-neutral-200/80 p-8 text-center text-sm text-neutral-500 shadow-card">
          Verifying your seller access…
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container-shop py-12">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-neutral-200/80 p-8 text-center space-y-4 shadow-card">
          <h1 className="text-xl font-display font-bold text-navy-900">Seller Sign In Required</h1>
          <p className="text-sm text-neutral-500">
            The seller dashboard is available to approved sellers. Please sign in first.
          </p>
          <Button to="/login?return=/seller" variant="primary" size="md" className="w-full">
            Sign In
          </Button>
        </div>
      </div>
    )
  }

  if (!profile || profile.role !== 'seller' || profile.verification_status !== 'verified') {
    const status = profile?.verification_status
    return (
      <div className="container-shop py-12">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-neutral-200/80 p-8 text-center space-y-4 shadow-card">
          <h1 className="text-xl font-display font-bold text-navy-900">Seller Access Only</h1>
          <p className="text-sm text-neutral-500">
            {status === 'pending' || !profile
              ? 'Your seller application is still under review. You will get dashboard access once an admin approves it.'
              : status === 'rejected'
                ? 'Your seller application was not approved. You may submit a new application for review.'
                : 'This area is restricted to verified sellers.'}
          </p>
          <div className="flex flex-col gap-2">
            <Button to="/seller/application" variant="primary" size="md" className="w-full">
              Check Application Status
            </Button>
            <Link to="/" className="text-xs font-semibold text-primary-700 hover:underline">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
