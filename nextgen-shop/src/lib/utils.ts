// Utility functions for Nextgen Shop

export const formatBDT = (amount: number): string => {
  return '৳' + amount.toLocaleString()
}

export const formatDate = (date: string | Date): string => {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export const generateOrderId = (): string => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substr(2, 5)
  return 'ORD-' + (timestamp + random).toUpperCase()
}

export const isValidBDMobile = (mobile: string): boolean => {
  const cleaned = mobile.replace(/\s/g, '')
  return /^01[3-9]\d{8}$/.test(cleaned)
}

// Single source of truth: canonical store config lives in
// src/data/storeConfig.ts (freeShippingOver: 5000). Re-exported here so
// existing `import { STORE_CONFIG } from '@/lib/utils'` call sites keep
// working without behavior drift between two config objects.
export { STORE_CONFIG } from '@/data/storeConfig'