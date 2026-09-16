import React from 'react'
import { EmptyState } from '@/components/seller/SellerWidgets'

export const SellerCustomersPage: React.FC = () => {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Customers</h1>
        <p className="text-sm text-neutral-500 mt-1">People who bought from your shop.</p>
      </div>
      <div className="card-premium p-5 sm:p-6">
        <EmptyState
          title="No customers yet"
          message="Buyer profiles linked to your completed sales will appear here. Contact details stay limited to what each order requires."
        />
      </div>
    </div>
  )
}
