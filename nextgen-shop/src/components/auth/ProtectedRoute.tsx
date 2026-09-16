import React from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAdmin = false }) => {
  const { user, profile, isLoading, profileLoading, isConfigured } = useAuth()
  const location = useLocation()

  // Backend not configured: keep existing demo behavior instead of locking the app.
  if (!isConfigured) return <>{children}</>
  if (isLoading) {
    return (
      <div className="container-shop py-12">
        <div className="bg-white rounded-xl border border-neutral-200/80 p-6 text-center text-sm text-neutral-500">
          Checking your session...
        </div>
      </div>
    )
  }
  if (!user) {
    return <Navigate to={`/login?return=${encodeURIComponent(location.pathname)}`} replace />
  }
  if (requireAdmin) {
    if (profileLoading) {
      return (
        <div className="container-shop py-12">
          <div className="bg-white rounded-xl border border-neutral-200/80 p-6 text-center text-sm text-neutral-500">
            Verifying your role...
          </div>
        </div>
      )
    }
    if (!profile || profile.role !== 'admin') {
      return (
        <div className="container-shop py-12">
          <div className="max-w-md mx-auto bg-white rounded-xl border border-neutral-200/80 p-6 text-center space-y-3">
            <h1 className="text-xl font-display font-bold text-neutral-900">Access denied</h1>
            <p className="text-sm text-neutral-500">
              This area is restricted to administrators. Your role is read securely from the database, never from the browser.
            </p>
            <Link to="/" className="inline-block text-sm font-semibold text-accent-700 hover:underline">
              Back to Home
            </Link>
          </div>
        </div>
      )
    }
  }
  return <>{children}</>
}
