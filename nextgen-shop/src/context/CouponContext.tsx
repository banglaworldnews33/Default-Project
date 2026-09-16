import React, { createContext, useContext, useState } from 'react'
import { validateCoupon } from '@/services/coupons'
import type { Coupon } from '@/types'

interface CouponContextValue {
  appliedCoupon: Coupon | null
  discountAmount: number
  applyCoupon: (code: string, subtotal: number) => { ok: boolean; message: string }
  removeCoupon: () => void
}

const CouponContext = createContext<CouponContextValue | undefined>(undefined)

export const CouponProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null)
  const [discountAmount, setDiscountAmount] = useState(0)

  const applyCoupon = (code: string, subtotal: number) => {
    const result = validateCoupon(code, subtotal)
    if (result.ok) {
      setDiscountAmount(result.discount)
    }
    return result
  }

  const removeCoupon = () => {
    setAppliedCoupon(null)
    setDiscountAmount(0)
  }

  return (
    <CouponContext.Provider value={{ appliedCoupon, discountAmount, applyCoupon, removeCoupon }}>
      {children}
    </CouponContext.Provider>
  )
}

export function useCoupon(): CouponContextValue {
  const ctx = useContext(CouponContext)
  if (!ctx) throw new Error('useCoupon must be used within CouponProvider')
  return ctx
}
