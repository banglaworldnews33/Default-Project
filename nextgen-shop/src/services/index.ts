/**
 * Data services — the single seam between UI and storage.
 *
 * Today: mock/local data + localStorage persistence.
 * Tomorrow: swap the bodies of these functions for Supabase / Firebase /
 * MySQL / PostgreSQL calls (or keep the cache + call the API).
 *
 * Google Sheets: `orderService.create()` posts to the configured Apps Script
 * Web App URL when `VITE_GOOGLE_SHEETS_WEBAPP_URL` is set (see .env.example).
 * No credentials are ever hardcoded here.
 */

import { products as seedProducts } from '@/data/products'
import { generateOrderId } from '@/lib/utils'
import type { Order, Product } from '@/types'

const PRODUCT_KEY = 'ngs.products.v1'
const ORDER_KEY = 'ngs.orders.v1'

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeLS<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full/unavailable — non-fatal for the demo.
  }
}

// ---------------------------------------------------------------- products --

export const productService = {
  list(): Product[] {
    return readLS<Product[]>(PRODUCT_KEY, seedProducts)
  },

  bySlug(slug: string): Product | undefined {
    return this.list().find((p) => p.slug === slug)
  },

  byId(id: string): Product | undefined {
    return this.list().find((p) => p.id === id)
  },

  /** Create or update; returns the saved product. */
  save(product: Product): Product {
    const all = this.list()
    const idx = all.findIndex((p) => p.id === product.id)
    if (idx >= 0) all[idx] = product
    else all.unshift(product)
    writeLS(PRODUCT_KEY, all)
    return product
  },

  remove(id: string): void {
    writeLS(PRODUCT_KEY, this.list().filter((p) => p.id !== id))
  },

  /** Stock mutation used when orders are placed (stock -= qty). */
  decrementStock(items: { productId: string; quantity: number }[]): void {
    const all = this.list()
    for (const item of items) {
      const p = all.find((x) => x.id === item.productId)
      if (p) p.stock = Math.max(0, p.stock - item.quantity)
    }
    writeLS(PRODUCT_KEY, all)
  },
}

// ------------------------------------------------------------------ orders --

/**
 * INTEGRATION POINT (Google Sheets / Apps Script):
 * Configure VITE_GOOGLE_SHEETS_WEBAPP_URL to a Web App that accepts a POST
 * with the JSON order and appends it to a sheet. Until then orders persist in
 * localStorage.
 */
async function pushOrderToSheets(order: Order): Promise<void> {
  const url = import.meta.env.VITE_GOOGLE_SHEETS_WEBAPP_URL as string | undefined
  const token = import.meta.env.VITE_GOOGLE_SHEETS_TOKEN as string | undefined
  if (!url) return
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', // avoids Apps Script CORS preflight
      },
      body: JSON.stringify({ token, order }),
    })
  } catch {
    // Never block order placement on Sheets sync; reconcile later from admin.
  }
}

export const orderService = {
  list(): Order[] {
    return readLS<Order[]>(ORDER_KEY, [])
  },

  /** Seed demo orders once so the admin dashboard is not empty. */
  seedDemoOrders(demoOrders: Order[]): void {
    if (localStorage.getItem(ORDER_KEY)) return
    writeLS(ORDER_KEY, demoOrders)
  },

  byId(orderId: string): Order | undefined {
    return this.list().find((o) => o.orderId.toLowerCase() === orderId.toLowerCase())
  },

  /** Orders belonging to a mobile number (order tracking). */
  byMobile(mobile: string): Order[] {
    const m = mobile.trim()
    return this.list().filter((o) => o.mobile === m || o.alternativeMobile === m)
  },

  async create(input: Omit<Order, 'orderId' | 'orderDate' | 'status'>): Promise<Order> {
    const order: Order = {
      ...input,
      orderId: generateOrderId(),
      orderDate: new Date().toISOString(),
      status: 'Pending',
    }
    const all = this.list()
    all.unshift(order)
    writeLS(ORDER_KEY, all)

    // Reduce product stock according to ordered quantities.
    productService.decrementStock(order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })))

    void pushOrderToSheets(order)
    return order
  },

  updateStatus(orderId: string, status: Order['status']): void {
    const all = this.list()
    const idx = all.findIndex((o) => o.orderId === orderId)
    if (idx >= 0) {
      all[idx].status = status
      writeLS(ORDER_KEY, all)
    }
  },

  remove(orderId: string): void {
    writeLS(ORDER_KEY, this.list().filter((o) => o.orderId !== orderId))
  },
}

// --------------------------------------------------------------- customers --

export interface CustomerSummary {
  mobile: string
  name: string
  address: string
  totalOrders: number
  totalSpent: number
  lastOrderAt?: string
  status: 'active' | 'inactive'
}

export const customerService = {
  /** Derive customer summaries from orders (replaced by a customers table later). */
  list(): CustomerSummary[] {
    const map = new Map<string, CustomerSummary>()
    for (const o of orderService.list()) {
      const existing = map.get(o.mobile)
      const spent = o.status === 'Cancelled' ? 0 : o.total
      if (existing) {
        existing.totalOrders += 1
        existing.totalSpent += spent
        if (!existing.lastOrderAt || o.orderDate > existing.lastOrderAt) {
          existing.lastOrderAt = o.orderDate
          existing.name = o.customerName
          existing.address = `${o.address}, ${o.upazila}, ${o.district}`
        }
      } else {
        map.set(o.mobile, {
          mobile: o.mobile,
          name: o.customerName,
          address: `${o.address}, ${o.upazila}, ${o.district}`,
          totalOrders: 1,
          totalSpent: spent,
          lastOrderAt: o.orderDate,
          status: 'active',
        })
      }
    }
    return [...map.values()].sort((a, b) => b.totalSpent - a.totalSpent)
  },
}
