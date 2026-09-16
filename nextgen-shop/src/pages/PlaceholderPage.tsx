import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

interface PlaceholderPageProps {
  title: string
  subtitle?: string
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({
  title,
  subtitle = 'This page will be implemented in the next step.',
}) => {
  return (
    <div className="container-shop py-16 sm:py-24 text-center">
      <h1 className="text-3xl sm:text-4xl font-display font-bold text-neutral-900">{title}</h1>
      <p className="mt-3 text-neutral-500 max-w-md mx-auto text-sm">{subtitle}</p>
      <div className="mt-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-900 hover:text-accent-700"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Home</span>
        </Link>
      </div>
    </div>
  )
}
