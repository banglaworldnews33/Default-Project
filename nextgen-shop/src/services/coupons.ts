import { sampleCoupons } from '@/data/storeConfig'
import type { Coupon } from '@/types'

export function validateCoupon(code: string, subtotal: number): { ok: boolean; discount: number; message: string } {
  const coupon = (sampleCoupons as readonly Coupon[]).find(
    (c) => c.code.toLowerCase() === code.trim().toLowerCase(),
  )
  if (!coupon || !coupon.active) {
    return { ok: false, discount: 0, message: 'Invalid coupon code.' }
  }
  if (subtotal < coupon.minOrderAmount) {
    return {
      ok: false,
      discount: 0,
      message: `Minimum order ৳${coupon.minOrderAmount.toLocaleString()} required.`,
    }
  }
  const discount = Math.round((subtotal * coupon.value) / 100)
  return { ok: true, discount, message: `${coupon.value}% off applied!` }
}
